-- Create storage bucket for forum images
INSERT INTO storage.buckets (id, name, public) VALUES ('forum-images', 'forum-images', true);

-- Add images column to forum_posts table
ALTER TABLE public.forum_posts ADD COLUMN images TEXT[];

-- Create storage policies for forum images
CREATE POLICY "Anyone can view forum images"
ON storage.objects FOR SELECT 
USING (bucket_id = 'forum-images');

CREATE POLICY "Authenticated users can upload forum images"
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'forum-images' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own forum images"
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'forum-images' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);