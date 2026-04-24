-- Seed 2026 upcoming regattas so the Upcoming tab has data
-- Uses ON CONFLICT DO NOTHING so re-running is safe

INSERT INTO public.regattas (crewtimer_id, name, event_date, end_date, location, host_club, event_type, status, fetched_at, cached_at)
VALUES
  ('seed-bah-2026',    'Brentwood Aquatic Invitational',          '2026-04-25', '2026-04-26', 'Redwood City, CA',       'Brentwood Rowing Club',             'sprint',    'upcoming', NOW(), NOW()),
  ('seed-sraa-2026',   'SRAA National Championship 2026',         '2026-05-01', '2026-05-03', 'Sarasota, FL',           'Scholastic Rowing Assoc',           'sprint',    'upcoming', NOW(), NOW()),
  ('seed-stobt-2026',  'Stotesbury Cup Regatta 2026',             '2026-05-08', '2026-05-09', 'Philadelphia, PA',       'Schuylkill Navy',                   'sprint',    'upcoming', NOW(), NOW()),
  ('seed-dadv-2026',   'Dad Vail Regatta 2026',                   '2026-05-08', '2026-05-09', 'Philadelphia, PA',       'Dad Vail Regatta Committee',        'sprint',    'upcoming', NOW(), NOW()),
  ('seed-nera-2026',   'New England Rowing Championships 2026',   '2026-05-16', '2026-05-17', 'Worcester, MA',          'WPI Rowing',                        'sprint',    'upcoming', NOW(), NOW()),
  ('seed-ira-2026',    'IRA National Championship 2026',          '2026-06-04', '2026-06-06', 'Camden, NJ',             'Intercollegiate Rowing Assoc',      'sprint',    'upcoming', NOW(), NOW()),
  ('seed-acra-2026',   'ACRA National Championship 2026',         '2026-05-31', '2026-06-02', 'Oak Ridge, TN',          'ACRA',                              'sprint',    'upcoming', NOW(), NOW()),
  ('seed-mwrc-2026',   'Midwest Rowing Championship 2026',        '2026-05-22', '2026-05-24', 'Indianapolis, IN',       'White River Rowing Club',           'sprint',    'upcoming', NOW(), NOW()),
  ('seed-usrn-2026',   'USRowing Youth National Championship',    '2026-07-27', '2026-08-01', 'Sarasota, FL',           'USRowing',                          'sprint',    'upcoming', NOW(), NOW()),
  ('seed-usra-2026',   'USRowing Senior National Championship',   '2026-06-29', '2026-07-05', 'Oklahoma City, OK',      'USRowing',                          'sprint',    'upcoming', NOW(), NOW()),
  ('seed-wcra-2026',   'Western Canadian Rowing Championship',    '2026-07-11', '2026-07-12', 'Burnaby, BC',            'BC Rowing',                         'sprint',    'upcoming', NOW(), NOW()),
  ('seed-hotc-2026',   'Head of the Charles Regatta 2026',        '2026-10-17', '2026-10-18', 'Boston, MA',             'Cambridge Boat Club',               'head_race', 'upcoming', NOW(), NOW()),
  ('seed-hooh-2026',   'Head of the Hooch 2026',                  '2026-11-07', '2026-11-08', 'Chattanooga, TN',        'Chattanooga Rowing Center',         'head_race', 'upcoming', NOW(), NOW()),
  ('seed-hosc-2026',   'Head of the Schuylkill 2026',             '2026-10-24', '2026-10-25', 'Philadelphia, PA',       'Schuylkill Navy',                   'head_race', 'upcoming', NOW(), NOW()),
  ('seed-hotf-2026',   'Head of the Fish 2026',                   '2026-10-10', '2026-10-11', 'Saratoga Springs, NY',   'Saratoga Rowing Association',       'head_race', 'upcoming', NOW(), NOW()),
  ('seed-sdcc-2026',   'San Diego Crew Classic 2026',             '2026-04-04', '2026-04-05', 'San Diego, CA',          'San Diego Crew Classic',            'sprint',    'completed', NOW(), NOW()),
  ('seed-knecht-2026', 'Knecht Cup Regatta 2026',                 '2026-03-28', '2026-03-29', 'San Diego, CA',          'San Diego Rowing Club',             'sprint',    'completed', NOW(), NOW()),
  ('seed-crash-2026',  'CRASH-B Sprints 2026',                    '2026-02-22', '2026-02-22', 'Boston, MA',             'Cambridge Boat Club',               'sprint',    'completed', NOW(), NOW()),
  ('seed-camb-2026',   'Cambridge Sprints 2026',                  '2026-05-30', '2026-05-31', 'Cambridge, UK',          'Cambridge University Rowing',       'sprint',    'upcoming', NOW(), NOW()),
  ('seed-hopo-2026',   'Head of the Ohio 2026',                   '2026-10-03', '2026-10-04', 'Pittsburgh, PA',         'Three Rivers Rowing Association',   'head_race', 'upcoming', NOW(), NOW())
ON CONFLICT DO NOTHING;
