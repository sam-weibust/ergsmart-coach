-- Add relative-to-2K split support to erg_assignment_pieces
ALTER TABLE public.erg_assignment_pieces
  ADD COLUMN IF NOT EXISTS target_split_type text NOT NULL DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS target_split_offset_seconds integer;
