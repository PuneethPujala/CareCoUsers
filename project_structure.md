# Project Structure

This document outlines the core directory tree of the CareMyMed / CareConnect monorepo, clearly separating active codebases from legacy modules.

---

## Monorepo Overview

```
CareCoUsers/
├── users-mobile/           # [ACTIVE] React Native (Expo) app for patients & callers
├── users-backend/          # [ACTIVE] Primary Node.js/Express API server
├── users-ai-vitals/        # [ACTIVE] AI Vitals Prediction Service (Python/FastAPI)
├── chroma/                 # [ACTIVE] Local Chroma DB vector store for RAG companion guidelines
├── admin-app/              # [LEGACY - UNMAINTAINED] React Native admin app (staff/managers)
├── backend/                # [LEGACY - DEPRECATED] Older Node.js backend & admin API gateway
├── docs/                   # Documentation archives and reference files
├── .github/                # GitHub actions and CI workflows
├── DESIGN_CONTRACT.md      # UI/UX design contract for the mobile app
└── notifications_playbook.md # Push notification architecture & setup guide
```

---

## Active Codebases

### 1. Patient & Caller App — [users-mobile/](file:///c:/dev/CareCoUsers/users-mobile)
The primary customer-facing codebase, built using Expo.
```
users-mobile/
├── .maestro/               # E2E Maestro flows (signup, session expiry)
├── assets/                 # App assets (icons, splash screens)
└── src/
    ├── assets/             # In-app image and media assets
    ├── components/         # Common UI elements & custom styling hooks
    ├── constants/          # App-wide constants and configuration values
    ├── context/            # Global AuthState & profile management
    ├── hooks/              # Custom React hooks
    ├── i18n/               # Internationalization / localization strings
    ├── lib/                # OfflineSyncService, API Client, CacheService
    ├── navigation/         # Navigation navigators (Auth, Main, Onboarding stacks)
    ├── providers/          # React context providers (theme, etc.)
    ├── screens/
    │   ├── app/            # Cross-cutting app-level screens
    │   ├── auth/           # Login, Signup, MFA, ResetPassword screens
    │   ├── caller/         # Caller Dashboard, Feed, CallLogs, ActiveCall
    │   ├── onboarding/     # Patient onboarding flow screens
    │   ├── patient/        # Patient Dashboard, Adherence, HealthProfile, Vitals
    │   └── settings/       # User settings & preferences
    ├── services/           # Service integrations (push notifications, analytics)
    ├── store/              # Zustand state manager (usePatientStore)
    ├── theme/              # Design tokens, colors, and theming
    └── utils/              # Shared utility functions
```

### 2. Primary Backend Server — [users-backend/](file:///c:/dev/CareCoUsers/users-backend)
The primary backend serving the patient and caller apps, backed by MongoDB & Redis.
```
users-backend/
├── src/
│   ├── config/             # DB & Redis connection pools
│   ├── constants/          # Application-wide constants
│   ├── controllers/        # Express route handlers
│   ├── jobs/               # cron notification and reminder worker jobs
│   ├── lib/                # Shared library code (Supabase client, etc.)
│   ├── middleware/         # authentication guards, authorize RBAC, scopeFilter scope
│   ├── models/             # Mongoose schemas (Patient, Profile, Alert, CallLog, Medication, etc.)
│   ├── routes/             # Express API endpoints
│   ├── scripts/            # One-off maintenance and migration scripts
│   ├── seeds/              # Database seed data (role permissions)
│   ├── services/           # Business logic & external service integrations (Companion AI, Token, Mail)
│   ├── utils/              # Winston logger, error classes, patient helpers
│   └── validators/         # Request body and query validators
└── tests/                  # Jest test suites (services, routes)
```

### 3. AI Vitals Forecasting Service — [users-ai-vitals/](file:///c:/dev/CareCoUsers/users-ai-vitals)
AI prediction and forecasting service using Python, FastAPI, and PyTorch.
```
users-ai-vitals/
├── models/                 # PyTorch model architectures and forecaster engines
├── tests/                  # Unit and integration test suites
└── main.py                 # FastAPI endpoints & server configuration
```

---

## Legacy Modules [DEPRECATED / UNMAINTAINED]

> [!WARNING]
> The modules below are **no longer actively maintained** and should not be modified. They are kept for historical reference or older gateway integration. Do not query their database schemas or deploy their routes.

### 1. Legacy Admin App — [admin-app/](file:///c:/dev/CareCoUsers/admin-app)
Older React Native admin panel for managers and org admins.

### 2. Legacy Backend Gateway — [backend/](file:///c:/dev/CareCoUsers/backend)
Parallel Express gateway used by the legacy admin app.
