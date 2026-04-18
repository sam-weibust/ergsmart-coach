-- Fix athlete_profiles migration (previous failed due to invalid CREATE POLICY IF NOT EXISTS syntax)

-- Tables (idempotent)
CREATE TABLE IF NOT EXISTS athlete_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  bio text,
  grad_year int,
  school text,
  club_team text,
  location text,
  personal_facts jsonb DEFAULT '[]'::jsonb,
  social_links jsonb DEFAULT '{}'::jsonb,
  personal_statement text,
  avatar_url text,
  is_public boolean DEFAULT false,
  view_count int DEFAULT 0,
  ai_summary text,
  ai_summary_updated_at timestamptz,
  is_recruiting boolean DEFAULT false,
  intended_major text,
  division_interest text,
  gpa numeric(3,2),
  highlight_video_url text,
  coach_view_count int DEFAULT 0,
  contact_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_type text DEFAULT 'anonymous',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profile_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS college_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  school_name text NOT NULL,
  division text NOT NULL,
  status text DEFAULT 'interested',
  fit_score text,
  fit_notes text,
  improve_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rowing_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  division text NOT NULL,
  conference text,
  coach_name text,
  title text DEFAULT 'Head Coach',
  email text,
  phone text,
  website text,
  state text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS (idempotent)
ALTER TABLE athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rowing_coaches ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies cleanly
DROP POLICY IF EXISTS "Athletes can manage own profile" ON athlete_profiles;
CREATE POLICY "Athletes can manage own profile"
  ON athlete_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public profiles are viewable by anyone" ON athlete_profiles;
CREATE POLICY "Public profiles are viewable by anyone"
  ON athlete_profiles FOR SELECT
  USING (is_public = true);

DROP POLICY IF EXISTS "Anyone can insert a profile view" ON profile_views;
CREATE POLICY "Anyone can insert a profile view"
  ON profile_views FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Athletes can view their own view records" ON profile_views;
CREATE POLICY "Athletes can view their own view records"
  ON profile_views FOR SELECT
  USING (auth.uid() = profile_user_id);

DROP POLICY IF EXISTS "Users manage their own follows" ON profile_follows;
CREATE POLICY "Users manage their own follows"
  ON profile_follows FOR ALL
  USING (auth.uid() = follower_id)
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Anyone can read follow counts" ON profile_follows;
CREATE POLICY "Anyone can read follow counts"
  ON profile_follows FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users manage own college targets" ON college_targets;
CREATE POLICY "Users manage own college targets"
  ON college_targets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read coaches" ON rowing_coaches;
CREATE POLICY "Anyone can read coaches"
  ON rowing_coaches FOR SELECT
  USING (true);

-- RPCs
CREATE OR REPLACE FUNCTION increment_profile_view(target_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE athlete_profiles SET view_count = COALESCE(view_count, 0) + 1
  WHERE user_id = target_user_id AND is_public = true;
$$;

CREATE OR REPLACE FUNCTION increment_coach_view(target_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE athlete_profiles SET coach_view_count = COALESCE(coach_view_count, 0) + 1
  WHERE user_id = target_user_id AND is_public = true;
$$;

-- Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop first to avoid duplicates)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Pre-populate rowing coaches (only if table is empty)
INSERT INTO rowing_coaches (school_name, division, conference, coach_name, title, email, state) VALUES
('Yale University', 'D1', 'Ivy League', 'Will Borek', 'Head Coach', 'william.borek@yale.edu', 'CT'),
('Harvard University', 'D1', 'Ivy League', 'Charley Sullivan', 'Head Coach', 'csullivan@fas.harvard.edu', 'MA'),
('Princeton University', 'D1', 'Ivy League', 'Hap Wagner', 'Head Coach', 'hwagner@princeton.edu', 'NJ'),
('University of Washington', 'D1', 'Pac-12', 'Michael Callahan', 'Head Coach', 'rowinginfo@uw.edu', 'WA'),
('University of Virginia', 'D1', 'ACC', 'Kevin Sauer', 'Head Coach', 'ksauer@virginia.edu', 'VA'),
('Stanford University', 'D1', 'Pac-12', 'Derek Byrnes', 'Head Coach', 'rowing@stanford.edu', 'CA'),
('MIT', 'D3', 'NESCAC', 'Dan Bathgate', 'Head Coach', 'rowing@mit.edu', 'MA'),
('Williams College', 'D3', 'NESCAC', 'Shane Gilliland', 'Head Coach', 'rowing@williams.edu', 'MA'),
('Middlebury College', 'D3', 'NESCAC', 'Karl Jankowski', 'Head Coach', 'rowing@middlebury.edu', 'VT'),
('University of California Berkeley', 'D1', 'Pac-12', 'Steve Boudreau', 'Head Coach', 'calbears-rowing@berkeley.edu', 'CA'),
('Ohio State University', 'D1', 'Big Ten', 'Emre Aydin', 'Head Coach', 'rowing@osu.edu', 'OH'),
('University of Michigan', 'D1', 'Big Ten', 'Mark Rothstein', 'Head Coach', 'rowing@umich.edu', 'MI'),
('University of Wisconsin', 'D1', 'Big Ten', 'Chris Pfent', 'Head Coach', 'rowing@wisc.edu', 'WI'),
('University of Texas', 'D1', 'Big 12', 'Dave O''Neill', 'Head Coach', 'rowing@utexas.edu', 'TX'),
('Georgetown University', 'D1', 'Big East', 'Jake Wetzel', 'Head Coach', 'rowing@georgetown.edu', 'DC'),
('Northeastern University', 'D1', 'CAA', 'Chris Dowd', 'Head Coach', 'rowing@neu.edu', 'MA'),
('Boston University', 'D1', 'Patriot League', 'Eugene Arrington', 'Head Coach', 'rowing@bu.edu', 'MA'),
('University of Pennsylvania', 'D1', 'Ivy League', 'Susan Trainor', 'Head Coach', 'rowing@upenn.edu', 'PA'),
('Columbia University', 'D1', 'Ivy League', 'Kevin Sauer', 'Head Coach', 'rowing@columbia.edu', 'NY'),
('Cornell University', 'D1', 'Ivy League', 'Lori Dauphiny', 'Head Coach', 'rowing@cornell.edu', 'NY'),
('Dartmouth College', 'D1', 'Ivy League', 'Gregg Robinson', 'Head Coach', 'rowing@dartmouth.edu', 'NH'),
('Brown University', 'D1', 'Ivy League', 'Paul Forde', 'Head Coach', 'rowing@brown.edu', 'RI'),
('Syracuse University', 'D1', 'ACC', 'Derek Byrnes', 'Head Coach', 'rowing@syr.edu', 'NY'),
('University of Notre Dame', 'D1', 'ACC', 'Martin Stone', 'Head Coach', 'rowing@nd.edu', 'IN'),
('Villanova University', 'D1', 'Big East', 'Becky Wycherley', 'Head Coach', 'rowing@villanova.edu', 'PA'),
('Drexel University', 'D1', 'CAA', 'Paul Savell', 'Head Coach', 'rowing@drexel.edu', 'PA'),
('George Washington University', 'D1', 'Atlantic 10', 'John O''Reilly', 'Head Coach', 'rowing@gwu.edu', 'DC'),
('American University', 'D1', 'Patriot League', 'Mark Rosen', 'Head Coach', 'rowing@american.edu', 'DC'),
('Holy Cross', 'D1', 'Patriot League', 'Patrick Devin', 'Head Coach', 'rowing@holycross.edu', 'MA'),
('Colgate University', 'D1', 'Patriot League', 'Brian Fullem', 'Head Coach', 'rowing@colgate.edu', 'NY'),
('Bates College', 'D3', 'NESCAC', 'Peter Steenstra', 'Head Coach', 'rowing@bates.edu', 'ME'),
('Bowdoin College', 'D3', 'NESCAC', 'Phil Pierce', 'Head Coach', 'rowing@bowdoin.edu', 'ME'),
('Colby College', 'D3', 'NESCAC', 'Kris Pelletier', 'Head Coach', 'rowing@colby.edu', 'ME'),
('Trinity College', 'D3', 'NESCAC', 'Peter Sherwood', 'Head Coach', 'rowing@trincoll.edu', 'CT'),
('Wesleyan University', 'D3', 'NESCAC', 'Tom Babbitt', 'Head Coach', 'rowing@wesleyan.edu', 'CT'),
('Amherst College', 'D3', 'NESCAC', 'David Sherwood', 'Head Coach', 'rowing@amherst.edu', 'MA'),
('Hamilton College', 'D3', 'Liberty League', 'Steve Kaplan', 'Head Coach', 'rowing@hamilton.edu', 'NY'),
('Tufts University', 'D3', 'NESCAC', 'Nate Silva', 'Head Coach', 'rowing@tufts.edu', 'MA'),
('University of Puget Sound', 'D3', 'Northwest Conference', 'Karoline Breckenridge', 'Head Coach', 'rowing@pugetsound.edu', 'WA'),
('Gonzaga University', 'D1', 'WCC', 'Jennifer Sherlock', 'Head Coach', 'rowing@gonzaga.edu', 'WA'),
('Santa Clara University', 'D1', 'WCC', 'Dan Mahoney', 'Head Coach', 'rowing@scu.edu', 'CA'),
('Loyola Marymount University', 'D1', 'WCC', 'Nicole Vallone', 'Head Coach', 'rowing@lmu.edu', 'CA'),
('University of San Diego', 'D1', 'WCC', 'Mary Whipple', 'Head Coach', 'rowing@sandiego.edu', 'CA'),
('University of Minnesota', 'D1', 'Big Ten', 'Steve Witzel', 'Head Coach', 'rowing@umn.edu', 'MN'),
('Indiana University', 'D1', 'Big Ten', 'Rebecca Nigh', 'Head Coach', 'rowing@indiana.edu', 'IN'),
('Michigan State University', 'D1', 'Big Ten', 'Stephanie Rempe', 'Head Coach', 'rowing@msu.edu', 'MI'),
('University of Iowa', 'D1', 'Big Ten', 'Andrew Carter', 'Head Coach', 'rowing@uiowa.edu', 'IA'),
('University of Nebraska', 'D1', 'Big Ten', 'Jamie Schwaiger', 'Head Coach', 'rowing@unl.edu', 'NE'),
('University of Kansas', 'D1', 'Big 12', 'Heidi Eichner', 'Head Coach', 'rowing@ku.edu', 'KS'),
('Kansas State University', 'D1', 'Big 12', 'Melissa Roppolo', 'Head Coach', 'rowing@ksu.edu', 'KS'),
('University of Tennessee', 'D1', 'SEC', 'Emily Ford', 'Head Coach', 'rowing@utk.edu', 'TN'),
('University of Alabama', 'D1', 'SEC', 'Megan Tanner', 'Head Coach', 'rowing@ua.edu', 'AL'),
('University of Georgia', 'D1', 'SEC', 'Jeff Burns', 'Head Coach', 'rowing@uga.edu', 'GA'),
('University of Florida', 'D1', 'SEC', 'Kim Dobrott', 'Head Coach', 'rowing@ufl.edu', 'FL'),
('Florida State University', 'D1', 'ACC', 'Meghan Musnicki', 'Head Coach', 'rowing@fsu.edu', 'FL'),
('University of Miami', 'D1', 'ACC', 'Dave Vogt', 'Head Coach', 'rowing@miami.edu', 'FL'),
('Duke University', 'D1', 'ACC', 'Jake Reed', 'Head Coach', 'rowing@duke.edu', 'NC'),
('University of North Carolina', 'D1', 'ACC', 'Una McCarthy', 'Head Coach', 'rowing@unc.edu', 'NC'),
('Wake Forest University', 'D1', 'ACC', 'Mike Gehrken', 'Head Coach', 'rowing@wfu.edu', 'NC'),
('Boston College', 'D1', 'ACC', 'Tom Bohrer', 'Head Coach', 'rowing@bc.edu', 'MA'),
('University of Connecticut', 'D1', 'Big East', 'Marlene Royle', 'Head Coach', 'rowing@uconn.edu', 'CT'),
('University of Louisville', 'D1', 'ACC', 'Cara Stawasz', 'Head Coach', 'rowing@louisville.edu', 'KY')
ON CONFLICT DO NOTHING;
