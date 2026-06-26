# Setup & Installation Guide

This guide describes how to set up and run the CareMyMed / CareConnect monorepo services locally.

---

## 📋 Prerequisites

Before you start, ensure you have:
1. **Node.js 18+ (LTS)** & npm installed.
2. **Python 3.10+** (with `pip` & `venv`) for the AI forecasting module.
3. **MongoDB** (Atlas cluster or a local MongoDB database instance).
4. **Redis** (running locally on port `6379` or a custom Redis URL; required for backend session validation).
5. **Supabase Account** with an active project (for authentication and user registration).

---

## 🗄️ Step 1: Database Setup

### 1.1 MongoDB Configuration
1. Set up a MongoDB Atlas cluster or a local running instance.
2. Create a database called `caremymed` (or similar).
3. Retrieve your MongoDB Connection String (e.g. `mongodb+srv://...`).

### 1.2 Redis Configuration
1. Install and start Redis:
   - **macOS**: `brew install redis && brew services start redis`
   - **Windows**: Run Redis via WSL or download a native installer (e.g. Memurai or MSI installer).
2. By default, the backend expects Redis to be running at `localhost:6379`. If using a custom URL, you will set `REDIS_URL` in the environment variables.

---

## 🔐 Step 2: Supabase Authentication Setup

1. Create a project at [Supabase](https://supabase.com).
2. Go to **Project Settings** → **API** and copy:
   - **Project URL**
   - **Anon public** key
   - **Service_role** key (keep this secret, only for `users-backend`)
3. Go to **Authentication** → **Settings**:
   - In **Email Settings**, toggle "Confirm email" to `false` for easier local testing (so signups are auto-verified).
   - Configure Redirect URLs to point to your development Expo host (e.g., `exp://192.168.x.x:8081` or standard Expo deep link targets).

---

## 🔧 Step 3: Primary Backend Setup — [users-backend/](file:///c:/dev/CareCoUsers/users-backend)

The backend runs on Node.js/Express, uses MongoDB for storage, and Redis for session cache.

1. Navigate to the backend directory:
   ```bash
   cd users-backend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```
4. Edit `users-backend/.env` with your actual database and API credentials:
    ```env
    # Supabase Configuration
    SUPABASE_URL=https://your-supabase-url.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
    SUPABASE_ANON_KEY=your-supabase-anon-key

    # MongoDB Configuration
    MONGODB_URI=mongodb+srv://...

    # Server Configuration
    PORT=3001
    NODE_ENV=development

    # Security — JWT
    JWT_SECRET=your_long_random_string_secret
    JWT_ACCESS_SECRET=your_long_random_string_access_secret
    JWT_REFRESH_SECRET=your_long_random_string_refresh_secret
    JWT_ACCESS_EXPIRES_IN=15m
    JWT_REFRESH_EXPIRES_MS=604800000
    BCRYPT_ROUNDS=12
    AUTH_ENABLE_SUPABASE_FALLBACK=false

    # Rate Limiting
    RATE_LIMIT_WINDOW_MS=900000
    RATE_LIMIT_MAX_REQUESTS=100
    AUTH_RATE_LIMIT_WINDOW_MS=900000
    AUTH_RATE_LIMIT_MAX=60
    AUTH_LOGIN_RATE_LIMIT_MAX=25

    # Frontend URL (for password reset redirects)
    FRONTEND_URL=http://localhost:3000

    # Redis (session cache)
    REDIS_URL=redis://localhost:6379

    # SMTP / Email Configuration
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your_smtp_email_here@example.com
    SMTP_PASS=your_16_char_app_password_here
    FROM_EMAIL=your_sending_email_here@example.com
    ```
5. Seed the database with core role permissions:
   ```bash
   npm run seed
   ```
6. Start the server in hot-reload mode:
   ```bash
   npm run dev
   ```
   *The server runs on http://localhost:3001. Confirm it works by visiting http://localhost:3001/health.*

---

## 📱 Step 4: Mobile App Setup — [users-mobile/](file:///c:/dev/CareCoUsers/users-mobile)

The mobile application is a React Native app built using Expo.

1. Navigate to the mobile directory:
   ```bash
   cd users-mobile
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```
4. Edit `users-mobile/.env` to configure project credentials:
    ```env
    # Supabase Configuration
    EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-url.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

    # Backend API URL
    EXPO_PUBLIC_API_URL=http://localhost:3001/api

    # Application Configuration
    EXPO_PUBLIC_APP_NAME=CareMyMed
    EXPO_PUBLIC_APP_VERSION=1.0.0

    # Environment
    EXPO_PUBLIC_ENVIRONMENT=development
    EXPO_PUBLIC_DEBUG_MODE=true

    # Google OAuth (required for Google Sign-In)
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_google_web_client_id_here
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your_google_android_client_id_here
    EXPO_PUBLIC_GOOGLE_PROJECT_ID=your_google_project_id_here
    ```
   > [!IMPORTANT]
   > **Physical Device Testing**:
   > If running the app on a physical device via the Expo Go app, replace `localhost` in `EXPO_PUBLIC_API_URL` with your workstation's local LAN IP address (e.g. `http://192.168.1.55:3001/api`). Otherwise, your phone will not be able to connect to your workstation's local backend.

5. Start the Expo development server:
   ```bash
   npm start
   ```
6. Scan the QR code shown in the terminal with your device:
   - **Android**: Use the QR scanner in the Expo Go app.
   - **iOS**: Use the native camera app.

---

## 🧠 Step 5: AI Vitals Forecaster Setup — [users-ai-vitals/](file:///c:/dev/CareCoUsers/users-ai-vitals)

The AI Vital Forecasting service is a FastAPI Python microservice that models and projects vitals data.

1. Navigate to the vitals predictor directory:
   ```bash
   cd users-ai-vitals
   ```
2. Create and activate a Python virtual environment:
   - **macOS/Linux**:
     ```bash
     python -m venv venv
     source venv/bin/activate
     ```
   - **Windows**:
     ```bash
     python -m venv venv
     .\venv\Scripts\activate
     ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the microservice server:
   ```bash
   python main.py
   ```
   *The AI Forecasting service runs on port **8000**. Test it via http://localhost:8000.*

---

## 🐛 Troubleshooting

### Redis Connection Error
- **Symptom**: Server crashes on launch with `Redis Connection Failure` or is unable to track user sessions.
- **Solution**: Ensure your Redis server is running (`redis-cli ping` should return `PONG`). Check your `REDIS_URL` in `users-backend/.env`.

### Network Request Failed (Mobile app)
- **Symptom**: Sign In or Sign Up clicks in `users-mobile` load indefinitely or output a network error.
- **Solution**: Ensure your phone and development workstation are on the exact same Wi-Fi network. Ensure `EXPO_PUBLIC_API_URL` in `users-mobile/.env` is set to your workstation's LAN IP address, not `localhost`.
