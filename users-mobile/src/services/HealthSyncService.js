import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    initializeHealthPlatform,
    checkPermissionStatus,
    fetchGranularVitals,
    isHealthSupported,
} from '../lib/healthIntegration';
import { apiService } from '../lib/api';

// ─── Storage keys ───────────────────────────────────────────────
const STORAGE_KEYS = {
    LAST_SYNC_TIMESTAMP: '@samvaya_health_last_sync',
    SYNC_ENABLED: '@samvaya_health_sync_enabled',
    TOTAL_SYNCED_TODAY: '@samvaya_health_synced_today',
    TODAY_DATE: '@samvaya_health_today_date',
};

// ─── Config ─────────────────────────────────────────────────────
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes between syncs
const MAX_READINGS_PER_SYNC = 100;

class HealthSyncService {
    static _appStateSubscription = null;
    static _isRunning = false;
    static _listeners = [];

    /**
     * Initialize the sync service and set up AppState listener.
     * Call this once when the app starts (after authentication).
     */
    static async initialize() {
        if (!isHealthSupported()) {
            console.log('⚡ Health sync: Platform not supported');
            return false;
        }

        const enabled = await this.isSyncEnabled();
        if (!enabled) {
            console.log('⚡ Health sync: Not enabled by user');
            return false;
        }

        const initialized = await initializeHealthPlatform();
        if (!initialized) {
            console.log('⚡ Health sync: Platform initialization failed');
            return false;
        }

        const permStatus = await checkPermissionStatus();
        if (permStatus !== 'granted') {
            console.log(`⚡ Health sync: Permissions ${permStatus}`);
            return false;
        }

        // Start listening for app foreground events
        this._setupAppStateListener();

        // Do an immediate sync on initialization
        this.syncNow();

        console.log('✅ Health sync service initialized');
        return true;
    }

    /**
     * Register a listener for sync status changes.
     * @param {function} callback - Called with { syncing, lastSync, readingsToday, error }
     * @returns {function} Unsubscribe function
     */
    static addListener(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(l => l !== callback);
        };
    }

    /**
     * Notify all registered listeners of a status change.
     */
    static _notifyListeners(status) {
        this._listeners.forEach(cb => {
            try { cb(status); } catch (e) { /* listener error */ }
        });
    }

    /**
     * Set up the AppState listener for foreground sync.
     */
    static _setupAppStateListener() {
        if (this._appStateSubscription) return;

        this._appStateSubscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                // App came to foreground — trigger sync if interval has passed
                this.syncIfReady();
            }
        });
    }

    /**
     * Clean up the AppState listener.
     */
    static cleanup() {
        if (this._appStateSubscription) {
            this._appStateSubscription.remove();
            this._appStateSubscription = null;
        }
        this._listeners = [];
    }

    /**
     * Check if sync is enabled by the user.
     */
    static async isSyncEnabled() {
        try {
            const val = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_ENABLED);
            return val === 'true';
        } catch {
            return false;
        }
    }

    /**
     * Enable or disable health sync.
     * @param {boolean} enabled
     */
    static async setSyncEnabled(enabled) {
        await AsyncStorage.setItem(STORAGE_KEYS.SYNC_ENABLED, enabled ? 'true' : 'false');
        if (enabled) {
            await this.initialize();
        } else {
            this.cleanup();
        }
    }

    /**
     * Sync if enough time has passed since the last sync.
     */
    static async syncIfReady() {
        try {
            const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIMESTAMP);
            if (lastSync) {
                const elapsed = Date.now() - parseInt(lastSync, 10);
                if (elapsed < MIN_SYNC_INTERVAL_MS) {
                    console.log(`⏳ Health sync: Too soon (${Math.round(elapsed / 60000)}m since last sync)`);
                    return;
                }
            }
            await this.syncNow();
        } catch (e) {
            console.error('Health sync readiness check failed:', e);
        }
    }

    /**
     * Perform the sync immediately.
     * Fetches granular vitals from the device and uploads them to the backend.
     */
    static async syncNow() {
        if (this._isRunning) {
            console.log('⚡ Health sync: Already running, skipping');
            return null;
        }

        this._isRunning = true;
        this._notifyListeners({ syncing: true });

        try {
            // 1. Determine the "since" timestamp
            const lastSyncStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIMESTAMP);
            const sinceTimestamp = lastSyncStr
                ? new Date(parseInt(lastSyncStr, 10))
                : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h

            // 2. Fetch granular vitals from device
            const readings = await fetchGranularVitals(sinceTimestamp);

            if (!readings || readings.length === 0) {
                console.log('⚡ Health sync: No new readings since last sync');
                await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIMESTAMP, Date.now().toString());

                this._notifyListeners({
                    syncing: false,
                    lastSync: new Date(),
                    readingsToday: await this._getTodayCount(),
                });
                return null;
            }

            // 3. Chunk readings if > MAX_READINGS_PER_SYNC
            const chunks = [];
            for (let i = 0; i < readings.length; i += MAX_READINGS_PER_SYNC) {
                chunks.push(readings.slice(i, i + MAX_READINGS_PER_SYNC));
            }

            let totalAccepted = 0;
            let totalDuplicates = 0;
            let anomaliesDetected = 0;

            // 4. Upload each chunk
            const source = Platform.OS === 'ios' ? 'healthkit' : 'health_connect';

            for (const chunk of chunks) {
                try {
                    const response = await apiService.patients.syncVitals({
                        readings: chunk,
                        source,
                    });

                    const summary = response.data?.summary;
                    if (summary) {
                        totalAccepted += summary.accepted || 0;
                        totalDuplicates += summary.duplicates || 0;
                        anomaliesDetected += summary.anomalies_detected || 0;
                    }
                } catch (err) {
                    console.error('Health sync chunk upload failed:', err.message);
                    // Continue with next chunk — partial success is fine
                }
            }

            // 5. Update last sync timestamp
            await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIMESTAMP, Date.now().toString());

            // 6. Update today's count
            await this._incrementTodayCount(totalAccepted);

            const result = {
                syncing: false,
                lastSync: new Date(),
                readingsToday: await this._getTodayCount(),
                totalAccepted,
                totalDuplicates,
                anomaliesDetected,
            };

            console.log(`✅ Health sync complete: ${totalAccepted} accepted, ${totalDuplicates} duplicates, ${anomaliesDetected} anomalies`);
            this._notifyListeners(result);
            return result;

        } catch (err) {
            console.error('Health sync failed:', err);
            this._notifyListeners({
                syncing: false,
                error: err.message,
            });
            return null;
        } finally {
            this._isRunning = false;
        }
    }

    /**
     * Get the current sync status (for UI display).
     */
    static async getStatus() {
        try {
            const [lastSyncStr, todayCount, enabled] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIMESTAMP),
                this._getTodayCount(),
                this.isSyncEnabled(),
            ]);

            const permStatus = await checkPermissionStatus();

            return {
                enabled,
                connected: permStatus === 'granted',
                permissionStatus: permStatus,
                lastSync: lastSyncStr ? new Date(parseInt(lastSyncStr, 10)) : null,
                readingsToday: todayCount,
                syncing: this._isRunning,
            };
        } catch (e) {
            return {
                enabled: false,
                connected: false,
                permissionStatus: 'unavailable',
                lastSync: null,
                readingsToday: 0,
                syncing: false,
            };
        }
    }

    /**
     * Track today's synced readings count in AsyncStorage.
     */
    static async _getTodayCount() {
        try {
            const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const storedDate = await AsyncStorage.getItem(STORAGE_KEYS.TODAY_DATE);

            if (storedDate !== todayKey) {
                // New day — reset counter
                await AsyncStorage.setItem(STORAGE_KEYS.TODAY_DATE, todayKey);
                await AsyncStorage.setItem(STORAGE_KEYS.TOTAL_SYNCED_TODAY, '0');
                return 0;
            }

            const count = await AsyncStorage.getItem(STORAGE_KEYS.TOTAL_SYNCED_TODAY);
            return parseInt(count || '0', 10);
        } catch {
            return 0;
        }
    }

    static async _incrementTodayCount(amount) {
        try {
            const current = await this._getTodayCount();
            await AsyncStorage.setItem(STORAGE_KEYS.TOTAL_SYNCED_TODAY, (current + amount).toString());
        } catch {
            // Non-critical
        }
    }
}

export default HealthSyncService;
