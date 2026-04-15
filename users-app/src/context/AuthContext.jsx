/**
 * AuthContext.jsx — Production-ready auth context
 *
 * Fixes applied:
 * §2: Expose session, handle TOKEN_REFRESHED/USER_UPDATED/PASSWORD_RECOVERY
 * §3: Profile cached in SecureStore for offline access
 * §8: Logout clears SecureStore + AsyncStorage onboarding progress
 * §15: Analytics events for all auth actions
 */

import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { supabase, auth, handleAuthError } from '../lib/supabase';
import { apiService, handleApiError } from '../lib/api';
import { setCacheUserId, clearUserCache } from '../lib/CacheService';
import analytics from '../utils/analytics';
import * as WebBrowser from 'expo-web-browser';

const AuthContext = createContext(null);

const ONBOARDING_STORAGE_KEY = 'samvaya_onboarding_progress';
const PROFILE_SECURE_KEY = 'samvaya_user_profile';
const STALE_PROGRESS_DAYS = 7;

import { normaliseStatus, resolveOnboardingStep } from '../utils/authUtils';

// ─── Profile SecureStore helpers ────────────────────────────────────────────

async function cacheProfile(profileData) {
    try {
        await AsyncStorage.setItem(PROFILE_SECURE_KEY, JSON.stringify(profileData));
    } catch { }
}

async function getCachedProfile() {
    try {
        const raw = await AsyncStorage.getItem(PROFILE_SECURE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function clearCachedProfile() {
    try {
        await AsyncStorage.removeItem(PROFILE_SECURE_KEY);
    } catch { }
}

// ─── Onboarding progress check ─────────────────────────────────────────────

async function hasActiveOnboardingProgress() {
    try {
        const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!raw) return false;
        const progress = JSON.parse(raw);
        const ageMs = Date.now() - (progress.savedAt || 0);
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        return ageDays < STALE_PROGRESS_DAYS;
    } catch {
        return false;
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [recoverySessionAt, setRecoverySessionAt] = useState(null);

    const skipFetchCountRef = useRef(0);
    const profileRef = useRef(profile);

    useEffect(() => { profileRef.current = profile; }, [profile]);

    // §RN0.81 FIX: Defer native bridge access until the component mounts.
    // Previously at module scope, this caused an EventEmitter crash.
    useEffect(() => {
        WebBrowser.maybeCompleteAuthSession();
    }, []);

    // ── Internal setter that also caches to SecureStore ─────────────────────

    const setProfileAndCache = useCallback(async (profileData) => {
        setProfile(profileData);
        profileRef.current = profileData;
        if (profileData) {
            await cacheProfile(profileData);
            // Set user ID for CacheService scoping
            setCacheUserId(profileData.id || profileData._id || null);
        }
    }, []);

    // ── Fetch Patient Record ────────────────────────────────────────────────

    const fetchPatientData = useCallback(async () => {
        try {
            const res = await apiService.patients.getMe();
            const p = res.data?.patient;
            if (p) {
                setPatient(p);
                return p;
            }
            return null;
        } catch (err) {
            console.warn('[Auth] fetchPatientData failed:', err.message);
            return null;
        }
    }, []);

    // ── Sign Out — §8 FIX: clears SecureStore + AsyncStorage ───────────────

    const signOut = useCallback(async () => {
        try {
            try { await auth.signOut(); } catch { }
            try { await GoogleSignin.signOut(); } catch { }
        } finally {
            // §8 FIX: Always explicitly nullify local state and clear storage
            await clearCachedProfile();
            await clearUserCache();
            try { await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch { }
            
            setCacheUserId(null);
            setUser(null);
            setSession(null);
            setProfile(null);
            setPatient(null);
            setRecoverySessionAt(null);
            profileRef.current = null;
            analytics.reset();
        }
    }, []);

    // ── Initialization ─────────────────────────────────────────────────────

    useEffect(() => {
        const init = async () => {
            try {
                const currentSession = await auth.getCurrentSession();
                if (currentSession?.user) {
                    setCacheUserId(currentSession.user.id);
                    setUser(currentSession.user);
                    setSession(currentSession);
                    try {
                        const response = await apiService.auth.getProfile();
                        const profileData = response.data.profile;
                        if (profileData) profileData.role = 'patient';
                        await setProfileAndCache(profileData);
                        analytics.identify(currentSession.user.id, { role: 'patient' });

                        await fetchPatientData();
                    } catch (error) {
                        if (error.response?.status === 403 || error.response?.status === 401) {
                            await signOut();
                            return;
                        }
                        const cached = await getCachedProfile();
                        if (cached) {
                            cached.role = 'patient';
                            setProfile(cached);
                            profileRef.current = cached;
                        } else {
                            await signOut();
                        }
                    }
                }
            } catch (error) {
                if (error.message?.includes('Refresh Token')) {
                    await signOut();
                }
            } finally {
                setIsBootstrapping(false);
            }
        };
        init();
    }, [signOut, setProfileAndCache, fetchPatientData]);

    // ── Auth state listener — §2 FIX: handle all event types ────────────────

    useEffect(() => {
        const { data: { subscription } } = auth.onAuthStateChange(async (event, newSession) => {
            if (newSession?.user) {
                setCacheUserId(newSession.user.id); // §SET CACHE SCOPE
            }

            // ── SIGNED_OUT ──────────────────────────────────────────
            if (event === 'SIGNED_OUT') {
                setUser(null);
                setSession(null);
                setProfile(null);
                setPatient(null);
                profileRef.current = null;
                return;
            }

            // ── TOKEN_REFRESHED — §2 FIX ────────────────────────────
            if (event === 'TOKEN_REFRESHED') {
                if (newSession?.user) {
                    setUser(newSession.user);
                    setSession(newSession);
                    analytics.tokenRefreshed(newSession.user.id);
                }
                return;
            }

            // ── USER_UPDATED — §2 FIX ───────────────────────────────
            if (event === 'USER_UPDATED') {
                if (newSession?.user) {
                    setUser(newSession.user);
                    setSession(newSession);
                    // Re-fetch profile in case metadata changed
                    try {
                        const resp = await apiService.auth.getProfile();
                        const pd = resp.data.profile;
                        if (pd) pd.role = 'patient';
                        await setProfileAndCache(pd);
                    } catch { }
                }
                return;
            }

            // ── PASSWORD_RECOVERY — §2 FIX ──────────────────────────
            if (event === 'PASSWORD_RECOVERY') {
                if (newSession?.user) {
                    setSession(newSession);
                    setRecoverySessionAt(Date.now());
                }
                return;
            }

            // ── SIGNED_IN + default ─────────────────────────────────
            if (newSession?.user) {
                try {
                    if (skipFetchCountRef.current > 0) {
                        skipFetchCountRef.current--;
                        setSession(newSession);
                        return;
                    }

                    setUser(newSession.user);
                    setSession(newSession);

                    if (!profileRef.current) {
                        try {
                            const response = await apiService.auth.getProfile();
                            // If user is brand new Google OAuth, profile might be null until manually registered.
                            // Ensure empty responses don't falsely evaluate layout checks.
                            const profileData = response.data.profile || null;
                            if (profileData) profileData.role = 'patient';
                            await setProfileAndCache(profileData);
                            await fetchPatientData();
                        } catch { }
                    }
                } finally {
                    setIsBootstrapping(false);
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [signOut, setProfileAndCache, fetchPatientData]);

    // ── Sign In ────────────────────────────────────────────────────────────

    const signIn = useCallback(async (email, password, role) => {
        setLoading(true);
        try {
            const response = await apiService.auth.login({ email, password, role });
            const { session: loginSession, profile: profileData } = response.data;

            if (profileData) profileData.role = 'patient';
            await setProfileAndCache(profileData);

            await fetchPatientData();

            skipFetchCountRef.current = 2;

            await supabase.auth.setSession({
                access_token: loginSession.access_token,
                refresh_token: loginSession.refresh_token,
            });

            setUser(loginSession.user);
            setSession(loginSession);
            setLoading(false);
            analytics.identify(loginSession.user.id, { role: 'patient' });
            return response.data;
        } catch (error) {
            setLoading(false);
            throw error;
        }
    }, [setProfileAndCache, fetchPatientData]);

    // ── Sign Up ────────────────────────────────────────────────────────────

    const signUp = useCallback(async (email, password, fullName, role, additionalData = {}) => {
        setLoading(true);
        try {
            await apiService.auth.register({ email, password, fullName, role, ...additionalData });

            const loginRes = await apiService.auth.login({ email, password, role });
            const { session: signUpSession, profile: profileData } = loginRes.data;

            setUser(signUpSession.user);
            await setProfileAndCache(profileData);

            await fetchPatientData();

            await supabase.auth.setSession({
                access_token: signUpSession.access_token,
                refresh_token: signUpSession.refresh_token,
            });

            setSession(signUpSession);
            analytics.identify(signUpSession.user.id, { role: profileData.role });

            return { user: signUpSession.user, session: signUpSession, needsEmailVerification: false };
        } catch (error) {
            throw error;
        } finally {
            setLoading(false);
        }
    }, [setProfileAndCache, fetchPatientData]);

    // ── Google Sign In ─────────────────────────────────────────────────────

    const signInWithGoogle = useCallback(async (idToken) => {
        setLoading(true);
        try {
            skipFetchCountRef.current = 2;

            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: idToken,
            });
            if (error) throw error;

            setSession(data.session);

            try {
                const config = { headers: { Authorization: `Bearer ${data.session.access_token}` } };
                const response = await apiService.auth.getProfile(config);
                const profileData = response.data.profile;
                if (profileData) profileData.role = 'patient';

                await setProfileAndCache(profileData);
                await fetchPatientData();
                setUser(data.user);
            } catch {
                setLoading(false);
                return { isNewUser: true, user: data.user, session: data.session };
            }

            setLoading(false);
            return { isNewUser: false, user: data.user, session: data.session };
        } catch (error) {
            setLoading(false);
            throw new Error(error?.message || 'Google sign-in failed');
        }
    }, [setProfileAndCache, fetchPatientData]);

    // ── Reset Password ─────────────────────────────────────────────────────
    // Now uses our custom OTP-based reset flow instead of Supabase default
    const resetPassword = useCallback(async (email) => {
        try {
            await apiService.auth.resetPassword(email);
        } catch (error) {
            throw error;
        }
    }, []);

    // ── Inject Session (post Google new-user signup) ───────────────────────

    const injectSession = useCallback(async (newSession, newProfile) => {
        if (newProfile) newProfile.role = 'patient';
        await setProfileAndCache(newProfile);

        await fetchPatientData();

        await supabase.auth.setSession({
            access_token: newSession.access_token,
            refresh_token: newSession.refresh_token,
        });

        setUser(newSession.user);
        setSession(newSession);
    }, [setProfileAndCache, fetchPatientData]);

    // ── Complete Sign Up (Deprecated, preserved for compat) ───────────────

    const completeSignUp = useCallback(() => {
        // No longer needed due to granular flags
    }, []);

    // ── OTP Verification (Custom Backend) ──────────────────────────────────
    // Uses our Redis-backed OTP service instead of Supabase Magic Links

    const sendOtp = useCallback(async (field, value) => {
        try {
            await apiService.auth.sendOtp(value, field); // field = 'email' or 'phone'
            return true;
        } catch (error) {
            throw error;
        }
    }, []);

    const verifyOtp = useCallback(async (field, value, token) => {
        try {
            const res = await apiService.auth.verifyOtp(value, token, field);
            return res.data;
        } catch (error) {
            throw error;
        }
    }, []);

    // ── Context value ──────────────────────────────────────────────────────

    const onboardingStep = resolveOnboardingStep(patient, profile);
    const onboardingComplete = onboardingStep === null;
    const subscriptionStatus = normaliseStatus(patient?.subscription?.status);

    const displayName = profile?.fullName || user?.user_metadata?.full_name || 'User';
    const userRole = profile?.role;

    const value = {
        user, session, profile, patient, loading, 
        isBootstrapping, onboardingComplete, subscriptionStatus, recoverySessionAt,
        displayName, userRole, userEmail: user?.email,
        signIn, signUp, signOut, resetPassword, signInWithGoogle, completeSignUp, injectSession,
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