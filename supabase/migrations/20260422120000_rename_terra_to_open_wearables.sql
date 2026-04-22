-- Rename terra_user_id to open_wearables_user_id
ALTER TABLE public.wearable_connections
  RENAME COLUMN terra_user_id TO open_wearables_user_id;
