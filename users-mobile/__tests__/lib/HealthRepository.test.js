import { Platform } from 'react-native';
import HealthRepository from '../../src/lib/HealthRepository';
import HealthSyncService from '../../src/services/HealthSyncService';
import { initializeHealthPlatform } from '../../src/lib/healthIntegration';

// Mock react-native-health-connect
jest.mock('react-native-health-connect', () => {
  return {
    initialize: jest.fn().mockResolvedValue(true),
    getGrantedPermissions: jest.fn().mockResolvedValue([]),
    readRecords: jest.fn().mockImplementation((type) => {
      if (type === 'HeartRate') {
        return Promise.resolve({
          records: [
            {
              startTime: '2026-07-08T00:00:00.000Z',
              endTime: '2026-07-08T00:00:05.000Z',
              samples: [{ beatsPerMinute: 72, time: '2026-07-08T00:00:00.000Z' }],
              metadata: { id: 'hr-1', clientRecordId: 'c-hr-1' },
            },
          ]
        });
      }
      if (type === 'BloodPressure') {
        return Promise.resolve({
          records: [
            {
              time: '2026-07-08T00:00:00.000Z',
              systolic: { inMillimetersOfMercury: 120 },
              diastolic: { inMillimetersOfMercury: 80 },
              metadata: { id: 'bp-1' },
            },
          ]
        });
      }
      return Promise.resolve({ records: [] });
    }),
  };
}, { virtual: true });

// Mock expo-sensors Pedometer
jest.mock('expo-sensors', () => {
  return {
    Pedometer: {
      isAvailableAsync: jest.fn().mockResolvedValue(true),
      getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      getStepCountAsync: jest.fn().mockResolvedValue({ steps: 12500 }),
    },
  };
}, { virtual: true });

// Mock axios / apiService
jest.mock('../../src/lib/api', () => {
  const mockApiService = {
    patients: {
      syncHealthData: jest.fn().mockResolvedValue({
        data: {
          success: true,
          results: {
            vitals: {
              summary: {
                accepted: 10,
                duplicates: 0,
                anomalies_detected: 0,
              },
            },
          },
        },
      }),
    },
  };

  return {
    apiService: mockApiService,
    post: jest.fn().mockResolvedValue({ data: { success: true } }),
    get: jest.fn().mockResolvedValue({ data: { health_provider: 'health_connect' } }),
  };
});

describe('Mobile Health Repository & Sync Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AndroidHealthAdapter correctly normalizes Health Connect records', async () => {
    Platform.OS = 'android';

    const HealthConnect = require('react-native-health-connect');
    HealthConnect.getGrantedPermissions.mockResolvedValue([
      { recordType: 'HeartRate' },
      { recordType: 'BloodPressure' },
    ]);

    await initializeHealthPlatform();
    const data = await HealthRepository.fetchAll();
    console.log('TEST DATA VITALS:', JSON.stringify(data.vitals));

    expect(data.vitals).toBeDefined();
    const hrVal = data.vitals.find(v => v.heart_rate === 72);
    expect(hrVal).toBeDefined();
    expect(hrVal.metadata.record_id).toBe('hr-1');

    const bpVal = data.vitals.find(v => v.blood_pressure);
    expect(bpVal).toBeDefined();
    expect(bpVal.blood_pressure.systolic).toBe(120);
    expect(bpVal.blood_pressure.diastolic).toBe(80);
  });

  it('AndroidHealthAdapter falls back to Expo Pedometer when Health Connect steps is 0', async () => {
    Platform.OS = 'android';

    const HealthConnect = require('react-native-health-connect');
    HealthConnect.getGrantedPermissions.mockResolvedValue([
      { recordType: 'Steps' }
    ]);
    
    // Force HealthConnect readRecords to return empty list for steps
    HealthConnect.readRecords.mockResolvedValue({ records: [] });

    await initializeHealthPlatform();
    const data = await HealthRepository.fetchAll();

    expect(data.activity).toBeDefined();
    expect(data.activity).not.toBeNull();
    expect(data.activity.steps).toBe(12500);
    expect(data.activity.distance_meters).toBe(Math.round(12500 * 0.762)); // Estimated distance
    expect(data.activity.active_calories).toBe(Math.round(12500 * 0.04));  // Estimated calories
    expect(data.activity.metadata.device_name).toBe('Device Pedometer Sensor');
  });

  it('IOSHealthAdapter returns empty or structured mock data when HealthKit not initialized', async () => {
    Platform.OS = 'ios';
    
    // By default, since we are in dev/mock, it should return mock/empty structures safely
    const data = await HealthRepository.fetchAll();
    expect(data.vitals).toBeDefined();
    expect(data.activity).toBeDefined();
    expect(data.body).toBeDefined();
  });

  it('HealthSyncService chunking works correctly and calls api endpoint', async () => {
    Platform.OS = 'android';

    const api = require('../../src/lib/api');
    
    // Mock HealthRepository to return 250 vitals to trigger chunking (chunk size is 100)
    const mockVitals = [];
    for (let i = 0; i < 250; i++) {
      mockVitals.push({
        timestamp: new Date().toISOString(),
        heart_rate: 60 + (i % 20),
        metadata: { record_id: `rec-${i}` },
      });
    }

    jest.spyOn(HealthRepository, 'fetchAll').mockResolvedValue({
      vitals: mockVitals,
      activity: { steps: 5000, active_calories: 200, date: new Date().toISOString() },
      body: { weight_kg: 70, date: new Date().toISOString() },
    });

    const result = await HealthSyncService.syncNow();
    expect(result).toBeDefined();
    expect(result.totalAccepted).toBe(30);
    
    // Vitals count is 250, chunk size is 100, so we expect 3 posts:
    expect(api.apiService.patients.syncHealthData).toHaveBeenCalledTimes(3);
  });
});
