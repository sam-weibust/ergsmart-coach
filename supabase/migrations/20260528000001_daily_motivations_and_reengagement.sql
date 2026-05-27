-- Daily motivation messages
CREATE TABLE IF NOT EXISTS daily_motivations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  category text NOT NULL CHECK (category IN ('general', 'base_building', 'peak', 'taper', 'race_day', 'testing', 'off_season')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_motivations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read daily motivations" ON daily_motivations FOR SELECT USING (true);

-- Seed general (20)
INSERT INTO daily_motivations (message, category) VALUES
  ('The erg does not lie. Every meter counts.', 'general'),
  ('Pain is temporary, splits are forever.', 'general'),
  ('You are one workout away from a better 2k.', 'general'),
  ('Champions are built in the off season.', 'general'),
  ('The only bad workout is the one you skipped.', 'general'),
  ('Consistency beats intensity every time.', 'general'),
  ('Your future self will thank you for rowing today.', 'general'),
  ('Every stroke is a choice. Make it count.', 'general'),
  ('The boat moves when everyone commits.', 'general'),
  ('Rows won are rows earned.', 'general'),
  ('Discipline is choosing what you want most over what you want now.', 'general'),
  ('The water does not care how you feel. Show up anyway.', 'general'),
  ('Trust the process. The gains are in the boring work.', 'general'),
  ('Row like someone is always watching your splits.', 'general'),
  ('Technique first, intensity second.', 'general'),
  ('You cannot fake the erg.', 'general'),
  ('There is no shortcut to the finish line.', 'general'),
  ('Strong legs, strong back, strong mind.', 'general'),
  ('The meters you skip today are the ones you miss on race day.', 'general'),
  ('One more piece. Always one more piece.', 'general');

-- Seed base_building (10)
INSERT INTO daily_motivations (message, category) VALUES
  ('This is where fitness is built. Embrace the long slow meters.', 'base_building'),
  ('UT2 today is TR2 tomorrow.', 'base_building'),
  ('Base building is boring. Do it anyway.', 'base_building'),
  ('The aerobic engine takes months to build. Start now.', 'base_building'),
  ('Every long steady piece is an investment in your race day.', 'base_building'),
  ('The meters you row today are the fitness you have in September.', 'base_building'),
  ('Build the base wide and the peak will be high.', 'base_building'),
  ('Slow down to go fast later. Trust the zone.', 'base_building'),
  ('Your aerobic base is your foundation. Pour the concrete now.', 'base_building'),
  ('An hour at UT2 is worth ten minutes of regret on race day.', 'base_building');

-- Seed peak (10)
INSERT INTO daily_motivations (message, category) VALUES
  ('This is what the base was for. Now we sharpen it.', 'peak'),
  ('The hard weeks are the ones that matter most.', 'peak'),
  ('You trained for this. Now execute.', 'peak'),
  ('Pain in practice means confidence in the race.', 'peak'),
  ('The suffering is almost over. Race day is close.', 'peak'),
  ('Every hard piece now means one less doubt on race day.', 'peak'),
  ('This is the sharpening phase. Get sharp.', 'peak'),
  ('You have done the work. Now prove it in pieces.', 'peak'),
  ('The body adapts to what you demand of it. Demand more.', 'peak'),
  ('Hard sessions build tough athletes. Lean into the work.', 'peak');

-- Seed taper (10)
INSERT INTO daily_motivations (message, category) VALUES
  ('The work is done. Trust it.', 'taper'),
  ('Taper is not laziness — it is preparation.', 'taper'),
  ('Your body is loading for race day. Let it.', 'taper'),
  ('Resist the urge to do more. Less is more this week.', 'taper'),
  ('The fitness is locked in. Now recover.', 'taper'),
  ('You are stronger than you were last week. The rest is part of the plan.', 'taper'),
  ('Stay sharp, stay fresh. Race day is coming.', 'taper'),
  ('The hay is in the barn. Rest and race.', 'taper'),
  ('Your best race will come from your most recovered body.', 'taper'),
  ('Trust your training. You have prepared for this moment.', 'taper');

-- Seed race_day (5)
INSERT INTO daily_motivations (message, category) VALUES
  ('Today is what everything was for.', 'race_day'),
  ('Race your race. Trust your training. Empty the tank.', 'race_day'),
  ('Leave nothing on the water.', 'race_day'),
  ('This is your moment. Make it count.', 'race_day'),
  ('The race belongs to the prepared.', 'race_day');

-- Seed testing (5)
INSERT INTO daily_motivations (message, category) VALUES
  ('The erg test is a conversation between you and the machine. Speak clearly.', 'testing'),
  ('Pace smart, finish hard.', 'testing'),
  ('Your 2k is a reflection of every meter you rowed to get here.', 'testing'),
  ('Negative split wins. The second 1k is where races are won.', 'testing'),
  ('The test does not define you. Your response to it does.', 'testing');

-- Re-engagement notification history
CREATE TABLE IF NOT EXISTS reengagement_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now(),
  days_inactive integer NOT NULL,
  message_variant integer NOT NULL DEFAULT 1
);

ALTER TABLE reengagement_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for reengagement_notifications"
  ON reengagement_notifications FOR ALL
  USING (false);

CREATE INDEX IF NOT EXISTS idx_reengagement_notifications_user_sent
  ON reengagement_notifications (user_id, sent_at);
