/**
 * AuthContext.jsx — Production-ready auth context
 *
 * Fixes applied in this revision:
 *
 * A1. skipFetchCountRef left at 1 after login.
 *     FIX: replaced with skipNextSignedInRef one-shot boolean.
 *
 * A2. fetchPatientData concurrent race condition.
 *     FIX: patientFetchPromiseRef deduplicates concurrent getMe() calls.
 *
 * A3. completeSignUp no-op is fragile.
 *     FIX: completeSignUp explicitly calls fetchPatientData() as backstop.
 *
 * A4. recoverySessionAt set but never consumed.
 *     FIX: navigate('ResetPassword') called imperatively on PASSWORD_RECOVERY.
 *
 * A5 (THIS REVISION — CRITICAL): init() try/catch structural mismatch.
 *     The inner try/catch inside if(apiTok?.access_token) consumed the brace
 *     that was meant to close the outer try. The outer else block and the final
 *     catch(error) were left dangling with no matching outer try — a SyntaxError
 *     that prevented the entire module from loading. The app would crash
 *     immediately on launch with "Cannot find module" or an unhandled parse error.
 *     FIX: flattened to a single try/catch wrapping the entire if/else block.
 *
 * A6 (THIS REVISION): console.log/warn/error calls in init() fired in every
 *     production build. Gated behind __DEV__ so Metro strips them from release.
 *
 * Prior fixes (§2, §3, §8, §15) preserved unchanged.
 */

import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { supabase, auth } from '../lib/supabase';
import { apiService, saveApiTokens, clearApiTokens, getApiTokens } from '../lib/api';
import { setCacheUserId, clearUserCache } from '../lib/CacheService';
import analytics from '../utils/analytics';
import * as WebBrowser from 'expo-web-browser';
import usePatientStore from '../store/usePatientStore';
import WidgetBridge from '../lib/WidgetBridge';
import { navigate } from '../lib/navigationRef';
import { normaliseStatus, resolveOnboardingStep } from '../utils/authUtils';

const AuthContext = createContext(null);

const ONBOARDING_STORAGE_KEY = 'CareMyMed_onboarding_progress';
const PROFILE_SECURE_KEY = 'CareMyMed_user_profile';

// ─── Profile SecureStore helpers ──────────────────────────────────────────────

async function cacheProfile(profileData) {
    try {
        await SecureStore.setItemAsync(PROFILE_SECURE_KEY, JSON.stringify(profileData));
    } catch { }
}

async function getCachedProfile() {
    try {
        const raw = await SecureStore.getItemAsync(PROFILE_SECURE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function clearCachedProfile() {
    try {
        await SecureStore.deleteItemAsync(PROFILE_SECURE_KEY);
    } catch { }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [recoverySessionAt, setRecoverySessionAt] = useState(null);

    // A1 FIX: one-shot skip flag for the SIGNED_IN event that fires immediately
    // after a programmatic login — avoids a redundant getMe() call.
    const skipNextSignedInRef = useRef(false);
    // A2 FIX: in-flight deduplication so concurrent callers share one getMe().
    const patientFetchPromiseRef = useRef(null);

    const profileRef = useRef(profile);
    useEffect(() => { profileRef.current = profile; }, [profile]);

    useEffect(() => { WebBrowser.maybeCompleteAuthSession(); }, []);

    const setProfileAndCache = useCallback(async (profileData) => {
        setProfile(profileData);
        profileRef.current = profileData;
        if (profileData) {
            await cacheProfile(profileData);
            setCacheUserId(profileData.id || profileData._id || null);
        }
    }, []);

    // A2 FIX: deduplicate concurrent fetchPatientData calls.
    const fetchPatientData = useCallback(async () => {
        if (patientFetchPromiseRef.current) {
            return patientFetchPromiseRef.current;
        }
        const promise = apiService.patients.getMe()
            .then(res => {
                const p = res.data?.patient;
                if (p) {
                    setPatient(p);
                    usePatientStore.getState().setPatient(p);
                }
                return p || null;
            })
            .catch(err => {
                if (__DEV__) console.warn('[Auth] fetchPatientData failed:', err.message);
                return null;
            })
            .finally(() => {
                patientFetchPromiseRef.current = null;
            });
        patientFetchPromiseRef.current = promise;
        return promise;
    }, []);

    const signOut = useCallback(async () => {
        try {
            try { await auth.signOut(); } catch { }
            try { await GoogleSignin.signOut(); } catch { }
        } finally {
            await clearCachedProfile();
            await clearUserCache();
            await clearApiTokens();
            try { await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch { }

            setCacheUserId(null);
            setUser(null);
            setSession(null);
            setProfile(null);
            setPatient(null);
            usePatientStore.getState().setPatient(null);
            WidgetBridge.clearWidget();
            setRecoverySessionAt(null);
            profileRef.current = null;
            skipNextSignedInRef.current = false;
            analytics.reset();
        }
    }, []);

    // ── Initialization ────────────────────────────────────────────────────────

    useEffect(() => {
        const init = async () => {
            if (__DEV__) console.log('[Auth] Starting init...');

            // Fail-safe: force bootstrapping=false after 6s if init hangs
            // (e.g. a network call that never resolves on a dead connection).
            const timeoutId = setTimeout(() => {
                if (__DEV__) console.warn('[Auth] Init timeout — forcing bootstrapping false');
                setIsBootstrapping(false);
            }, 6000);

            // A5 FIX: The original code nested a try/catch inside the if(apiTok) branch.
            // That inner catch's closing brace consumed the outer try's brace, leaving
            // the else block and the final catch(error) with no matching outer try —
            // a SyntaxError on parse that crashed the module before a single line ran.
            // Fixed by wrapping the entire if/else in one flat try/catch.
            try {
                const apiTok = await getApiTokens();
                if (__DEV__) console.log('[Auth] API token present:', !!apiTok?.access_token);

                if (apiTok?.access_token) {
                    if (__DEV__) console.log('[Auth] Fetching profile + patient...');

                    const [profileRes] = await Promise.all([
                        apiService.auth.getProfile().catch(() => ({ data: null })),
                        fetchPatientData(),
                    ]);

                    const profileData = profileRes?.data?.profile;
                    const userData = profileRes?.data?.user;

                    if (__DEV__) console.log('[Auth] Profile:', !!profileData, '| User:', !!userData);

                    if (profileData && userData) {
                        profileData.role = 'patient';
                        setCacheUserId(userData.id);
                        setUser(userData);
                        setSession({ access_token: apiTok.access_token, user: userData });
                        await setProfileAndCache(profileData);
                        analytics.identify(userData.id, { role: 'patient' });
                    } else {
                        // Network responded but returned no profile — serve cache.
                        const cached = await getCachedProfile();
                        if (cached) {
                            cached.role = 'patient';
                            const id = cached.id || cached._id;
                            setCacheUserId(id);
                            setUser({ id, email: cached.email });
                            setSession({ user: { id } });
                            setProfile(cached);
                            profileRef.current = cached;
                        } else {
                            await signOut();
                        }
                    }
                } else {
                    // No custom API token — fall back to Supabase session.
                    if (__DEV__) console.log('[Auth] No API token, checking Supabase session...');
                    const currentSession = await auth.getCurrentSession().catch(() => null);
                    if (__DEV__) console.log('[Auth] Supabase session:', !!currentSession?.user);

                    if (currentSession?.user) {
                        setCacheUserId(currentSession.user.id);
                        setUser(currentSession.user);
                        setSession(currentSession);

                        const [profileRes] = await Promise.all([
                            apiService.auth.getProfile().catch(() => ({ data: null })),
                            fetchPatientData(),
                        ]);
                        const profileData = profileRes?.data?.profile;
                        if (profileData) {
                            profileData.role = 'patient';
                            await setProfileAndCache(profileData);
                        }
                        analytics.identify(currentSession.user.id, { role: 'patient' });
                    }
                    // No session at all → user stays on the auth stack (initial state).
                }
            } catch (error) {
                if (__DEV__) console.error('[Auth] Init error:', error.message);

                // Hard sign-out on invalid/expired token.
                if (error.response?.status === 401 || error.response?.status === 403) {
                    await signOut();
                } else {
                    // Offline or transient — serve cached profile so the user isn't
                    // force-logged-out just because they launched with no network.
                    const cached = await getCachedProfile();
                    if (cached) {
                        cached.role = 'patient';
                        const id = cached.id || cached._id;
                        setCacheUserId(id);
                        setUser({ id, email: cached.email });
                        setSession({ user: { id } });
                        setProfile(cached);
                        profileRef.current = cached;
                    }
                }
            } finally {
                clearTimeout(timeoutId);
                if (__DEV__) console.log('[Auth] Init complete');
                setIsBootstrapping(false);
            }
        };

        init();
    }, [signOut, setProfileAndCache, fetchPatientData]);

    // ── Auth state listener ───────────────────────────────────────────────────

    useEffect(() => {
        const { data: { subscription } } = auth.onAuthStateChange(async (event, newSession) => {
            if (newSession?.user) {
                setCacheUserId(newSession.user.id);
            }

            if (event === 'SIGNED_OUT') {
                // Only clear React state if there's no custom API token keeping
                // the user logged in via the dual-auth architecture.
                const apiTok = await getApiTokens();
                if (!apiTok) {
                    setUser(null);
                    setSession(null);
                    setProfile(null);
                    setPatient(null);
                    usePatientStore.getState().setPatient(null);
                    profileRef.current = null;
                }
                return;
            }

            if (event === 'TOKEN_REFRESHED') {
                if (newSession?.user) {
                    setUser(newSession.user);
                    setSession(newSession);
                    analytics.tokenRefreshed?.(newSession.user.id);
                }
                return;
            }

            if (event === 'USER_UPDATED') {
                if (newSession?.user) {
                    setUser(newSession.user);
                    setSession(newSession);
                    try {
                        const response = await apiService.auth.getProfile().catch(() => ({ data: null }));
                        const pd = response?.data?.profile;
                        if (pd) {
                            pd.role = 'patient';
                            await setProfileAndCache(pd);
                        }
                    } catch { }
                }
                return;
            }

            if (event === 'PASSWORD_RECOVERY') {
                if (newSession?.user) {
                    setSession(newSession);
                    setRecoverySessionAt(Date.now());
                    // A4 FIX: navigate immediately so the user lands on the reset screen.
                    navigate('ResetPassword');
                }
                return;
            }

            // SIGNED_IN
            if (newSession?.user) {
                // A1 FIX: skip the SIGNED_IN that fires right after a programmatic
                // login — we already have fresh profile/patient data from that flow.
                if (skipNextSignedInRef.current) {
                    skipNextSignedInRef.current = false;
                    setSession(newSession);
                    setIsBootstrapping(false);
                    return;
                }

                setUser(newSession.user);
                setSession(newSession);

                try {
                    if (!profileRef.current) {
                        const response = await apiService.auth.getProfile();
                        const profileData = response.data.profile || null;
                        if (profileData) {
                            profileData.role = 'patient';
                            await setProfileAndCache(profileData);
                        }
                        await fetchPatientData();
                    }
                } catch { } finally {
                    setIsBootstrapping(false);
                }
            }
        });

        return () => subscription.unsubscribe();
    }, [signOut, setProfileAndCache, fetchPatientData]);

    // ── Auth actions ──────────────────────────────────────────────────────────

    const signIn = useCallback(async (email, password, role) => {
        setLoading(true);
        try {
            const response = await apiService.auth.login({ email, password, role });
            if (response.data.requireMfa) {
                setLoading(false);
                return response.data;
            }
            const { session: loginSession, profile: profileData } = response.data;
            if (profileData) profileData.role = 'patient';
            await setProfileAndCache(profileData);
            await saveApiTokens({
                access_token: loginSession.access_token,
                refresh_token: loginSession.refresh_token,
                expires_at: loginSession.expires_at,
            });
            await fetchPatientData();
            skipNextSignedInRef.current = true; // A1 FIX
            setUser(loginSession.user);
            setSession(loginSession);
            analytics.identify(loginSession.user.id, { role: 'patient' });
            return response.data;
        } catch (error) {
            throw error;
        } finally {
            setLoading(false);
        }
    }, [setProfileAndCache, fetchPatientData]);

    const completeMfaLogin = useCallback(async (mfaSession, profileData) => {
        try {
            if (profileData) profileData.role = 'patient';
            await setProfileAndCache(profileData);
            await saveApiTokens({
                access_token: mfaSession.access_token,
                refresh_token: mfaSession.refresh_token,
                expires_at: mfaSession.expires_at,
            });
            await fetchPatientData();
            skipNextSignedInRef.current = true; // A1 FIX
            setUser(mfaSession.user);
            setSession(mfaSession);
            analytics.identify(mfaSession.user.id, { role: 'patient', mfa: true });
        } catch (error) {
            throw error;
        }
    }, [setProfileAndCache, fetchPatientData]);

    const signUp = useCallback(async (email, password, fullName, role, additionalData = {}) => {
        setLoading(true);
        try {
            await apiService.auth.register({ email, password, fullName, role, ...additionalData });
            const loginRes = await apiService.auth.login({ email, password, role });
            const { session: signUpSession, profile: profileData } = loginRes.data;
            if (profileData) profileData.role = 'patient';
            await setProfileAndCache(profileData);
            await saveApiTokens({
                access_token: signUpSession.access_token,
                refresh_token: signUpSession.refresh_token,
                expires_at: signUpSession.expires_at,
            });
            await fetchPatientData();
            skipNextSignedInRef.current = true; // A1 FIX
            setUser(signUpSession.user);
            setSession(signUpSession);
            analytics.identify(signUpSession.user.id, { role: profileData?.role || role });
            return { user: signUpSession.user, session: signUpSession, needsEmailVerification: false };
        } catch (error) {
            throw error;
        } finally {
            setLoading(false);
        }
    }, [setProfileAndCache, fetchPatientData]);

    const signInWithGoogle = useCallback(async (idToken) => {
        setLoading(true);
        try {
            skipNextSignedInRef.current = true; // A1 FIX
            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: idToken,
            });
            if (error) throw error;
            setSession(data.session);
            return { isNewUser: true, user: data.user, session: data.session };
        } catch (error) {
            throw new Error(error?.message || 'Google sign-in failed');
        } finally {
            setLoading(false);
        }
    }, []);

    const resetPassword = useCallback(async (email) => {
        await apiService.auth.resetPassword(email);
    }, []);

    const injectSession = useCallback(async (newSession, newProfile) => {
        if (newProfile) newProfile.role = 'patient';
        await setProfileAndCache(newProfile);
        await saveApiTokens({
            access_token: newSession.access_token,
            refresh_token: newSession.refresh_token,
            expires_at: newSession.expires_at,
        });
        await fetchPatientData();
        skipNextSignedInRef.current = true; // A1 FIX
        setUser(newSession.user);
        setSession(newSession);
    }, [setProfileAndCache, fetchPatientData]);

    // A3 FIX: was a no-op () => {}. Now re-fetches patient so the onboarding
    // resolver has fresh data even if an earlier refreshPatient() failed silently.
    const completeSignUp = useCallback(async () => {
        await fetchPatientData();
    }, [fetchPatientData]);

    const sendOtp = useCallback(async (field, value) => {
        const res = await apiService.auth.sendOtp(value, field);
        return res.data || true;
    }, []);

    const verifyOtp = useCallback(async (field, value, token) => {
        const res = await apiService.auth.verifyOtp(value, token, field);
        return res.data;
    }, []);

    // ── Derived state ─────────────────────────────────────────────────────────

    const onboardingStep = resolveOnboardingStep(patient, profile);
    const onboardingComplete = onboardingStep === null;
    const subscriptionStatus = normaliseStatus(patient?.subscription?.status);
    const displayName = profile?.fullName || user?.user_metadata?.full_name || 'User';
    const userRole = profile?.role;

    const value = {
        user, session, profile, patient, loading,
        isBootstrapping, onboardingComplete, subscriptionStatus, recoverySessionAt,
        displayName, userRole, userEmail: user?.email,
        signIn, signUp, signOut, resetPassword, signInWithGoogle,
        completeSignUp, injectSession, completeMfaLogin,
        sendOtp, verifyOtp, refreshPatient: fetchPatientData,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};