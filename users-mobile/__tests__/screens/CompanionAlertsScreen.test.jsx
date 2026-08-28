import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import CompanionAlertsScreen from '../../src/screens/app/CompanionAlertsScreen';
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

jest.mock('../../src/lib/api', () => ({
  apiService: {
    companion: {
      getPatientStatus: jest.fn().mockResolvedValue({
        data: {
          patient: {
            name: 'Puneeth',
          },
          recent_alerts: [
            {
              _id: 'a-1',
              type: 'critical_vital',
              severity: 'critical',
              description: 'High BP recorded: 150/95 mmHg',
              created_at: new Date().toISOString(),
              acknowledged: false,
            },
          ],
        },
      }),
      acknowledgeAlert: jest.fn().mockResolvedValue({ data: { success: true } }),
    },
  },
}));

describe('CompanionAlertsScreen', () => {
  beforeEach(() => {
    usePatientStore.setState({
      companionSelectedPatientId: 'p-1',
      companionSelectedPatientName: 'Puneeth',
    });
  });

  it('renders alerts screen cleanly without throwing', async () => {
    const { getByText } = render(<CompanionAlertsScreen />);
    await waitFor(() => {
      expect(getByText(/High BP recorded/i)).toBeTruthy();
    });
  });
});
