import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';

const ROLES = [
  { id: 'super_admin', label: 'Super Admin', icon: '🛡️' },
  { id: 'org_admin', label: 'Org Admin', icon: '🏥' },
  { id: 'care_manager', label: 'Care Manager', icon: '📋' },
  { id: 'caller', label: 'Caller', icon: '📞' },
  { id: 'mentor', label: 'Patient Mentor', icon: '👥' },
  { id: 'patient', label: 'Patient', icon: '❤️' },
];

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  const navigation = useNavigation();
  const { signIn } = useAuth();

  const validateForm = () => {
    const newErrors = {};
    if (!email.trim()) newErrors.email = 'Please enter your email address';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) newErrors.email = 'Please enter a valid email address';
    if (!password.trim()) newErrors.password = 'Please enter your password';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setErrors({});
    try {
      await signIn(email.trim(), password, role);
    } catch (error) {
      console.warn('Login error:', error?.message);
      
      if (error?.response?.data?.details) {
         setErrors(error.response.data.details);
      } else {
         const title = error?.code === 'ROLE_MISMATCH' ? 'Wrong Role' : 'Login Failed';
         Alert.alert(title, error?.message || 'An error occurred during login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gray-50"
    >
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center px-6 py-8">
          {/* Logo */}
          <View className="items-center mb-6">
            <View className="w-20 h-20 bg-blue-600 rounded-full justify-center items-center mb-4">
              <Text className="text-white text-2xl font-bold">CC</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-1">CareConnect</Text>
            <Text className="text-gray-600 text-center">Healthcare management platform</Text>
          </View>

          {/* Role Selector */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8, letterSpacing: 1 }}>
              SELECT YOUR ROLE
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => setRole(r.id)}
                  activeOpacity={0.7}
                  style={{
                    width: '48%',
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: role === r.id ? '#3B82F6' : '#E5E7EB',
                    backgroundColor: role === r.id ? '#EFF6FF' : '#FFFFFF',
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{r.icon}</Text>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: role === r.id ? '700' : '500',
                    color: role === r.id ? '#3B82F6' : '#6B7280',
                  }}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Login Form */}
          <View className="bg-white rounded-lg p-6 shadow-sm">
            <Text className="text-xl font-semibold text-gray-900 mb-6">Welcome Back</Text>

            <Input
              label="Email Address"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              error={errors.email}
            />

            <View className="mb-6">
              <View className="relative">
                <Input
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                  error={errors.password}
                />
                <TouchableOpacity
                  className={`absolute right-3 ${errors.password ? 'top-9' : 'top-9'}`}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  <Text className="text-gray-500">{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              className={`w-full py-3 rounded-lg ${loading ? 'bg-gray-400' : 'bg-blue-600'}`}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text className="text-white font-semibold text-center">
                {loading ? 'Signing In...' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity className="mt-4" onPress={() => navigation.navigate('ForgotPassword')} disabled={loading}>
              <Text className="text-blue-600 text-center font-medium">Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {/* Sign Up Link */}
          <View className="mt-6 flex-row justify-center">
            <Text className="text-gray-600">Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')} disabled={loading}>
              <Text className="text-blue-600 font-medium">Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
