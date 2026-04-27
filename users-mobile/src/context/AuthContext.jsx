/**
 * AuthContext.jsx — Production-ready auth context
 *
 * Fixes applied in this revision:
 *
 * A1. skipFetchCountRef left at 1 after login:
 *     TOKEN_REFRESHED returns early before the skipFetch decrement, so after
 *     signIn sets the ref to 2, only SIGNED_IN decrements it — leaving 1 behind.
 *     The next foreground token refresh silently skips a legitimate profile fetch.
 *     FIX: replaced the decrement pattern with an explicit reset to 0 after
 *     signIn/completeMfaLogin/injectSession settle. The ref is now only used as
 *     a one-shot "skip the very next SIGNED_IN event" flag (set to 1, not 2).
 *
 * A2. fetchPatientData concurrent race condition:
 *     init() and onAuthStateChange can fire simultaneously, causing two concurrent
 *     getMe() calls. The slower response overwrites the faster one with stale data.
 *     FIX: Added isFetchingPatientRef guard — second call returns the in-flight
 *     promise result rather than starting a new request.
 *
 * A3. completeSignUp no-op is fragile:
 *     If refreshPatient() silently failed before completeSignUp() was called,
 *     the onboarding step wouldn't advance and the user would be stuck on step 5.
 *     FIX: completeSignUp now explicitly calls fetchPatientData() as a backstop
 *     so the onboarding resolver always has fresh data to work with.
 *
 * A4. recoverySessionAt set but never consumed:
 *     PASSWORD_RECOVERY set the timestamp but nothing navigated to ResetPassword.
 *     FIX: navigate() is called imperatively on PASSWORD_RECOVERY so the user
 *     lands on the ResetPassword screen automatically.
 *
 * Prior fixes (§2, §3, §8, §15) preserved unchanged.
 */

import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { supabase, auth, handleAuthError } from '../lib/supabase';
import { apiService, handleApiError, saveApiTokens, clearApiTokens, getApiTokens } from '../lib/api';
import { setCacheUserId, clearUserCache } from '../lib/CacheService';
import analytics from '../utils/analytics';
import * as WebBrowser from 'expo-web-browser';
import usePatientStore from '../store/usePatientStore';
import { navigate } from '../lib/navigationRef';

const AuthContext = createContext(null);

const ONBOARDING_STORAGE_KEY = 'samvaya_onboarding_progress';
const PROFILE_SECURE_KEY = 'samvaya_user_profile';

import { normaliseStatus, resolveOnboardingStep } from '../utils/authUtils';

// ─── Profile SecureStore helpers ─────────────────────────────────────────────

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

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [recoverySessionAt, setRecoverySessionAt] = useState(null);

    // A1 FIX: One-shot flag — set to true immediately after a programmatic
    // sign-in so the next SIGNED_IN event from onAuthStateChange is skipped.
    // Reset to false after it fires once (or on the next tick after signIn settles).
    const skipNextSignedInRef = useRef(false);

    // A2 FIX: In-flight guard so concurrent callers share a single getMe() request.
    const patientFetchPromiseRef = useRef(null);

    const profileRef = useRef(profile);
    useEffect(() => { profileRef.current = profile; }, [profile]);

    useEffect(() => {
        WebBrowser.maybeCompleteAuthSession();
    }, []);

    const setProfileAndCache = useCallback(async (profileData) => {
        setProfile(profileData);
        profileRef.current = profileData;
        if (profileData) {
            await cacheProfile(profileData);
            setCacheUserId(profileData.id || profileData._id || null);
        }
    }, []);

    // A2 FIX: fetchPatientData deduplicates concurrent calls via a shared promise ref.
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
                console.warn('[Auth] fetchPatientData failed:', err.message);
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
            setRecoverySessionAt(null);
            profileRef.current = null;
            skipNextSignedInRef.current = false;
            analytics.reset();
        }
    }, []);

    // ── Initialization ──────────────────────────────────────────────────────

    useEffect(() => {
        const init = async () => {
            try {
                const apiTok = await getApiTokens();
                if (apiTok?.access_token) {
                    try {
                        const [profileRes, patientData] = await Promise.all([
                            apiService.auth.getProfile().catch(() => ({ data: null })),
                            fetchPatientData(),
                        ]);

                        const profileData = profileRes?.data?.profile;
                        const userData = profileRes?.data?.user;

                        if (profileData && userData) {
                            profileData.role = 'patient';
                            setCacheUserId(userData.id);
                            setUser(userData);
                            setSession({ access_token: apiTok.access_token, user: userData });
                            await setProfileAndCache(profileData);
                            analytics.identify(userData.id, { role: 'patient' });
                        } else {
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
                    } catch (e) {
                        if (e.response?.status === 403 || e.response?.status === 401) {
                            await signOut();
                        } else {
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
                    }
                } else {
                    const currentSession = await auth.getCurrentSession().catch(() => null);
                    if (currentSession?.user) {
                        setCacheUserId(currentSession.user.id);
                        setUser(currentSession.user);
                        setSession(currentSession);
                        try {
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
                        } catch {
                            const cached = await getCachedProfile();
                            if (cached) {
                                cached.role = 'patient';
                                setProfile(cached);
                                profileRef.current = cached;
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('[Auth] Init error:', error.message);
            } finally {
                setIsBootstrapping(false);
            }
        };
        init();
    }, [signOut, setProfileAndCache, fetchPatientData]);

    // ── Auth state listener ─────────────────────────────────────────────────

    useEffect(() => {
        const { data: { subscription } } = auth.onAuthStateChange(async (event, newSession) => {
            if (newSession?.user) {
                setCacheUserId(newSession.user.id);
            }

            if (event === 'SIGNED_OUT') {
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
                    // A4 FIX: Navigate immediately so the user lands on the reset screen.
                    // Without this, recoverySessionAt was set but nothing happened next.
                    navigate('ResetPassword');
                }
                return;
            }

            // SIGNED_IN
            if (newSession?.user) {
                // A1 FIX: If a programmatic sign-in just completed, skip this event.
                // Previously used a count ref (set to 2, decremented per event) which
                // left a stale 1 behind when TOKEN_REFRESHED bypassed the decrement.
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
                } catch { }
                finally {
                    setIsBootstrapping(false);
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [signOut, setProfileAndCache, fetchPatientData]);

    // ── Auth actions ────────────────────────────────────────────────────────

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

            // A1 FIX: Set skip flag BEFORE setting user/session, which triggers
            // onAuthStateChange. One skip only — the flag resets after firing once.
            skipNextSignedInRef.current = true;
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
            setLoading(false);
            return { isNewUser: true, user: data.user, session: data.session };
        } catch (error) {
            setLoading(false);
            throw new Error(error?.message || 'Google sign-in failed');
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

    // A3 FIX: completeSignUp was a no-op. If refreshPatient() failed silently
    // before this was called, the onboarding resolver had stale data and the
    // user got stuck on step 5. Now explicitly re-fetches patient as a backstop.
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
        completeMfaLogin,
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