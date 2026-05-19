-- Add all test athletes to sam.weibust@gmail.com's team
INSERT INTO public.team_members (team_id, user_id)
SELECT
  t.id AS team_id,
  p.id AS user_id
FROM public.teams t
JOIN auth.users coach ON coach.id = t.coach_id
CROSS JOIN public.profiles p
JOIN auth.users au ON au.id = p.id
WHERE coach.email = 'sam.weibust@gmail.com'
  AND au.email LIKE '%@test.crewsync.com'
ON CONFLICT (team_id, user_id) DO NOTHING;
