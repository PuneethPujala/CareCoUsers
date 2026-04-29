# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

This is a monorepo for **CareMyMed / CareConnect** — a healthcare management platform.

| Directory | Purpose |
|-----------|---------|
| `users-mobile/` | React Native (Expo) app for patients and callers |
| `users-backend/` | Node.js/Express API server used by `users-mobile` |
| `backend/` | Older/parallel backend (admin app API gateway); `users-backend` is the primary one |
| `admin-app/` | React Native admin app for org admins, care managers, caretakers |
| `users-ai-vitals/` | AI vitals prediction service |

## Common Commands

### Mobile App (`users-mobile/`)
```bash
cd users-mobile
npm install
npm start           # Expo dev server (scan QR with Expo Go)
npm run android     # Run on Android device/emulator
npm run ios         # Run on iOS simulator
npm test            # Jest tests (jest-expo preset)
npm test -- --testPathPattern=SomeTest   # Run a single test file
```

### Backend (`users-backend/`)
```bash
cd users-backend
npm install
npm run dev         # nodemon (hot-reload)
npm start           # production
npm run seed        # seed role permissions into MongoDB
npm test            # Jest + supertest
npm run test:watch
npm run test:coverage
npm test -- auth.test.js   # Run a single test file
```

### Backend health check
```bash
curl http://localhost:3001/health
```

## Environment Setup

**`users-mobile/.env`** (copy from `.env.example` in root):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=http://localhost:3001/api
EXPO_PUBLIC_RESET_PASSWORD_URL=exp://192.168.1.100:8081/reset-password
EXPO_PUBLIC_SENTRY_DSN=   # optional
```

**`users-backend/.env`** (copy from `users-backend/.env.example`):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
MONGODB_URI=
PORT=3001
NODE_ENV=development
JWT_SECRET=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_MS=604800000
AUTH_ENABLE_SUPABASE_FALLBACK=false   # set true to allow legacy Supabase tokens
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=
```

Redis is required by the backend (session validity checks via `tokenService.checkRedisSessionValidity`). Configure via `REDIS_URL` or default `localhost:6379`.

## Architecture

### Authentication Flow

The system uses a **dual-token architecture**:
1. **CareMyMed JWT** (primary) — issued by `users-backend/src/services/tokenService.js`, signed with `JWT_ACCESS_SECRET`. Short-lived (15 min) access token + opaque refresh token stored hashed in MongoDB and cached in Redis.
2. **Supabase Auth** (fallback/legacy) — enabled only when `AUTH_ENABLE_SUPABASE_FALLBACK=true`, used for Google OAuth and migrating old accounts.

`users-backend/src/middleware/authenticate.js` tries JWT first (`attachJwtUser`), then falls back to Supabase (`attachSupabaseUser`). `req.profile` is always a Mongoose `Patient` or `Profile` document after successful auth.

On the mobile side, `users-mobile/src/context/AuthContext.jsx` manages session state, profile caching in `expo-secure-store`, and Supabase `onAuthStateChange` events. The `usePatientStore` (Zustand) holds all patient data fetched after login.

### API Layer (`users-mobile`)

`src/lib/api.js` — axios instance with interceptors that:
- Prefer CareMyMed JWTs; fall back to Supabase tokens (Google sign-in)
- Proactively refresh access tokens when < 90 s remain
- Queue failed requests during token refresh (single in-flight refresh)

`src/lib/OfflineSyncService.js` — queues mutations to `AsyncStorage` when offline; flushes on network restore (wired in `AppNavigator`).

`src/lib/CacheService.js` — user-scoped cache (prefixed by UID). Sensitive health data keys (`medications_today`, `health_profile`, `patient_data`) use `react-native-encrypted-storage` when available.

### Navigation (`users-mobile`)

`AppNavigator` (root) decides which stack to render based on auth state:
1. `isBootstrapping` → splash
2. `!user` → `AuthStack` (Login, PatientSignup, ResetPassword, VerifyEmail, MFAVerify)
3. `!onboardingComplete` → `PatientOnboardingStack`
4. `subscriptionStatus !== 'active'` → Payment gate
5. Otherwise → `MainAppStack` → `PatientTabNavigator` (Home, MyCaller, Medications, HealthProfile, Profile)

Deep links (`CareMyMed-app://`) are configured in `App.js` for `reset-password` and `verify-email`.

### Backend Route Structure (`users-backend`)

`server.js` mounts:
- `/api/auth` — registration, login, logout, refresh, password reset, MFA
- `/api/users/patients` — patient profile, dashboard, vitals, medications
- `/api/users/callers` — caller (caretaker) endpoints
- `/api/users/medicines` — medicine management
- `/api/vitals` — vitals ingestion and sync
- Standard admin routes (`/api/patients`, `/api/organizations`, etc.)

Background jobs run on startup (skipped in `NODE_ENV=test`):
- `jobs/notificationJob.js` — cron-based push notifications
- `jobs/medicationReminderJob.js` — 1-minute medication reminder cron

### RBAC

Roles: `super_admin` → `org_admin` → `care_manager` → `caretaker` / `patient_mentor` → `patient`.

Server-side enforcement via:
- `middleware/authenticate.js` — verifies token, loads `req.profile`
- `middleware/authorize.js` — permission checks against `RolePermission` MongoDB collection
- `middleware/scopeFilter.js` — filters query results to the caller's organization/patient scope
- `requireRole(...roles)` — inline role guard exported from `authenticate.js`

Patient accounts use the `Patient` Mongoose model; all other staff use `Profile`. The `authenticate` middleware handles both transparently via `payload.typ === 'patient'`.

### Data Models (`users-backend/src/models/`)

Key models: `Patient`, `Profile`, `Organization`, `Medication`, `MedicineLog`, `VitalLog`, `CallLog`, `Notification`, `AuditLog`, `RefreshToken`, `RolePermission`.

### Mobile State Management

Zustand store (`usePatientStore`) is the single source of truth for patient dashboard data. It exposes optimistic update methods (`optimisticToggleMed`, `optimisticMarkSlotTaken`) that update state immediately and revert on API failure. Always use the store's action methods rather than calling `apiService` directly from screens.

### Security Notes

- Screen capture is disabled for patients who have `allow_screenshots: false` in their profile.
- A privacy overlay is shown when `appState === 'background'` (not `inactive` — iOS control center pull-down briefly sets `inactive` and should not trigger the overlay).
- Sentry is initialized before any other code in `App.js`; PII (email, IP) is stripped in `beforeSend`.
- Stale notifications (> 30 s old) are ignored on app mount to prevent spurious navigation.

## E2E Testing

Maestro flows are in `users-mobile/.maestro/flows/`:
- `happy_path_signup.yaml`
- `session_expiry.yaml`
