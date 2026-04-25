-- Add wants_launch_notification flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wants_launch_notification BOOLEAN NOT NULL DEFAULT false;

-- Enable pg_net extension if not already enabled (required for HTTP calls from triggers)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function: call send-welcome-email edge function after a new profile is created
-- (public.profiles is inserted immediately after auth.users via the existing handle_new_user trigger)
CREATE OR REPLACE FUNCTION public.trigger_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, net
AS $$
DECLARE
  edge_fn_url TEXT := 'https://clmesnkdwohtvduzdgex.supabase.co/functions/v1/send-welcome-email';
  anon_key    TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsbWVzbmtkd29odHZkdXpkZ2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDg2MDQsImV4cCI6MjA5MTE4NDYwNH0.mShxwGOOkmxneL5l4HPo_gC4hMuCnLFB_SZw_xsz7No';
BEGIN
  -- Fire and forget — do not block the INSERT if the email fails
  PERFORM net.http_post(
    url     := edge_fn_url,
    body    := jsonb_build_object(
                 'user_id',   NEW.id::text,
                 'email',     NEW.email,
                 'full_name', NEW.full_name
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || anon_key
               )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Swallow errors so signup never fails due to email issues
  RAISE WARNING 'trigger_welcome_email failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger fires after a new profile row is inserted
DROP TRIGGER IF EXISTS on_profile_created_send_welcome ON public.profiles;
CREATE TRIGGER on_profile_created_send_welcome
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_welcome_email();
