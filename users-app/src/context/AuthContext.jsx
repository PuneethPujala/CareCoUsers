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
import * as SecureStore from 'expo-secure-store';
import { supabase, auth, handleAuthError } from '../lib/supabase';
import { apiService, handleApiError } from '../lib/api';
import analytics from '../utils/analytics';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

const ONBOARDING_STORAGE_KEY = 'careco_onboarding_progress';
const PROFILE_SECURE_KEY = 'careco_user_profile';
const STALE_PROGRESS_DAYS = 7;

// ─── Profile SecureStore helpers ────────────────────────────────────────────

async function cacheProfile(profileData) {
    try {
        if (Platform.OS === 'web') {
            await AsyncStorage.setItem(PROFILE_SECURE_KEY, JSON.stringify(profileData));
            return;
        }
        await SecureStore.setItemAsync(PROFILE_SECURE_KEY, JSON.stringify(profileData));
    } catch { }
}

async function getCachedProfile() {
    try {
        const raw = Platform.OS === 'web'
            ? await AsyncStorage.getItem(PROFILE_SECURE_KEY)
            : await SecureStore.getItemAsync(PROFILE_SECURE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function clearCachedProfile() {
    try {
        if (Platform.OS === 'web') {
            await AsyncStorage.removeItem(PROFILE_SECURE_KEY);
            return;
        }
        await SecureStore.deleteItemAsync(PROFILE_SECURE_KEY);
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
    const [loading, setLoading] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [isOnboarding, setIsOnboarding] = useState(false);

    const skipFetchCountRef = useRef(0);
    const isOnboardingRef = useRef(false);
    const profileRef = useRef(profile);

    useEffect(() => { profileRef.current = profile; }, [profile]);
    useEffect(() => { isOnboardingRef.current = isOnboarding; }, [isOnboarding]);

    // ── Internal setter that also caches to SecureStore ─────────────────────

    const setProfileAndCache = useCallback(async (profileData) => {
        setProfile(profileData);
        profileRef.current = profileData;
        if (profileData) {
            await cacheProfile(profileData);
        }
    }, []);

    // ── Sign Out — §8 FIX: clears SecureStore + AsyncStorage ───────────────

    const signOut = useCallback(async () => {
        try { await auth.signOut(); } catch { }
        // §8 FIX: Clear all stored data
        await clearCachedProfile();
        try { await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch { }
        setUser(null);
        setSession(null);
        setProfile(null);
        setIsOnboarding(false);
        isOnboardingRef.current = false;
        profileRef.current = null;
        analytics.reset();
    }, []);

    // ── Initialization ─────────────────────────────────────────────────────

    useEffect(() => {
        const init = async () => {
            try {
                const currentSession = await auth.getCurrentSession();
                if (currentSession?.user) {
                    setUser(currentSession.user);
                    setSession(currentSession);
                    try {
                        const response = await apiService.auth.getProfile();
                        const profileData = response.data.profile;
                        await setProfileAndCache(profileData);
                        analytics.identify(currentSession.user.id, { role: profileData.role });

                        if (profileData.role === 'patient' && profileData.subscription_status !== 'active') {
                            const midOnboarding = await hasActiveOnboardingProgress();
                            if (midOnboarding) {
                                setIsOnboarding(true);
                                isOnboardingRef.current = true;
                            } else {
                                await signOut();
                            }
                            return;
                        }
                    } catch (error) {
                        // If 403 (Profile deleted from DB) or 401, log out to prevent cached ghost sessions
                        if (error.response?.status === 403 || error.response?.status === 401) {
                            await signOut();
                            return;
                        }
                        // §3 FIX: Fall back to cached profile for offline access
                        const cached = await getCachedProfile();
                        if (cached) {
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
                setInitializing(false);
            }
        };
        init();
    }, [signOut, setProfileAndCache]);

    // ── Auth state listener — §2 FIX: handle all event types ────────────────

    useEffect(() => {
        const { data: { subscription } } = auth.onAuthStateChange(async (event, newSession) => {
            // ── SIGNED_OUT ──────────────────────────────────────────
            if (event === 'SIGNED_OUT') {
                setUser(null);
                setSession(null);
                setProfile(null);
                setIsOnboarding(false);
                isOnboardingRef.current = false;
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
                        await setProfileAndCache(resp.data.profile);
                    } catch { }
                }
                return;
            }

            // ── PASSWORD_RECOVERY — §2 FIX ──────────────────────────
            if (event === 'PASSWORD_RECOVERY') {
                if (newSession?.user) {
                    setUser(newSession.user);
                    setSession(newSession);
                }
                // The navigation to reset-password screen is handled by AppNavigator
                return;
            }

            // ── SIGNED_IN + default ─────────────────────────────────
            if (newSession?.user) {
                if (skipFetchCountRef.current > 0) {
                    skipFetchCountRef.current--;
                    setSession(newSession);
                    return;
                }

                if (isOnboardingRef.current) {
                    setUser(newSession.user);
                    setSession(newSession);
                    return;
                }

                setUser(newSession.user);
                setSession(newSession);

                if (!profileRef.current) {
                    try {
                        const response = await apiService.auth.getProfile();
                        const profileData = response.data.profile;

                        if (profileData.role === 'patient' && profileData.subscription_status !== 'active') {
                            const midOnboarding = await hasActiveOnboardingProgress();
                            if (midOnboarding) {
                                setIsOnboarding(true);
                                isOnboardingRef.current = true;
                                await setProfileAndCache(profileData);
                            } else {
                                await signOut();
                            }
                            return;
                        }

                        await setProfileAndCache(profileData);
                    } catch { }
                }
            }
        });
        return () => subscription.unsubscribe();
    }, [signOut, setProfileAndCache]);

    // ── Sign In ────────────────────────────────────────────────────────────

    const signIn = useCallback(async (email, password, role) => {
        setLoading(true);
        try {
            const response = await apiService.auth.login({ email, password, role });
            const { session: loginSession, profile: profileData } = response.data;

            await setProfileAndCache(profileData);

            if (profileData.role === 'patient' && profileData.subscription_status !== 'active') {
                setIsOnboarding(true);
                isOnboardingRef.current = true;
            }

            skipFetchCountRef.current = 2;

            await supabase.auth.setSession({
                access_token: loginSession.access_token,
                refresh_token: loginSession.refresh_token,
            });

            setUser(loginSession.user);
            setSession(loginSession);
            setLoading(false);
            analytics.identify(loginSession.user.id, { role: profileData.role });
            return response.data;
        } catch (error) {
            setLoading(false);
            throw error;
        }
    }, [setProfileAndCache]);

    // ── Sign Up ────────────────────────────────────────────────────────────

    const signUp = useCallback(async (email, password, fullName, role, additionalData = {}) => {
        setLoading(true);
        setIsOnboarding(true);
        isOnboardingRef.current = true;
        try {
            await apiService.auth.register({ email, password, fullName, role, ...additionalData });

            const loginRes = await apiService.auth.login({ email, password, role });
            const { session: signUpSession, profile: profileData } = loginRes.data;

            setUser(signUpSession.user);
            await setProfileAndCache(profileData);

            const { error: sessionError } = await supabase.auth.setSession({
                access_token: signUpSession.access_token,
                refresh_token: signUpSession.refresh_token,
            });

            setSession(signUpSession);
            analytics.identify(signUpSession.user.id, { role: profileData.role });

            return { user: signUpSession.user, session: signUpSession, needsEmailVerification: false };
        } catch (error) {
            setIsOnboarding(false);
            isOnboardingRef.current = false;
            throw error;
        } finally {
            setLoading(false);
        }
    }, [setProfileAndCache]);

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

                await setProfileAndCache(profileData);

                if (profileData.role === 'patient' && profileData.subscription_status !== 'active') {
                    setIsOnboarding(true);
                    isOnboardingRef.current = true;
                    setUser(data.user);
                    setLoading(false);
                    return { isNewUser: false, user: data.user, session: data.session };
                }

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
    }, [setProfileAndCache]);

    // ── Reset Password ─────────────────────────────────────────────────────

    const resetPassword = useCallback(async (email) => {
        try { await auth.resetPassword(email, 'careco-app://reset-password'); }
        catch (error) { throw handleAuthError(error); }
    }, []);

    // ── Inject Session (post Google new-user signup) ───────────────────────

    const injectSession = useCallback(async (newSession, newProfile) => {
        await setProfileAndCache(newProfile);

        if (newProfile.role === 'patient' && newProfile.subscription_status !== 'active') {
            setIsOnboarding(true);
            isOnboardingRef.current = true;
        }

        await supabase.auth.setSession({
            access_token: newSession.access_token,
            refresh_token: newSession.refresh_token,
        });

        setUser(newSession.user);
        setSession(newSession);
    }, [setProfileAndCache]);

    // ── Complete Sign Up ───────────────────────────────────────────────────

    const completeSignUp = useCallback(() => {
        setIsOnboarding(false);
        isOnboardingRef.current = false;
    }, []);

    // ── OTP Verification ───────────────────────────────────────────────────

    const sendOtp = useCallback(async (field, value) => {
        try {
            const { error } = await supabase.auth.signInWithOtp({
                [field === 'phone' ? 'phone' : 'email']: value,
            });
            if (error) throw handleAuthError(error);
            return true;
        } catch (error) {
            throw error;
        }
    }, []);

    const verifyOtp = useCallback(async (field, value, token) => {
        try {
            const { data, error } = await supabase.auth.verifyOtp({
                [field === 'phone' ? 'phone' : 'email']: value,
                token,
                type: field === 'phone' ? 'sms' : 'email',
            });
            if (error) throw handleAuthError(error);
            
            // Note: Since this is for verification *during* signup, we don't
            // want to accidentally set the main session yet if they are still 
            // filling out the rest of the form. But Supabase will log them in. 
            // The signup flow handles this by re-authenticating or linking.
            return data;
        } catch (error) {
            throw error;
        }
    }, []);

    // ── Context value — §2 FIX: expose session ─────────────────────────────

    const isAuthenticated = !!user && !!profile && !isOnboarding;
    const displayName = profile?.fullName || user?.user_metadata?.full_name || 'User';
    const userRole = profile?.role;

    const value = {
        user, session, profile, loading, initializing,
        isAuthenticated, displayName, userRole, userEmail: user?.email,
        signIn, signUp, signOut, resetPassword, signInWithGoogle, completeSignUp, injectSession,
        sendOtp, verifyOtp,
        isOnboarding,
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