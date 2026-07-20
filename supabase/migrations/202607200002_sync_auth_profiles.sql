begin;

-- Keep the public workspace profile aligned with personal auth metadata.
create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    display_name = coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'User'
    ),
    avatar_url = case
      when new.raw_user_meta_data ? 'avatar_url'
        then nullif(new.raw_user_meta_data ->> 'avatar_url', '')
      else avatar_url
    end
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_updated on auth.users;
create trigger on_auth_user_profile_updated
after update of raw_user_meta_data, email on auth.users
for each row execute function public.sync_profile_from_auth_user();

-- Repair profiles created before personal settings were connected to workspaces.
update public.profiles as p
set
  display_name = coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    p.display_name
  ),
  avatar_url = case
    when u.raw_user_meta_data ? 'avatar_url'
      then nullif(u.raw_user_meta_data ->> 'avatar_url', '')
    else p.avatar_url
  end
from auth.users as u
where p.id = u.id;

revoke execute on function public.sync_profile_from_auth_user() from public, anon, authenticated;

commit;
