import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const navigation = useNavigation();
  const { resetPassword } = useAuth();

  const handleResetPassword = async () => {
    // Basic validation
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email.trim());
      setEmailSent(true);
    } catch (error) {
      console.warn('Reset password error:', error?.message);

      let errorMessage = 'An error occurred while sending reset email';

      if (error.message) {
        if (error.message.includes('Network error')) {
          errorMessage = 'Network error. Please check your internet connection';
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigation.navigate('Login');
  };

  const handleResendEmail = () => {
    setEmailSent(false);
    handleResetPassword();
  };

  if (emailSent) {
    return (
      <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center px-6 py-8">
          {/* Logo and Title */}
          <View className="items-center mb-8">
            <View className="w-20 h-20 bg-green-600 rounded-full justify-center items-center mb-4">
              <Text className="text-white text-2xl font-bold">✓</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-2">
              Reset Email Sent
            </Text>
            <Text className="text-gray-600 text-center">
              We've sent password reset instructions to your email
            </Text>
          </View>

          {/* Success Card */}
          <View className="bg-white rounded-lg p-6 shadow-sm mb-6">
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-green-100 rounded-full justify-center items-center mb-4">
                <Text className="text-3xl">📧</Text>
              </View>
              <Text className="text-lg font-semibold text-gray-900 text-center mb-2">
                Check Your Email
              </Text>
              <Text className="text-gray-600 text-center mb-4">
                We've sent password reset instructions to:
              </Text>
              <View className="bg-gray-50 rounded-lg px-4 py-2">
                <Text className="text-gray-900 font-medium">{email}</Text>
              </View>
            </View>

            {/* Instructions */}
            <View className="bg-blue-50 rounded-lg p-4 mb-6">
              <Text className="text-sm font-semibold text-blue-900 mb-3">
                Next steps:
              </Text>
              <View className="space-y-2">
                <View className="flex-row items-start">
                  <Text className="text-blue-600 mr-2">1.</Text>
                  <Text className="text-blue-800 flex-1 text-sm">
                    Open your email inbox
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-blue-600 mr-2">2.</Text>
                  <Text className="text-blue-800 flex-1 text-sm">
                    Find the email from "CareConnect"
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-blue-600 mr-2">3.</Text>
                  <Text className="text-blue-800 flex-1 text-sm">
                    Click the reset password link
                  </Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-blue-600 mr-2">4.</Text>
                  <Text className="text-blue-800 flex-1 text-sm">
                    Create a new password
                  </Text>
                </View>
              </View>
            </View>

            {/* Resend Button */}
            <TouchableOpacity
              className="w-full py-3 rounded-lg border border-blue-600 bg-white"
              onPress={handleResendEmail}
            >
              <Text className="text-blue-600 font-medium text-center">
                Resend Reset Email
              </Text>
            </TouchableOpacity>
          </View>

          {/* Back to Login */}
          <View className="items-center">
            <TouchableOpacity onPress={handleBackToLogin}>
              <Text className="text-blue-600 font-medium">
                ← Back to Login
              </Text>
            </TouchableOpacity>
          </View>

          {/* Help Section */}
          <View className="mt-8 bg-amber-50 rounded-lg p-4">
            <Text className="text-sm font-semibold text-amber-900 mb-2">
              Didn't receive the email?
            </Text>
            <View className="space-y-1">
              <Text className="text-sm text-amber-800">
                • Check your spam or junk folder
              </Text>
              <Text className="text-sm text-amber-800">
                • Make sure the email address is correct
              </Text>
              <Text className="text-sm text-amber-800">
                • Wait a few minutes and try again
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gray-50"
    >
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center px-6 py-8">
          {/* Logo and Title */}
          <View className="items-center mb-8">
            <View className="w-20 h-20 bg-blue-600 rounded-full justify-center items-center mb-4">
              <Text className="text-white text-2xl font-bold">CC</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-2">
              Reset Password
            </Text>
            <Text className="text-gray-600 text-center">
              Enter your email address and we'll send you a link to reset your password
            </Text>
          </View>

          {/* Reset Form */}
          <View className="bg-white rounded-lg p-6 shadow-sm mb-6">
            <Text className="text-xl font-semibold text-gray-900 mb-6">
              Forgot Password?
            </Text>

            {/* Email Input */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Email Address
              </Text>
              <TextInput
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* Reset Button */}
            <TouchableOpacity
              className={`w-full py-3 rounded-lg ${loading
                  ? 'bg-gray-400'
                  : 'bg-blue-600 hover:bg-blue-700'
                }`}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <View className="flex-row justify-center items-center">
                  <View className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  <Text className="text-white font-semibold">Sending...</Text>
                </View>
              ) : (
                <Text className="text-white font-semibold text-center">
                  Send Reset Email
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Back to Login */}
          <View className="flex-row justify-center">
            <TouchableOpacity onPress={handleBackToLogin} disabled={loading}>
              <Text className="text-blue-600 font-medium">
                ← Back to Login
              </Text>
            </TouchableOpacity>
          </View>

          {/* Help Info */}
          <View className="mt-8 bg-gray-100 rounded-lg p-4">
            <Text className="text-sm font-semibold text-gray-900 mb-2">
              Password Reset Help
            </Text>
            <View className="space-y-2">
              <Text className="text-sm text-gray-700">
                • The reset link will expire after 24 hours
              </Text>
              <Text className="text-sm text-gray-700">
                • Check your spam folder if you don't see the email
              </Text>
              <Text className="text-sm text-gray-700">
                • Contact support if you continue to have issues
              </Text>
            </View>
            <View className="mt-3 pt-3 border-t border-gray-300">
              <Text className="text-sm text-gray-600">
                Need immediate help? Email us at support@careconnect.com
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default ForgotPasswordScreen;
