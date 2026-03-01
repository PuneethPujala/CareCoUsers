import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute component - Protects routes that require authentication
 * Can also restrict access based on user roles
 */
export const ProtectedRoute = ({ 
  children, 
  allowedRoles = [], 
  requireEmailVerified = false,
  fallback = null,
  loadingComponent = null 
}) => {
  const { user, profile, loading, initializing, isEmailVerified } = useAuth();

  // Show loading indicator during initialization
  if (initializing || loading) {
    return loadingComponent || (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="mt-4 text-gray-600 font-medium">Loading...</Text>
      </View>
    );
  }

  // Redirect to login if not authenticated
  if (!user || !profile) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50 px-6">
        <View className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-4">
            Authentication Required
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            Please sign in to access this content.
          </Text>
          {/* You would typically navigate to login screen here */}
          <Text className="text-blue-600 text-center font-medium">
            Go to Login →
          </Text>
        </View>
      </View>
    );
  }

  // Check email verification if required
  if (requireEmailVerified && !isEmailVerified) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50 px-6">
        <View className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-4">
            Email Verification Required
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            Please verify your email address to continue.
          </Text>
          <Text className="text-blue-600 text-center font-medium">
            Check Your Email →
          </Text>
        </View>
      </View>
    );
  }

  // Check role-based access
  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50 px-6">
        <View className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-4">
            Access Denied
          </Text>
          <Text className="text-gray-600 text-center mb-2">
            You don't have permission to access this content.
          </Text>
          <Text className="text-gray-500 text-center text-sm mb-6">
            Required role: {allowedRoles.join(' or ')}
          </Text>
          <Text className="text-gray-600 text-center font-medium">
            Current role: {profile.role?.replace('_', ' ')}
          </Text>
        </View>
      </View>
    );
  }

  // User is authenticated and authorized
  return children;
};

/**
 * RoleGuard component - Simpler version for role-based protection only
 */
export const RoleGuard = ({ children, allowedRoles, fallback = null }) => {
  const { profile } = useAuth();

  if (!profile) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading profile...</Text>
      </View>
    );
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50 px-6">
        <View className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full">
          <Text className="text-xl font-bold text-gray-900 text-center mb-4">
            Access Denied
          </Text>
          <Text className="text-gray-600 text-center">
            This feature requires: {allowedRoles.join(' or ')}
          </Text>
        </View>
      </View>
    );
  }

  return children;
};

/**
 * PermissionGuard component - Protects based on permissions
 */
export const PermissionGuard = ({ 
  children, 
  resource, 
  action, 
  fallback = null 
}) => {
  const { hasPermission, profile } = useAuth();

  if (!profile) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading profile...</Text>
      </View>
    );
  }

  if (!hasPermission(resource, action)) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50 px-6">
        <View className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full">
          <Text className="text-xl font-bold text-gray-900 text-center mb-4">
            Permission Denied
          </Text>
          <Text className="text-gray-600 text-center">
            You don't have permission to {action} {resource}.
          </Text>
        </View>
      </View>
    );
  }

  return children;
};

/**
 * AuthGuard component - Basic authentication check
 */
export const AuthGuard = ({ children, fallback = null }) => {
  const { user, profile, loading, initializing } = useAuth();

  if (initializing || loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="mt-4 text-gray-600 font-medium">Loading...</Text>
      </View>
    );
  }

  if (!user || !profile) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50 px-6">
        <View className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-4">
            Sign In Required
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            Please sign in to continue using the app.
          </Text>
          <Text className="text-blue-600 text-center font-medium">
            Go to Login →
          </Text>
        </View>
      </View>
    );
  }

  return children;
};

/**
 * EmailVerificationGuard component - Ensures email is verified
 */
export const EmailVerificationGuard = ({ children, fallback = null }) => {
  const { isEmailVerified, user } = useAuth();

  if (!user) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading...</Text>
      </View>
    );
  }

  if (!isEmailVerified) {
    return fallback || (
      <View className="flex-1 justify-center items-center bg-gray-50 px-6">
        <View className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-4">
            Verify Your Email
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            Please check your email and click the verification link to continue.
          </Text>
          <View className="bg-blue-50 rounded-lg p-4 mb-4">
            <Text className="text-blue-800 text-center text-sm">
              Didn't receive the email? Check your spam folder.
            </Text>
          </View>
          <Text className="text-blue-600 text-center font-medium">
            Resend Verification →
          </Text>
        </View>
      </View>
    );
  }

  return children;
};

export default ProtectedRoute;
