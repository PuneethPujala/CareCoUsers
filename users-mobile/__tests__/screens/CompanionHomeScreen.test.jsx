import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CompanionHomeScreen from '../../src/screens/app/CompanionHomeScreen';
import usePatientStore from '../../src/store/usePatientStore';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
    useFocusEffect: (callback) => {
      React.useEffect(() => {
        callback();
      }, []);
    },
    useIsFocused: () => true,
  };
});

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'comp-123', email: 'companion@example.com' },
    profile: { fullName: 'Puneeth Companion', role: 'companion' },
  }),
}));

jest.mock('../../src/lib/api', () => ({
  apiService: {
    companion: {
      getLinkedPatients: jest.fn().mockResolvedValue({
        data: {
          linked_patients: [
            {
              patient_id: 'p-1',
              id: 'p-1',
              name: 'Puneeth',
              age: 28,
              relation: 'Self',
              adherence_rate: 90,
              current_streak: 7,
              vital_status: 'stable',
              recent_alerts_count: 0,
            },
            {
              patient_id: 'p-2',
              id: 'p-2',
              name: 'Priyanka',
              age: 26,
              relation: 'Sister',
              adherence_rate: 85,
              current_streak: 4,
              vital_status: 'stable',
              recent_alerts_count: 1,
            },
          ],
        },
      }),
      linkPatient: jest.fn().mockResolvedValue({ data: { success: true } }),
    },
  },
}));

describe('CompanionHomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders patient cards cleanly without throwing', async () => {
    const { getByText } = render(<CompanionHomeScreen />);
    await waitFor(() => {
      expect(getByText('Puneeth')).toBeTruthy();
      expect(getByText('Priyanka')).toBeTruthy();
    });
  });

  it('navigates to CompanionTabs with correct patient parameters on select', async () => {
    const { getByText } = render(<CompanionHomeScreen />);
    await waitFor(() => {
      expect(getByText('Puneeth')).toBeTruthy();
    });

    fireEvent.press(getByText('Puneeth'));
    expect(mockNavigate).toHaveBeenCalledWith('CompanionTabs', {
      screen: 'CompanionDashboard',
      params: { patientId: 'p-1', patientName: 'Puneeth' },
    });
  });
});
