-- Create forum categories table
CREATE TABLE public.forum_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT 'MessageCircle',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  post_count INTEGER DEFAULT 0,
  topic_count INTEGER DEFAULT 0,
  last_post_at TIMESTAMP WITH TIME ZONE
);

-- Create forum topics table
CREATE TABLE public.forum_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.forum_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reply_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  last_post_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_post_author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false
);

-- Create forum posts table
CREATE TABLE public.forum_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_edited BOOLEAN DEFAULT false,
  parent_post_id UUID REFERENCES public.forum_posts(id) ON DELETE SET NULL
);

-- Enable RLS on all forum tables
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for forum_categories
CREATE POLICY "Anyone can view categories" 
ON public.forum_categories 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage categories" 
ON public.forum_categories 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for forum_topics
CREATE POLICY "Anyone can view topics" 
ON public.forum_topics 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create topics" 
ON public.forum_topics 
FOR INSERT 
WITH CHECK (auth.uid() = author_id AND auth.uid() IS NOT NULL);

CREATE POLICY "Authors can update their topics" 
ON public.forum_topics 
FOR UPDATE 
USING (auth.uid() = author_id);

CREATE POLICY "Authors and admins can delete topics" 
ON public.forum_topics 
FOR DELETE 
USING (auth.uid() = author_id OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for forum_posts
CREATE POLICY "Anyone can view posts" 
ON public.forum_posts 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create posts" 
ON public.forum_posts 
FOR INSERT 
WITH CHECK (auth.uid() = author_id AND auth.uid() IS NOT NULL);

CREATE POLICY "Authors can update their posts" 
ON public.forum_posts 
FOR UPDATE 
USING (auth.uid() = author_id);

CREATE POLICY "Authors and admins can delete posts" 
ON public.forum_posts 
FOR DELETE 
USING (auth.uid() = author_id OR has_role(auth.uid(), 'admin'::app_role));

-- Create function to update forum counters
CREATE OR REPLACE FUNCTION update_forum_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'forum_topics' THEN
    -- Update category counters when topic is added/removed
    IF TG_OP = 'INSERT' THEN
      UPDATE public.forum_categories 
      SET topic_count = topic_count + 1,
          updated_at = now()
      WHERE id = NEW.category_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.forum_categories 
      SET topic_count = GREATEST(0, topic_count - 1),
          updated_at = now()
      WHERE id = OLD.category_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'forum_posts' THEN
    -- Update topic and category counters when post is added/removed
    IF TG_OP = 'INSERT' THEN
      UPDATE public.forum_topics 
      SET reply_count = reply_count + 1,
          last_post_at = NEW.created_at,
          last_post_author_id = NEW.author_id,
          updated_at = now()
      WHERE id = NEW.topic_id;
      
      UPDATE public.forum_categories 
      SET post_count = post_count + 1,
          last_post_at = NEW.created_at,
          updated_at = now()
      WHERE id = (SELECT category_id FROM public.forum_topics WHERE id = NEW.topic_id);
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.forum_topics 
      SET reply_count = GREATEST(0, reply_count - 1),
          updated_at = now()
      WHERE id = OLD.topic_id;
      
      UPDATE public.forum_categories 
      SET post_count = GREATEST(0, post_count - 1),
          updated_at = now()
      WHERE id = (SELECT category_id FROM public.forum_topics WHERE id = OLD.topic_id);
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for counter updates
CREATE TRIGGER update_topic_counters
  AFTER INSERT OR DELETE ON public.forum_topics
  FOR EACH ROW EXECUTE FUNCTION update_forum_counters();

CREATE TRIGGER update_post_counters
  AFTER INSERT OR DELETE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION update_forum_counters();

-- Create trigger for updated_at columns
CREATE TRIGGER update_forum_categories_updated_at
  BEFORE UPDATE ON public.forum_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_forum_topics_updated_at
  BEFORE UPDATE ON public.forum_topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_forum_posts_updated_at
  BEFORE UPDATE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default forum categories
INSERT INTO public.forum_categories (name, description, color, icon) VALUES
  ('General Discussion', 'General rowing and training discussions', '#3b82f6', 'MessageCircle'),
  ('Training & Technique', 'Share training plans, techniques, and form advice', '#10b981', 'Zap'),
  ('Equipment & Gear', 'Discuss rowing equipment, ergs, and gear recommendations', '#f59e0b', 'Settings'),
  ('Nutrition & Recovery', 'Nutrition tips, meal plans, and recovery strategies', '#ef4444', 'Apple'),
  ('Team & Coaching', 'Team management, coaching tips, and leadership', '#8b5cf6', 'Users'),
  ('Competition & Racing', 'Race results, competition prep, and event discussions', '#f97316', 'Trophy');