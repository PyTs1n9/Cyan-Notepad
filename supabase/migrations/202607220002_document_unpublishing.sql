begin;

-- The collaboration server uses the previous publication status from Realtime
-- to distinguish an actual unpublish from other updates to a draft document.
alter table public.documents replica identity full;

create or replace function public.set_document_publication(
  target_document_id uuid,
  publication_action text,
  target_publish_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  current_status text;
begin
  select workspace_id, publication_status
  into target_workspace_id, current_status
  from public.documents
  where id = target_document_id
  for update;

  if target_workspace_id is null then
    raise exception 'Document not found';
  end if;

  if public.workspace_role(target_workspace_id) not in ('owner', 'editor') then
    raise exception 'Editor access required';
  end if;

  if publication_action = 'publish_now' then
    update public.documents
    set publication_status = 'published',
        scheduled_publish_at = null,
        published_at = coalesce(published_at, now())
    where id = target_document_id;
    return;
  end if;

  if publication_action = 'unpublish' then
    if current_status <> 'published' then
      raise exception 'Only published documents can be unpublished';
    end if;

    update public.documents
    set publication_status = 'draft',
        scheduled_publish_at = null,
        published_at = null
    where id = target_document_id;
    return;
  end if;

  if current_status = 'published' then
    raise exception 'Published documents must be unpublished before scheduling';
  end if;

  if publication_action = 'schedule' then
    if target_publish_at is null or target_publish_at <= now() then
      raise exception 'Scheduled publish time must be in the future';
    end if;

    update public.documents
    set publication_status = 'scheduled',
        scheduled_publish_at = target_publish_at,
        published_at = null
    where id = target_document_id;
    return;
  end if;

  if publication_action = 'cancel_schedule' then
    if current_status <> 'scheduled' then
      raise exception 'Only scheduled documents can cancel publishing';
    end if;

    update public.documents
    set publication_status = 'draft',
        scheduled_publish_at = null,
        published_at = null
    where id = target_document_id;
    return;
  end if;

  raise exception 'Invalid publication action';
end;
$$;

revoke execute on function public.set_document_publication(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.set_document_publication(uuid, text, timestamptz)
  to authenticated;

commit;
