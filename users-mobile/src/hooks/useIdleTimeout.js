/**
 * useIdleTimeout.js — SEC-FIX-15
 *
 * Auto-logs out the user after a configurable period of inactivity.
 * Tracks user touches via AppState and a timer. Resets on any interaction.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export default function useIdleTimeout(signOut, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const timerRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);
    const backgroundedAtRef = useRef(null);

    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            console.log('[IdleTimeout] Session expired due to inactivity');
            signOut();
        }, timeoutMs);
    }, [signOut, timeoutMs]);

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
                    console.log('[IdleTimeout] Session expired while backgrounded');
                    signOut();
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
    }, [resetTimer, signOut, timeoutMs]);

    // Expose resetTimer so screens can call it on user interaction
    return { resetTimer };
}
