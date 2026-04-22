-- RPC function to count all auth users (not just those with a profile row).
-- Called from the landing page stats so the count reflects every sign-up.
create or replace function get_user_count()
returns bigint
language sql
security definer
stable
as $$
  select count(*) from auth.users;
$$;

grant execute on function get_user_count() to anon, authenticated;
