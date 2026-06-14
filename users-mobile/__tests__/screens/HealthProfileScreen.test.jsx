import React from 'react';
import { render, act } from '@testing-library/react-native';
import HealthProfileScreen from '../../src/screens/patient/HealthProfileScreen';

// Mock translation hook
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (options && options.defaultValue) return options.defaultValue;
      return key;
    },
  }),
}));

// Mock navigation hooks
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback) => {
      React.useEffect(() => {
        callback();
      }, [callback]);
    },
  };
});

// Mock API layer
jest.mock('../../src/lib/api', () => ({
  apiService: {
    patients: {
      getProfile: jest.fn().mockResolvedValue({
        data: {
          blood_type: 'O+',
          conditions: [],
          allergies: [],
          medical_history: [],
          medications: [],
          vaccinations: [],
          appointments: [],
          lifestyle: {
            height_cm: 175,
            weight_kg: 70,
            smoking_status: 'never',
            alcohol_use: 'none',
            exercise_frequency: 'moderate',
            mobility_level: 'full',
          },
          gp: {
            name: 'Dr. John Doe',
            phone: '+919999999999',
            email: 'john@example.com',
          },
          health_score: {
            score: 85,
            grade: 'A',
            label: 'Excellent',
            color: '#10B981',
            bracket: 'young_adult',
            breakdown: {
              adherence: { pts: 25, max: 30 },
              lifestyle: { pts: 15, max: 20 },
              vitals: { pts: 12, max: 15 },
              conditions: { pts: 15, max: 15 },
              preventive: { pts: 8, max: 10 },
              mobility: { pts: 10, max: 10 },
            },
            tips: [],
          },
        },
      }),
      getNotificationsUnreadCount: jest.fn().mockResolvedValue({ data: { count: 0 } }),
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
    TriangleAlert: () => React.createElement(View),
    AlertTriangle: () => React.createElement(View),
    ShieldCheck: () => React.createElement(View),
    HeartPulse: () => React.createElement(View),
    Activity: () => React.createElement(View),
    Droplet: () => React.createElement(View),
    Phone: () => React.createElement(View),
    Plus: () => React.createElement(View),
    Pencil: () => React.createElement(View),
    X: () => React.createElement(View),
    Trash2: () => React.createElement(View),
    CircleCheck: () => React.createElement(View),
    CheckCircle2: () => React.createElement(View),
    RefreshCw: () => React.createElement(View),
    ChevronDown: () => React.createElement(View),
    Upload: () => React.createElement(View),
    Siren: () => React.createElement(View),
    ChevronRight: () => React.createElement(View),
    TrendingUp: () => React.createElement(View),
    TrendingDown: () => React.createElement(View),
    Sparkles: () => React.createElement(View),
    Bell: () => React.createElement(View),
    FileText: () => React.createElement(View),
    Pill: () => React.createElement(View),
    Syringe: () => React.createElement(View),
    Link2: () => React.createElement(View),
    Users: () => React.createElement(View),
    Calendar: () => React.createElement(View),
    Info: () => React.createElement(View),
    Clock: () => React.createElement(View),
    MapPin: () => React.createElement(View),
  };
});

describe('HealthProfileScreen', () => {
  const { apiService } = require('../../src/lib/api');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderScreen = async (mockProfileValue) => {
    if (mockProfileValue !== undefined) {
      apiService.patients.getProfile.mockResolvedValueOnce(mockProfileValue);
    }
    const navigationMock = { navigate: jest.fn() };
    const renderResult = render(<HealthProfileScreen navigation={navigationMock} />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    return renderResult;
  };

  it('renders correctly', async () => {
    const { toJSON } = await renderScreen();
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly when profile is null', async () => {
    const { toJSON } = await renderScreen({ data: null });
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly when profile is empty object', async () => {
    const { toJSON } = await renderScreen({ data: {} });
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly when profile sub-objects (lifestyle, gp, conditions, allergies) are null', async () => {
    const { toJSON } = await renderScreen({
      data: {
        blood_type: 'O+',
        conditions: null,
        allergies: null,
        medical_history: null,
        medications: null,
        vaccinations: null,
        appointments: null,
        lifestyle: null,
        gp: null,
      },
    });
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly when BMI fields (height, weight) are null', async () => {
    const { toJSON } = await renderScreen({
      data: {
        blood_type: 'O+',
        lifestyle: {
          height_cm: null,
          weight_kg: null,
          smoking_status: null,
          alcohol_use: null,
        },
        gp: {
          name: null,
        },
      },
    });
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly when profile contains malformed data types', async () => {
    const { toJSON } = await renderScreen({
      data: {
        conditions: {},
        allergies: 'penicillin',
        lifestyle: [],
        gp: 'doctor',
        medical_history: 'none',
        medications: {},
        vaccinations: 123,
        appointments: 'tomorrow',
      },
    });
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly and parses BMI fields when units are appended to strings', async () => {
    const { toJSON } = await renderScreen({
      data: {
        blood_type: 'O+',
        lifestyle: {
          height_cm: '175cm',
          weight_kg: '70kg',
        },
      },
    });
    expect(toJSON()).toBeTruthy();
  });
});
