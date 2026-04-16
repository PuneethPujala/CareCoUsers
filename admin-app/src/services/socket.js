/**
 * ═══════════════════════════════════════════════════════════════
 * CARECONNECT — React Native Socket.io Client
 *
 * Usage:
 *   import { socketService } from './services/socket';
 *
 *   // Connect on app startup (after auth)
 *   socketService.connect(jwtToken);
 *
 *   // Listen for events
 *   socketService.on('new_escalation', (data) => { ... });
 *   socketService.on('call_status_change', (data) => { ... });
 *
 *   // Disconnect on logout
 *   socketService.disconnect();
 * ═══════════════════════════════════════════════════════════════
 */

import { io } from 'socket.io-client';
import { Platform } from 'react-native';

// ── Configuration ────────────────────────────────────────────
const BACKEND_PORT = 5000; // Must match backend .env PORT

const getSocketUrl = () => {
    if (__DEV__) {
        // Use env var if explicitly set (strip /api suffix for socket)
        if (process.env.EXPO_PUBLIC_API_URL) {
            return process.env.EXPO_PUBLIC_API_URL.replace(/\/api\/?$/, '');
        }

        // Auto-detect from Expo debugger host
        const Constants = require('expo-constants').default;
        const debuggerHost =
            Constants.expoConfig?.hostUri ||
            Constants.manifest?.debuggerHost ||
            Constants.manifest2?.extra?.expoGo?.debuggerHost;

        if (debuggerHost) {
            const host = debuggerHost.split(':')[0];
            return `http://${host}:${BACKEND_PORT}`;
        }

        return Platform.OS === 'android'
            ? `http://10.0.2.2:${BACKEND_PORT}`
            : `http://localhost:${BACKEND_PORT}`;
    }
    return 'https://your-production-api.com';
};

const RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;

// ── Socket Service ───────────────────────────────────────────

class SocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();     // event → Set<callback>
        this.connectionInfo = null;
        this._isConnecting = false;
    }

    /**
     * Connect to the WebSocket server with JWT authentication.
     * @param {string} token — Supabase JWT
     * @param {object} [options] — override options
     */
    connect(token, options = {}) {
        if (this.socket?.connected) {
            console.log('[Socket] Already connected');
            return;
        }

        if (this._isConnecting) {
            console.log('[Socket] Connection already in progress');
            return;
        }

        this._isConnecting = true;

        this.socket = io(options.url || getSocketUrl(), {
            auth: { token },
            transports: ['websocket'],  // Skip polling for React Native
            reconnection: true,
            reconnectionAttempts: RECONNECT_ATTEMPTS,
            reconnectionDelay: RECONNECT_DELAY,
            timeout: 10000,
            forceNew: true,
        });

        this._setupCoreListeners();
        this._reattachListeners();
    }

    /**
     * Disconnect from the server.
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connectionInfo = null;
            this._isConnecting = false;
            console.log('[Socket] Disconnected');
        }
    }

    /**
     * Subscribe to a socket event.
     * @param {string} event — event name
     * @param {function} callback
     * @returns {function} unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        // If already connected, attach immediately
        if (this.socket) {
            this.socket.on(event, callback);
        }

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from a socket event.
     */
    off(event, callback) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.delete(callback);
            if (eventListeners.size === 0) {
                this.listeners.delete(event);
            }
        }
        if (this.socket) {
            this.socket.off(event, callback);
        }
    }

    /**
     * Subscribe to a patient's real-time updates.
     * @param {string} patientId
     */
    subscribeToPatient(patientId) {
        this.socket?.emit('subscribe_patient', patientId);
    }

    /**
     * Unsubscribe from a patient's updates.
     * @param {string} patientId
     */
    unsubscribeFromPatient(patientId) {
        this.socket?.emit('unsubscribe_patient', patientId);
    }

    /**
     * Send typing indicator.
     * @param {string} recipientId
     * @param {boolean} isTyping
     */
    sendTypingIndicator(recipientId, isTyping) {
        this.socket?.emit('typing', { recipientId, isTyping });
    }

    /**
     * Check connection status.
     */
    get isConnected() {
        return this.socket?.connected ?? false;
    }

    // ── Internal ─────────────────────────────────────────────

    _setupCoreListeners() {
        const socket = this.socket;

        socket.on('connect', () => {
            this._isConnecting = false;
            console.log('[Socket] Connected:', socket.id);
        });

        socket.on('connected', (info) => {
            this.connectionInfo = info;
            console.log('[Socket] Authenticated:', info.role, '| Rooms:', info.rooms?.length);
        });

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
        });

        socket.on('connect_error', (err) => {
            this._isConnecting = false;
            console.error('[Socket] Connection error:', err.message);
        });

        socket.on('reconnect', (attempt) => {
            console.log('[Socket] Reconnected on attempt:', attempt);
        });

        socket.on('reconnect_failed', () => {
            console.error('[Socket] Reconnection failed after', RECONNECT_ATTEMPTS, 'attempts');
        });
    }

    /** Re-attach user listeners after reconnect */
    _reattachListeners() {
        if (!this.socket) return;
        this.listeners.forEach((callbacks, event) => {
            callbacks.forEach((cb) => {
                this.socket.on(event, cb);
            });
        });
    }
}

// ── Singleton export ─────────────────────────────────────────
export const socketService = new SocketService();

// ═══════════════════════════════════════════════════════════════
// REACT HOOK — useSocket
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * React hook for consuming socket events.
 *
 * Usage:
 *   const { isConnected, lastEvent } = useSocket('new_escalation', (data) => {
 *     setAlerts(prev => [data, ...prev]);
 *   });
 *
 * @param {string} event — event name
 * @param {function} handler — callback
 * @returns {{ isConnected: boolean, lastEvent: any }}
 */
export function useSocket(event, handler) {
    const [isConnected, setIsConnected] = useState(socketService.isConnected);
    const [lastEvent, setLastEvent] = useState(null);
    const handlerRef = useRef(handler);

    // Keep handler ref fresh
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        const eventHandler = (data) => {
            setLastEvent(data);
            handlerRef.current?.(data);
        };

        const unsub = socketService.on(event, eventHandler);
        socketService.on('connect', onConnect);
        socketService.on('disconnect', onDisconnect);

        return () => {
            unsub();
            socketService.off('connect', onConnect);
            socketService.off('disconnect', onDisconnect);
        };
    }, [event]);

    return { isConnected, lastEvent };
}

/**
 * Hook for subscribing to patient-specific updates.
 *
 * Usage:
 *   usePatientSocket(patientId, {
 *     onCallChange: (data) => { ... },
 *     onAdherenceUpdate: (data) => { ... },
 *   });
 */
export function usePatientSocket(patientId, handlers = {}) {
    useEffect(() => {
        if (!patientId) return;

        socketService.subscribeToPatient(patientId);

        const unsubs = [];
        if (handlers.onCallChange) {
            unsubs.push(socketService.on('call_status_change', (payload) => {
                if (payload.data?.patientId?.toString() === patientId.toString()) {
                    handlers.onCallChange(payload);
                }
            }));
        }
        if (handlers.onAdherenceUpdate) {
            unsubs.push(socketService.on('adherence_update', (payload) => {
                if (payload.data?.patientId?.toString() === patientId.toString()) {
                    handlers.onAdherenceUpdate(payload);
                }
            }));
        }
        if (handlers.onEscalation) {
            unsubs.push(socketService.on('new_escalation', (payload) => {
                if (payload.data?.patientId?.toString() === patientId.toString()) {
                    handlers.onEscalation(payload);
                }
            }));
        }

        return () => {
            socketService.unsubscribeFromPatient(patientId);
            unsubs.forEach(unsub => unsub());
        };
    }, [patientId]);
}
