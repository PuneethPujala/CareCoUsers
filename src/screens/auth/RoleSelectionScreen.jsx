import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';

const RoleSelectionScreen = ({ route }) => {
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(null);
  
  const navigation = useNavigation();
  const { VALID_ROLES } = useAuth();

  const { email, fullName, password, phone } = route.params || {};

  const roleInfo = {
    patient: {
      title: 'Patient',
      description: 'Care recipient',
      icon: '🏥',
      color: 'blue',
      features: [
        'View your health information',
        'Manage your medications',
        'See call history',
        'Authorize family mentors',
        'Track your health journey',
      ],
      requirements: 'Must be a care recipient receiving healthcare services',
    },
    patient_mentor: {
      title: 'Patient Mentor',
      description: 'Family member or caregiver',
      icon: '👨‍👩‍👧‍👦',
      color: 'purple',
      features: [
        'View patient health information',
        'Manage patient medications',
        'View call logs',
        'Create health journal entries',
        'Receive health notifications',
      ],
      requirements: 'Must be authorized by the patient or care manager',
    },
    caretaker: {
      title: 'Caretaker',
      description: 'Call agent or healthcare worker',
      icon: '📞',
      color: 'amber',
      features: [
        'Make calls to assigned patients',
        'View patient information',
        'Log call activities',
        'Create escalations when needed',
        'Track patient interactions',
      ],
      requirements: 'Must be employed by a healthcare organization',
    },
    care_manager: {
      title: 'Care Manager',
      description: 'Clinical coordinator',
      icon: '👨‍⚕️',
      color: 'green',
      features: [
        'Manage caretakers and patients',
        'Assign patients to caretakers',
        'Authorize patient mentors',
        'View comprehensive reports',
        'Monitor care quality',
      ],
      requirements: 'Must be clinical staff with management responsibilities',
    },
    org_admin: {
      title: 'Organization Admin',
      description: 'Healthcare organization administrator',
      icon: '🏢',
      color: 'indigo',
      features: [
        'Manage organization settings',
        'Create and manage user accounts',
        'View organization reports',
        'Manage billing and subscriptions',
        'Oversee all organizational activities',
      ],
      requirements: 'Must be administrator of a healthcare organization',
    },
    super_admin: {
      title: 'Super Admin',
      description: 'Platform administrator (Invite only)',
      icon: '🔧',
      color: 'red',
      features: [
        'Full platform access',
        'Manage all organizations',
        'System-wide configuration',
        'Platform analytics and reporting',
        'User support and troubleshooting',
      ],
      requirements: 'Invite only - must be CareConnect platform administrator',
    },
  };

  const getColorClasses = (color) => {
    const colorMap = {
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        selectedBg: 'bg-blue-600',
        selectedText: 'text-white',
      },
      purple: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        selectedBg: 'bg-purple-600',
        selectedText: 'text-white',
      },
      amber: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-700',
        selectedBg: 'bg-amber-600',
        selectedText: 'text-white',
      },
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        selectedBg: 'bg-green-600',
        selectedText: 'text-white',
      },
      indigo: {
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        text: 'text-indigo-700',
        selectedBg: 'bg-indigo-600',
        selectedText: 'text-white',
      },
      red: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        selectedBg: 'bg-red-600',
        selectedText: 'text-white',
      },
    };
    return colorMap[color] || colorMap.blue;
  };

  const handleRoleSelect = (role) => {
    if (role === 'super_admin') {
      Alert.alert(
        'Super Admin Role',
        'The Super Admin role is invite only. Please contact CareConnect support if you believe you should have access.',
        [{ text: 'OK' }]
      );
      return;
    }
    setSelectedRole(role);
  };

  const handleContinue = () => {
    if (!selectedRole) {
      Alert.alert('Error', 'Please select a role to continue');
      return;
    }

    // Navigate back to signup with selected role
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Signup', { selectedRole });
    }
  };

  const handleViewDetails = (role) => {
    setShowDetails(role);
  };

  const RoleCard = ({ role, info }) => {
    const colors = getColorClasses(info.color);
    const isSelected = selectedRole === role;

    return (
      <TouchableOpacity
        className={`p-4 rounded-lg border-2 mb-3 ${
          isSelected
            ? `${colors.selectedBg} ${colors.selectedText} border-transparent`
            : `${colors.bg} ${colors.border} ${colors.text}`
        }`}
        onPress={() => handleRoleSelect(role)}
        disabled={loading}
      >
        <View className="flex-row items-start">
          <Text className="text-2xl mr-3">{info.icon}</Text>
          <View className="flex-1">
            <Text className={`font-semibold text-lg ${isSelected ? colors.selectedText : colors.text}`}>
              {info.title}
            </Text>
            <Text className={`text-sm ${isSelected ? colors.selectedText + ' opacity-90' : colors.text + ' opacity-80'}`}>
              {info.description}
            </Text>
            <TouchableOpacity
              className={`mt-2 text-xs ${isSelected ? colors.selectedText + ' opacity-80' : colors.text}`}
              onPress={() => handleViewDetails(role)}
            >
              <Text className="underline">Learn more →</Text>
            </TouchableOpacity>
          </View>
          <View className={`w-6 h-6 rounded-full border-2 ${
            isSelected ? 'border-white' : 'border-gray-300'
          } justify-center items-center`}>
            {isSelected && (
              <View className="w-3 h-3 bg-white rounded-full" />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const RoleDetailsModal = () => {
    if (!showDetails) return null;
    
    const info = roleInfo[showDetails];
    const colors = getColorClasses(info.color);

    return (
      <Modal
        visible={!!showDetails}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetails(null)}
      >
        <View className="flex-1 bg-gray-50">
          <View className={`${colors.bg} p-6 pb-8`}>
            <View className="flex-row items-center mb-4">
              <Text className="text-4xl mr-3">{info.icon}</Text>
              <View className="flex-1">
                <Text className={`text-2xl font-bold ${colors.text}`}>
                  {info.title}
                </Text>
                <Text className={`${colors.text} opacity-80`}>
                  {info.description}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView className="flex-1 px-6">
            <View className="bg-white rounded-lg p-6 shadow-sm mb-4">
              <Text className="text-lg font-semibold text-gray-900 mb-4">
                What you can do:
              </Text>
              {info.features.map((feature, index) => (
                <View key={index} className="flex-row items-start mb-3">
                  <Text className="text-green-500 mr-2">✓</Text>
                  <Text className="text-gray-700 flex-1">{feature}</Text>
                </View>
              ))}
            </View>

            <View className="bg-amber-50 rounded-lg p-6 shadow-sm mb-4">
              <Text className="text-lg font-semibold text-amber-900 mb-2">
                Requirements:
              </Text>
              <Text className="text-amber-800">{info.requirements}</Text>
            </View>

            <TouchableOpacity
              className={`${colors.selectedBg} p-4 rounded-lg mb-4`}
              onPress={() => {
                setShowDetails(null);
                handleRoleSelect(showDetails);
              }}
            >
              <Text className="text-white font-semibold text-center">
                Select {info.title}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-gray-200 p-4 rounded-lg"
              onPress={() => setShowDetails(null)}
            >
              <Text className="text-gray-700 font-semibold text-center">
                Back to Roles
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="px-6 py-8">
          {/* Header */}
          <View className="items-center mb-8">
            <View className="w-16 h-16 bg-blue-600 rounded-full justify-center items-center mb-4">
              <Text className="text-white text-xl font-bold">CC</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-2">
              Choose Your Role
            </Text>
            <Text className="text-gray-600 text-center">
              Select how you'll be using CareConnect
            </Text>
          </View>

          {/* Role Cards */}
          <View className="mb-8">
            {VALID_ROLES.map((role) => (
              <RoleCard key={role} role={role} info={roleInfo[role]} />
            ))}
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            className={`w-full py-4 rounded-lg ${
              selectedRole && !loading
                ? 'bg-blue-600'
                : 'bg-gray-400'
            }`}
            onPress={handleContinue}
            disabled={!selectedRole || loading}
          >
            <Text className="text-white font-semibold text-center text-lg">
              Continue
            </Text>
          </TouchableOpacity>

          {/* Help Text */}
          <View className="mt-6 bg-blue-50 rounded-lg p-4">
            <Text className="text-sm font-semibold text-blue-900 mb-2">
              Not sure which role to choose?
            </Text>
            <Text className="text-sm text-blue-800 mb-3">
              Most users start as "Patient" or "Patient Mentor". Healthcare professionals should choose the role that best matches their job responsibilities.
            </Text>
            <Text className="text-sm text-blue-700">
              You can always contact support if you need to change your role later.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Role Details Modal */}
      <RoleDetailsModal />
    </View>
  );
};

export default RoleSelectionScreen;
