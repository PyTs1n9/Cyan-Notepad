-- Enable realtime metadata refresh for workspace name/invite-role changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'workspaces'
     ) then
    alter publication supabase_realtime add table public.workspaces;
  end if;
end;
$$;
