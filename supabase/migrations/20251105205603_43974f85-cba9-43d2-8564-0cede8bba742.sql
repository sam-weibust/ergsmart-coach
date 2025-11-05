-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('user', 'coach', 'admin');

-- User roles table (for coaches/admins)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- User goals table
CREATE TABLE public.user_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_2k_time INTERVAL,
  goal_2k_time INTERVAL,
  current_5k_time INTERVAL,
  goal_5k_time INTERVAL,
  current_6k_time INTERVAL,
  goal_6k_time INTERVAL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

-- Erg workouts table
CREATE TABLE public.erg_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  workout_date DATE NOT NULL DEFAULT CURRENT_DATE,
  workout_type TEXT NOT NULL,
  distance INTEGER,
  duration INTERVAL,
  avg_split INTERVAL,
  avg_heart_rate INTEGER,
  calories INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.erg_workouts ENABLE ROW LEVEL SECURITY;

-- Strength workouts table
CREATE TABLE public.strength_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  workout_date DATE NOT NULL DEFAULT CURRENT_DATE,
  exercise TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.strength_workouts ENABLE ROW LEVEL SECURITY;

-- Meal plans table
CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type TEXT NOT NULL,
  description TEXT NOT NULL,
  calories INTEGER,
  protein NUMERIC,
  carbs NUMERIC,
  fats NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

-- Friendships table
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Workout shares table
CREATE TABLE public.workout_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erg_workout_id UUID REFERENCES erg_workouts(id) ON DELETE CASCADE,
  strength_workout_id UUID REFERENCES strength_workouts(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  shared_with UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (
    (erg_workout_id IS NOT NULL AND strength_workout_id IS NULL) OR
    (erg_workout_id IS NULL AND strength_workout_id IS NOT NULL)
  )
);

ALTER TABLE public.workout_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_goals
CREATE POLICY "Users can view their own goals"
  ON public.user_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goals"
  ON public.user_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
  ON public.user_goals FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for erg_workouts
CREATE POLICY "Users can view their own erg workouts"
  ON public.erg_workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared erg workouts"
  ON public.erg_workouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_shares
      WHERE erg_workout_id = erg_workouts.id
      AND shared_with = auth.uid()
    )
  );

CREATE POLICY "Coaches can view their athletes' erg workouts"
  ON public.erg_workouts FOR SELECT
  USING (
    public.has_role(auth.uid(), 'coach') AND
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE friend_id = auth.uid()
      AND user_id = erg_workouts.user_id
      AND status = 'accepted'
    )
  );

CREATE POLICY "Users can insert their own erg workouts"
  ON public.erg_workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own erg workouts"
  ON public.erg_workouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own erg workouts"
  ON public.erg_workouts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for strength_workouts
CREATE POLICY "Users can view their own strength workouts"
  ON public.strength_workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared strength workouts"
  ON public.strength_workouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_shares
      WHERE strength_workout_id = strength_workouts.id
      AND shared_with = auth.uid()
    )
  );

CREATE POLICY "Coaches can view their athletes' strength workouts"
  ON public.strength_workouts FOR SELECT
  USING (
    public.has_role(auth.uid(), 'coach') AND
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE friend_id = auth.uid()
      AND user_id = strength_workouts.user_id
      AND status = 'accepted'
    )
  );

CREATE POLICY "Users can insert their own strength workouts"
  ON public.strength_workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strength workouts"
  ON public.strength_workouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strength workouts"
  ON public.strength_workouts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for meal_plans
CREATE POLICY "Users can view their own meal plans"
  ON public.meal_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meal plans"
  ON public.meal_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meal plans"
  ON public.meal_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meal plans"
  ON public.meal_plans FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for friendships
CREATE POLICY "Users can view their own friendships"
  ON public.friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friendship requests"
  ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can accept/reject friendship requests"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = friend_id);

CREATE POLICY "Users can delete their own friendships"
  ON public.friendships FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- RLS Policies for workout_shares
CREATE POLICY "Users can view shares involving them"
  ON public.workout_shares FOR SELECT
  USING (auth.uid() = shared_by OR auth.uid() = shared_with);

CREATE POLICY "Users can create shares for their workouts"
  ON public.workout_shares FOR INSERT
  WITH CHECK (auth.uid() = shared_by);

CREATE POLICY "Users can delete their own shares"
  ON public.workout_shares FOR DELETE
  USING (auth.uid() = shared_by);

-- Triggers for updated_at
CREATE TRIGGER update_user_goals_updated_at
  BEFORE UPDATE ON public.user_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_erg_workouts_user_date ON public.erg_workouts(user_id, workout_date DESC);
CREATE INDEX idx_strength_workouts_user_date ON public.strength_workouts(user_id, workout_date DESC);
CREATE INDEX idx_meal_plans_user_date ON public.meal_plans(user_id, meal_date DESC);
CREATE INDEX idx_friendships_user ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend ON public.friendships(friend_id);