-- Fix: coach Today screen never saw live attendance updates.
--
-- CoachTodayView subscribes to postgres_changes on public.attendance
-- (filter: team_id=eq.<team>) and invalidates the ["today-attendance-coach"]
-- query on every event. The subscription reported SUBSCRIBED but delivered
-- ZERO events -- a WebSocket capture showed the athlete check-in write landing
-- in the DB with nothing coming back down the socket. A control subscription
-- on team_board_posts over the same socket did receive events.
--
-- Root cause: realtime only replays rows for tables that are members of the
-- supabase_realtime publication, and membership was only:
--   notifications, race_participants, team_board_posts
-- attendance was never added, so the WAL decoder had nothing to emit for it.
-- The coach only saw new check-ins after a manual refresh.
--
-- Adds attendance plus the two other tables the coach views poll on the same
-- screen (boat_lineups, practice_entries) so lineup edits and the published
-- practice entry push instead of waiting for a refetch.

-- ── Publication membership ───────────────────────────────────
-- Guarded per table: a bare ALTER PUBLICATION ... ADD TABLE raises 42710
-- duplicate_object when the table is already a member, which would abort the
-- whole migration on a re-run (or on an environment where one was added by
-- hand). Check pg_publication_tables first instead of swallowing every error,
-- so a genuine failure (missing table, missing publication) still surfaces.
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'publication supabase_realtime does not exist';
  END IF;

  FOREACH t IN ARRAY ARRAY['attendance', 'boat_lineups', 'practice_entries'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'added public.% to supabase_realtime', t;
    END IF;
  END LOOP;
END $$;

-- ── Replica identity ─────────────────────────────────────────
-- DEFAULT replica identity puts only the primary key in the old record, which
-- is enough for the CoachTodayView handler itself (it ignores the payload and
-- just invalidates a react-query key). It is NOT enough for the server-side
-- filter: realtime evaluates `team_id=eq.<team>` against the old record on
-- UPDATE and DELETE, and with only the PK present team_id is absent, so those
-- events get dropped before they reach the channel -- an athlete un-checking-in
-- (a DELETE) would silently leave a stale "present" row on the coach's screen.
-- FULL makes the old record carry every column so the filter matches.
--
-- attendance is a narrow, low-volume table (one row per athlete per day), so
-- the extra WAL volume from FULL is negligible. boat_lineups and
-- practice_entries are left at DEFAULT: they carry large jsonb payloads
-- (seats, workout blocks) that would be duplicated into the WAL on every
-- UPDATE, and nothing subscribes to them with a filter today. Revisit if a
-- filtered subscription on either is ever added.
ALTER TABLE public.attendance REPLICA IDENTITY FULL;
