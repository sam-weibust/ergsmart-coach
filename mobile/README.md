# CrewSync Mobile

React Native / Expo app for the CrewSync rowing training platform.

## Setup

1. Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
   ```
   cp .env.example .env.local
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npx expo start
   ```

## Tech Stack

- **Expo 52** with Expo Router 4 (file-based routing)
- **React Native 0.76** with New Architecture enabled
- **NativeWind 4** for Tailwind CSS styling
- **Supabase** with AsyncStorage auth persistence
- **Zustand** for global state (auth, workout, UI)
- **TanStack Query** for server state / data fetching
- **Victory Native** for charts
- **React Hook Form + Zod** for forms

## Project Structure

```
mobile/
├── app/                   # Expo Router screens
│   ├── _layout.tsx        # Root layout (auth gate, providers)
│   ├── auth.tsx           # Sign in / sign up screen
│   ├── live-erg.tsx       # Live rowing metrics screen
│   └── (tabs)/            # Bottom tab navigator
│       ├── _layout.tsx    # Tab bar config
│       ├── index.tsx      # Dashboard / Home
│       ├── training.tsx   # Training plan & log
│       ├── performance.tsx # PRs & progress charts
│       ├── teams.tsx      # Team roster & messaging
│       └── more.tsx       # Settings & tools
├── api/                   # Supabase API calls
│   ├── auth.ts
│   ├── workouts.ts
│   └── performance.ts
├── components/
│   ├── ui/                # Base UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── Toast.tsx
│   ├── MetricTile.tsx     # Large metric display (Live Erg)
│   └── WorkoutCard.tsx    # Workout list item
├── hooks/
│   ├── useAuth.ts         # Auth state + actions
│   └── useWorkouts.ts     # Workout data queries
├── lib/
│   └── supabase.ts        # Supabase client (AsyncStorage)
├── store/
│   ├── authStore.ts       # Zustand auth store
│   ├── workoutStore.ts    # Zustand workout store
│   └── uiStore.ts         # Zustand UI store (toasts, tabs)
└── types/
    └── index.ts           # All TypeScript types
```

## Building

### iOS (requires macOS + Xcode)
```
npx expo run:ios
```

### Android
```
npx expo run:android
```

### EAS Build (cloud)
```
npx eas build --platform ios
npx eas build --platform android
```
