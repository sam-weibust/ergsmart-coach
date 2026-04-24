-- Fix all seed regattas: set status based on actual event_date (not hardcoded)
UPDATE public.regattas
SET status = CASE
  WHEN event_date < CURRENT_DATE THEN 'completed'
  ELSE 'upcoming'
END
WHERE crewtimer_id LIKE 'seed-%';

-- Insert completed regattas Sep 2025 – Apr 24 2026 so Recent tab has meaningful data.
-- ON CONFLICT DO NOTHING makes this safe to re-run.
INSERT INTO public.regattas (crewtimer_id, name, event_date, end_date, location, host_club, event_type, status, fetched_at, cached_at)
VALUES
  -- September 2025
  ('seed-tail-fox-2025',        'Tail of the Fox Regatta 2025',                 '2025-09-20', '2025-09-21', 'Auburn, AL',             'Auburn Rowing Association',           'head_race', 'completed', NOW(), NOW()),
  ('seed-charles-river-2025',   'Charles River Sprints 2025',                   '2025-09-27', '2025-09-28', 'Cambridge, MA',           'Charles River Rowing Association',    'sprint',    'completed', NOW(), NOW()),
  -- October 2025
  ('seed-hopo-2025',            'Head of the Ohio 2025',                        '2025-10-04', '2025-10-05', 'Pittsburgh, PA',          'Three Rivers Rowing Association',     'head_race', 'completed', NOW(), NOW()),
  ('seed-hotf-2025',            'Head of the Fish 2025',                        '2025-10-11', '2025-10-12', 'Saratoga Springs, NY',    'Saratoga Rowing Association',         'head_race', 'completed', NOW(), NOW()),
  ('seed-hotc-2025',            'Head of the Charles Regatta 2025',             '2025-10-18', '2025-10-19', 'Boston, MA',              'Cambridge Boat Club',                 'head_race', 'completed', NOW(), NOW()),
  ('seed-hosc-2025',            'Head of the Schuylkill 2025',                  '2025-10-25', '2025-10-26', 'Philadelphia, PA',        'Schuylkill Navy',                     'head_race', 'completed', NOW(), NOW()),
  ('seed-hof-2025',             'Head of the Farmington 2025',                  '2025-10-25', '2025-10-26', 'Farmington, CT',          'Farmington River Rowing Association', 'head_race', 'completed', NOW(), NOW()),
  -- November 2025
  ('seed-hoct-2025',            'Head of the Connecticut 2025',                 '2025-11-01', '2025-11-02', 'Hartford, CT',            'Connecticut Rowing Association',      'head_race', 'completed', NOW(), NOW()),
  ('seed-hooh-2025',            'Head of the Hooch 2025',                       '2025-11-08', '2025-11-09', 'Chattanooga, TN',         'Chattanooga Rowing Center',           'head_race', 'completed', NOW(), NOW()),
  ('seed-horiv-2025',           'Head of the Rivanna 2025',                     '2025-11-15', '2025-11-16', 'Charlottesville, VA',     'Rivanna Rowing Club',                 'head_race', 'completed', NOW(), NOW()),
  ('seed-hotampa-2025',         'Head of the Tampa 2025',                       '2025-11-22', '2025-11-23', 'Tampa, FL',               'Tampa Rowing Club',                   'head_race', 'completed', NOW(), NOW()),
  -- December 2025
  ('seed-frosty-2025',          'Frostbite Regatta 2025',                       '2025-12-06', '2025-12-07', 'Rancho Cordova, CA',      'Sacramento State Aquatic Center',     'sprint',    'completed', NOW(), NOW()),
  -- January 2026
  ('seed-florida-winter-2026',  'Florida Rowing Center Winter Invitational',    '2026-01-17', '2026-01-18', 'Gainesville, FL',         'Florida Rowing Center',               'sprint',    'completed', NOW(), NOW()),
  ('seed-mlk-invite-2026',      'MLK Invitational Regatta 2026',                '2026-01-17', '2026-01-18', 'Rancho Cordova, CA',      'Sacramento State Aquatic Center',     'sprint',    'completed', NOW(), NOW()),
  -- February 2026
  ('seed-snake-river-2026',     'Snake River Rowing Invitational 2026',         '2026-02-07', '2026-02-08', 'Nampa, ID',               'Treasure Valley Rowing Club',         'sprint',    'completed', NOW(), NOW()),
  ('seed-nac-winter-2026',      'Newport Aquatic Center Winter Classic 2026',   '2026-02-14', '2026-02-15', 'Newport Beach, CA',       'Newport Aquatic Center',              'sprint',    'completed', NOW(), NOW()),
  -- March 2026
  ('seed-swcrc-2026',           'Southwest Collegiate Rowing Championship',     '2026-03-07', '2026-03-08', 'Rancho Cordova, CA',      'SWCRC',                               'sprint',    'completed', NOW(), NOW()),
  ('seed-textile-2026',         'Textile River Regatta 2026',                   '2026-03-14', '2026-03-15', 'Lowell, MA',              'Community Rowing Inc',                'sprint',    'completed', NOW(), NOW()),
  ('seed-dogwood-2026',         'Dogwood Regatta 2026',                         '2026-03-21', '2026-03-22', 'Augusta, GA',             'Augusta Rowing Club',                 'sprint',    'completed', NOW(), NOW()),
  -- April 2026 (before Apr 24)
  ('seed-delval-2026',          'Delaware Valley Regatta 2026',                 '2026-04-05', '2026-04-06', 'Hamilton, NJ',            'Mercer County Rowing Association',    'sprint',    'completed', NOW(), NOW()),
  ('seed-hoc-occoquan-2026',    'Head of the Occoquan 2026',                    '2026-04-11', '2026-04-12', 'Occoquan, VA',            'Virginia Scholastic Rowing Assoc',    'head_race', 'completed', NOW(), NOW()),
  ('seed-green-lake-2026',      'Green Lake Spring Regatta 2026',               '2026-04-18', '2026-04-19', 'Seattle, WA',             'Lake Union Dragonboat Club',          'sprint',    'completed', NOW(), NOW()),
  ('seed-va-sprints-2026',      'Virginia Sprints 2026',                        '2026-04-19', '2026-04-20', 'Charlottesville, VA',     'Rivanna Rowing Club',                 'sprint',    'completed', NOW(), NOW())
ON CONFLICT DO NOTHING;
