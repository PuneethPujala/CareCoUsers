import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, DeviceEventEmitter } from 'react-native';
import { apiService } from './api';
import usePatientStore from '../store/usePatientStore';

const QUEUE_KEY = 'offline_mutation_queue';

class OfflineSyncService {
    constructor() {
        this.isFlushing = false;
        this.lastFlushAt = 0;
        
        // Listen to network changes to automatically update syncState
        NetInfo.addEventListener(state => {
            const currentSyncState = usePatientStore.getState().syncState;
            const isSimulatingOffline = usePatientStore.getState().simulateOffline;
            
            const isOffline = state.isConnected === false || isSimulatingOffline;
            
            this.logLifecycleEvent('network_change', `connected: ${state.isConnected}, type: ${state.type}`);

            if (isOffline) {
                usePatientStore.getState().setSyncState('offline');
            } else if (currentSyncState === 'offline') {
                // We just came online. We should immediately flush the queue if there's anything pending
                this.flushQueue();
            }
        });

        // Listen to app foregrounding to automatically flush the queue (with 5s debounce)
        this.appStateSubscription = AppState.addEventListener('change', nextAppState => {
            this.logLifecycleEvent('app_state_change', nextAppState);
            if (nextAppState === 'active') {
                const now = Date.now();
                if (now - this.lastFlushAt < 5000) {
                    if (__DEV__) console.log('[OfflineSync] Foreground flush debounced.');
                    return;
                }
                if (__DEV__) console.log('[OfflineSync] App returned to foreground, flushing queue...');
                this.flushQueue();
            }
        });
    }

    /**
     * Appends a detailed log entry to the app lifecycle history stored in AsyncStorage.
     */
    async logLifecycleEvent(event, detail) {
        try {
            const now = new Date();
            const offsetMinutes = -now.getTimezoneOffset();
            const sign = offsetMinutes >= 0 ? '+' : '-';
            const pad = (num) => String(Math.abs(num)).padStart(2, '0');
            const offsetStr = `${sign}${pad(Math.floor(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
            const localTimeStr = now.toLocaleTimeString();

            const newEntry = {
                event,
                detail,
                local_time: localTimeStr,
                utc_time: now.toISOString(),
                offset: offsetStr,
                timestamp: Date.now()
            };

            const historyStr = await AsyncStorage.getItem('app_lifecycle_history');
            let history = historyStr ? JSON.parse(historyStr) : [];
            if (!Array.isArray(history)) history = [];

            history.unshift(newEntry);
            if (history.length > 20) {
                history = history.slice(0, 20);
            }

            await AsyncStorage.setItem('app_lifecycle_history', JSON.stringify(history));
        } catch (err) {
            console.error('[OfflineSync] Failed to log lifecycle event:', err);
        }
    }

    /**
     * Appends a detailed entry to the offline mutation replay history stored in AsyncStorage.
     */
    async logReplayEvent(action, status, errorMsg = null) {
        try {
            const now = new Date();
            const offsetMinutes = -now.getTimezoneOffset();
            const sign = offsetMinutes >= 0 ? '+' : '-';
            const pad = (num) => String(Math.abs(num)).padStart(2, '0');
            const offsetStr = `${sign}${pad(Math.floor(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
            const localTimeStr = now.toLocaleTimeString();

            const newEntry = {
                action,
                status, // 'success' | 'failure'
                error: errorMsg,
                local_time: localTimeStr,
                utc_time: now.toISOString(),
                offset: offsetStr,
                timestamp: Date.now()
            };

            const historyStr = await AsyncStorage.getItem('offline_replay_history');
            let history = historyStr ? JSON.parse(historyStr) : [];
            if (!Array.isArray(history)) history = [];

            history.unshift(newEntry);
            if (history.length > 15) {
                history = history.slice(0, 15);
            }

            await AsyncStorage.setItem('offline_replay_history', JSON.stringify(history));
        } catch (err) {
            console.error('[OfflineSync] Failed to log replay event:', err);
        }
    }

    /**
     * Broadcasts the current pending queue length to the store
     */
    async _updateStoreCount(countOverride) {
        try {
            if (typeof countOverride === 'number') {
                usePatientStore.getState().setPendingSyncCount(countOverride);
            } else {
                const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
                let queue = [];
                try {
                    queue = queueStr ? JSON.parse(queueStr) : [];
                    if (!Array.isArray(queue)) queue = [];
                } catch {
                    queue = [];
                }
                usePatientStore.getState().setPendingSyncCount(queue.length);
            }
        } catch (e) {}
    }

    /**
     * Pushes a mutation object to the AsyncStorage queue.
     * @param {Object} mutation - e.g. { type: 'MARK_MED_TAKEN', payload: { medicine_name: 'Aspirin', scheduled_time: 'morning', taken: true } }
     */
    async enqueueMutation(mutation) {
        try {
            const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
            let queue = [];
            try {
                queue = queueStr ? JSON.parse(queueStr) : [];
                if (!Array.isArray(queue)) queue = [];
            } catch (parseErr) {
                console.error('[OfflineSync] Queue corruption detected during enqueue. Resetting queue...', parseErr);
                queue = [];
                await AsyncStorage.removeItem(QUEUE_KEY);
            }
            
            // Add timestamp for debugging/logging
            const item = { ...mutation, timestamp: Date.now() };
            queue.push(item);
            
            // Max queue size cap of 150 items to prevent RAM/Storage leaks
            const MAX_QUEUE_SIZE = 150;
            if (queue.length > MAX_QUEUE_SIZE) {
                console.warn(`[OfflineSync] Queue size cap exceeded. Pruning oldest ${queue.length - MAX_QUEUE_SIZE} items.`);
                queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
            }

            await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
            this._updateStoreCount(queue.length);

            // If we are currently disconnected, we know it's going to stay in the queue
            const netInfo = await NetInfo.fetch();
            const isSimulatingOffline = usePatientStore.getState().simulateOffline;
            if (!netInfo.isConnected || isSimulatingOffline) {
                usePatientStore.getState().setSyncState('offline');
            }

            if (__DEV__) console.log('[OfflineSync] Enqueued mutation:', mutation.type);
        } catch (error) {
            console.error('[OfflineSync] Failed to enqueue mutation:', error);
        }
    }

    /**
     * Reads the queue and attempts to process all items.
     * Removes successful items from the queue.
     */
    async flushQueue() {
        if (this.isFlushing) return;
        
        const netInfo = await NetInfo.fetch();
        const isSimulatingOffline = usePatientStore.getState().simulateOffline;
        
        if (!netInfo.isConnected || isSimulatingOffline) {
            usePatientStore.getState().setSyncState('offline');
            return;
        }

        this.lastFlushAt = Date.now();
        this.isFlushing = true;

        try {
            const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
            if (!queueStr) {
                this._updateStoreCount(0);
                usePatientStore.getState().setSyncState('synced');
                usePatientStore.getState().setLastSyncTimestamp(Date.now());
                this.isFlushing = false;
                return;
            }

            let queue = [];
            try {
                queue = JSON.parse(queueStr);
                if (!Array.isArray(queue)) queue = [];
            } catch (parseErr) {
                console.error('[OfflineSync] Queue corruption detected during flush. Resetting queue...', parseErr);
                await AsyncStorage.removeItem(QUEUE_KEY);
                this._updateStoreCount(0);
                usePatientStore.getState().setSyncState('synced');
                usePatientStore.getState().setLastSyncTimestamp(Date.now());
                this.isFlushing = false;
                return;
            }

            if (queue.length === 0) {
                this._updateStoreCount(0);
                usePatientStore.getState().setSyncState('synced');
                usePatientStore.getState().setLastSyncTimestamp(Date.now());
                this.isFlushing = false;
                return;
            }

            usePatientStore.getState().setSyncState('syncing');
            this._updateStoreCount(queue.length);

            if (__DEV__) console.log(`[OfflineSync] Flushing ${queue.length} items...`);

            const remainingQueue = [];
            let hadFailures = false;
            let hadVitalsSynced = false;

            for (const item of queue) {
                // If a prior item in this flush loop failed or was skipped, we MUST halt replay
                // for all subsequent items to guarantee strict sequential replay order.
                if (hadFailures) {
                    remainingQueue.push(item);
                    continue;
                }

                if (item.nextRetryTime && Date.now() < item.nextRetryTime) {
                    remainingQueue.push(item);
                    hadFailures = true;
                    continue;
                }

                let success = false;
                let errorMsg = null;
                try {
                    // Route the mutation to the correct API call
                    switch (item.type) {
                        case 'MARK_MED_TAKEN':
                            await apiService.medicines.markMedicine(item.payload);
                            success = true;
                            break;
                        case 'MARK_SLOT_TAKEN':
                            await apiService.medicines.markSlotTaken(item.payload);
                            success = true;
                            break;
                        case 'LOG_VITALS':
                            await apiService.patients.logVitals(item.payload);
                            success = true;
                            hadVitalsSynced = true;
                            break;
                        // Add more offline-capable mutations here in the future
                        default:
                            console.warn(`[OfflineSync] Unknown mutation type: ${item.type}`);
                            success = true; // Drop unknown mutations to prevent blocking
                            break;
                    }
                    if (success) {
                        this.logReplayEvent(item.type, 'success');
                    }
                } catch (error) {
                    errorMsg = error.message;
                    // If it's a 4xx error (e.g. invalid data), we should probably drop it so it doesn't block forever.
                    // If it's a network error (ECONNABORTED, no response), keep it in the queue.
                    if (error.response && error.response.status >= 400 && error.response.status < 500) {
                        console.warn(`[OfflineSync] Dropping invalid mutation (4xx error):`, error.message);
                        success = true; // Drop it
                        this.logReplayEvent(item.type, 'failure', `Dropped (4xx): ${error.message}`);
                    } else {
                        item.retryCount = (item.retryCount || 0) + 1;
                        const backoffMs = Math.min(1000 * Math.pow(2, item.retryCount), 3600000); // Max 1 hour
                        item.nextRetryTime = Date.now() + backoffMs;
                        console.warn(`[OfflineSync] Sync failed, backing off for ${backoffMs/1000}s. Error:`, error.message);
                        success = false; // Keep it
                        hadFailures = true; // Halt further queue items
                        this.logReplayEvent(item.type, 'failure', `Backoff ${backoffMs/1000}s: ${error.message}`);
                    }
                }

                if (!success) {
                    remainingQueue.push(item);
                    hadFailures = true;
                }
            }

            if (hadVitalsSynced) {
                DeviceEventEmitter.emit('VITALS_UPDATED', { source: 'sync' });
            }

            // Save the remaining items back to the queue
            await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
            this._updateStoreCount(remainingQueue.length);
            
            if (hadFailures && remainingQueue.length > 0) {
                usePatientStore.getState().setSyncState('failed');
            } else {
                usePatientStore.getState().setSyncState('synced');
                usePatientStore.getState().setLastSyncTimestamp(Date.now());
            }
            
            if (__DEV__) {
                console.log(`[OfflineSync] Flush complete. ${remainingQueue.length} items remain.`);
            }

        } catch (error) {
            console.error('[OfflineSync] Flush error:', error);
            usePatientStore.getState().setSyncState('failed');
        } finally {
            this.isFlushing = false;
        }
    }
}

export default new OfflineSyncService();
