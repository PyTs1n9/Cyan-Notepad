begin;

alter table public.documents
  add column if not exists publication_status text,
  add column if not exists scheduled_publish_at timestamptz,
  add column if not exists published_at timestamptz;

-- Documents created before this migration were already visible to every
-- workspace member, so preserve that behavior during the rollout.
update public.documents
set publication_status = 'published',
    published_at = coalesce(published_at, created_at)
where publication_status is null;

update public.documents
set published_at = coalesce(published_at, created_at)
where publication_status = 'published'
  and published_at is null;

alter table public.documents
  alter column publication_status set default 'draft',
  alter column publication_status set not null;
 
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_publication_status_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_publication_status_check
      check (publication_status in ('draft', 'scheduled', 'published'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_publication_state_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_publication_state_check
      check (
        (publication_status = 'draft'
          and scheduled_publish_at is null
          and published_at is null)
        or (publication_status = 'scheduled'
          and scheduled_publish_at is not null
          and published_at is null)
        or (publication_status = 'published'
          and published_at is not null)
      );
  end if;
end;
$$;

create index if not exists documents_scheduled_publish_idx
  on public.documents(scheduled_publish_at)
  where publication_status = 'scheduled';

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

  if current_status = 'published' then
    raise exception 'Published documents cannot be scheduled or returned to draft';
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

drop policy if exists documents_select_member on public.documents;
create policy documents_select_member on public.documents
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    public.workspace_role(workspace_id) in ('owner', 'editor')
    or publication_status = 'published'
  )
);

commit;
