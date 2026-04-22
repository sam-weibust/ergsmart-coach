-- Fix: Whoop tables referenced public.profiles(id) which blocks users who
-- haven't completed onboarding (no profiles row). Re-point FKs to auth.users(id).

-- whoop_connections
ALTER TABLE public.whoop_connections
  DROP CONSTRAINT IF EXISTS whoop_connections_user_id_fkey;
ALTER TABLE public.whoop_connections
  ADD CONSTRAINT whoop_connections_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- whoop_recovery
ALTER TABLE public.whoop_recovery
  DROP CONSTRAINT IF EXISTS whoop_recovery_user_id_fkey;
ALTER TABLE public.whoop_recovery
  ADD CONSTRAINT whoop_recovery_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- whoop_sleep
ALTER TABLE public.whoop_sleep
  DROP CONSTRAINT IF EXISTS whoop_sleep_user_id_fkey;
ALTER TABLE public.whoop_sleep
  ADD CONSTRAINT whoop_sleep_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- whoop_strain
ALTER TABLE public.whoop_strain
  DROP CONSTRAINT IF EXISTS whoop_strain_user_id_fkey;
ALTER TABLE public.whoop_strain
  ADD CONSTRAINT whoop_strain_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- whoop_workouts
ALTER TABLE public.whoop_workouts
  DROP CONSTRAINT IF EXISTS whoop_workouts_user_id_fkey;
ALTER TABLE public.whoop_workouts
  ADD CONSTRAINT whoop_workouts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
