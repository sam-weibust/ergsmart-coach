-- Add date column to ai_insights for per-day caching
ALTER TABLE public.ai_insights ADD COLUMN IF NOT EXISTS date DATE;

-- Backfill existing rows
UPDATE public.ai_insights SET date = CURRENT_DATE WHERE date IS NULL;

-- Make NOT NULL
ALTER TABLE public.ai_insights ALTER COLUMN date SET NOT NULL;

-- Drop old unique constraint
ALTER TABLE public.ai_insights DROP CONSTRAINT IF EXISTS ai_insights_user_id_insight_type_key;

-- New unique constraint: one insight per user per type per date
ALTER TABLE public.ai_insights ADD CONSTRAINT ai_insights_user_id_insight_type_date_key
  UNIQUE (user_id, insight_type, date);

CREATE INDEX IF NOT EXISTS idx_ai_insights_user_date ON ai_insights(user_id, date DESC);
