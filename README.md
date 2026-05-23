# CareMyMednnect - Healthcare Management Platform

A comprehensive healthcare management system built with React Native, Supabase Auth, and MongoDB, featuring role-based access control (RBAC) for 6 distinct user types.

## 🏗️ Architecture Overview

**Tech Stack:**
- **Frontend**: React Native with Expo
- **Authentication**: Supabase Auth (JWT tokens, sessions, OAuth)
- **Database**: MongoDB with Mongoose ODM
- **Backend**: Node.js + Express REST API
- **Security**: Server-side RBAC with Express middleware

## 👥 User Roles & Hierarchy

```
Super Admin (Platform Owner - CareMyMednnect Internal)
    └── Org Admin (Healthcare Organization Administrator)
        └── Care Manager (Clinical Coordinator)
            └── Caretaker (Call Agent)
        └── Patient Mentor (Family Member)
        └── Patient (Care Recipient)
```

### Role Definitions

1. **Super Admin** — CareMyMednnect internal staff, full platform access
2. **Org Admin** — Organization administrator, manages their org
3. **Care Manager** — Clinical coordinator, oversees caretakers & patients in org
4. **Caretaker** — Call agent, accesses assigned patients only
5. **Patient Mentor** — Family member, views linked patient only
6. **Patient** — Care recipient, views own data only

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- MongoDB Atlas or local MongoDB instance
- Supabase project
- Expo CLI

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd IIEC-Project

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Environment Setup

```bash
# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env

# Configure your environment variables
# See Environment Configuration section below
```

### 3. Database Setup

```bash
# Start MongoDB (if using local instance)
mongod

# Seed role permissions
cd backend
npm run seed
```

### 4. Start Development Servers

```bash
# Terminal 1: Start backend server
cd backend
npm run dev

# Terminal 2: Start frontend
npm start
```

## ⚙️ Environment Configuration

### Frontend (.env)

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Backend API Configuration
EXPO_PUBLIC_API_URL=http://localhost:3001/api

# Password Reset Configuration
EXPO_PUBLIC_RESET_PASSWORD_URL=exp://192.168.1.100:8081/reset-password
```

### Backend (backend/.env)

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/caremymednnect?retryWrites=true&w=majority

# Server Configuration
PORT=3001
NODE_ENV=development

# Security
JWT_EXPIRES_IN=7d
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📱 Mobile App Structure

```
src/
├── components/          # Reusable UI components
│   └── ProtectedRoute.jsx
├── context/            # React Context providers
│   └── AuthContext.jsx
├── lib/                # Utility libraries
│   ├── api.js
│   └── supabase.js
├── navigation/         # Navigation configuration
│   └── RoleBasedNavigator.jsx
├── screens/           # Screen components
│   ├── auth/          # Authentication screens
│   ├── superAdmin/    # Super Admin screens
│   ├── orgAdmin/      # Organization Admin screens
│   ├── careManager/   # Care Manager screens
│   ├── caretaker/     # Caretaker screens
│   ├── mentor/        # Patient Mentor screens
│   └── patient/       # Patient screens
└── theme/             # Theme configuration
```

## 🔧 Backend API Structure

```
backend/src/
├── config/           # Database configuration
├── middleware/       # Express middleware
│   ├── authenticate.js
│   ├── authorize.js
│   └── scopeFilter.js
├── models/          # Mongoose models
│   ├── Profile.js
│   ├── Organization.js
│   ├── RolePermission.js
│   ├── CaretakerPatient.js
│   ├── MentorAuthorization.js
│   └── AuditLog.js
├── routes/          # API routes
│   ├── auth.js
│   ├── profile.js
│   ├── patients.js
│   ├── caretakers.js
│   ├── mentors.js
│   ├── organizations.js
│   └── reports.js
├── services/        # Business logic services
│   ├── caretakerService.js
│   ├── mentorService.js
│   └── auditService.js
├── seeds/           # Database seeding scripts
│   ├── rolePermissions.js
│   └── index.js
└── server.js        # Express server entry point
```

## 🔐 Security Features

### Authentication
- **Supabase Auth** for secure user authentication
- **JWT tokens** with automatic refresh
- **Email verification** required for account activation
- **Password policies** with complexity requirements
- **Multi-device support** with session management

### Authorization
- **Role-Based Access Control (RBAC)** enforced server-side
- **Permission-based middleware** for API endpoints
- **Data scope filtering** based on user role
- **Cross-organization access control**
- **Audit logging** for all sensitive operations

### Data Protection
- **Server-side validation** for all data operations
- **Input sanitization** and SQL injection prevention
- **Rate limiting** to prevent brute force attacks
- **HIPAA-compliant audit trails**
- **Secure password storage** with Supabase

## 📊 Database Schema

### Core Collections

1. **Profile** - User profiles with role and organization
2. **Organization** - Healthcare organization details
3. **RolePermission** - Permission definitions per role
4. **CaretakerPatient** - Caretaker-patient assignments
5. **MentorAuthorization** - Mentor access authorizations
6. **AuditLog** - Comprehensive audit trail

### Key Relationships

- Users belong to Organizations (except Super Admins)
- Caretakers are assigned to Patients via CaretakerPatient
- Mentors access Patients via MentorAuthorization
- All actions are logged in AuditLog

## 🧪 Testing

### Backend Testing

```bash
cd backend

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.js
```

### Frontend Testing

```bash
# Run Jest tests
npm test

# Run with coverage
npm test -- --coverage
```

### Manual Testing Checklist

#### Authentication Tests
- [ ] User registration with email verification
- [ ] Login with valid credentials
- [ ] Login failure with invalid credentials
- [ ] Password reset flow
- [ ] Session persistence across app restarts

#### Authorization Tests
- [ ] Super Admin can access all resources
- [ ] Org Admin limited to their organization
- [ ] Care Manager limited to their organization
- [ ] Caretaker limited to assigned patients
- [ ] Mentor limited to authorized patients
- [ ] Patient limited to own data

## 🚀 Deployment

### Backend Deployment

```bash
# Build for production
cd backend
npm run build

# Start production server
npm start
```

### Frontend Deployment

```bash
# Build for production
expo build:android
expo build:ios

# Or use Expo EAS
eas build --platform android
eas build --platform ios
```

## 📚 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/refresh` | Refresh JWT token |
| POST | `/api/auth/reset-password` | Request password reset |
| GET | `/api/auth/me` | Get current user profile |

### Protected Endpoints

All protected endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### Example API Call

```javascript
// Get current user profile
const response = await fetch('http://localhost:3001/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

## 🔧 Development Tools

### Useful Scripts

```bash
# Frontend
npm start          # Start Expo development server
npm run android     # Run on Android device/emulator
npm run ios        # Run on iOS device/simulator

# Backend
npm run dev        # Start development server with nodemon
npm run seed       # Seed database with role permissions
npm test           # Run backend tests
```

### Database Management

```bash
# Connect to MongoDB
mongosh mongodb+srv://username:password@cluster.mongodb.net/caremymednnect

# View collections
show collections

# Query profiles
db.profiles.find().pretty()
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- **Email**: support@caremymednnect.com
- **Phone**: 1-800-CARE-CONNECT
- **Documentation**: [Wiki](https://github.com/your-org/caremymednnect/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/caremymednnect/issues)

## 🎯 Roadmap

### Phase 1 (Current)
- ✅ Basic authentication and authorization
- ✅ Role-based access control
- ✅ Core user management
- ✅ Audit logging

### Phase 2 (Planned)
- 🔄 Two-factor authentication
- 🔄 OAuth integration (Google, Microsoft)
- 🔄 Real-time notifications
- 🔄 Advanced reporting

### Phase 3 (Future)
- 📋 Telehealth integration
- 📋 Medication management
- 📋 Appointment scheduling
- 📋 Billing integration

---

**Built with ❤️ for healthcare professionals**
