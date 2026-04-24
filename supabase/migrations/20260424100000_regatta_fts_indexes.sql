-- Add FTS GIN indexes for regatta search
CREATE INDEX IF NOT EXISTS idx_entries_crew_fts
  ON public.regatta_entries USING gin(to_tsvector('english', coalesce(crew_name, '')));

CREATE INDEX IF NOT EXISTS idx_entries_club_fts
  ON public.regatta_entries USING gin(to_tsvector('english', coalesce(club, '')));

-- idx_entries_athletes already exists as idx_regatta_entries_athletes_gin
-- idx_regattas_name already exists from 20260420000000
-- Add date index if missing
CREATE INDEX IF NOT EXISTS idx_regattas_date ON public.regattas(event_date);
