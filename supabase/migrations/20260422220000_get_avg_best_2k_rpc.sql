-- Returns the average of each user's personal-best 2k time (in seconds),
-- or NULL if fewer than 3 users have a recorded 2k.
create or replace function get_avg_best_2k()
returns numeric
language sql
security definer
stable
as $$
  with best_per_user as (
    select user_id, min(two_k_seconds) as best
    from combine_entries
    where two_k_seconds is not null and two_k_seconds > 0
    group by user_id
  )
  select
    case when count(*) >= 3 then round(avg(best)) else null end
  from best_per_user;
$$;

grant execute on function get_avg_best_2k() to anon, authenticated;
