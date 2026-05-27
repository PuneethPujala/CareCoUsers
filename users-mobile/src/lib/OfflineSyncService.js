import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { apiService } from './api';
import usePatientStore from '../store/usePatientStore';

const QUEUE_KEY = 'offline_mutation_queue';

class OfflineSyncService {
    constructor() {
        this.isFlushing = false;
        
        // Listen to network changes to automatically update syncState
        NetInfo.addEventListener(state => {
            const currentSyncState = usePatientStore.getState().syncState;
            const isSimulatingOffline = usePatientStore.getState().simulateOffline;
            
            const isOffline = state.isConnected === false || isSimulatingOffline;
            
            if (isOffline) {
                usePatientStore.getState().setSyncState('offline');
            } else if (currentSyncState === 'offline') {
                // We just came online. We should immediately flush the queue if there's anything pending
                this.flushQueue();
            }
        });
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
                const queue = queueStr ? JSON.parse(queueStr) : [];
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
            const queue = queueStr ? JSON.parse(queueStr) : [];
            
            // Add timestamp for debugging/logging
            const item = { ...mutation, timestamp: Date.now() };
            queue.push(item);
            
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

            let queue = JSON.parse(queueStr);
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

            for (const item of queue) {
                if (item.nextRetryTime && Date.now() < item.nextRetryTime) {
                    remainingQueue.push(item);
                    hadFailures = true;
                    continue;
                }

                let success = false;
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
                            break;
                        // Add more offline-capable mutations here in the future
                        default:
                            console.warn(`[OfflineSync] Unknown mutation type: ${item.type}`);
                            success = true; // Drop unknown mutations to prevent blocking
                            break;
                    }
                } catch (error) {
                    // If it's a 4xx error (e.g. invalid data), we should probably drop it so it doesn't block forever.
                    // If it's a network error (ECONNABORTED, no response), keep it in the queue.
                    if (error.response && error.response.status >= 400 && error.response.status < 500) {
                        console.warn(`[OfflineSync] Dropping invalid mutation (4xx error):`, error.message);
                        success = true; // Drop it
                    } else {
                        item.retryCount = (item.retryCount || 0) + 1;
                        const backoffMs = Math.min(1000 * Math.pow(2, item.retryCount), 3600000); // Max 1 hour
                        item.nextRetryTime = Date.now() + backoffMs;
                        console.warn(`[OfflineSync] Sync failed, backing off for ${backoffMs/1000}s. Error:`, error.message);
                        success = false; // Keep it
                    }
                }

                if (!success) {
                    remainingQueue.push(item);
                    hadFailures = true;
                }
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
