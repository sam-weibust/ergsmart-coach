-- Head-to-Head Racing Tables

CREATE TABLE public.race_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  distance INTEGER NOT NULL DEFAULT 2000,
  status TEXT NOT NULL DEFAULT 'lobby',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.race_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.race_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Athlete',
  erg_score_2k INTEGER,
  current_split INTEGER,
  current_spm INTEGER,
  current_distance REAL DEFAULT 0,
  current_watts INTEGER,
  elapsed_time INTEGER DEFAULT 0,
  finished_at TIMESTAMPTZ,
  finish_time INTEGER,
  avg_split INTEGER,
  avg_spm INTEGER,
  stroke_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(room_id, user_id)
);

CREATE TABLE public.race_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT 'Athlete',
  erg_score_2k INTEGER,
  queued_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.race_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can read race rooms" ON public.race_rooms FOR SELECT USING (true);
CREATE POLICY "Auth users can create race rooms" ON public.race_rooms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Creator can update race room" ON public.race_rooms FOR UPDATE USING (creator_id = auth.uid());

CREATE POLICY "Anyone can read race participants" ON public.race_participants FOR SELECT USING (true);
CREATE POLICY "Auth users can join races" ON public.race_participants FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own participant row" ON public.race_participants FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Anyone can read race queue" ON public.race_queue FOR SELECT USING (true);
CREATE POLICY "Auth users can join queue" ON public.race_queue FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can leave queue" ON public.race_queue FOR DELETE USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_queue;
