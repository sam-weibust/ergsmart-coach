-- Default strength programs table
CREATE TABLE IF NOT EXISTS public.default_strength_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  days_per_week integer,
  program_data jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.default_strength_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read strength programs"
  ON public.default_strength_programs FOR SELECT
  USING (true);

-- Athlete strength session logs (tracks weights used per exercise per session)
CREATE TABLE IF NOT EXISTS public.strength_program_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.default_strength_programs(id),
  day_key text NOT NULL,
  session_date date DEFAULT current_date,
  exercises jsonb NOT NULL DEFAULT '[]',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.strength_program_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own strength logs"
  ON public.strength_program_logs
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Insert the default Rowing Strength Program
INSERT INTO public.default_strength_programs (name, description, days_per_week, is_default, program_data)
VALUES (
  'Rowing Strength Program',
  'A rowing-specific 4-day strength program designed to directly transfer to on-water and erg performance. Integrates with the weekly erg training loading cycle.',
  4,
  true,
  '{
    "warmup": {
      "duration": "5 minutes",
      "exercises": [
        "Hip flexor stretch — 30 seconds each side",
        "Thoracic rotation — 10 reps each direction",
        "Banded clamshells — 15 reps each side",
        "Leg swings front/back — 10 reps each leg",
        "Leg swings side to side — 10 reps each leg"
      ]
    },
    "intensity_by_erg_week": {
      "easy": { "pct": "75-80%", "label": "Easy erg week — lift at 75-80% intensity" },
      "medium": { "pct": "80-85%", "label": "Medium erg week — lift at 80-85% intensity" },
      "hard": { "pct": "85-90%", "label": "Hard erg week — lift at 85-90% intensity" },
      "recovery": { "pct": "60-65%", "label": "Recovery week — lift at 60-65%, cut volume in half" }
    },
    "taper_protocol": {
      "week_3_out": "Drop volume 20%, keep intensity",
      "week_2_out": "Drop volume 40%, keep intensity on main lifts only",
      "week_1_out": "One light session at 50% volume, no max effort"
    },
    "schedule_4_day": ["Monday", "Tuesday", "Thursday", "Saturday"],
    "schedule_3_day": ["Monday", "Tuesday", "Friday"],
    "days": {
      "day_a": {
        "key": "day_a",
        "label": "Day A — Lower Power",
        "day_of_week": "Monday",
        "focus": "Lower Power",
        "exercises": [
          {
            "name": "Back Squat",
            "sets": 5,
            "reps": 3,
            "intensity": "85-90% 1RM",
            "cue": "Explosive out of the hole",
            "rowing_note": "Mirrors the leg drive phase — explosive hip and knee extension identical to the catch-to-mid-drive transition on the erg"
          },
          {
            "name": "Romanian Deadlift",
            "sets": 4,
            "reps": 5,
            "intensity": "Moderate",
            "cue": "Slow eccentric, explosive concentric",
            "rowing_note": "Trains the hamstrings and posterior chain through the same range used in the recovery phase — also builds the strength needed for a controlled return up the slide"
          },
          {
            "name": "Power Clean",
            "sets": 4,
            "reps": 3,
            "intensity": "Moderate-Heavy",
            "cue": "Full extension at top — mirrors drive phase",
            "rowing_note": "The triple extension (ankle, knee, hip) of the power clean directly mirrors the leg drive and hip opening in the rowing stroke drive phase"
          },
          {
            "name": "Box Jump",
            "sets": 4,
            "reps": 5,
            "intensity": "Max height",
            "cue": "Reset between each rep — full effort",
            "rowing_note": "Develops explosive rate of force development, which translates directly to the quick force application needed at the catch"
          },
          {
            "name": "Glute Ham Raise",
            "sets": 3,
            "reps": 8,
            "intensity": "Controlled",
            "cue": "Controlled descent, pull with hamstrings",
            "rowing_note": "Strengthens the posterior chain through the hip hinge pattern — directly transfers to drive power and protects the lower back at high stroke rates"
          },
          {
            "name": "Plank Hold",
            "sets": 3,
            "reps": "60 seconds",
            "intensity": "Bodyweight",
            "cue": "Neutral spine, tight core throughout",
            "rowing_note": "Core stability on the erg requires the same rigid trunk position — plank strength prevents energy leaks during the drive"
          }
        ]
      },
      "day_b": {
        "key": "day_b",
        "label": "Day B — Upper Pull",
        "day_of_week": "Tuesday",
        "focus": "Upper Pull",
        "exercises": [
          {
            "name": "Deadlift",
            "sets": 5,
            "reps": 3,
            "intensity": "85-90% 1RM",
            "cue": "Maintain flat back, lock out fully",
            "rowing_note": "The deadlift finish position — hips forward, shoulders back, arms at sides — is identical to the rowing finish position"
          },
          {
            "name": "Weighted Pull-ups",
            "sets": 4,
            "reps": 5,
            "intensity": "Heavy — add weight if needed",
            "cue": "Full ROM, chest to bar",
            "rowing_note": "Pulls through the same lat-dominant movement pattern used during the pull-through phase of the rowing stroke"
          },
          {
            "name": "Barbell Row",
            "sets": 4,
            "reps": 6,
            "intensity": "Moderate-Heavy",
            "cue": "Overhand grip, horizontal pull",
            "rowing_note": "Horizontal pulling strength directly builds the lats, rhomboids, and rear delts used during the arm draw at the finish"
          },
          {
            "name": "Single Arm Dumbbell Row",
            "sets": 3,
            "reps": 8,
            "intensity": "Heavy — full stretch at bottom",
            "cue": "Full range of motion each rep",
            "rowing_note": "Addresses left-right pulling asymmetry and trains the lat through a longer range than barbell rowing"
          },
          {
            "name": "Face Pulls",
            "sets": 3,
            "reps": 15,
            "intensity": "Light-Moderate",
            "cue": "External rotation at peak — pull to forehead",
            "rowing_note": "Shoulder health exercise — high repetitive pulling on the erg creates internal rotation dominance; face pulls counteract this and prevent shoulder injury"
          },
          {
            "name": "Hanging Leg Raise",
            "sets": 3,
            "reps": 12,
            "intensity": "Bodyweight",
            "cue": "Control the descent — no swinging",
            "rowing_note": "Builds hip flexor and lower abdominal strength needed to hold a powerful layback position without collapsing"
          }
        ]
      },
      "day_c": {
        "key": "day_c",
        "label": "Day C — Lower Endurance",
        "day_of_week": "Thursday",
        "focus": "Lower Endurance",
        "exercises": [
          {
            "name": "Front Squat",
            "sets": 4,
            "reps": 6,
            "intensity": "Moderate",
            "cue": "Upright torso, elbows high",
            "rowing_note": "The upright torso of the front squat more closely mirrors the body angle at the catch than the back squat — trains quad endurance in a rowing-specific position"
          },
          {
            "name": "Bulgarian Split Squat",
            "sets": 3,
            "reps": 8,
            "intensity": "Moderate",
            "cue": "Rear foot elevated, knee tracks over toe",
            "rowing_note": "Addresses single-leg strength imbalances that develop from the bilateral symmetry of rowing — also trains the hip flexors in a lengthened position"
          },
          {
            "name": "Trap Bar Deadlift",
            "sets": 4,
            "reps": 8,
            "intensity": "Moderate — faster tempo",
            "cue": "Moderate weight, move with intent",
            "rowing_note": "Higher rep deadlifts at moderate weight build the muscular endurance needed to maintain strong leg drive across long erg pieces"
          },
          {
            "name": "Step-ups with Weight",
            "sets": 3,
            "reps": 10,
            "intensity": "Moderate",
            "cue": "Drive through heel — single leg control",
            "rowing_note": "Develops single-leg power and proprioception — also challenges ankle and knee stability under load similar to catch loading in a boat"
          },
          {
            "name": "Nordic Hamstring Curl",
            "sets": 3,
            "reps": 6,
            "intensity": "Eccentric only — controlled descent",
            "cue": "Lower as slowly as possible",
            "rowing_note": "The highest-evidence exercise for hamstring injury prevention — protects against the hamstring strains common in rowers who increase training volume quickly"
          },
          {
            "name": "Pallof Press",
            "sets": 3,
            "reps": 12,
            "intensity": "Light-Moderate",
            "cue": "Anti-rotation — resist the cable pull",
            "rowing_note": "Trains core to resist rotation — critical for maintaining a square, stable trunk position during the drive on rough water or when fatigued"
          }
        ]
      },
      "day_d": {
        "key": "day_d",
        "label": "Day D — Upper Endurance & Full Body",
        "day_of_week": "Saturday",
        "focus": "Upper Endurance",
        "exercises": [
          {
            "name": "Hex Bar Deadlift",
            "sets": 4,
            "reps": 8,
            "intensity": "Moderate weight",
            "cue": "Neutral spine, drive through floor",
            "rowing_note": "Full-body pulling endurance in a neutral-grip position — trains the same posterior chain used in the drive without the spinal loading of a conventional deadlift"
          },
          {
            "name": "Dumbbell Romanian Deadlift",
            "sets": 3,
            "reps": 12,
            "intensity": "Light-Moderate",
            "cue": "Hip hinge — feel stretch in hamstrings",
            "rowing_note": "High-rep hamstring and glute endurance work — builds the capacity to maintain a strong body angle through late-race fatigue"
          },
          {
            "name": "Lat Pulldown",
            "sets": 4,
            "reps": 10,
            "intensity": "Moderate",
            "cue": "Full stretch at top, pull elbows to hips",
            "rowing_note": "Lat endurance training at higher reps — develops the muscular capacity to maintain a strong pull-through across thousands of strokes per session"
          },
          {
            "name": "Cable Row",
            "sets": 4,
            "reps": 12,
            "intensity": "Moderate",
            "cue": "Squeeze shoulder blades at finish",
            "rowing_note": "High-rep horizontal pulling endurance — directly mirrors the arm and back pull at the finish position of each stroke"
          },
          {
            "name": "Dumbbell Curl to Press",
            "sets": 3,
            "reps": 10,
            "intensity": "Light-Moderate",
            "cue": "Controlled through full range",
            "rowing_note": "Bicep and shoulder accessory work — maintains elbow flexor health under the repetitive pulling load of the rowing stroke"
          },
          {
            "name": "Copenhagen Plank",
            "sets": 3,
            "reps": "30 seconds each side",
            "intensity": "Bodyweight",
            "cue": "Hips level — do not let them drop",
            "rowing_note": "Adductor and hip stability — protects against groin injuries and builds the lateral stability that keeps the hips level during the drive"
          },
          {
            "name": "Reverse Hyper or Back Extension",
            "sets": 3,
            "reps": 15,
            "intensity": "Light-Moderate",
            "cue": "Full extension at top — controlled descent",
            "rowing_note": "Strengthens the lower back in extension — directly counteracts the flexion-dominant loading of rowing and reduces chronic lower back fatigue"
          }
        ]
      }
    }
  }'
);
