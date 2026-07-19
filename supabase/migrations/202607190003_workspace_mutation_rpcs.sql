begin;

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(workspace_name)) < 1 or char_length(trim(workspace_name)) > 80 then
    raise exception 'Workspace name must be between 1 and 80 characters';
  end if;

  insert into public.workspaces (name, owner_id)
  values (trim(workspace_name), auth.uid())
  returning id into new_workspace_id;
  return new_workspace_id;
end;
$$;

create or replace function public.update_workspace(
  target_workspace_id uuid,
  next_name text default null,
  next_invite_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.workspace_role(target_workspace_id) <> 'owner' then
    raise exception 'Only the workspace owner can update it';
  end if;
  if next_name is not null and (char_length(trim(next_name)) < 1 or char_length(trim(next_name)) > 80) then
    raise exception 'Workspace name must be between 1 and 80 characters';
  end if;
  if next_invite_role is not null and next_invite_role not in ('editor', 'viewer') then
    raise exception 'Invalid invite role';
  end if;

  update public.workspaces
  set
    name = coalesce(trim(next_name), name),
    invite_role = coalesce(next_invite_role, invite_role)
  where id = target_workspace_id;
end;
$$;

create or replace function public.delete_workspace(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.workspace_role(target_workspace_id) <> 'owner' then
    raise exception 'Only the workspace owner can delete it';
  end if;
  delete from public.workspaces where id = target_workspace_id;
end;
$$;

create or replace function public.update_workspace_member_role(
  target_workspace_id uuid,
  target_user_id uuid,
  next_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.workspace_role(target_workspace_id) <> 'owner' then
    raise exception 'Only the workspace owner can change roles';
  end if;
  if next_role not in ('editor', 'viewer') then
    raise exception 'Invalid member role';
  end if;

  update public.workspace_members
  set role = next_role
  where workspace_id = target_workspace_id
    and user_id = target_user_id
    and role <> 'owner';
end;
$$;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.workspace_role(target_workspace_id) <> 'owner' then
    raise exception 'Only the workspace owner can remove members';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id
    and role <> 'owner';
end;
$$;

create or replace function public.create_document(
  target_workspace_id uuid,
  document_title text,
  document_content text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_document_id uuid;
begin
  if public.workspace_role(target_workspace_id) not in ('owner', 'editor') then
    raise exception 'Editor access required';
  end if;
  if char_length(trim(document_title)) < 1 or char_length(trim(document_title)) > 200 then
    raise exception 'Document title must be between 1 and 200 characters';
  end if;

  insert into public.documents (workspace_id, title, content, created_by)
  values (target_workspace_id, trim(document_title), coalesce(document_content, ''), auth.uid())
  returning id into new_document_id;
  return new_document_id;
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
begin
  select workspace_id into target_workspace_id
  from public.documents
  where id = target_document_id;
  if public.workspace_role(target_workspace_id) not in ('owner', 'editor') then
    raise exception 'Editor access required';
  end if;
  if char_length(trim(next_title)) < 1 or char_length(trim(next_title)) > 200 then
    raise exception 'Document title must be between 1 and 200 characters';
  end if;
  update public.documents set title = trim(next_title) where id = target_document_id;
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
begin
  select workspace_id into target_workspace_id
  from public.documents
  where id = target_document_id;
  if public.workspace_role(target_workspace_id) not in ('owner', 'editor') then
    raise exception 'Editor access required';
  end if;
  delete from public.documents where id = target_document_id;
end;
$$;

revoke execute on function public.create_workspace(text) from public, anon;
revoke execute on function public.update_workspace(uuid, text, text) from public, anon;
revoke execute on function public.delete_workspace(uuid) from public, anon;
revoke execute on function public.update_workspace_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_workspace_member(uuid, uuid) from public, anon;
revoke execute on function public.create_document(uuid, text, text) from public, anon;
revoke execute on function public.update_document_title(uuid, text) from public, anon;
revoke execute on function public.delete_document(uuid) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.update_workspace(uuid, text, text) to authenticated;
grant execute on function public.delete_workspace(uuid) to authenticated;
grant execute on function public.update_workspace_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.create_document(uuid, text, text) to authenticated;
grant execute on function public.update_document_title(uuid, text) to authenticated;
grant execute on function public.delete_document(uuid) to authenticated;

commit;
