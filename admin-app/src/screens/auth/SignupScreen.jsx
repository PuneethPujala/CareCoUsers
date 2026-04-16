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

const SignupScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigation = useNavigation();
  const { signUp, VALID_ROLES } = useAuth();

  const roleDescriptions = {
    patient: 'Care recipient - access your health information',
    patient_mentor: 'Family member - help manage patient care',
    caretaker: 'Call agent - make calls to assigned patients',
    care_manager: 'Clinical coordinator - manage caretakers and patients',
    org_admin: 'Organization administrator - manage your healthcare organization',
    super_admin: 'Platform administrator - full system access (invite only)',
  };

  const validateForm = () => {
    // Basic validation
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return false;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }

    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return false;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters long');
      return false;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      Alert.alert('Error', 'Password must contain at least one uppercase letter, one lowercase letter, and one number');
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }

    if (!selectedRole) {
      Alert.alert('Error', 'Please select your role');
      return false;
    }

    // Phone validation (optional but if provided, must be valid)
    if (phone && !/^[\+]?[1-9][\d]{0,15}$/.test(phone.replace(/\s/g, ''))) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return false;
    }

    return true;
  };

  const handleSignup = async () => {
    if (!validateForm()) return;

    setLoading(true);

    try {
      const result = await signUp(
        email.trim(),
        password,
        fullName.trim(),
        selectedRole,
        {
          phone: phone.trim() || null,
        }
      );

      if (result.needsEmailVerification) {
        Alert.alert(
          'Registration Successful',
          'Please check your email and click the verification link to complete your registration.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('EmailVerification', { email: email.trim() }),
            },
          ]
        );
      } else {
        Alert.alert(
          'Registration Successful',
          'Your account has been created successfully!',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
      }
    } catch (error) {
      console.warn('Signup error:', error?.message);

      let errorMessage = 'An error occurred during registration';

      if (error.message) {
        if (error.message.includes('User already registered')) {
          errorMessage = 'An account with this email already exists';
        } else if (error.message.includes('Password should be at least 6 characters')) {
          errorMessage = 'Password must be at least 6 characters long';
        } else if (error.message.includes('Invalid email')) {
          errorMessage = 'Please enter a valid email address';
        } else if (error.message.includes('Network error')) {
          errorMessage = 'Network error. Please check your internet connection';
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert('Registration Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gray-50"
    >
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center px-6 py-8">
          {/* Logo and Title */}
          <View className="items-center mb-6">
            <View className="w-16 h-16 bg-blue-600 rounded-full justify-center items-center mb-3">
              <Text className="text-white text-xl font-bold">CC</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-2">
              Create Account
            </Text>
            <Text className="text-gray-600 text-center">
              Join CareConnect healthcare platform
            </Text>
          </View>

          {/* Signup Form */}
          <View className="bg-white rounded-lg p-6 shadow-sm">
            {/* Full Name Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </Text>
              <TextInput
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your full name"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>

            {/* Email Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </Text>
              <TextInput
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* Phone Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Phone Number (Optional)
              </Text>
              <TextInput
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!loading}
              />
            </View>

            {/* Password Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Password *
              </Text>
              <View className="relative">
                <TextInput
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Create a password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity
                  className="absolute right-3 top-3.5"
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  <Text className="text-gray-500">
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text className="text-xs text-gray-500 mt-1">
                Must be at least 8 characters with uppercase, lowercase, and number
              </Text>
            </View>

            {/* Confirm Password Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Confirm Password *
              </Text>
              <View className="relative">
                <TextInput
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity
                  className="absolute right-3 top-3.5"
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                >
                  <Text className="text-gray-500">
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Role Selection */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Select Your Role *
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                {VALID_ROLES.map((role) => (
                  <TouchableOpacity
                    key={role}
                    className={`mr-2 px-4 py-2 rounded-lg border ${selectedRole === role
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-white border-gray-300'
                      }`}
                    onPress={() => setSelectedRole(role)}
                    disabled={loading}
                  >
                    <Text
                      className={`text-sm font-medium ${selectedRole === role ? 'text-white' : 'text-gray-700'
                        }`}
                    >
                      {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {selectedRole && (
                <Text className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  {roleDescriptions[selectedRole]}
                </Text>
              )}
            </View>

            {/* Signup Button */}
            <TouchableOpacity
              className={`w-full py-3 rounded-lg ${loading
                  ? 'bg-gray-400'
                  : 'bg-blue-600 hover:bg-blue-700'
                }`}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <View className="flex-row justify-center items-center">
                  <View className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  <Text className="text-white font-semibold">Creating Account...</Text>
                </View>
              ) : (
                <Text className="text-white font-semibold text-center">
                  Create Account
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Login Link */}
          <View className="mt-6 flex-row justify-center">
            <Text className="text-gray-600">Already have an account? </Text>
            <TouchableOpacity onPress={handleLogin} disabled={loading}>
              <Text className="text-blue-600 font-medium">Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default SignupScreen;
