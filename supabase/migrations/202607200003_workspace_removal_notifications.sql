begin;

create table if not exists public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null,
  workspace_name text not null,
  type text not null check (type in ('member_removed')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists workspace_notifications_user_unread_idx
on public.workspace_notifications (user_id, created_at)
where read_at is null;

alter table public.workspace_notifications enable row level security;

drop policy if exists workspace_notifications_select_self on public.workspace_notifications;
create policy workspace_notifications_select_self on public.workspace_notifications
for select to authenticated
using (user_id = auth.uid());

drop policy if exists workspace_notifications_update_self on public.workspace_notifications;
create policy workspace_notifications_update_self on public.workspace_notifications
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select on public.workspace_notifications to authenticated;
grant update (read_at) on public.workspace_notifications to authenticated;
grant select, insert, update, delete on public.workspace_notifications to service_role;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_name text;
  removed_user_id uuid;
begin
  if public.workspace_role(target_workspace_id) <> 'owner' then
    raise exception 'Only the workspace owner can remove members';
  end if;

  select name into target_workspace_name
  from public.workspaces
  where id = target_workspace_id;

  if target_workspace_name is null then
    raise exception 'Workspace not found';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id
    and role <> 'owner'
  returning user_id into removed_user_id;

  if removed_user_id is null then
    raise exception 'Workspace member not found';
  end if;

  insert into public.workspace_notifications (
    user_id,
    workspace_id,
    workspace_name,
    type
  ) values (
    target_user_id,
    target_workspace_id,
    target_workspace_name,
    'member_removed'
  );

end;
$$;

revoke execute on function public.remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'workspace_notifications'
     ) then
    alter publication supabase_realtime add table public.workspace_notifications;
  end if;
end;
$$;

commit;
