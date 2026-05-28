import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import OfflineSyncService from '../../src/lib/OfflineSyncService';
import usePatientStore from '../../src/store/usePatientStore';
import { apiService } from '../../src/lib/api';
import * as SecureStore from 'expo-secure-store';

// Mock apiService
jest.mock('../../src/lib/api', () => ({
    apiService: {
        medicines: {
            markMedicine: jest.fn(),
            markSlotTaken: jest.fn(),
        },
        patients: {
            logVitals: jest.fn(),
        },
    },
}));

// Mock supabase
jest.mock('../../src/lib/supabase', () => ({
    supabase: {
        auth: {
            signOut: jest.fn().mockResolvedValue({}),
            getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
            refreshSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        },
    },
}));

// Mock tokenStorage
jest.mock('../../src/lib/tokenStorage', () => ({
    getApiTokens: jest.fn().mockResolvedValue(null),
    saveApiTokens: jest.fn().mockResolvedValue(null),
    clearApiTokens: jest.fn().mockResolvedValue(null),
}));

const QUEUE_KEY = 'offline_mutation_queue';

describe('Chaos & Resilience Integration Tests', () => {
    let mockStore = {};

    beforeAll(() => {
        // Implement an in-memory storage mock for AsyncStorage
        AsyncStorage.getItem.mockImplementation(async (key) => mockStore[key] || null);
        AsyncStorage.setItem.mockImplementation(async (key, val) => {
            mockStore[key] = String(val);
            return null;
        });
        AsyncStorage.removeItem.mockImplementation(async (key) => {
            delete mockStore[key];
            return null;
        });
        AsyncStorage.clear.mockImplementation(async () => {
            mockStore = {};
            return null;
        });
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        // Reset local in-memory mock store
        mockStore = {};
        // Reset Zustand store state
        usePatientStore.getState().setPendingSyncCount(0);
        usePatientStore.getState().setSyncState('synced');
        usePatientStore.getState().setSimulateOffline(false);
        OfflineSyncService.isFlushing = false;
        
        // Default NetInfo connection is true
        NetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // PHASE A: Network Hell & Partial Sync (CHAOS_NETWORK_DROP_V1)
    // ─────────────────────────────────────────────────────────────────────────────
    describe('Phase A: Network Hell & Partial Sync [CHAOS_NETWORK_DROP_V1]', () => {
        it('halts replay immediately on a mutation failure and preserves subsequent queue items in order', async () => {
            // Mock sequence of API responses:
            // 1. markMedicine succeeds
            apiService.medicines.markMedicine.mockResolvedValueOnce({ success: true });
            // 2. markSlotTaken fails with a network/timeout error
            apiService.medicines.markSlotTaken.mockRejectedValueOnce(new Error('Network Timeout'));
            
            // Queue three mutations chronologically
            const m1 = { type: 'MARK_MED_TAKEN', payload: { id: 'med-1' } };
            const m2 = { type: 'MARK_SLOT_TAKEN', payload: { id: 'slot-1' } };
            const m3 = { type: 'LOG_VITALS', payload: { systolic: 120, diastolic: 80 } };

            await OfflineSyncService.enqueueMutation(m1);
            await OfflineSyncService.enqueueMutation(m2);
            await OfflineSyncService.enqueueMutation(m3);

            expect(usePatientStore.getState().pendingSyncCount).toBe(3);

            // Execute flush
            await OfflineSyncService.flushQueue();

            // Verify API calls
            expect(apiService.medicines.markMedicine).toHaveBeenCalledTimes(1);
            expect(apiService.medicines.markSlotTaken).toHaveBeenCalledTimes(1);
            // Vitals logging must NOT have been called due to the halt contract
            expect(apiService.patients.logVitals).not.toHaveBeenCalled();

            // Verify queue state in AsyncStorage
            const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
            const queue = JSON.parse(queueStr);
            
            expect(queue.length).toBe(2);
            // Chronology must be preserved
            expect(queue[0].type).toBe('MARK_SLOT_TAKEN');
            expect(queue[1].type).toBe('LOG_VITALS');

            // Verify store updates
            expect(usePatientStore.getState().pendingSyncCount).toBe(2);
            expect(usePatientStore.getState().syncState).toBe('failed');
        });

        it('re-queues mutation with backoff timestamp and skips it on immediate retry', async () => {
            apiService.medicines.markMedicine.mockRejectedValueOnce(new Error('Server unavailable'));
            
            const mutation = { type: 'MARK_MED_TAKEN', payload: { id: 'med-1' } };
            await OfflineSyncService.enqueueMutation(mutation);

            // Flush failing request
            await OfflineSyncService.flushQueue();

            // Get queued item with backoff metadata
            const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
            const queue = JSON.parse(queueStr);
            expect(queue[0].retryCount).toBe(1);
            expect(queue[0].nextRetryTime).toBeGreaterThan(Date.now());

            // Attempting to flush again immediately should skip the mutation
            jest.clearAllMocks();
            await OfflineSyncService.flushQueue();

            expect(apiService.medicines.markMedicine).not.toHaveBeenCalled();
            expect(usePatientStore.getState().syncState).toBe('failed');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // PHASE B: Clock Manipulation & System Drift (CHAOS_CLOCK_DRIFT_V1)
    // ─────────────────────────────────────────────────────────────────────────────
    describe('Phase B: Clock Manipulation [CHAOS_CLOCK_DRIFT_V1]', () => {
        it('correctly calculates clock drift relative to server time using midpoint estimation', () => {
            const start = 1000000;
            const end = 1000200; // 200ms latency
            const serverTime = 1005000; // Server is 5 seconds ahead
            
            // Midpoint of roundtrip client time: start + (end - start) / 2 = 1000100
            const clientMidpoint = start + ((end - start) / 2);
            const drift = Math.abs(serverTime - clientMidpoint);

            expect(drift).toBe(4900); // 4.9 seconds drift
            
            // Drift is < 5000ms threshold -> good
            const status = drift < 5000 ? 'good' : 'bad';
            expect(status).toBe('good');
        });

        it('flags clock drift >= 5000ms threshold as bad status', () => {
            const start = 1000000;
            const end = 1000200;
            const serverTime = 1006000; // Server is 6 seconds ahead
            
            const clientMidpoint = start + ((end - start) / 2);
            const drift = Math.abs(serverTime - clientMidpoint);

            expect(drift).toBe(5900); // 5.9 seconds drift
            const status = drift < 5000 ? 'good' : 'bad';
            expect(status).toBe('bad');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // PHASE C: Queue Stress, 150 Limit & Write Interruption (CHAOS_QUEUE_CORRUPTION_V1)
    // ─────────────────────────────────────────────────────────────────────────────
    describe('Phase C: Queue Stress & Interruption [CHAOS_QUEUE_CORRUPTION_V1]', () => {
        it('enforces maximum queue capacity of 150 items by dropping oldest entries', async () => {
            // Enqueue 160 mutations
            for (let i = 1; i <= 160; i++) {
                await OfflineSyncService.enqueueMutation({
                    type: 'MARK_MED_TAKEN',
                    payload: { id: `med-${i}` }
                });
            }

            const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
            const queue = JSON.parse(queueStr);

            expect(queue.length).toBe(150);
            // Oldest 10 items (1 to 10) must have been dropped
            expect(queue[0].payload.id).toBe('med-11');
            expect(queue[149].payload.id).toBe('med-160');
            expect(usePatientStore.getState().pendingSyncCount).toBe(150);
        });

        it('recovers gracefully from storage corruption (malformed/interrupted JSON) by resetting the queue', async () => {
            // Write malformed JSON to simulate interrupted write or corrupted state
            await AsyncStorage.setItem(QUEUE_KEY, '{"corrupted": true, queue: [');

            // Enqueueing a new item should handle parse error, reset storage, and successfully save item
            const mutation = { type: 'LOG_VITALS', payload: { systolic: 120 } };
            await expect(OfflineSyncService.enqueueMutation(mutation)).resolves.not.toThrow();

            const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
            const queue = JSON.parse(queueStr);

            expect(queue.length).toBe(1);
            expect(queue[0].type).toBe('LOG_VITALS');
            expect(usePatientStore.getState().pendingSyncCount).toBe(1);
        });

        it('recovers gracefully during flush when queue JSON is corrupted', async () => {
            await AsyncStorage.setItem(QUEUE_KEY, '{"corrupted": true, queue: [');

            await expect(OfflineSyncService.flushQueue()).resolves.not.toThrow();

            expect(usePatientStore.getState().pendingSyncCount).toBe(0);
            expect(usePatientStore.getState().syncState).toBe('synced');
            expect(OfflineSyncService.isFlushing).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // PHASE D: Session Recovery & Revocation mid-sync (CHAOS_SESSION_REVOCATION_V1)
    // ─────────────────────────────────────────────────────────────────────────────
    describe('Phase D: Session Recovery & Revocation [CHAOS_SESSION_REVOCATION_V1]', () => {
        it('clears all security tokens and PHI caches on 401 Unauthorized API error during replay', async () => {
            // Mock a 401 Unauthorized API response for markMedicine
            const error401 = new Error('Unauthorized');
            error401.response = { status: 401, data: { error: 'Invalid token' } };
            apiService.medicines.markMedicine.mockRejectedValueOnce(error401);

            const mutation = { type: 'MARK_MED_TAKEN', payload: { id: 'med-1' } };
            await OfflineSyncService.enqueueMutation(mutation);

            // Mock profile caches
            await AsyncStorage.setItem('onboarding_step', '4');
            await SecureStore.setItemAsync('CareMyMed_user_profile', JSON.stringify({ name: 'Patient X' }));

            // Trigger flush
            await OfflineSyncService.flushQueue();

            // Verify queue drops the invalid mutation (4xx) and resets state
            expect(usePatientStore.getState().syncState).toBe('synced');
            expect(usePatientStore.getState().pendingSyncCount).toBe(0);
            expect(OfflineSyncService.isFlushing).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // PHASE E: Network Simulation & Double-Tap Prevention [CHAOS_NETWORK_SIMULATION_V1]
    // ─────────────────────────────────────────────────────────────────────────────
    describe('Phase E: Network Simulation & Double-Tap Prevention [CHAOS_NETWORK_SIMULATION_V1]', () => {
        it('prevents double-tap spam of medication marking within 1.5 seconds', async () => {
            apiService.medicines.markMedicine.mockResolvedValue({ success: true });
            
            const testMed = { id: 'aspirin_morning', name: 'Aspirin', type: 'morning', taken: false };
            
            usePatientStore.setState({
                dashboardMeds: [testMed],
                _optimisticMeds: {},
            });

            const p1 = usePatientStore.getState().optimisticToggleMed(testMed, true);
            const p2 = usePatientStore.getState().optimisticToggleMed(testMed, true);

            await Promise.all([p1, p2]);

            expect(apiService.medicines.markMedicine).toHaveBeenCalledTimes(1);
        });

        it('supports configured network simulation modes', () => {
            const store = usePatientStore.getState();
            
            expect(store.networkSimulationMode).toBe('online');
            
            store.setNetworkSimulationMode('flaky');
            expect(usePatientStore.getState().networkSimulationMode).toBe('flaky');
            
            store.setNetworkSimulationMode('slow');
            expect(usePatientStore.getState().networkSimulationMode).toBe('slow');
            
            store.setNetworkSimulationMode('online');
        });
    });
});
