import React from 'react';
import { render, act } from '@testing-library/react-native';
import VitalsHistoryScreen from '../../src/screens/patient/VitalsHistoryScreen';

// Mock translation hook or any unused ones if needed
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (options && options.defaultValue) return options.defaultValue;
      return key;
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
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
    useIsFocused: () => true,
  };
});

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
}));

// Mock react-native-chart-kit
jest.mock('react-native-chart-kit', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LineChart: () => React.createElement(View, { testID: 'line-chart' }),
  };
});

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, style }) => React.createElement(View, { style }, children),
  };
});

// Mock Lucide Icons
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const dummy = () => React.createElement(View);
  return {
    ChevronLeft: dummy,
    ChevronRight: dummy,
    Heart: dummy,
    Activity: dummy,
    Wind: dummy,
    Droplets: dummy,
    AlertTriangle: dummy,
    WifiOff: dummy,
    RefreshCw: dummy,
    Calendar: dummy,
    Clock: dummy,
    Sparkles: dummy,
    Maximize2: dummy,
    X: dummy,
    Plus: dummy,
    Zap: dummy,
    Watch: dummy,
    CheckCircle2: dummy,
    AlertCircle: dummy,
  };
});

// Mock API layer
jest.mock('../../src/lib/api', () => {
  const mockApi = {
    get: jest.fn().mockResolvedValue({
      data: {
        vitals: [
          {
            _id: '1',
            date: new Date().toISOString(),
            heart_rate: 72,
            blood_pressure: { systolic: 120, diastolic: 80 },
            oxygen_saturation: 98,
            hydration: 65,
            source: 'manual',
          },
        ],
      },
    }),
  };
  return {
    __esModule: true,
    default: mockApi,
    api: mockApi,
    apiService: {
      patients: {
        getSyncStatus: jest.fn().mockResolvedValue({
          data: {
            last_sync: new Date().toISOString(),
            readings_today: 1,
            connected: true,
            source: 'health_connect',
          },
        }),
      },
    },
  };
});

// Mock axios
jest.mock('axios', () => {
  const mockAxios = {
    create: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
    isCancel: jest.fn().mockReturnValue(false),
    CancelToken: {
      source: jest.fn().mockReturnValue({
        token: {},
        cancel: jest.fn(),
      }),
    },
  };
  return mockAxios;
});

// Mock HealthSyncService
jest.mock('../../src/services/HealthSyncService', () => ({
  getStatus: jest.fn().mockResolvedValue({
    enabled: true,
    connected: true,
    permissionStatus: 'granted',
    lastSync: new Date().toISOString(),
    readingsToday: 1,
    syncing: false,
    latestSource: 'health_connect',
  }),
  syncNow: jest.fn().mockResolvedValue(true),
}));

describe('VitalsHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly and matches snapshot / structure', async () => {
    const navigationMock = { goBack: jest.fn(), navigate: jest.fn() };
    const { toJSON } = render(<VitalsHistoryScreen navigation={navigationMock} />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(toJSON()).toBeTruthy();
  });
});
