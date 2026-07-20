# Supabase setup

1. Open the project SQL Editor in the Supabase dashboard.
2. Paste and run `migrations/202607190001_workspaces.sql` once.
3. Paste and run `migrations/202607190002_service_role_grants.sql` once.
4. Paste and run `migrations/202607190003_workspace_mutation_rpcs.sql` once.
5. Paste and run `migrations/202607190004_realtime_workspaces.sql` once.
6. Paste and run `migrations/202607200001_realtime_profiles.sql` once.
7. Paste and run `migrations/202607200002_sync_auth_profiles.sql` once.
8. Paste and run `migrations/202607200003_workspace_removal_notifications.sql` once.
9. Confirm that `profiles`, `workspaces`, `workspace_members`, `workspace_notifications`, `documents`, and `document_states` exist.
10. Never expose the `service_role` key to the desktop client. It is only used by the collaboration server.

The migrations enable RLS and Realtime profile refreshes, add explicit grants for projects with “Automatically expose new tables” disabled, and create invitation RPC functions.
