/**
 * ═══════════════════════════════════════════════════════════════
 * CARECONNECT — React Native Dashboard Hooks
 *
 * Hooks:
 *   useDashboardData(role)  — auto-refresh every 30s
 *   useCallQueue(date?)     — real-time call list
 *   usePatientList(options) — paginated patient list
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { socketService, useSocket } from '../services/socket';

// ═══════════════════════════════════════════════════════════════
// 1. useDashboardData — auto-refreshing KPIs
// ═══════════════════════════════════════════════════════════════

/**
 * Fetches dashboard data for the authenticated user's role.
 * Auto-refreshes every 30s and on WebSocket `dashboard_refresh` events.
 *
 * @param {'admin' | 'org' | 'manager' | 'caretaker'} role
 * @returns {{ data, loading, error, refresh }}
 */
export function useDashboardData(role = 'caretaker') {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const intervalRef = useRef(null);

    const ENDPOINTS = {
        admin: '/dashboard/super-admin-stats',
        org: '/dashboard/org-admin-stats',
        manager: '/dashboard/care-manager-stats',
        caretaker: '/caretaker/dashboard',
    };

    const fetchData = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            setError(null);

            const res = await api.get(ENDPOINTS[role]);
            setData(res.data);
        } catch (err) {
            setError(err.message || 'Failed to load dashboard');
            console.error(`[Dashboard] ${role} fetch error:`, err);
        } finally {
            setLoading(false);
        }
    }, [role]);

    // Initial fetch + polling
    useEffect(() => {
        fetchData();
        intervalRef.current = setInterval(() => fetchData(true), 30000);
        return () => clearInterval(intervalRef.current);
    }, [fetchData]);

    // WebSocket-triggered refresh
    useSocket('dashboard_refresh', () => fetchData(true));

    return { data, loading, error, refresh: () => fetchData(true) };
}

// ═══════════════════════════════════════════════════════════════
// 2. useCallQueue — real-time call list
// ═══════════════════════════════════════════════════════════════

/**
 * Fetches today's call queue with real-time status updates via WebSocket.
 *
 * @param {{ date?: string, role?: string }} options
 * @returns {{ calls, summary, loading, error, refresh }}
 */
export function useCallQueue({ date, role = 'caretaker' } = {}) {
    const [calls, setCalls] = useState([]);
    const [summary, setSummary] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const ENDPOINTS = {
        caretaker: '/caretaker/call-queue',
        manager: '/manager/call-queue',
    };

    const fetchCalls = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const params = date ? { date } : {};
            const res = await api.get(ENDPOINTS[role], { params });

            setCalls(res.data.calls || []);
            setSummary(res.data.summary || res.data.statusSummary || {});
        } catch (err) {
            setError(err.message || 'Failed to load calls');
        } finally {
            setLoading(false);
        }
    }, [date, role]);

    useEffect(() => {
        fetchCalls();
    }, [fetchCalls]);

    // Real-time call status changes
    useSocket('call_status_change', (payload) => {
        setCalls((prev) =>
            prev.map((call) =>
                call._id === payload.data?.id
                    ? { ...call, status: payload.data.status, outcome: payload.data.outcome }
                    : call
            )
        );
    });

    return { calls, summary, loading, error, refresh: fetchCalls };
}

// ═══════════════════════════════════════════════════════════════
// 3. usePatientList — paginated patient list
// ═══════════════════════════════════════════════════════════════

/**
 * Paginated patient list with search.
 *
 * @param {{ role?: string, page?: number, limit?: number, search?: string }} options
 * @returns {{ patients, pagination, loading, error, setPage, setSearch, refresh }}
 */
export function usePatientList({ role = 'caretaker', initialLimit = 20 } = {}) {
    const [patients, setPatients] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: initialLimit, total: 0, totalPages: 0, hasNext: false, hasPrev: false });
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const ENDPOINTS = {
        caretaker: '/caretaker/patients',
        manager: '/manager/patients',
        org: '/org/patients',
    };

    const fetchPatients = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const params = { page, limit: initialLimit };
            if (search) params.search = search;

            const res = await api.get(ENDPOINTS[role], { params });

            setPatients(res.data.patients || res.data.data || []);
            setPagination(res.data.pagination || {});
        } catch (err) {
            setError(err.message || 'Failed to load patients');
        } finally {
            setLoading(false);
        }
    }, [page, search, role, initialLimit]);

    useEffect(() => {
        fetchPatients();
    }, [fetchPatients]);

    // Debounced search
    const searchTimer = useRef(null);
    const handleSearch = useCallback((text) => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setSearch(text);
            setPage(1);
        }, 400);
    }, []);

    return {
        patients,
        pagination,
        loading,
        error,
        setPage,
        setSearch: handleSearch,
        refresh: fetchPatients,
    };
}

// ═══════════════════════════════════════════════════════════════
// 4. useWebSocket — connection lifecycle hook
// ═══════════════════════════════════════════════════════════════

/**
 * Manages WebSocket connection lifecycle tied to auth state.
 * Connect on mount, disconnect on unmount / logout.
 *
 * @param {string} token — Supabase JWT
 * @returns {{ isConnected, connectionInfo }}
 */
export function useWebSocket(token) {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionInfo, setConnectionInfo] = useState(null);

    useEffect(() => {
        if (!token) return;

        socketService.connect(token);

        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);
        const onInfo = (info) => setConnectionInfo(info);

        socketService.on('connect', onConnect);
        socketService.on('disconnect', onDisconnect);
        socketService.on('connected', onInfo);

        return () => {
            socketService.off('connect', onConnect);
            socketService.off('disconnect', onDisconnect);
            socketService.off('connected', onInfo);
            socketService.disconnect();
        };
    }, [token]);

    return { isConnected, connectionInfo };
}

// ═══════════════════════════════════════════════════════════════
// 5. useEscalationAlerts — real-time escalation listener
// ═══════════════════════════════════════════════════════════════

/**
 * Listens for new escalations and maintains an alert badge count.
 *
 * @returns {{ alerts, badge, clearBadge }}
 */
export function useEscalationAlerts() {
    const [alerts, setAlerts] = useState([]);
    const [badge, setBadge] = useState(0);

    useSocket('new_escalation', (payload) => {
        setAlerts((prev) => [payload.data, ...prev].slice(0, 50));
        setBadge((prev) => prev + 1);
    });

    const clearBadge = useCallback(() => setBadge(0), []);

    return { alerts, badge, clearBadge };
}
