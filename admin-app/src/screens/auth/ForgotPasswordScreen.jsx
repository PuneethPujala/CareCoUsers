import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { apiService } from '../../lib/api';

const ForgotPasswordScreen = () => {
  const [step, setStep] = useState('email'); // 'email' | 'otp' | 'password' | 'success'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const navigation = useNavigation();

  const handleSendOtp = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await apiService.auth.sendResetOtp({ email: email.trim() });
      setStep('otp');
    } catch (error) {
      console.warn('Send OTP error:', error?.message);
      
      // If the backend returns 429 (Too Many Requests), an OTP was already sent recently.
      // We should still move them to the OTP step so they can enter the one they just received.
      if (error.response?.status === 429) {
        Alert.alert('Notice', error.response?.data?.error || 'An OTP was already sent recently.');
        setStep('otp');
        return;
      }

      let errorMessage = 'An error occurred while sending reset email';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.trim().length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      await apiService.auth.verifyResetOtp({ email: email.trim(), otp: otp.trim() });
      setStep('password');
    } catch (error) {
      console.warn('Verify OTP error:', error?.message);
      let errorMessage = 'Invalid OTP';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await apiService.auth.resetPasswordWithOtp({ 
        email: email.trim(), 
        otp: otp.trim(), 
        newPassword 
      });
      setStep('success');
    } catch (error) {
      console.warn('Reset password error:', error?.message);
      let errorMessage = 'An error occurred while resetting password';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
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
    setOtp('');
    handleSendOtp();
  };

  if (step === 'success') {
    return (
      <ScrollView className="flex-1 bg-gray-50" showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center px-6 py-8">
          <View className="items-center mb-8">
            <View className="w-20 h-20 bg-green-600 rounded-full justify-center items-center mb-4">
              <Text className="text-white text-2xl font-bold">✓</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-2">
              Password Reset!
            </Text>
            <Text className="text-gray-600 text-center">
              Your password has been successfully reset.
            </Text>
          </View>
          
          <View className="bg-white rounded-lg p-6 shadow-sm mb-6">
            <TouchableOpacity
              className="w-full py-3 rounded-lg border border-blue-600 bg-blue-600"
              onPress={handleBackToLogin}
            >
              <Text className="text-white font-medium text-center">
                Back to Login
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      enableOnAndroid={true} extraScrollHeight={20} keyboardShouldPersistTaps="handled"
      className="flex-1 bg-gray-50"
    >
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center px-6 py-8">
          <View className="items-center mb-8">
            <View className="w-20 h-20 bg-blue-600 rounded-full justify-center items-center mb-4">
              <Text className="text-white text-2xl font-bold">CC</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-2">
              Reset Password
            </Text>
            <Text className="text-gray-600 text-center">
              {step === 'email' && "Enter your email address and we'll send you an OTP to reset your password"}
              {step === 'otp' && "Enter the 6-digit OTP sent to your email"}
              {step === 'password' && "Create a new password for your account"}
            </Text>
          </View>

          <View className="bg-white rounded-lg p-6 shadow-sm mb-6">
            {step === 'email' && (
              <>
                <Text className="text-xl font-semibold text-gray-900 mb-6">Forgot Password?</Text>
                <View className="mb-6">
                  <Text className="text-sm font-medium text-gray-700 mb-2">Email Address</Text>
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
                <TouchableOpacity
                  className={`w-full py-3 rounded-lg ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  {loading ? (
                    <View className="flex-row justify-center items-center">
                      <View className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      <Text className="text-white font-semibold">Sending...</Text>
                    </View>
                  ) : (
                    <Text className="text-white font-semibold text-center">Send OTP</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {step === 'otp' && (
              <>
                <Text className="text-xl font-semibold text-gray-900 mb-6">Verify OTP</Text>
                <View className="mb-6">
                  <Text className="text-sm font-medium text-gray-700 mb-2">6-Digit OTP</Text>
                  <TextInput
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center tracking-[0.5em] text-lg font-bold"
                    placeholder="------"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                </View>
                <TouchableOpacity
                  className={`w-full py-3 rounded-lg ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} mb-4`}
                  onPress={handleVerifyOtp}
                  disabled={loading}
                >
                  {loading ? (
                    <View className="flex-row justify-center items-center">
                      <View className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      <Text className="text-white font-semibold">Verifying...</Text>
                    </View>
                  ) : (
                    <Text className="text-white font-semibold text-center">Verify OTP</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleResendEmail} disabled={loading}>
                  <Text className="text-blue-600 font-medium text-center">Resend OTP</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'password' && (
              <>
                <Text className="text-xl font-semibold text-gray-900 mb-6">Create New Password</Text>
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 mb-2">New Password</Text>
                  <TextInput
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    editable={!loading}
                  />
                </View>
                <View className="mb-6">
                  <Text className="text-sm font-medium text-gray-700 mb-2">Confirm Password</Text>
                  <TextInput
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    editable={!loading}
                  />
                </View>
                <TouchableOpacity
                  className={`w-full py-3 rounded-lg ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                  onPress={handleResetPassword}
                  disabled={loading}
                >
                  {loading ? (
                    <View className="flex-row justify-center items-center">
                      <View className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      <Text className="text-white font-semibold">Resetting...</Text>
                    </View>
                  ) : (
                    <Text className="text-white font-semibold text-center">Reset Password</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          <View className="flex-row justify-center">
            <TouchableOpacity onPress={handleBackToLogin} disabled={loading}>
              <Text className="text-blue-600 font-medium">← Back to Login</Text>
            </TouchableOpacity>
          </View>

          {/* Help Info */}
          <View className="mt-8 bg-gray-100 rounded-lg p-4">
            <Text className="text-sm font-semibold text-gray-900 mb-2">
              Password Reset Help
            </Text>
            <View className="space-y-2">
              <Text className="text-sm text-gray-700">
                • The OTP will expire after 10 minutes
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
    </KeyboardAwareScrollView>
  );
};

export default ForgotPasswordScreen;
