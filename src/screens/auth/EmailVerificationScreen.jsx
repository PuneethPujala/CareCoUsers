import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';

const EmailVerificationScreen = () => {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const navigation = useNavigation();
  const route = useRoute();
  const { user, refreshProfile } = useAuth();

  const { email } = route.params || {};
  const userEmail = email || user?.email || '';

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Check email verification status periodically
  useEffect(() => {
    const checkVerificationStatus = async () => {
      if (user) {
        try {
          await refreshProfile();
          // If email is now verified, navigate to main app
          // This will be handled by AuthContext state change
        } catch (error) {
          console.warn('Error checking verification status:', error?.message);
        }
      }
    };

    // Check every 5 seconds
    const interval = setInterval(checkVerificationStatus, 5000);
    return () => clearInterval(interval);
  }, [user, refreshProfile]);

  const handleResendEmail = async () => {
    if (countdown > 0) return;

    setResendLoading(true);

    try {
      // This would call Supabase to resend verification email
      // For now, we'll simulate the API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setCountdown(60); // 60 second cooldown
      Alert.alert(
        'Email Sent',
        `Verification email has been sent to ${userEmail}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.warn('Resend email error:', error?.message);
      Alert.alert(
        'Error',
        'Failed to resend verification email. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setResendLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigation.navigate('Login');
  };

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false}>
      <View className="flex-1 justify-center px-6 py-8">
        {/* Logo and Title */}
        <View className="items-center mb-8">
          <View className="w-20 h-20 bg-blue-600 rounded-full justify-center items-center mb-4">
            <Text className="text-white text-2xl font-bold">CC</Text>
          </View>
          <Text className="text-2xl font-bold text-gray-900 mb-2">
            Verify Your Email
          </Text>
          <Text className="text-gray-600 text-center">
            We've sent a verification link to your email
          </Text>
        </View>

        {/* Verification Card */}
        <View className="bg-white rounded-lg p-6 shadow-sm mb-6">
          <View className="items-center mb-6">
            <View className="w-16 h-16 bg-green-100 rounded-full justify-center items-center mb-4">
              <Text className="text-3xl">✉️</Text>
            </View>
            <Text className="text-lg font-semibold text-gray-900 text-center mb-2">
              Check Your Email
            </Text>
            <Text className="text-gray-600 text-center mb-4">
              We've sent a verification email to:
            </Text>
            <View className="bg-gray-50 rounded-lg px-4 py-2">
              <Text className="text-gray-900 font-medium">{userEmail}</Text>
            </View>
          </View>

          {/* Instructions */}
          <View className="bg-blue-50 rounded-lg p-4 mb-6">
            <Text className="text-sm font-semibold text-blue-900 mb-3">
              How to verify your email:
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
                  Find the email from "CareConnect" (check spam folder too)
                </Text>
              </View>
              <View className="flex-row items-start">
                <Text className="text-blue-600 mr-2">3.</Text>
                <Text className="text-blue-800 flex-1 text-sm">
                  Click the verification link in the email
                </Text>
              </View>
              <View className="flex-row items-start">
                <Text className="text-blue-600 mr-2">4.</Text>
                <Text className="text-blue-800 flex-1 text-sm">
                  Return to this app to continue
                </Text>
              </View>
            </View>
          </View>

          {/* Auto-check message */}
          <View className="items-center mb-6">
            <View className="flex-row items-center">
              <View className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
              <Text className="text-gray-600 text-sm">
                Checking verification status...
              </Text>
            </View>
          </View>

          {/* Resend Email Button */}
          <TouchableOpacity
            className={`w-full py-3 rounded-lg border ${resendLoading || countdown > 0
                ? 'bg-gray-100 border-gray-300'
                : 'bg-white border-blue-600'
              }`}
            onPress={handleResendEmail}
            disabled={resendLoading || countdown > 0}
          >
            {resendLoading ? (
              <View className="flex-row justify-center items-center">
                <View className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2" />
                <Text className="text-gray-400 font-medium">Sending...</Text>
              </View>
            ) : (
              <Text className={`font-medium text-center ${countdown > 0 ? 'text-gray-400' : 'text-blue-600'
                }`}>
                {countdown > 0
                  ? `Resend Email (${formatCountdown(countdown)})`
                  : 'Resend Verification Email'
                }
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Help Section */}
        <View className="bg-amber-50 rounded-lg p-4 mb-6">
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
            <Text className="text-sm text-amber-800">
              • Contact support if you continue to have issues
            </Text>
          </View>
        </View>

        {/* Back to Login */}
        <View className="items-center">
          <TouchableOpacity onPress={handleBackToLogin}>
            <Text className="text-blue-600 font-medium">
              ← Back to Login
            </Text>
          </TouchableOpacity>
        </View>

        {/* Support Info */}
        <View className="mt-8 bg-gray-100 rounded-lg p-4">
          <Text className="text-sm font-semibold text-gray-900 mb-2">
            Need Help?
          </Text>
          <Text className="text-sm text-gray-700 mb-2">
            If you're having trouble verifying your email, please contact our support team:
          </Text>
          <View className="space-y-1">
            <Text className="text-sm text-gray-600">
              Email: support@careconnect.com
            </Text>
            <Text className="text-sm text-gray-600">
              Phone: 1-800-CARE-CONNECT
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default EmailVerificationScreen;
