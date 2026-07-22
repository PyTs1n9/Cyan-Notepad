begin;

-- New invitations follow least privilege unless the creator explicitly opts
-- into manager access for the workspace.
alter table public.workspaces
  alter column invite_role set default 'viewer';

alter table public.documents
  add column if not exists access_level text;

-- Preserve the audience that every existing publication state had before
-- document-level permissions were introduced.
update public.documents
set access_level = case
  when publication_status = 'published' then 'members'
  else 'managers'
end
where access_level is null;

alter table public.documents
  alter column access_level set default 'managers',
  alter column access_level set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_access_level_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_access_level_check
      check (access_level in ('creator', 'managers', 'members'));
  end if;
end;
$$;

create or replace function public.can_access_document(
  target_workspace_id uuid,
  target_access_level text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.workspace_role(target_workspace_id)
    when 'owner' then true
    when 'editor' then target_access_level in ('managers', 'members')
    when 'viewer' then target_access_level = 'members'
    else false
  end;
$$;

create or replace function public.set_document_access_level(
  target_document_id uuid,
  next_access_level text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  current_access_level text;
  actor_role text;
begin
  if next_access_level is null or next_access_level not in ('creator', 'managers', 'members') then
    raise exception 'Invalid document access level';
  end if;

  select workspace_id, access_level
  into target_workspace_id, current_access_level
  from public.documents
  where id = target_document_id
  for update;

  if target_workspace_id is null then
    raise exception 'Document not found';
  end if;

  actor_role := public.workspace_role(target_workspace_id);
  if actor_role = 'owner' then
    null;
  elsif actor_role = 'editor'
    and current_access_level in ('managers', 'members')
    and next_access_level in ('managers', 'members') then
    null;
  else
    raise exception 'Document permission management access required';
  end if;

  update public.documents
  set access_level = next_access_level,
      publication_status = case when next_access_level = 'members' then 'published' else 'draft' end,
      scheduled_publish_at = null,
      published_at = case
        when next_access_level = 'members' then coalesce(published_at, now())
        else null
      end
  where id = target_document_id;
end;
$$;

create or replace function public.transfer_workspace_ownership(
  target_workspace_id uuid,
  next_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner_id uuid;
  target_role text;
begin
  select owner_id
  into current_owner_id
  from public.workspaces
  where id = target_workspace_id
  for update;

  if current_owner_id is null then
    raise exception 'Workspace not found';
  end if;
  if auth.uid() is null or current_owner_id <> auth.uid() then
    raise exception 'Only the workspace creator can transfer ownership';
  end if;
  if next_owner_id = current_owner_id then
    return;
  end if;

  select role
  into target_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = next_owner_id
  for update;

  if target_role is null or target_role not in ('editor', 'viewer') then
    raise exception 'The new creator must already be a workspace member';
  end if;

  update public.workspace_members
  set role = case
    when user_id = current_owner_id then 'editor'
    when user_id = next_owner_id then 'owner'
    else role
  end
  where workspace_id = target_workspace_id
    and user_id in (current_owner_id, next_owner_id);

  update public.workspaces
  set owner_id = next_owner_id
  where id = target_workspace_id;
end;
$$;

create or replace function public.update_document_title(
  target_document_id uuid,
  next_title text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  target_access_level text;
begin
  select workspace_id, access_level
  into target_workspace_id, target_access_level
  from public.documents
  where id = target_document_id;

  if target_workspace_id is null then
    raise exception 'Document not found';
  end if;
  if not public.can_access_document(target_workspace_id, target_access_level)
    or public.workspace_role(target_workspace_id) = 'viewer' then
    raise exception 'Document edit access required';
  end if;
  if char_length(trim(next_title)) < 1 or char_length(trim(next_title)) > 200 then
    raise exception 'Document title must be between 1 and 200 characters';
  end if;

  update public.documents
  set title = trim(next_title)
  where id = target_document_id;
end;
$$;

create or replace function public.delete_document(target_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  target_access_level text;
begin
  select workspace_id, access_level
  into target_workspace_id, target_access_level
  from public.documents
  where id = target_document_id;

  if target_workspace_id is null then
    raise exception 'Document not found';
  end if;
  if not public.can_access_document(target_workspace_id, target_access_level)
    or public.workspace_role(target_workspace_id) = 'viewer' then
    raise exception 'Document edit access required';
  end if;

  delete from public.documents where id = target_document_id;
end;
$$;

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
  current_access_level text;
begin
  select workspace_id, publication_status, access_level
  into target_workspace_id, current_status, current_access_level
  from public.documents
  where id = target_document_id
  for update;

  if target_workspace_id is null then
    raise exception 'Document not found';
  end if;
  if not public.can_access_document(target_workspace_id, current_access_level)
    or public.workspace_role(target_workspace_id) = 'viewer' then
    raise exception 'Document edit access required';
  end if;

  if publication_action = 'publish_now' then
    update public.documents
    set access_level = 'members',
        publication_status = 'published',
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
    set access_level = 'managers',
        publication_status = 'draft',
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

drop policy if exists documents_select_member on public.documents;
create policy documents_select_member on public.documents
for select to authenticated
using (public.can_access_document(workspace_id, access_level));

drop policy if exists documents_insert_editor on public.documents;
create policy documents_insert_editor on public.documents
for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    public.workspace_role(workspace_id) = 'owner'
    or (
      public.workspace_role(workspace_id) = 'editor'
      and access_level in ('managers', 'members')
    )
  )
);

drop policy if exists documents_update_editor on public.documents;
create policy documents_update_editor on public.documents
for update to authenticated
using (
  public.workspace_role(workspace_id) = 'owner'
  or (
    public.workspace_role(workspace_id) = 'editor'
    and access_level in ('managers', 'members')
  )
)
with check (
  public.workspace_role(workspace_id) = 'owner'
  or (
    public.workspace_role(workspace_id) = 'editor'
    and access_level in ('managers', 'members')
  )
);

drop policy if exists documents_delete_editor on public.documents;
create policy documents_delete_editor on public.documents
for delete to authenticated
using (
  public.workspace_role(workspace_id) = 'owner'
  or (
    public.workspace_role(workspace_id) = 'editor'
    and access_level in ('managers', 'members')
  )
);

revoke execute on function public.can_access_document(uuid, text) from public, anon;
revoke execute on function public.set_document_access_level(uuid, text) from public, anon;
revoke execute on function public.transfer_workspace_ownership(uuid, uuid) from public, anon;
grant execute on function public.can_access_document(uuid, text) to authenticated;
grant execute on function public.set_document_access_level(uuid, text) to authenticated;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;

-- Document structure and permissions are changed only through the validated
-- RPCs above. The renderer keeps direct access only to the collaborative body.
revoke insert, update, delete on public.documents from authenticated;
grant select on public.documents to authenticated;
grant update (content) on public.documents to authenticated;

commit;
