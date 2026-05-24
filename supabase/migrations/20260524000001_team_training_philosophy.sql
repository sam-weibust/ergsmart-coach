-- Team-specific training philosophy extracted from coach uploads
CREATE TABLE IF NOT EXISTS public.team_training_philosophy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id),
  philosophy jsonb,
  raw_file_url text,
  summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(team_id)
);

ALTER TABLE public.team_training_philosophy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage team philosophy"
  ON public.team_training_philosophy
  USING (
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_training_philosophy.team_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (coach_id = auth.uid());

-- Storage bucket for training files (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-files',
  'training-files',
  false,
  10485760,
  ARRAY['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload training files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'training-files');

CREATE POLICY "Authenticated users can read training files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'training-files');

CREATE POLICY "Users can delete own training files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'training-files' AND auth.uid()::text = (storage.foldername(name))[1]);
