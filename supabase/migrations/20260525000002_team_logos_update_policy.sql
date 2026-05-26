-- Add UPDATE policy for team-logos bucket (required for upsert/overwrite uploads)
-- The INSERT-only policy was blocking re-uploads when a logo already existed

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'coaches_update_team_logos'
  ) THEN
    CREATE POLICY "coaches_update_team_logos"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'team-logos')
      WITH CHECK (bucket_id = 'team-logos');
  END IF;
END $$;

-- Ensure logo_url column exists on teams table
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS logo_url text;
