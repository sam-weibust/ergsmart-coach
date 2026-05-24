-- Remove all coach name references from default_training_philosophy
UPDATE public.default_training_philosophy
SET
  name = 'CrewSync Default Training Methodology',
  description = 'Default training philosophy for competitive rowing programs. A periodized competitive rowing methodology used as the CrewSync system default.'
WHERE is_default = true;
