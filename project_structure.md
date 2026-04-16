# CareCoUsers Directory Structure

```text
CareCoUsers/
|-- users-ai-vitals/
|   |-- models/
|   |   -- forecaster.py
|   |-- tests/
|   |   |-- __init__.py
|   |   |-- test_forecaster.py
|   |   -- test_main.py
|   |-- main.py
|   |-- output.txt
|   -- requirements.txt
|-- users-backend/
|   |-- scripts/
|   |   |-- check_patient.js
|   |   |-- migrate-cleanup-schema.js
|   |   |-- seed_guntur.js
|   |   |-- test_conn.js
|   |   |-- test_empty_profile.js
|   |   |-- testAIPrediction.js
|   |   -- verify_hierarchy.js
|   |-- src/
|   |   |-- config/
|   |   |   |-- database.js
|   |   |   -- jwt.js
|   |   |-- constants/
|   |   |   -- auth.js
|   |   |-- controllers/
|   |   |   -- authController.js
|   |   |-- jobs/
|   |   |   -- vitalsQueue.js
|   |   |-- lib/
|   |   |   -- redis.js
|   |   |-- middleware/
|   |   |   |-- asyncHandler.js
|   |   |   |-- authenticate.js
|   |   |   |-- authorize.js
|   |   |   |-- checkPasswordChange.js
|   |   |   |-- scopeFilter.js
|   |   |   -- validateRequest.js
|   |   |-- models/
|   |   |   |-- AIVitalPrediction.js
|   |   |   |-- Alert.js
|   |   |   |-- AuditLog.js
|   |   |   |-- Caller.js
|   |   |   |-- CallLog.js
|   |   |   |-- City.js
|   |   |   |-- MedicineLog.js
|   |   |   |-- Notification.js
|   |   |   |-- Organization.js
|   |   |   |-- Patient.js
|   |   |   |-- Profile.js
|   |   |   |-- RefreshToken.js
|   |   |   |-- RolePermission.js
|   |   |   -- VitalLog.js
|   |   |-- routes/
|   |   |   |-- users/
|   |   |   |   |-- callers.js
|   |   |   |   |-- medicines.js
|   |   |   |   -- patients.js
|   |   |   |-- auth.js
|   |   |   |-- organizations.js
|   |   |   |-- patients.js
|   |   |   |-- profile.js
|   |   |   |-- reports.js
|   |   |   |-- vitalsRoutes.js
|   |   |   -- vitalsSync.js
|   |   |-- scratch/
|   |   |   -- drop_unused_collections.js
|   |   |-- seeds/
|   |   |   |-- index.js
|   |   |   -- rolePermissions.js
|   |   |-- services/
|   |   |   |-- aiPredictionService.js
|   |   |   |-- auditService.js
|   |   |   |-- authService.js
|   |   |   |-- emailService.js
|   |   |   |-- otpService.js
|   |   |   |-- passwordService.js
|   |   |   |-- tokenService.js
|   |   |   -- vitalsIngestionService.js
|   |   |-- utils/
|   |   |   |-- locationUtils.js
|   |   |   -- pushNotifications.js
|   |   |-- validators/
|   |   |   -- authValidators.js
|   |   -- server.js
|   |-- tests/
|   |   |-- helpers/
|   |   |   |-- mockAuth.js
|   |   |   -- mockModels.js
|   |   |-- middleware/
|   |   |   |-- authenticate.test.js
|   |   |   |-- authorize.test.js
|   |   |   |-- checkPasswordChange.test.js
|   |   |   -- scopeFilter.test.js
|   |   |-- services/
|   |   |   -- aiPrediction.test.js
|   |   |-- users/
|   |   |   |-- callers.test.js
|   |   |   |-- medicines.test.js
|   |   |   -- patients.test.js
|   |   |-- utils/
|   |   |   -- locationUtils.test.js
|   |   |-- auth.test.js
|   |   |-- health.test.js
|   |   |-- organizations.test.js
|   |   |-- patients.test.js
|   |   |-- profile.test.js
|   |   |-- reports.test.js
|   |   -- setup.js
|   |-- .env
|   |-- .env.example
|   |-- eslint.config.js
|   |-- jest.config.js
|   |-- migrate-patient-profiles.js
|   |-- package.json
|   |-- reset-users.js
|   |-- testAnomalySync.js
|   -- testPush.js
|-- users-mobile/
|   |-- __tests__/
|   |   |-- integration/
|   |   |   |-- AuthRouting.test.jsx
|   |   |   -- OnboardingFlow.test.js
|   |   |-- lib/
|   |   |   -- CacheService.test.js
|   |   -- utils/
|   |       |-- authUtils.test.js
|   |       -- parseError.test.js
|   |-- assets/
|   |   |-- careco_features.png
|   |   |-- isometric_city.png
|   |   |-- Logo.jpg
|   |   |-- logo.png
|   |   -- splash.png
|   |-- src/
|   |   |-- components/
|   |   |   |-- caller/
|   |   |   |   -- PatientMedicationsEditor.jsx
|   |   |   -- vitals/
|   |   |       -- AIPredictionChart.jsx
|   |   |-- context/
|   |   |   |-- AuthContext.jsx
|   |   |   -- NetworkContext.jsx
|   |   |-- lib/
|   |   |   |-- api.js
|   |   |   |-- axiosInstance.js
|   |   |   |-- CacheService.js
|   |   |   |-- healthIntegration.js
|   |   |   |-- supabase.js
|   |   |   -- tokenStorage.js
|   |   |-- navigation/
|   |   |   -- AppNavigator.jsx
|   |   |-- screens/
|   |   |   |-- caller/
|   |   |   |   |-- ActivityFeedScreen.jsx
|   |   |   |   |-- HomeScreen.jsx
|   |   |   |   |-- PatientsScreen.jsx
|   |   |   |   -- ProfileScreen.jsx
|   |   |   |-- onboarding/
|   |   |   |   |-- LoginScreen.jsx
|   |   |   |   |-- PatientSignupScreen.jsx
|   |   |   |   |-- ResetPasswordScreen.jsx
|   |   |   |   |-- SplashScreen.jsx
|   |   |   |   -- VerifyEmailScreen.jsx
|   |   |   -- patient/
|   |   |       |-- AddAddressScreen.jsx
|   |   |       |-- CallerProfileScreen.jsx
|   |   |       |-- HealthConnectSetupScreen.jsx
|   |   |       |-- HealthProfileScreen.jsx
|   |   |       |-- HomeScreen.jsx
|   |   |       |-- LocationSearchScreen.jsx
|   |   |       |-- MedicationsScreen.jsx
|   |   |       |-- MyCallerScreen.jsx
|   |   |       |-- NotificationsScreen.jsx
|   |   |       |-- PaymentScreen.jsx
|   |   |       |-- ProfileScreen.jsx
|   |   |       |-- SubscribePlansScreen.jsx
|   |   |       |-- VitalsHistoryScreen.jsx
|   |   |       -- WaitingScreen.jsx
|   |   |-- services/
|   |   |   -- HealthSyncService.js
|   |   |-- theme/
|   |   |   -- index.js
|   |   -- utils/
|   |       |-- analytics.js
|   |       |-- authUtils.js
|   |       |-- notifications.js
|   |       -- parseError.js
|   |-- .env
|   |-- .env.example
|   |-- .eslintrc.js
|   |-- @k.karthik018__careco-users.jks
|   |-- App.js
|   |-- app.json
|   |-- App.test.js
|   |-- babel.config.js
|   |-- careco-e5d38-firebase-adminsdk-fbsvc-5d17ee7d6c.json
|   |-- eas.json
|   |-- google-services.json
|   |-- index.js
|   |-- jest.config.js
|   |-- jest.setup.js
|   |-- package.json
|   |-- task.md
|   -- updateTokens.js
|-- .easignore
|-- .gitattributes
|-- .gitignore
|-- generate_tree_ascii.js
|-- generate_tree.js
|-- project_structure.md
-- README.md
```
