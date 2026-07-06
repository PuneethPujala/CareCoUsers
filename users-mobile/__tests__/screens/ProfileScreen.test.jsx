import React from 'react';
import { render, act } from '@testing-library/react-native';
import PatientProfileScreen from '../../src/screens/patient/ProfileScreen';
import { useAuth } from '../../src/context/AuthContext';

// Mock translation hook
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (options && options.defaultValue) return options.defaultValue;
      return key;
    },
  }),
}));

jest.mock('../../src/i18n', () => ({}));

// Mock navigation hooks
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback) => {
      React.useEffect(() => {
        callback();
      }, [callback]);
    },
    useIsFocused: () => true,
  };
});

// Mock AuthContext
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock API layer
jest.mock('../../src/lib/api', () => ({
  apiService: {
    patients: {
      getMe: jest.fn().mockResolvedValue({
        data: {
          patient: {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+919999999999',
            trusted_contacts: [],
            saved_addresses: [],
          },
        },
      }),
      getNotificationsUnreadCount: jest.fn().mockResolvedValue({ data: { count: 0 } }),
    },
    auth: {
      mfaStatus: jest.fn().mockResolvedValue({ data: { enabled: false } }),
    },
  },
}));

// Mock components and assets to avoid issues
jest.mock('../../src/components/ui/SmartInput', () => 'SmartInput');
jest.mock('../../src/components/ui/PremiumFormModal', () => 'PremiumFormModal');
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Bell: () => React.createElement(View),
    Settings: () => React.createElement(View),
    LogOut: () => React.createElement(View),
    ChevronRight: () => React.createElement(View),
    ChevronDown: () => React.createElement(View),
    UserRound: () => React.createElement(View),
    Phone: () => React.createElement(View),
    X: () => React.createElement(View),
    Save: () => React.createElement(View),
    ShieldCheck: () => React.createElement(View),
    Star: () => React.createElement(View),
    MapPin: () => React.createElement(View),
    ClipboardList: () => React.createElement(View),
    FileText: () => React.createElement(View),
    FlaskConical: () => React.createElement(View),
    Wallet: () => React.createElement(View),
    CreditCard: () => React.createElement(View),
    Receipt: () => React.createElement(View),
    Heart: () => React.createElement(View),
    Users: () => React.createElement(View),
    BellRing: () => React.createElement(View),
    Clock: () => React.createElement(View),
    Globe: () => React.createElement(View),
    Shield: () => React.createElement(View),
    Droplets: () => React.createElement(View),
    Calendar: () => React.createElement(View),
    User: () => React.createElement(View),
    Trash2: () => React.createElement(View),
    ShieldCheckIcon: () => React.createElement(View),
    Smartphone: () => React.createElement(View),
    Mail: () => React.createElement(View),
    TrendingUp: () => React.createElement(View),
    HeartPulse: () => React.createElement(View),
    Check: () => React.createElement(View),
    Lock: () => React.createElement(View),
  };
});

describe('PatientProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      signOut: jest.fn(),
      displayName: 'John Doe',
      userEmail: 'john@example.com',
      profile: { workspaces: [{ id: 'patient' }, { id: 'companion' }] },
      refreshProfile: jest.fn().mockResolvedValue({}),
      switchRole: jest.fn(),
    });
  });

  it('renders correctly', async () => {
    const navigationMock = { navigate: jest.fn() };
    const { toJSON } = render(<PatientProfileScreen navigation={navigationMock} />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(toJSON()).toBeTruthy();
  });
});
