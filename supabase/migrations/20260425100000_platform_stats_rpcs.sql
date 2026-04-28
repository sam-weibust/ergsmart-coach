-- RPC: total meters from erg_workouts
CREATE OR REPLACE FUNCTION get_total_meters()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(SUM(distance), 0)::bigint FROM erg_workouts WHERE distance IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_total_meters() TO anon, authenticated;

-- RPC: average of each user's best 2k time (all sources)
CREATE OR REPLACE FUNCTION get_avg_verified_2k()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH best_per_user AS (
    SELECT user_id, MIN(time_seconds) AS best
    FROM erg_scores
    WHERE
      test_type = '2k'
      AND time_seconds IS NOT NULL
      AND time_seconds > 0
    GROUP BY user_id
  )
  SELECT
    CASE WHEN COUNT(*) >= 3 THEN ROUND(AVG(best)) ELSE NULL END
  FROM best_per_user;
$$;

GRANT EXECUTE ON FUNCTION get_avg_verified_2k() TO anon, authenticated;
