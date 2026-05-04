# CrewSync Feature Breakdown

## Authentication & Onboarding
- **Sign Up with Email/Password**: Users can create accounts with full name, email, password, and role selection (athlete, coxswain, coach, organizer).
- **Google OAuth Integration**: One-click sign in via Google with automatic session handling.
- **Role-Based Signup**: Users select their role (athlete, coxswain, coach, organizer) during account creation with appropriate descriptions.
- **Referral System**: Track referral codes at signup and reward both referrer and referred user upon new account creation.
- **Coach Invite System**: Coaches can invite other coaches via email with time-limited invitation tokens (7-day expiration).
- **Auto Accept Coach Invites**: Accept pending coach invites from URL parameters to automatically add coaches to teams.

## Dashboard & Navigation
- **Main Dashboard Hub**: Central navigation with sidebar (desktop) and bottom nav (mobile) for all major feature areas.
- **Home Tab**: Quick overview with today's workouts, recent activity, wellness score, and upcoming events.
- **Pull-to-Refresh**: Mobile gesture support to manually refresh all data without navigation.
- **Session Management**: Real-time session state detection with automatic logout on session expiration.
- **Midnight Date Detector**: Auto-refresh time-sensitive queries when the calendar date changes.
- **Search Functionality**: Global search for athletes, coaches, teams, and regattas across the platform.

## Training & Workouts

### Erg Workouts
- **Manual Erg Logging**: Log erg workouts with date, time, distance, duration, split, stroke rate, and drag factor.
- **Erg Workout Types**: Support for steady state, UT2, UT1, TR intervals, AT intervals, multi-piece, timed pieces, test efforts.
- **Multi-Piece Session Tracking**: Log multiple pieces in a single session with individual splits, stroke rates, and notes per piece.
- **Personal Record Tracking**: Automatic detection and storage of 2K, 5K, 6K, 10K, 60min, and 30min personal records with improvement tracking.
- **Workout Feedback**: AI-generated feedback on pacing, stroke efficiency, and splits for each logged workout.
- **Force Curve Analysis**: Capture and display rowing force curves post-workout for technique analysis.
- **Live Erg View**: Real-time PM5 monitoring with split, stroke rate, watts, calories, and target split pacer display.

### Concept2 Integration
- **Concept2 Logbook Sync**: Full OAuth integration with Concept2 for automatic daily logbook import.
- **Auto Sync Background**: Daily background sync of Concept2 data without manual action.
- **Workout Verification Badge**: Mark workouts as "verified via Concept2 Logbook" or "verified via Live PM5".
- **Concept2 Disconnect**: Revoke Concept2 OAuth tokens and stop syncing.

### Strength Training
- **Multi-Set Strength Form**: Log strength workouts with exercise name, weight (lbs/kg), reps, and sets for multiple exercises.
- **Exercise Library**: Pre-defined list of rowing-specific strength exercises with dropdown selection.
- **Strength History**: Browse past strength workouts with date, exercise details, and performance progression.

### Cross Training
- **Cross Training Logging**: Log runs, bikes, swims, and other non-rowing activities with distance, duration, and intensity.
- **Cross Training Types**: Support for runs, cycling, swimming, and custom activities.

### Training Plans
- **AI Training Plan Generation**: Claude-powered generation of personalized multi-week training plans based on goals and performance.
- **Plan Export**: Download/print weekly training plans in PDF format.
- **Daily Workout Suggestions**: AI suggests specific workouts each day based on training phase and athlete feedback.
- **Plan Auto-Sync**: Automatically apply team plans to individual athlete calendars.

## Nutrition & Recovery

### Meal Planning
- **Meal Plan Generator**: AI-powered meal plan generation with breakfast, lunch, dinner, and snacks optimized for training.
- **Calorie Tracking**: Log meals and track total daily calories against macro targets.
- **Food Database Search**: Searchable database of foods with nutritional information and quick-add functionality.
- **Barcode Scanning**: Scan food barcodes to instantly pull nutritional data.
- **Custom Food Logging**: Log custom meals with manual nutritional entry.
- **Macro Targets**: Set personalized daily macronutrient targets (carbs, protein, fats, calories).

### Wellness Tracking
- **Weight Tracking**: Log daily body weight and track weight trends over time.
- **Water Intake Logging**: Log daily water consumption and track hydration against targets.
- **Sleep Tracking**: Log hours slept and track sleep consistency.
- **Recovery Score**: AI-computed recovery score based on sleep, hydration, body weight, and training load.
- **Wellness Checkin**: Daily checkin prompts for mood, soreness, energy level, and general wellness.
- **Recovery Insights**: AI-generated weekly insight summary analyzing recovery patterns and recommendations.

### Wearable Integration
- **WHOOP Sync**: Connect WHOOP device for automatic recovery, HRV, and sleep data import.
- **WHOOP Auto Sync**: Background daily sync of WHOOP data without manual action.
- **WHOOP Disconnect**: Revoke WHOOP OAuth and stop syncing.
- **HealthKit Integration**: iOS native HealthKit access for heart rate, step count, and workout data.
- **Recovery Modeling**: Advanced recovery projection based on wearable data and training load correlation.

## Performance & Analytics

### Erg Analytics
- **Erg Score Manager**: Track 2K equivalent scores from all workout types (UT2, UT1, TR, AT distances).
- **Performance Trends**: Multi-month view of split, wattage, and stroke rate progression over time.
- **Comparison Section**: Compare multiple athletes' performance metrics side-by-side.
- **Leaderboard Rankings**: Global ranking by 2K, 5K, 6K, 10K, 60min with filters by age, gender, weight class.
- **Global Leaderboards**: Top 100 verified rankings filtered by:
  - Distance (2K, 5K, 6K, 10K, 60min, custom)
  - Gender (all, male, female)
  - Age group (junior, U23, senior, masters 40/50/60+)
  - Weight class (open, lightweight)
  - Ranking method (time or watts/kg)
- **Leaderboard Opt-In**: Control whether your times appear on public leaderboards.
- **Score Verification**: Scores marked as verified only via Concept2 Logbook sync or live PM5 connection.
- **Percentile Calculation**: Show your percentile ranking among all verified athletes in your category.

### 2K Prediction
- **AI 2K Predictor**: Conservative 2K time prediction from recent erg scores using machine learning.
- **Weight-Adjusted Prediction**: Predict 2K time at target body weight based on power-to-weight scaling.
- **Improvement Timeline**: AI roadmap showing predicted progress toward goal 2K time with milestones.

### Technique & Video
- **Video Critique Section**: Upload rowing videos for AI feedback on technique, posture, blade work, and rhythm.
- **AI Technique Analysis**: Claude-powered feedback on recorded rowing video identifying specific technique issues.
- **Stroke Watch Calculator**: Tap in real-time to measure stroke rate on the water (no electronics needed).
- **Rowing Analytics**: In-depth analysis of stroke efficiency, drive phase efficiency, and recovery quality.

### Calculators
- **Split Calculator**: Two-way conversion between split (per 500m) and total time for any distance.
- **Pace & Watts Converter**: Convert split to watts and back using standard erg power equations.
- **Training Zones Calculator**: Calculate UT2, UT1, AT, TR, AN, SP training zones from 2K time.
- **Weight Adjustment Calculator**: Predict splits/watts at different body weights based on power-to-weight ratios.
- **Race Splits Planner**: Plan pacing strategy for 2K race in 500m splits with target pace adjustments.
- **Stroke Rate Analysis**: Analyze efficiency at various stroke rates and paces with power output.
- **Erg Equivalency**: Compare RowErg, SkiErg, BikeErg split/time equivalencies.
- **W/kg Ratio**: Power-to-weight benchmarks and performance comparison by body weight.

## Friends & Social

### Friend Management
- **Find Friends Search**: Search for other athletes by username or email.
- **Add Friends**: Send friend requests to other users with pending request notifications.
- **Accept/Reject Requests**: Manage incoming friend requests with approve/decline options.
- **Friend List**: View all confirmed friends and their status.

### Social Feed
- **Activity Feed**: See recent workout submissions and achievements from friends in chronological order.
- **Shareable Workout Cards**: Generate and share custom workout cards with splits, time, and personal bests.
- **Workout Share Cards**: Beautiful, shareable cards for social media with workout summary and medal for PRs.

### Messaging
- **Direct Messages**: Send and receive direct messages between athletes and friends.
- **Message History**: Persistent message history with all conversations.

## Team Management

### Roster & Membership
- **Team Creation**: Coaches can create rowing teams with name, description, location, division, program type.
- **Athlete Roster**: Coach view of all team athletes with contact info and performance metrics.
- **Join Team by Code**: Athletes join teams using a unique 6-character code.
- **Team Directory**: Browse all rowing programs and clubs on the platform with search/filter.
- **Athlete Count Tracking**: Teams track total athlete count for leaderboard and directory display.
- **Featured Team Programs**: Designate teams as featured in directory for increased visibility.

### Boat Lineups & Management
- **Boat Lineup Builder**: Drag-and-drop interface to create boat configurations with 1-8 athletes plus cox.
- **Lineup Templates**: Save and reuse common boat configurations (e.g., 4+, 8+, doubles).
- **Named Boats**: Define team boat names/classes (e.g., "Quicksilver", "8+ A-Boat") and assign to lineups.
- **Lineup History**: Archive all historical lineups with date, boat composition, and results.
- **Athlete Lineup Preferences**: Athletes indicate preferred positions (bow, 2, 3, etc., or cox).
- **AI Lineup Optimizer**: Claude-powered suggestions for optimal boat lineups based on athlete strengths.
- **Race Lineup Optimizer**: AI recommends race-day lineups based on seat racing and recent metrics.

### Practice Management
- **Practice Logging**: Log on-water practices with date, time, location, lineup, and notes.
- **Practice Calendar**: Team calendar view of all scheduled and past practices.
- **Practice Detail**: View full practice details including attendance, lineups, and logged results.
- **Attendance Tracking**: Coaches and athletes mark attendance (yes/no/maybe) for scheduled practices.
- **Attendance Prompts**: Automated prompts for athletes to confirm attendance each practice.

### On-Water Performance
- **On-Water Results**: Log boat times and splits from on-water pieces (1000m, 2000m, 500m, etc.).
- **Piece Tracking**: Log multiple pieces per practice with piece type, distance, time, split, stroke rate.
- **Piece Types**: Support for steady state, race pace, rate work, technical, starts, race simulations.
- **Practice Drills**: Log specific drills (e.g., pause drills, tap drills) with duration and notes.
- **Boat Performance History**: Historical view of all boat/lineup performance with results trending.

### Coxswain Management
- **Coxswain Profiles**: Coxes log weight (lbs), steering preference, voice level, years of experience, and notes.
- **Cox Technical Ratings**: Coaches rate cox performance post-practice on set/balance, timing, call quality, situational awareness (1-5).
- **Cox Ratings History**: Track coxswain improvement over the season with historical ratings.
- **Cox Weight Validation**: Ensure cox weight is within weight-class limits.
- **Coxswain Attendance**: Coxswains included in attendance system for boat lineups.

### Seat Racing
- **Seat Racing Analysis**: Log seat racing results comparing athletes in the same seat across multiple boats.
- **Comparison Calculations**: Automatic differential calculation between athlete performance in different boats.
- **Seat Racing History**: Archive of all seat racing sessions with athlete-to-athlete comparisons.
- **Accumulative Rankings**: Cumulative ranking view showing athlete competitive hierarchy from seat racing.

### Team Leaderboard
- **Team Erg Leaderboard**: Internal team ranking of best 2K erg times by athlete.
- **Team Comparison**: Side-by-side athlete comparison by erg scores, splits, watts, watts/kg.

### Team Training
- **Team Training Plan Generator**: AI generates customized training plans for entire team.
- **Load Management**: Track athlete training load over time and identify over/under-trained athletes.
- **Fatigue Heatmap**: Visual calendar showing athlete fatigue levels across the training week.
- **Workout Comparison**: Compare same workout across multiple athletes for performance analysis.

### Team Communication
- **Team Message Board**: Real-time team chat/message board for team-wide communication.
- **Team Regattas**: Connect team results to regatta database for centralized race tracking.
- **Parent Weekly Reports**: Automatic email summary reports sent to parents with team and athlete updates.
- **Recruiting Gaps Analysis**: Identify roster gaps (weak 2-seat, need lightweight rower, etc.) for recruiting targets.

### Direct Messaging (Teams)
- **Team Direct Messages**: Coach-to-athlete or athlete-to-athlete messaging within team context.
- **Message History**: Full message conversation history with timestamps.

### Season Management
- **Team Seasons**: Create named seasons (e.g., "Fall 2024", "Spring 2025") with start/end dates.
- **Active Season Tracking**: Mark seasons as active to organize practices and lineups.
- **Season-Linked Lineups**: Assign lineups and results to specific seasons for better organization.

### Coaching Staff
- **Multiple Coaches**: Add assistant coaches and volunteer coaches to a team.
- **Coach Roles**: Head coach, assistant coach, volunteer coach with permission-based access.
- **Coach Invitations**: Send time-limited email invites to coaches to join team.
- **Coach Management Interface**: Add, remove, and manage coach permissions for team.

## Recruiting & Athletes

### Public Athlete Profiles
- **Public Profile Page**: Shareable athlete profile with name, bio, and performance statistics.
- **Personal Records Display**: Show best times across distances (2K, 5K, 6K, 60min, etc.).
- **Athlete Stats Display**: Showcase height, weight, age, country, rowing years, and academics.
- **Academic Information**: Display SAT/ACT scores, GPA, class rank, and intended major.
- **Follow System**: Allow other athletes and coaches to follow and receive updates on athlete progress.
- **Shareable URL**: Generate and share unique URL for athlete profile with clean URL structure (e.g., /athlete/username).
- **Profile Analytics**: View count of profile visits and engagement.

### Recruiting Profile
- **Recruiting Profile Section**: Athletes create dedicated recruiting profile with pitch and call-to-action.
- **Recruiting Information**: Add class year, GPA, test scores, academic goals, rowing goals.
- **PDF Export**: Generate and download shareable PDF recruiting profile for college coaches.
- **Recruiting Email Generator**: AI template generator for personalized recruiting emails to coaches.

### College Recruiting
- **College Target List**: Athletes maintain list of target schools and coaches with contact info.
- **AI Fit Scoring**: ML-powered school fit score based on GPA, test scores, and erg times.
- **Contact History**: Log outreach attempts, responses, and communication with colleges.
- **Recruiting Status Tracker**: Track application status (interested, applied, accepted, committed, etc.).
- **National Ranking**: Athletes ranked nationally by erg scores within their class year.

### Virtual Combine
- **Combine Entry**: Athletes submit 2K, 6K, bench press, deadlift, squat, weight, and year.
- **Combine Score Calculation**: Standardized scoring rubric converts physical test results to comparable points.
- **Combine Results**: Browse combine results ranked by score with filters by class year and gender.
- **Combine Participation**: Open to all athletes for national comparison snapshot.

### Alumni Network
- **Alumni Directory**: Browse past athletes and connect with alumni by class year and location.
- **Alumni Status**: Designate graduates and maintain alumni connection to program.
- **Alumni Resources**: Networking opportunities and resources for graduated athletes.

## Regattas & Racing

### Regatta Management
- **Regatta Search**: Browse upcoming regattas by location, date, and event type.
- **Regatta Results**: View regatta results with all race entries, placements, and splits.
- **Regatta Calendar**: Team calendar showing upcoming regattas in the next 90 days.
- **Regatta Database**: Seed data with 2025 and 2026 U.S. rowing regattas.
- **Regatta Clubs**: Find rowing clubs and venues hosting regattas.

### Result Claiming
- **Claim Results**: Athletes claim and attribute regatta results to their profile.
- **Result Verification**: Coaches verify claimed results for accuracy.
- **Racing History**: Full historical racing record with boats, times, placements, and dates.

### Team Regattas
- **Team Regatta Tracker**: Coaches track team regatta entries, boat assignments, and results.
- **Team Results View**: View all team race results in one location with performance trending.

### Head-to-Head Racing
- **Live Head-to-Head**: Real-time racing against other athletes using live PM5 sync.
- **Race Rooms**: Create race rooms for 2-8 athletes to compete simultaneously.
- **Matchmaking**: Ability to invite specific opponents or request matchmaking by ability.
- **Race Replay**: Full race replay and comparison of splits, stroke rates, and watts.
- **Race Results**: Record race results and add to head-to-head racing history.
- **Race Rankings**: Global rankings by head-to-head racing performance and win-loss record.

## Competition & Challenges

### Global Leaderboards
- **Global Rankings**: Worldwide ranking of erg scores across multiple distances and categories.
- **Age-Based Rankings**: Separate rankings by age group (junior, U23, senior, masters).
- **Weight Class Rankings**: Lightweight and open weight class rankings.
- **Gender Rankings**: Separate male/female leaderboards.
- **Verification System**: Only verified scores (Concept2 or live PM5) appear on leaderboards.
- **Leaderboard Reports**: Export leaderboard data for team reports.

### Weekly Challenges
- **Challenge Creation**: Launch new weekly challenges with specific erg distance and target time.
- **Challenge Leaderboard**: Real-time leaderboard for current challenge with live updates.
- **Streak Tracking**: Track consecutive weekly challenge participation.
- **Challenge Badges**: Earn badges for winning challenges and achieving milestone streaks.
- **Challenge Archives**: Browse past challenge results and your historical performance.

### Achievements & Badges
- **Badge System**: Earn badges for milestones (first 2K under 7:00, 100 workouts, etc.).
- **Achievement Tracking**: View all earned and unlocked badges with unlock dates.
- **Public Badge Display**: Show badges on public athlete profile to showcase accomplishments.
- **Social Sharing**: Share badge achievements on social media from profile.

## Coaches Hub

### Recruiting Tools (Coach Perspective)
- **Recruit Discovery**: Search and discover recruiting prospects with filtering by location, grade, erg times.
- **Recruit Scoring**: AI scoring system to identify best recruiting fits for your program.
- **Recruiting Board**: Kanban board to organize recruits by status (prospect, contacted, interested, offered, committed).
- **Following List**: Track prospects you're actively recruiting with notes and communication history.
- **Contact History**: Log all outreach, emails, calls, and recruiting interactions with prospects.
- **Program Profile**: Coaches fill out program information, recruiting standards, and scholarship info.
- **Recommended Recruits**: AI recommendations for athletes matching your program profile.

### Athlete Management
- **Athlete Directory**: View all athletes in your program with contact info and performance.
- **Athlete Performance Tracking**: Historical and current performance metrics for each athlete.
- **Athlete Goal Setting**: Set and track individual athlete goals for the season.

### Program Analytics
- **Program Dashboard**: Coach administrative overview of team status, metrics, and alerts.
- **Team Statistics**: Average team 2K, roster size, training volume, injury statistics.
- **Recruiting Targets**: List of positions/athlete types needed for the program.

### Email & Notifications
- **Weekly Email Reports**: Coaches receive summary email of team activities and athlete updates.
- **Parent Notifications**: Weekly parent email reports with athlete progress and team updates.
- **Alert System**: Notifications for injury concerns, attendance issues, and performance drops.

## Organizations & Multi-Team

### Organization Management
- **Create Organization**: Multi-team organizations (e.g., "Yale Rowing" containing varsity, JV, novice).
- **Team Hierarchy**: Organize teams within organizations by crew type or competitive level.
- **Organization Admin**: Administrators can manage multiple teams and coaches across organization.
- **Organization Directory Listing**: Featured organizations appear in directory with all member teams.

### Cross-Team Coordination
- **Multi-Team Coaching**: Coaches manage multiple teams within organization.
- **Organization Analytics**: Aggregate statistics across all organization teams.
- **Organization Calendar**: Central calendar showing all practices and regattas for all teams.

## Database & Infrastructure

### Data Model
- **Profiles Table**: User profiles with name, email, role, height, weight, rowing experience, coaching info.
- **Teams Table**: Team data with name, location, division, coach, athlete count, directory visibility.
- **Team Members**: Athlete-to-team relationships tracking membership.
- **Team Coaches**: Multiple coaches per team with roles and permissions.
- **Boat Lineups**: Boat configurations with date, athlete assignments, cox, results.
- **Practice Entries**: On-water sessions with attendance, lineups, conditions, weather.
- **On-Water Results**: Boat times, splits, stroke rates for on-water pieces.
- **Erg Workouts**: Individual erg sessions with splits, watts, duration, type.
- **Erg Scores**: Verified test scores (2K, 5K, 6K, 60min) with source and verification status.
- **Strength Workouts**: Strength training sessions with exercises, weights, reps, sets.
- **Personal Records**: Best times and improvements tracked by distance and athlete.
- **Regattas**: Regatta events with date, location, results.
- **Regatta Results**: Individual boat finishes with placement, time, split.
- **Combine Entries**: Virtual combine submissions with test results and scoring.
- **Athlete Academics**: SAT/ACT scores, GPA, class rank, major interest.
- **Team Seasons**: Named season periods (fall, spring) for organizing training/racing.
- **Team Boats**: Named boat classes and individual boats within teams.
- **Organizations**: Multi-team organization groupings.
- **Chat Messages**: AI coach chat history with persistent storage.
- **Notifications**: System notifications and push notification preferences.

### API & Integrations

#### Supabase Functions (Edge Functions)
- **generate-team-training-plan**: Claude-powered team training plan generation.
- **generate-strength**: AI-powered strength workout program generation.
- **generate-meals**: AI meal plan generation with nutritional balance.
- **critique-rowing**: AI video technique analysis and feedback.
- **compare-athletes**: Side-by-side performance comparison.
- **optimize-race-lineup**: AI boat lineup optimization.
- **score-recruits**: Recruiting prospect scoring and fit analysis.
- **sync-whoop**: WHOOP device data synchronization.
- **daily-c2-sync**: Concept2 logbook auto-sync job.
- **send-notification**: Push notification delivery system.
- **c2-logbook-auth**: Concept2 OAuth token exchange.
- **c2-disconnect**: Revoke Concept2 OAuth.
- **parse-erg-screen**: OCR parsing of erg monitor screenshots.
- **parse-workout-image**: Image recognition for workout data entry.
- **scan-barcode**: Barcode scanning for food database lookup.
- **generate-recruit-emails**: AI template generation for recruiting emails.
- **generate-season-report**: End-of-season AI report generation.
- **wearable-webhook**: Open Wearables API callback handler.
- **wearable-callback**: Wearable device integration callbacks.
- **debug-whoop-recovery**: WHOOP data debugging and diagnostic.

#### Remote Data Syncing
- **Daily C2 Sync**: Background job syncs Concept2 logbook daily for all connected users.
- **WHOOP Auto Sync**: Background job syncs WHOOP recovery data daily.
- **Open Wearables Integration**: Support for Terra/OpenWearables API for multi-device wearable sync.

#### Row-Level Security (RLS)
- **Profile Access**: Users can view public profiles; own profile fully editable.
- **Team Access**: Team members and coaches can view team data; coaches manage lineups.
- **Workout Privacy**: Athletes own their workouts; coaches can view team member workouts.
- **Leaderboard Privacy**: Users control whether scores appear on public leaderboards.
- **Organization Access**: Organization admins manage all child teams.

## Mobile Experience

### Mobile Optimizations
- **Responsive Design**: Full responsive design for phones, tablets, and desktops.
- **Mobile Bottom Navigation**: Quick access bottom nav for mobile dashboard navigation.
- **Mobile-Optimized Forms**: Touch-friendly inputs and dropdowns for mobile data entry.
- **iOS Native App**: Capacitor-wrapped iOS native app with home screen support.
- **App Store Assets**: App store marketing materials (screenshots, description, icons).
- **Android Support**: React Native + Capacitor for cross-platform support.
- **Safe Area Insets**: Respect notch and safe area on modern mobile devices.
- **Gesture Support**: Pull-to-refresh and swipe navigation on mobile.

### Push Notifications
- **Push Notification System**: Firebase Cloud Messaging or similar push notification delivery.
- **Notification Preferences**: Users control notification types and frequency (on/off per feature).
- **Team Alerts**: Notifications for practice updates, lineup changes, and team events.
- **Challenge Alerts**: Notifications for challenge completions and weekly leaderboard updates.
- **Device Registration**: Multiple device push token registration per user.

## Security & Privacy

### Authentication
- **Supabase Auth**: PostgreSQL-backed authentication with email/password and OAuth.
- **Session Management**: Secure session handling with automatic logout on expiration.
- **Password Reset**: Email-based password reset with secure token.

### Privacy Controls
- **Leaderboard Opt-In**: Granular control over whether scores appear publicly.
- **Profile Visibility**: Control public profile visibility and shared information.
- **Data Export**: Users can export their data for portability.

### Billing & Plans
- **Subscription Plans**: Free, Pro, Elite, Elite+ pricing tiers with feature differentiation.
- **Beta Pricing**: Early adopters lock in 20% lifetime discount.
- **Monthly/Annual Billing**: Support for monthly and annual billing cycles with annual discount.
- **Feature Access Control**: Premium features restricted by plan tier with upsell prompts.

## Platform Features

### Landing Pages
- **Marketing Landing Page**: Public-facing landing page with features showcase, pricing, testimonials.
- **Pricing Page**: Full pricing tier comparison with feature matrix and upgrade CTAs.
- **Privacy Policy**: Legal privacy policy and terms of service.

### Notifications
- **In-App Notifications**: Toast notifications for actions and system messages.
- **Push Notifications**: Mobile push notifications for important updates and alerts.
- **Email Notifications**: Summary emails for team activity, parent reports, recruiting updates.
- **Notification Settings**: User control panel for notification type and frequency preferences.

### Theme Support
- **Light/Dark Mode**: Toggle between light and dark themes with system preference detection.
- **Theme Persistence**: Save theme preference to local storage.

### Data Export & Reporting
- **Workout Export**: Export workout history as CSV/JSON.
- **Leaderboard Export**: Export leaderboard rankings for coaching records.
- **Team Report**: Generate and export team performance reports.
- **PDF Generation**: Export plans and profiles as shareable PDFs.

---

**Last Updated**: May 2026
**Codebase**: CrewSync - AI-Powered Rowing Platform
**Total Features Identified**: 200+
