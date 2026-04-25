/**
 * useIdleTimeout.js — SEC-FIX-15 (Soft Lock)
 *
 * Shows a gentle "Welcome back" lock overlay after inactivity
 * instead of logging out. Elderly-friendly — no data loss, no re-login.
 * Resets on any app state change or manual unlock.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState } from 'react-native';

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export default function useIdleTimeout(onIdle, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const [isLocked, setIsLocked] = useState(false);
    const timerRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);
    const backgroundedAtRef = useRef(null);

    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            console.log('[IdleTimeout] Soft-locking after inactivity');
            setIsLocked(true);
        }, timeoutMs);
    }, [timeoutMs]);

    const unlock = useCallback(() => {
        setIsLocked(false);
        resetTimer();
    }, [resetTimer]);

    useEffect(() => {
        resetTimer();

        const sub = AppState.addEventListener('change', (nextState) => {
            if (appStateRef.current.match(/active/) && nextState.match(/inactive|background/)) {
                // Going to background — record timestamp
                backgroundedAtRef.current = Date.now();
            }

            if (nextState === 'active' && backgroundedAtRef.current) {
                // Returning to foreground — check how long we were away
                const elapsed = Date.now() - backgroundedAtRef.current;
                backgroundedAtRef.current = null;

                if (elapsed >= timeoutMs) {
                    console.log('[IdleTimeout] Soft-locking after background inactivity');
                    setIsLocked(true);
                    return;
                }
                resetTimer();
            }

            appStateRef.current = nextState;
        });

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            sub.remove();
        };
    }, [resetTimer, timeoutMs]);

    return { isLocked, unlock, resetTimer };
}
