# CrewSync — Complete Feature Breakdown
*Generated from codebase scan · April 27, 2026*

---

## Overview

CrewSync is a full-stack rowing training and recruitment platform for athletes and coaches. It combines AI-powered training plan generation, real-time Bluetooth ergometer monitoring, team management, recruiting pipeline tools, and regatta tracking into a single app — available on web and native iOS/Android. Athletes log erg and on-water workouts, track performance trends, connect with college programs, and compete on global leaderboards. Coaches get a dedicated hub for roster management, seat race analysis, AI boat lineup optimization, and recruiting prospect discovery.

---

## Dashboard

- **Profile card** — Displays avatar, school, graduation year, 2K personal best, and watts output at a glance.
- **Recent workout feed** — Shows last 3 workouts with splits, distance, and pace summary.
- **Training streak tracker** — Tracks consecutive training days with a streak-freeze feature to protect long streaks.
- **Quick stats** — Best split, most recent workout, and current training goals surfaced on the home screen.
- **Upcoming workout preview** — Displays next session from the active training plan.
- **Inline profile editing** — Edit name, goals, and profile details directly from the dashboard card.
- **C2 manual sync trigger** — Button to manually pull latest Concept2 logbook entries.

---

## Training

- **AI training plan generation** — Generates a personalized 7-day plan based on athlete profile, goals, and fitness level.
- **Team training plan generation** *(coach-facing)* — Produces a team-wide periodized plan distributed to all team members.
- **Printable weekly plan** — Download or print the current week's training schedule.
- **Plan regeneration** — Regenerate the plan at any time with progress tracking.
- **Manual erg workout logging** — Log distance, time, average split, and stroke rate for any erg session.
- **Bluetooth PM5 live capture** — Connect to a Concept2 PM5 over BLE and auto-import workout data at session end.
- **Multi-piece session tracking** — Log interval workouts with individual piece splits, rest intervals, and totals.
- **Force curve capture** — Records the drive-phase force curve from the PM5 for technique analysis.
- **Heart rate integration** — Live HR data from paired BLE heart rate monitors, displayed during and after sessions.
- **Workout annotations** — Add free-text notes to any workout for context or coach feedback.
- **AI erg screenshot parsing** — Upload a photo of an erg screen and extract workout data automatically via AI vision.
- **Strength workout logging** — Multi-set strength form with sets, reps, and weight per exercise.
- **AI exercise suggestions** — AI recommends exercises by muscle group, equipment availability, and athlete goals.
- **Strength history** — View progression across previous strength sessions with exercise-level detail.
- **Complete workout history** — Paginated, filterable log of all erg and strength sessions.
- **Force curve history review** — Replay force curve analysis for any past workout.
- **Workout sharing** — Generate a shareable workout card image.
- **Bulk workout deletion** — Remove multiple past workouts with a confirmation step.

---

## Live Erg

- **Real-time PM5 Bluetooth connection** — Streams live data from a Concept2 PM5 over BLE during a session.
- **Live metrics display** — Shows elapsed time, distance, split pace, stroke rate, power (watts), and heart rate in real time.
- **Live power curve** — Plots watts output as you row, updated stroke by stroke.
- **Heart rate zone tracking** — Color-coded HR zone indicator during live sessions.
- **Drive/recovery metrics** — Displays drive length, drive time, and recovery time from PM5 data stream.
- **Session state management** — Tracks idle, countdown, rowing, paused, and finished states automatically.
- **Cumulative session summary** — Running totals for distance and time visible throughout the session.
- **Heart rate monitor pairing** — Discover and pair separate BLE HR monitors alongside the PM5.

---

## Performance Analytics

- **2K power curve** — Visualizes watts output profile for 2K test efforts.
- **W/kg trending** — Charts power-to-weight ratio improvement over time.
- **Average split trends** — Line graph of average pace across all logged workouts.
- **Cumulative distance metrics** — Total meters logged across all sessions, with period breakdowns.
- **Training load metrics** — Aggregated weekly training volume and intensity.
- **AI 2K predictor** — Estimates current 2K time from recent training data with confidence range.
- **Improvement timeline** — AI-generated roadmap showing progressive target splits to reach a goal 2K time *(Elite+ plan)*.
- **Goal vs. actual progress** — Compares logged performance against stated goals on a timeline.
- **AI video technique critique** — Upload a rowing video frame; AI scores 6 categories: catch timing, body sequencing, drive phase, finish position, recovery, and overall efficiency — with drill recommendations.
- **AI coach chat** — Conversational AI coach with persistent history, pre-filled prompts, and streaming markdown responses.

---

## Teams *(Coach-Facing)*

- **Team creation** — Create a named team with description; coach is set as owner automatically.
- **Roster management** — Add and remove athletes by email; view full team roster with profiles.
- **Team erg leaderboard** — Ranks all team members by best 2K, 5K, and 6K times.
- **Seat race tracking** — Log seat race sessions with lineup combinations, margins (seconds), and winners.
- **AI seat race analysis** — Detects patterns across seat race history to surface consistent performer insights.
- **Race lineup optimizer** — AI recommends optimal boat lineups using configurable weights (erg 40%, on-water 30%, seat race 30%), locked seat constraints, confidence scores, and fatigue flags.
- **Lineup PDF export** — Export the recommended boat lineup as a printable PDF.
- **Load management** — Tracks weekly training load per athlete with fatigue indicators and overtraining alerts.
- **Team goals** — Set and track collective targets (team 2K average, total training volume).
- **Team analytics** — Aggregate injury rates, training consistency, and period-over-period performance comparisons.
- **Team message board** — Coach-to-athlete and athlete-to-coach messaging with announcement threads.
- **On-water race results** — Log regatta finishes and compare on-water times to erg benchmarks.
- **Recruiting gap analysis** — AI identifies roster gaps by position and weight class and recommends recruiting priorities.

---

## Recruiting — Coaches Hub *(Coach-Facing)*

- **Prospect discovery feed** — Browse recruitable athletes with filters for 2K time, graduation year, location, and weight class.
- **AI recruit scoring** — Scores each prospect's athletic potential automatically.
- **Recruiting board (Kanban)** — Drag-and-drop pipeline with columns: Watching → Contacted → Interested → Offered → Committed → Not a Fit.
- **Athlete detail panel** — Full profile view inside the board: 2K, 6K, strength metrics, virtual combine score.
- **Contact history log** — Record outreach interactions with method (email, phone, visit), date, outcome, and notes.
- **AI recruiting email generator** — Auto-generates personalized recruiting outreach emails for any prospect.
- **Recommended athletes** — AI suggests prospects that fill identified roster gaps with fit scores.
- **Followed athletes list** — Save and revisit a shortlist of top prospects.
- **Coach program profile** — Public-facing program page listing division, sport, recruiting targets, and coach contact info.

---

## Recruiting — Athlete-Facing

- **Public athlete profile** — Shareable profile page with stats, recent workouts, social links, and 2K history.
- **Recruiting profile editor** — Enter target schools, GPA, SAT/ACT scores, highlights, and availability.
- **Shareable recruiting link** — One-click link to send coaches directly to the athlete's recruiting profile.
- **PDF recruiting profile** — Generate a print-ready recruiting profile document.
- **College targets tracker** — List target programs with coaching contacts, division, and contact status.
- **AI college fit scoring** — Scores each target school for athletic and program fit.
- **Alumni network** — Find and connect with alumni rowers from your school for mentorship and networking.
- **Virtual combine** — Submit combine scores (2K, 6K, bench, deadlift, squat, weight) and receive a composite score with national rank.
- **Global combine leaderboard** — See where your combine score ranks nationally by gender and graduation year.

---

## Competition

- **Global 2K leaderboard** — Worldwide rankings filterable by distance (2K / 5K / 6K / 10K / 60 min), age group, gender, and weight class.
- **Personal rank and percentile** — Shows your current global rank and percentile within any filter set.
- **Head-to-head racing** — Challenge other athletes to time trial matchups with results tracked on a leaderboard.
- **Weekly challenges** — Auto-generated weekly community challenges (most meters, fastest improvement, highest W/kg gain) with a live leaderboard.
- **Achievements and badges** — Milestone badge system covering distance, power, improvement, and consistency categories.

---

## Calculators

- **Split calculator** — Bidirectional: enter a split to get total time, or total time to get split, for any standard rowing distance.
- **Pace and watts converter** — Real-time conversion between split pace and watts using the Concept2 power formula.
- **Training zones calculator** — Generates UT2, UT1, AT, TR, AN, and SP pacing zones from your 2K time, with HR equivalents.
- **2K predictor** — AI-powered conservative 2K time estimate from recent training data.
- **Weight adjustment calculator** — Projects how your 2K time would change at a target body weight.
- **Race splits planner** — Plan 500m-by-500m pacing strategy for a 2K race with a downloadable race plan.
- **Stroke rate efficiency analyzer** — Compares power output across different stroke rates to find your optimal rate.
- **Erg equivalency calculator** — Converts efforts across RowErg, SkiErg, and BikeErg for cross-training comparison.
- **W/kg ratio calculator** — Benchmarks your power-to-weight ratio against performance tiers with improvement targets.
- **Improvement timeline** — AI roadmap from current 2K to goal time with progressive targets and periodization suggestions *(Pro+ plan)*.
- **Stroke watch** — Tap-to-measure real-time stroke rate for on-water rowing, with session average tracking.

---

## Regattas

- **Regatta search** — Search the CrewTimer database for upcoming and past regattas by date, location, and boat class.
- **Regatta results browser** — View full race results with lane-by-lane placements, finish times, and entry names.
- **Upcoming regattas calendar** — Next 90 days of events with distance calculation and division context.
- **Claim race results** — Claim a regatta finish to your personal profile from CrewTimer data.
- **Personal racing history** — All claimed and verified regatta finishes in one place with share functionality.
- **Team regatta management** *(coach-facing)* — Track team entries, boat lineups, and aggregate results across multiple regattas.

---

## Community & Social

- **Activity feed** — Social feed of friend workouts, PRs, and achievements with like and comment support.
- **Direct messaging** — Real-time 1:1 conversations with friends, including unread indicators and message history.
- **Friend search** — Find athletes by username or name and send friend requests.
- **Friend request management** — Accept or decline incoming friend requests.
- **Athlete directory** — Browse all platform users, filterable by school, location, and experience level.
- **Forums** — Categorized discussion boards (Training, Nutrition, Recovery, Recruiting, etc.) with threaded replies, editing, and deletion.

---

## Recovery

- **Daily injury logging** — Log body region, pain severity (1–5 scale), and recovery notes each day.
- **Recovery history timeline** — Chronological view of all logged recovery entries.
- **Body region heatmap** — Visual map highlighting recurring injury or soreness areas.
- **Whoop recovery integration** — Syncs HRV, recovery score, sleep quality, and strain data from a Whoop band.
- **Sleep tracking** — Integrates with Apple HealthKit to pull nightly sleep duration and quality data.
- **Weight and hydration logging** — Daily entries for body weight and fluid intake.

---

## Nutrition

- **AI meal plan generation** — Produces a personalized daily meal plan based on athlete profile and calorie targets.
- **Daily meal logging** — Log breakfast, lunch, dinner, and snacks against a searchable food database.
- **Nutrition label scanning** — Photograph a nutrition label and auto-extract macros and calories via AI vision.
- **Macro and calorie tracking** — Daily summaries of protein, carbs, fat, and calories vs. targets.
- **Personalized nutrition recommendations** — AI suggestions based on training load, weight goals, and profile.

---

## Connected Apps

- **Concept2 logbook OAuth** — Connect your C2 logbook account; workouts auto-sync daily and can be manually triggered.
- **Whoop band OAuth** — Connect Whoop for recovery, HRV, sleep, and strain data.
- **Apple HealthKit** *(iOS)* — Pull sleep and health metrics from the iOS Health app.
- **Device management panel** — View connection status, last sync timestamp, and disconnect/reconnect for each integration.
- **BLE device pairing** — Discover and pair Concept2 PM5 ergs and BLE heart rate monitors directly from the app.

---

## Settings & Account

- **Profile editor** — Update name, height, weight, age, school, bio, social links, and profile photo.
- **Account type selection** — Switch between athlete, coach, or both roles.
- **Email and password management** — Update login credentials.
- **Email notification preferences** — Toggle notification types (achievements, friend requests, messages, team updates) and frequency.
- **In-app notification settings** — Per-channel toggle for in-app alerts.
- **Theme toggle** — Switch between light and dark mode.
- **Privacy settings** — Control profile visibility and data sharing.
- **Referral program** — Generate a personal referral code, share a link, and track referred users and rewards.

---

## Pricing Tiers

| Tier | Price (Beta) | Key Access |
|------|-------------|------------|
| Free | $0 | Basic logging, community, 3 AI queries/month |
| Pro | $8/mo | Unlimited AI, advanced analytics, training zones |
| Elite | $12/mo | Pro + video critique, recruiting profile, regatta tracking |
| Elite+ | $20/mo | Elite + head-to-head, force curve, college targeting, early features |

*Beta pricing includes a 20% lifetime lock-in. Annual billing available.*

---

## Key Differentiators

*Features not found in any other rowing app:*

1. **AI Technique Critique with Vision** — Submits a video frame to Claude AI for scored, category-by-category technique feedback with specific drill recommendations — no other rowing app offers AI vision coaching.
2. **Race Lineup Optimizer** — AI selects the optimal boat lineup by weighting erg, on-water, and seat race data, with locked-seat constraints and fatigue flags.
3. **Seat Race Analysis Tools** — Formal session logging with AI pattern detection across multiple seat race days to surface consistent performer trends.
4. **Recruiting Pipeline Kanban** — Full drag-and-drop recruiting CRM built specifically for rowing coaches, with integrated athlete profiles and AI email generation.
5. **Virtual Combine Scoring** — Composite athletic score across 2K, 6K, and strength lifts with a national leaderboard — a quantified combine no other platform offers.
6. **AI College Fit Scoring** — Scores each of an athlete's target schools for athletic and program fit, streamlining the recruiting decision.
7. **CrewTimer Integration** — Direct connection to CrewTimer race data so athletes can claim official regatta results to their profile.
8. **Force Curve Visualization** — Captures and replays the PM5 drive-phase force curve for stroke analysis, available during and after every live session.
9. **W/kg Power-Based Training Zones** — Zones calculated from watts, not just pace, enabling biomechanically precise training intensity prescription.
10. **Multi-Erg Equivalency Calculator** — Converts RowErg, SkiErg, and BikeErg efforts so coaches can program cross-training with accurate load matching.
11. **AI Recruiting Email Generator** — One-click generation of personalized outreach emails for any recruit on the board.
12. **Streak Freeze** — Protects long training streaks during planned rest or travel days, a gamification layer unique to CrewSync.
13. **Recovery Body Heatmap** — Visualizes recurring injury/soreness patterns over time to flag injury risk before it becomes a problem.
14. **Team Recruiting Gap Analysis** — AI analyzes the current roster and recommends the exact position, weight class, and profile to target in recruiting.
15. **Improvement Roadmap AI** — Generates a step-by-step training periodization timeline from current 2K to goal 2K, with split targets by training block.

---

*Document generated from a full scan of the CrewSync codebase — src/pages, src/components, src/services, and supabase/functions.*
