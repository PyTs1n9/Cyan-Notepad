begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'User' check (char_length(display_name) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  invite_role text not null default 'editor' check (invite_role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default 'Untitled' check (char_length(title) between 1 and 200),
  content text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_workspace_updated_idx
  on public.documents(workspace_id, updated_at desc);

create table if not exists public.document_states (
  document_id uuid primary key references public.documents(id) on delete cascade,
  state_base64 text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.keep_document_identity()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id <> old.workspace_id or new.created_by <> old.created_by then
    raise exception 'Document workspace and creator cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_keep_identity on public.documents;
create trigger documents_keep_identity
before update on public.documents
for each row execute function public.keep_document_identity();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists document_states_set_updated_at on public.document_states;
create trigger document_states_set_updated_at
before update on public.document_states
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'User'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    nullif(trim(raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'User'
  )
from auth.users
on conflict (id) do nothing;

create or replace function public.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
after insert on public.workspaces
for each row execute function public.add_workspace_owner();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.workspace_role(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.shares_workspace_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
  );
$$;

create or replace function public.join_workspace_by_code(join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace public.workspaces%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into target_workspace
  from public.workspaces
  where invite_code = upper(trim(join_code));

  if target_workspace.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace.id, auth.uid(), target_workspace.invite_role)
  on conflict (workspace_id, user_id) do nothing;

  return target_workspace.id;
end;
$$;

create or replace function public.regenerate_workspace_invite(target_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_code text;
begin
  if public.workspace_role(target_workspace_id) <> 'owner' then
    raise exception 'Only the workspace owner can regenerate invite codes';
  end if;

  next_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  update public.workspaces
  set invite_code = next_code
  where id = target_workspace_id;
  return next_code;
end;
$$;

create or replace function public.leave_workspace(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.workspace_role(target_workspace_id) = 'owner' then
    raise exception 'The owner cannot leave the workspace';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = auth.uid();
end;
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.documents enable row level security;
alter table public.document_states enable row level security;

drop policy if exists profiles_select_shared on public.profiles;
create policy profiles_select_shared on public.profiles
for select to authenticated
using (id = auth.uid() or public.shares_workspace_with(id));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner on public.workspaces
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner on public.workspaces
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces
for delete to authenticated
using (owner_id = auth.uid());

drop policy if exists workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_member on public.workspace_members
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_update_owner on public.workspace_members;
create policy workspace_members_update_owner on public.workspace_members
for update to authenticated
using (public.workspace_role(workspace_id) = 'owner' and role <> 'owner')
with check (public.workspace_role(workspace_id) = 'owner' and role in ('editor', 'viewer'));

drop policy if exists workspace_members_delete_owner on public.workspace_members;
create policy workspace_members_delete_owner on public.workspace_members
for delete to authenticated
using (public.workspace_role(workspace_id) = 'owner' and role <> 'owner');

drop policy if exists documents_select_member on public.documents;
create policy documents_select_member on public.documents
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists documents_insert_editor on public.documents;
create policy documents_insert_editor on public.documents
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.workspace_role(workspace_id) in ('owner', 'editor')
);

drop policy if exists documents_update_editor on public.documents;
create policy documents_update_editor on public.documents
for update to authenticated
using (public.workspace_role(workspace_id) in ('owner', 'editor'))
with check (public.workspace_role(workspace_id) in ('owner', 'editor'));

drop policy if exists documents_delete_editor on public.documents;
create policy documents_delete_editor on public.documents
for delete to authenticated
using (public.workspace_role(workspace_id) in ('owner', 'editor'));

grant usage on schema public to authenticated;
grant usage on schema public to service_role;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
revoke all on public.document_states from anon, authenticated;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.workspaces to service_role;
grant select, insert, update, delete on public.workspace_members to service_role;
grant select, insert, update, delete on public.documents to service_role;
grant select, insert, update, delete on public.document_states to service_role;

revoke execute on function public.is_workspace_member(uuid) from public, anon;
revoke execute on function public.workspace_role(uuid) from public, anon;
revoke execute on function public.shares_workspace_with(uuid) from public, anon;
revoke execute on function public.join_workspace_by_code(text) from public, anon;
revoke execute on function public.regenerate_workspace_invite(uuid) from public, anon;
revoke execute on function public.leave_workspace(uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_workspace_owner() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.keep_document_identity() from public, anon, authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.workspace_role(uuid) to authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;
grant execute on function public.join_workspace_by_code(text) to authenticated;
grant execute on function public.regenerate_workspace_invite(uuid) to authenticated;
grant execute on function public.leave_workspace(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
    ) then
      alter publication supabase_realtime add table public.documents;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_members'
    ) then
      alter publication supabase_realtime add table public.workspace_members;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspaces'
    ) then
      alter publication supabase_realtime add table public.workspaces;
    end if;
  end if;
end;
$$;

commit;
