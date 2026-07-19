-- Required when “Automatically expose new tables” is disabled.
-- Run this once after 202607190001_workspaces.sql.
begin;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.workspaces to service_role;
grant select, insert, update, delete on public.workspace_members to service_role;
grant select, insert, update, delete on public.documents to service_role;
grant select, insert, update, delete on public.document_states to service_role;

commit;
