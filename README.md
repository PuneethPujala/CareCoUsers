# CareMyMed / CareConnect — Monorepo

A comprehensive, role-based healthcare and medication management system. Built with React Native (Expo), Node.js (Express), FastAPI (Python), MongoDB, and Redis.

---

## 🏗️ Monorepo Architecture

This repository is organized as a monorepo containing active customer-facing apps alongside legacy administration modules.

### Active Components [ACTIVE]
- **[users-mobile/](file:///c:/dev/CareCoUsers/users-mobile)**: React Native (Expo) app for patients and caregivers (callers). It handles patient dashboards, vitals ingestion, adherence streaks, and active phone check-ins.
- **[users-backend/](file:///c:/dev/CareCoUsers/users-backend)**: Node.js/Express API server serving the `users-mobile` app (runs on port **3001**). Manages authentication, alerts, scheduling, and RAG chatbot context.
- **[users-ai-vitals/](file:///c:/dev/CareCoUsers/users-ai-vitals)**: AI vital forecasting service (FastAPI on port **8000**), using PyTorch models to predict patient biometric risk categories.
- **[chroma/](file:///c:/dev/CareCoUsers/chroma)**: Local vector database housing safety guidelines and RAG companion embeddings.

### Legacy Components [DEPRECATED / UNMAINTAINED]
- **[admin-app/](file:///c:/dev/CareCoUsers/admin-app)**: Legacy React Native portal for care managers and platform admins.
- **[backend/](file:///c:/dev/CareCoUsers/backend)**: Older Node.js backend API gateway corresponding to the `admin-app`.

---

## 👥 Roles & Hierarchy

```
Super Admin (Platform Owner)
    └── Org Admin (Healthcare Organization Admin)
        └── Care Manager (Clinical Lead)
            └── Caretaker / Caller (Call Center Agent)
                └── Patient / Care Recipient (End User)
```

- **Patient**: Views medication timelines, logs vitals, and talks to the AI Companion.
- **Caretaker / Caller**: Conducts scheduled care calls, updates patient adherence, and flags critical issues.
- **Care Manager**: Assigns callers, reviews patients' health trend reports, and resolves generated alerts.
- **Org Admin / Super Admin**: Standard platform management and configuration controls.

---

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 18+ (LTS) & npm
- Python 3.10+ & virtualenv (for vitals prediction)
- MongoDB (Atlas or local instance)
- Redis (required for backend session tracking)
- Expo Go app on your physical iOS/Android device

---

### Setup Instructions

### 1. Backend (`users-backend/`)
1. Navigate to the backend directory and install dependencies:
   ```bash
   cd users-backend
   npm install
   ```
2. Copy and configure the environment variables:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and fill in your MongoDB URI, Redis credentials, and Supabase keys.*
3. Seed the database role permissions:
   ```bash
   npm run seed
   ```
4. Start the server (runs on port **3001**):
   ```bash
   npm run dev
   ```

### 2. Mobile App (`users-mobile/`)
1. Navigate to the mobile directory and install dependencies:
   ```bash
   cd users-mobile
   npm install
   ```
2. Copy and configure the environment variables:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and set `EXPO_PUBLIC_API_URL` to `http://<your-lan-ip>:3001/api` (using LAN IP is necessary for physical devices running Expo Go).*
3. Start the Expo server:
   ```bash
   npm start
   ```
   *Scan the generated QR code with your mobile device's Expo Go app.*

### 3. AI Vitals Predictor (`users-ai-vitals/`)
1. Navigate to the Python service directory:
   ```bash
   cd users-ai-vitals
   ```
2. Create and load a virtual environment, then install dependencies:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   
   pip install -r requirements.txt
   ```
3. Start the forecasting microservice (runs on port **8000**):
   ```bash
   python main.py
   ```

---

## 🔐 Database Schema & Conventions

> [!WARNING]
> **Field Naming Inconsistency warning**:
> When writing database queries or scripts, check the exact property naming convention. The monorepo has mixed casing across models:
> - **camelCase Models**: `Profile`, `Medication`, `TempMedication`, `CallLog` (e.g. uses `patientId`, `organizationId`, `scheduledTime`, `isActive`).
> - **snake_case Models**: `Patient`, `Intervention`, `AIChatSession`, `Alert`, `VitalLog`, `MedicineLog`, `Notification` (e.g. uses `patient_id`, `organization_id`, `created_at`, `is_active`).
> Refer to [AGENTS.md](AGENTS.md) for full context.

### Core Collections

| Collection | Purpose |
|------------|---------|
| `Patient` | Patient profiles, health data, onboarding state |
| `Profile` | Staff/admin user profiles (all non-patient roles) |
| `Organization` | Healthcare organization details and settings |
| `Medication` | Patient medication schedules, dosages, and adherence slots |
| `TempMedication` | Temporary/PRN medications added by callers |
| `CallLog` | Scheduled and completed care call records |
| `VitalLog` | Patient vitals readings (BP, glucose, weight, etc.) |
| `MedicineLog` | Daily medication intake logs |
| `Alert` | System-generated alerts for care managers |
| `Intervention` | AI-triggered care interventions |
| `AIChatSession` | AI companion chat history and sessions |
| `Notification` | Push notification records |
| `RefreshToken` | Hashed refresh tokens for JWT session management |
| `RolePermission` | Permission definitions per role |
| `AuditLog` | Comprehensive audit trail for sensitive operations |

### Key Relationships

- Patients and staff belong to Organizations (except Super Admins)
- Caretakers (callers) are assigned to Patients via the caller flow
- All call interactions are logged in `CallLog`
- Medications, vitals, and alerts are scoped to individual patients
- All sensitive actions are recorded in `AuditLog`

---

## 🔐 Security Features

### Authentication
- **Dual-token JWT** architecture: short-lived access tokens (15 min) + hashed refresh tokens stored in MongoDB and cached in Redis
- **Supabase Auth fallback** for Google OAuth and legacy account migration (opt-in via `AUTH_ENABLE_SUPABASE_FALLBACK`)
- **MFA support**: TOTP-based multi-factor authentication (setup, verify, disable)
- **OTP verification** for email-based identity confirmation
- **Password reset flow** with configurable redirect URLs

### Authorization
- **Role-Based Access Control (RBAC)** enforced server-side via `RolePermission` collection
- **Permission-based middleware** (`authorize.js`) for API endpoints
- **Data scope filtering** (`scopeFilter.js`) based on user role and organization
- **Inline role guards** via `requireRole(...roles)` for quick route-level checks

### Data Protection
- **Rate limiting** on all API routes (configurable per endpoint)
- **Helmet.js** for HTTP security headers
- **Input validation** via dedicated validators layer
- **HIPAA-compliant audit trails** via `AuditLog`
- **Screen capture protection** for patients with `allow_screenshots: false`
- **Privacy overlay** when app is backgrounded
- **Sentry error tracking** with PII stripping (email, IP removed in `beforeSend`)

---

## 📚 API Documentation

### Health & Readiness

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (DB + Redis status) |
| GET | `/live` | Liveness probe |
| GET | `/ready` | Readiness probe |

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new patient account |
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/logout` | Logout (invalidates refresh token) |
| POST | `/api/auth/refresh-token` | Refresh access token |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/me/avatar` | Upload profile avatar |
| DELETE | `/api/auth/me` | Delete own account |
| GET | `/api/auth/me/export` | Export personal data |
| POST | `/api/auth/send-otp` | Send OTP for verification |
| POST | `/api/auth/verify-otp` | Verify OTP code |
| POST | `/api/auth/mfa/setup` | Set up MFA (TOTP) |
| POST | `/api/auth/mfa/verify` | Verify MFA login |
| POST | `/api/auth/mfa/disable` | Disable MFA |
| GET | `/api/auth/mfa/status` | Check MFA enrollment status |

### Patient Endpoints (`/api/users/patients`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/patients/dashboard` | Patient dashboard data |
| GET | `/api/users/patients/medications` | Patient medication list |
| GET | `/api/users/patients/health-profile` | Health profile & vitals summary |

### Other Route Groups

| Route Prefix | Description |
|--------------|-------------|
| `/api/users/callers` | Caller dashboard, call management, patient feed |
| `/api/users/patients/notifications` | Push notification preferences & history |
| `/api/vitals` | Vitals ingestion and sync |
| `/api/companion` | AI companion chat endpoints |
| `/api/chatbot` | RAG-based medical chatbot |
| `/api/ocr` | Prescription OCR scanning |
| `/api/payment` | Subscription and payment management |
| `/api/profile` | Staff profile management |
| `/api/patients` | Admin patient management |
| `/api/organizations` | Organization CRUD |
| `/api/reports` | Reporting and analytics |
| `/api/admin/observability` | Admin observability dashboard |

### Example API Call

```javascript
// Get current user profile
const response = await fetch('http://localhost:3001/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

const { data } = await response.json();
```

---

## 🧪 Testing

### Running Backend Tests
To run Jest integration/unit tests for the active Express server:
```bash
cd users-backend
npm test

# Run with coverage
npm run test:coverage

# Run a specific test file
npm test -- auth.test.js

# Watch mode
npm run test:watch
```

### Running Mobile Tests
To run unit tests for the Expo components:
```bash
cd users-mobile
npm test
```

### E2E Tests (Maestro)
End-to-end flows are defined in `users-mobile/.maestro/flows/`:
- `happy_path_signup.yaml` — full patient registration and onboarding
- `session_expiry.yaml` — token expiry and re-authentication

---

## 🚀 Deployment

### Backend Deployment (`users-backend`)
```bash
cd users-backend
npm start       # Production mode (no hot-reload)
```
Set `NODE_ENV=production` in your deployment environment. Ensure MongoDB Atlas and Redis are accessible from your hosting provider.

### Mobile App Build (Expo EAS)
```bash
cd users-mobile

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

### AI Vitals Service
```bash
cd users-ai-vitals
python main.py    # Runs on port 8000
```

---

## 🔧 Development Tools

### Useful Scripts

```bash
# Backend
cd users-backend
npm run dev        # Hot-reload development server (nodemon)
npm run seed       # Seed role permissions into MongoDB
npm test           # Run full test suite
curl http://localhost:3001/health   # Health check

# Mobile
cd users-mobile
npm start          # Expo development server
npm run android    # Run on Android device/emulator
npm run ios        # Run on iOS simulator
npm test           # Run Jest tests
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Read [AGENTS.md](AGENTS.md) for coding conventions (especially the field naming rules)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

**Built with ❤️ for healthcare professionals**
