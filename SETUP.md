# CareConnect Setup Guide

This guide will walk you through setting up the complete CareConnect healthcare management platform from scratch.

## 📋 Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** installed
- **MongoDB Atlas account** (or local MongoDB)
- **Supabase account** and project
- **Expo CLI** installed globally
- **Git** for version control
- **Code editor** (VS Code recommended)

## 🔧 Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project" 
3. Sign up/login to your account
4. Click "New Project"
5. Choose organization or create new one
6. Enter project details:
   - **Name**: `CareConnect`
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
7. Click "Create new project"

### 1.2 Configure Authentication

1. In your Supabase project, go to **Authentication** → **Settings**
2. Configure the following settings:

**Email Settings:**
- Enable "Confirm email" (for production)
- Set "Site URL" to your app URL
- Set "Redirect URLs" to include:
  - `exp://192.168.1.100:8081` (development)
  - `https://your-production-app.com` (production)

**JWT Settings:**
- Set "JWT expiry" to `604800` (7 days)
- Enable "Refresh token rotation"

### 1.3 Get API Keys

1. Go to **Project Settings** → **API**
2. Copy the following values:
   - **Project URL** (starts with https://)
   - **anon public** key
   - **service_role** key (for backend only)

## 🗄️ Step 2: MongoDB Setup

### Option A: MongoDB Atlas (Recommended)

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Sign up and create a free account
3. Create a new project: `CareConnect`
4. Create a new cluster:
   - Choose **M0 Sandbox** (free)
   - Select a cloud provider and region
   - Cluster name: `CareConnect`
5. Configure network access:
   - Add your IP address to whitelist
   - For development, add `0.0.0.0/0` (allows all IPs)
6. Create database user:
   - Username: `careconnect`
   - Password: Generate a strong password
7. Get connection string:
   - Click "Connect" → "Connect your application"
   - Select "Node.js"
   - Copy the connection string

### Option B: Local MongoDB

1. Install MongoDB locally:
   ```bash
   # macOS
   brew install mongodb-community
   
   # Windows
   # Download from mongodb.com
   
   # Linux
   sudo apt-get install mongodb
   ```

2. Start MongoDB:
   ```bash
   mongod
   ```

## 📱 Step 3: Frontend Setup

### 3.1 Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd IIEC-Project

# Install dependencies
npm install
```

### 3.2 Configure Environment

```bash
# Copy environment template
cp .env.example .env
```

Edit `.env` file:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Backend API Configuration  
EXPO_PUBLIC_API_URL=http://localhost:3001/api

# Password Reset Configuration
EXPO_PUBLIC_RESET_PASSWORD_URL=exp://192.168.1.100:8081/reset-password
```

Replace the Supabase values with your actual project URL and anon key.

### 3.3 Test Frontend

```bash
# Start Expo development server
npm start

# This will open Expo Go app in your browser
# Scan QR code with Expo Go app on your phone
```

## 🔧 Step 4: Backend Setup

### 4.1 Install Dependencies

```bash
cd backend
npm install
```

### 4.2 Configure Backend Environment

```bash
# Copy environment template
cp .env.example .env
```

Edit `backend/.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_ANON_KEY=your-anon-key-here

# MongoDB Configuration
MONGODB_URI=mongodb+srv://careconnect:password@cluster.mongodb.net/careconnect?retryWrites=true&w=majority

# Server Configuration
PORT=3001
NODE_ENV=development

# Security
JWT_EXPIRES_IN=7d
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

Replace:
- `SUPABASE_URL` with your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` with your service role key
- `MONGODB_URI` with your MongoDB connection string

### 4.3 Seed Database

```bash
# Seed role permissions
npm run seed
```

This will populate the database with all necessary role permissions.

### 4.4 Test Backend

```bash
# Start development server
npm run dev
```

The server should start on `http://localhost:3001`

Test health endpoint:
```bash
curl http://localhost:3001/health
```

Should return:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "CareConnect Backend API"
}
```

## 🧪 Step 5: Full System Test

### 5.1 Create Test User

1. Open the mobile app (Expo Go)
2. Click "Sign Up"
3. Fill in registration form:
   - **Email**: `test@example.com`
   - **Password**: `Test123456`
   - **Full Name**: `Test User`
   - **Role**: `Patient`
4. Submit registration

### 5.2 Verify Email

1. Check your email for verification link
2. Click the verification link
3. Return to the app

### 5.3 Test Login

1. In the app, click "Sign In"
2. Enter credentials:
   - **Email**: `test@example.com`
   - **Password**: `Test123456`
3. Click "Sign In"

You should be redirected to the Patient dashboard.

### 5.4 Test API

```bash
# Test authentication endpoint
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Test123456"}'
```

Should return JWT token and user profile.

## 🎯 Step 6: Create Demo Users

### 6.1 Create Super Admin

```bash
# Use Supabase dashboard or API to create super admin
# Or use the registration endpoint with super_admin role
```

### 6.2 Create Organization

```bash
# Create organization first, then create org admin
curl -X POST http://localhost:3001/api/organizations \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Healthcare Clinic",
    "type": "clinic",
    "subscriptionPlan": "professional"
  }'
```

### 6.3 Create Additional Users

Create users for each role using the registration endpoint or Supabase dashboard.

## 🔍 Step 7: Verify RBAC

Test that each role can only access their permitted resources:

1. **Super Admin**: Can access everything
2. **Org Admin**: Can only access their organization
3. **Care Manager**: Limited to their org
4. **Caretaker**: Only assigned patients
5. **Mentor**: Only authorized patients  
6. **Patient**: Only their own data

## 🚀 Step 8: Production Deployment

### 8.1 Backend Deployment

```bash
# Build and deploy to your hosting service
cd backend
npm run build

# Set production environment variables
export NODE_ENV=production
export PORT=3001
# ... other production vars

npm start
```

### 8.2 Frontend Deployment

```bash
# Build for production
expo build:android
expo build:ios

# Or use Expo EAS
eas build --platform android
eas build --platform ios

eas submit --platform android
eas submit --platform ios
```

### 8.3 Update Production URLs

Update environment variables in production:
- `EXPO_PUBLIC_API_URL` to your production backend URL
- `EXPO_PUBLIC_SUPABASE_URL` to your Supabase project URL
- Supabase redirect URLs to your production app

## 🐛 Common Issues & Solutions

### Issue: "Network request failed"
**Solution**: Check that backend server is running and API URL is correct.

### Issue: "Invalid token"
**Solution**: Ensure Supabase keys match between frontend and backend.

### Issue: "Profile not found"
**Solution**: Run the database seed script and check MongoDB connection.

### Issue: "Email verification required"
**Solution**: Either disable email verification in Supabase settings or verify the test email.

### Issue: "Permission denied"
**Solution**: Check that role permissions are seeded and user has correct role.

## 📞 Support

If you encounter issues during setup:

1. Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
2. Review the [API Documentation](./API.md)
3. Check GitHub Issues for similar problems
4. Contact support at support@careconnect.com

## 🎉 You're Done!

Once you've completed these steps, you should have a fully functional CareConnect platform with:

- ✅ User authentication and authorization
- ✅ Role-based access control
- ✅ Secure API endpoints
- ✅ Mobile app interface
- ✅ Audit logging
- ✅ Multi-organization support

Ready to start managing healthcare! 🏥
