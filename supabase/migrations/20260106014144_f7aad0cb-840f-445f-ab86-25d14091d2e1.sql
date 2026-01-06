-- Create storage bucket for workout plan uploads (PDF/PNG)
INSERT INTO storage.buckets (id, name, public)
VALUES ('workout-plans', 'workout-plans', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload workout plans"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'workout-plans' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to read all workout plans (for shared plans)
CREATE POLICY "Anyone can read workout plans"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'workout-plans');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete their workout plans"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'workout-plans'
  AND auth.uid()::text = (storage.foldername(name))[1]
);