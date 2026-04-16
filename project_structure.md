# Core Integration Directory Structure

`	ext
IIEC-Project/
|-- admin-app/
|   |-- src/
|   |   |-- components/
|   |   |   |-- common/
|   |   |   |   |-- Button.jsx
|   |   |   |   |-- Card.jsx
|   |   |   |   |-- EmptyState.js
|   |   |   |   |-- GradientHeader.js
|   |   |   |   |-- Input.jsx
|   |   |   |   |-- PatientHealthView.js
|   |   |   |   |-- PremiumButton.js
|   |   |   |   |-- PremiumCard.js
|   |   |   |   |-- PremiumInput.js
|   |   |   |   |-- SkeletonCard.jsx
|   |   |   |   |-- SkeletonLoader.js
|   |   |   |   -- StatusBadge.js
|   |   |   |-- layout/
|   |   |   |   -- ScreenWrapper.jsx
|   |   |   |-- premium/
|   |   |   |   |-- AnimatedNumber.jsx
|   |   |   |   |-- FloatingBottomNav.js
|   |   |   |   |-- HeroStatCard.jsx
|   |   |   |   |-- RecentActivity.js
|   |   |   |   -- StatCard.jsx
|   |   |   -- ProtectedRoute.jsx
|   |   |-- context/
|   |   |   -- AuthContext.jsx
|   |   |-- hooks/
|   |   |   |-- useAnimations.js
|   |   |   |-- useDashboard.js
|   |   |   -- useGoogleAuth.js
|   |   |-- lib/
|   |   |   |-- api.js
|   |   |   -- supabase.js
|   |   |-- navigation/
|   |   |   |-- AuthNavigator.jsx
|   |   |   |-- DashboardNavigator.js
|   |   |   |-- OrgAdminNavigator.jsx
|   |   |   -- RootNavigator.jsx
|   |   |-- screens/
|   |   |   |-- auth/
|   |   |   |   |-- EmailVerificationScreen.jsx
|   |   |   |   |-- ForgotPasswordScreen.jsx
|   |   |   |   |-- LoginScreen.jsx
|   |   |   |   |-- RoleSelectionScreen.jsx
|   |   |   |   -- SignupScreen.jsx
|   |   |   |-- dashboards/
|   |   |   |   |-- CallerDashboard.js
|   |   |   |   |-- CallerDetail.js
|   |   |   |   |-- CallersList.js
|   |   |   |   |-- CareManagerDashboard.js
|   |   |   |   |-- CareManagersList.js
|   |   |   |   |-- ManagerDetail.js
|   |   |   |   |-- MentorDashboard.js
|   |   |   |   |-- MentorDetail.js
|   |   |   |   |-- OrgAdminDashboard.js
|   |   |   |   |-- PatientDashboard.js
|   |   |   |   |-- PatientDetail.js
|   |   |   |   |-- PatientMentorsList.js
|   |   |   |   |-- PatientsList.js
|   |   |   |   -- SuperAdminDashboard.js
|   |   |   |-- details/
|   |   |   |   |-- ActiveCallScreen.js
|   |   |   |   |-- CallerDetailScreen.js
|   |   |   |   |-- EmergencyScreen.js
|   |   |   |   |-- ManagerDetailScreen.js
|   |   |   |   |-- NotificationsScreen.js
|   |   |   |   |-- OrgDetailScreen.js
|   |   |   |   -- PatientDetailScreen.js
|   |   |   |-- tabs/
|   |   |   |   |-- ActivityScreen.js
|   |   |   |   |-- AdminSearchScreen.js
|   |   |   |   |-- CallHistoryScreen.js
|   |   |   |   |-- OrganizationsListScreen.js
|   |   |   |   |-- PatientsListScreen.js
|   |   |   |   |-- ReportsScreen.js
|   |   |   |   -- TeamListScreen.js
|   |   |   |-- ChangePasswordScreen.jsx
|   |   |   |-- CreateOrganizationScreen.jsx
|   |   |   |-- CreateUserScreen.jsx
|   |   |   |-- ForgotPasswordScreen.js
|   |   |   |-- GetStartedScreen.js
|   |   |   |-- LandingScreen.js
|   |   |   |-- LoginScreen.js
|   |   |   |-- ProfileScreen.js
|   |   |   -- SignupScreen.js
|   |   |-- services/
|   |   |   -- socket.js
|   |   -- theme/
|   |       |-- colors.js
|   |       |-- styles.js
|   |       -- theme.js
|   |-- App.js
|   |-- babel.config.js
|   -- index.js
|-- backend/
|   |-- src/
|   |   |-- config/
|   |   |   |-- database.js
|   |   |   -- redis.js
|   |   |-- middleware/
|   |   |   |-- authenticate.js
|   |   |   |-- authorize.js
|   |   |   -- scopeFilter.js
|   |   |-- models/
|   |   |   |-- AuditLog.js
|   |   |   |-- CallLog.js
|   |   |   |-- CaretakerPatient.js
|   |   |   |-- Escalation.js
|   |   |   |-- Invoice.js
|   |   |   |-- Medication.js
|   |   |   |-- MentorAuthorization.js
|   |   |   |-- Notification.js
|   |   |   |-- Organization.js
|   |   |   |-- PasswordResetOtp.js
|   |   |   |-- Patient.js
|   |   |   |-- Profile.js
|   |   |   -- RolePermission.js
|   |   |-- routes/
|   |   |   |-- admin.js
|   |   |   |-- auth.js
|   |   |   |-- caretaker.js
|   |   |   |-- caretakers.js
|   |   |   |-- dashboard.js
|   |   |   |-- manager.js
|   |   |   |-- mentors.js
|   |   |   |-- org.js
|   |   |   |-- organizations.js
|   |   |   |-- patients.js
|   |   |   |-- profile.js
|   |   |   -- reports.js
|   |   |-- services/
|   |   |   |-- adherenceCalculator.js
|   |   |   |-- analyticsService.js
|   |   |   |-- auditService.js
|   |   |   |-- caretakerService.js
|   |   |   |-- emailService.js
|   |   |   |-- mentorService.js
|   |   |   |-- notificationService.js
|   |   |   -- reconciliationService.js
|   |   |-- utils/
|   |   |   |-- autoAssign.js
|   |   |   -- pagination.js
|   |   |-- websocket/
|   |   |   -- handlers.js
|   |   -- server.js
|   |-- clear-cache.js
|   |-- fix_caretaker.js
|   -- generateTodayCalls.js
|-- generate_tree.js
|-- project_structure.md
|-- README.md
-- SETUP.md
`
