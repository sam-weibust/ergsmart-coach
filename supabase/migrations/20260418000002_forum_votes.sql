-- Forum upvotes
ALTER TABLE public.forum_topics ADD COLUMN IF NOT EXISTS upvote_count INTEGER DEFAULT 0;
ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS upvote_count INTEGER DEFAULT 0;

CREATE TABLE public.forum_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT one_target CHECK (
    (topic_id IS NOT NULL AND post_id IS NULL) OR
    (topic_id IS NULL AND post_id IS NOT NULL)
  ),
  UNIQUE(user_id, topic_id),
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view votes" ON public.forum_votes FOR SELECT USING (true);
CREATE POLICY "Users can manage their own votes" ON public.forum_votes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Function to update upvote counts
CREATE OR REPLACE FUNCTION update_forum_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.topic_id IS NOT NULL THEN
      UPDATE public.forum_topics SET upvote_count = upvote_count + 1 WHERE id = NEW.topic_id;
    ELSE
      UPDATE public.forum_posts SET upvote_count = upvote_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.topic_id IS NOT NULL THEN
      UPDATE public.forum_topics SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = OLD.topic_id;
    ELSE
      UPDATE public.forum_posts SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_vote_counts
  AFTER INSERT OR DELETE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION update_forum_vote_count();
