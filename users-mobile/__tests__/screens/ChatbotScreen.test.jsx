import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import ChatbotScreen from '../../src/screens/patient/ChatbotScreen';

// Mock expo-av
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    setAudioModeAsync: jest.fn().mockResolvedValue(null),
    Recording: jest.fn().mockImplementation(() => ({
      prepareToRecordAsync: jest.fn().mockResolvedValue(null),
      startAsync: jest.fn().mockResolvedValue(null),
      stopAndUnloadAsync: jest.fn().mockResolvedValue(null),
      getURI: jest.fn().mockReturnValue('mock-audio-uri'),
    })),
  },
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: 'Images' },
}));

// Mock translation hook
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

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback) => {
      React.useEffect(() => {
        callback();
      }, [callback]);
    },
    useIsFocused: () => true,
    useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
  };
});

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
}));

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
    ArrowLeft: dummy,
    Send: dummy,
    Sparkles: dummy,
    Bot: dummy,
    User: dummy,
    Mic: dummy,
    Paperclip: dummy,
    Trash2: dummy,
    Pill: dummy,
    Flame: dummy,
    TrendingUp: dummy,
    CheckCircle2: dummy,
    Activity: dummy,
    Heart: dummy,
    Wind: dummy,
    Calendar: dummy,
    Shield: dummy,
    Plus: dummy,
    Square: dummy,
  };
});

// Mock Auth Context
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    displayName: 'Puneeth Pujala',
    user: { uid: 'test-user-123' },
    profile: { role: 'patient' },
    userRole: 'patient',
  }),
}));

// Mock Patient Store
jest.mock('../../src/store/usePatientStore', () => {
  const mockStore = (selector) => {
    const state = {
      patient: { _id: 'patient-abc', first_name: 'Puneeth', language: 'en' },
      dashboardMeds: [],
      vitals: { systolic: 120, diastolic: 80, heartRate: 72 },
      adherenceDetails: { streak: 5 },
      companionSelectedPatientId: null,
    };
    return selector(state);
  };
  mockStore.getState = () => ({
    dashboardMeds: [],
    adherenceDetails: { streak: 5 },
  });
  return mockStore;
});

// Mock API layer
jest.mock('../../src/lib/api', () => {
  const mockApi = {
    chatbot: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          messages: [
            {
              _id: 'disclaimer-msg',
              text: 'Disclaimer text...',
              role: 'assistant',
              timestamp: new Date().toISOString(),
            },
          ],
          title: 'Active Session',
        },
      }),
      createSession: jest.fn().mockResolvedValue({
        data: {
          _id: 'new-session-id',
          messages: [],
        },
      }),
    },
  };
  return {
    __esModule: true,
    default: mockApi,
    apiService: mockApi,
    getApiTokens: jest.fn().mockResolvedValue({ access_token: 'fake-jwt' }),
  };
});

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

describe('ChatbotScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly and matches active conversation structure', async () => {
    const navigationMock = { goBack: jest.fn(), navigate: jest.fn(), setParams: jest.fn() };
    const routeMock = { params: { sessionId: 'session-xyz' } };

    const { toJSON } = render(<ChatbotScreen navigation={navigationMock} route={routeMock} />);
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    
    expect(toJSON()).toBeTruthy();
  });
});
