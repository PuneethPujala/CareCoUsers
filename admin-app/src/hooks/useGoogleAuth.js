import { useState, useCallback } from 'react';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../lib/supabase';
import { apiService } from '../lib/api';

// Configure Google Sign-In on module load (same as Users App)
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '374987128995-d9rf99m6fn844nvhiij8tpu5haml9rau.apps.googleusercontent.com';
console.log('[GoogleAuth] Configuring with webClientId:', WEB_CLIENT_ID?.substring(0, 20) + '...');

GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: true,
    scopes: ['email', 'profile'],
});

/**
 * Google Auth using Native Google Sign-In SDK.
 * Identical approach to the Users App (no browser redirects needed).
 *
 * Flow:
 * 1. GoogleSignin.signIn() opens native Google dialog → returns ID token
 * 2. supabase.auth.signInWithIdToken() creates Supabase session
 * 3. apiService.auth.googleLogin() validates with backend (role check, first-login check)
 */
export default function useGoogleAuth() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const signInWithGoogle = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            console.log('[GoogleAuth] Starting native Google sign-in...');

            // Step 1: Check Play Services
            await GoogleSignin.hasPlayServices();

            // Clear any stale Google session
            try { await GoogleSignin.signOut(); } catch {}

            // Step 2: Open native Google sign-in dialog
            const signInResult = await GoogleSignin.signIn();
            console.log('[GoogleAuth] signIn result type:', signInResult?.type);
            console.log('[GoogleAuth] signIn result keys:', JSON.stringify(Object.keys(signInResult || {})));

            // v16+ returns { type: 'success', data: { idToken, user } }
            // v12+ returns { idToken, user, ... }
            // v10  returns { idToken, user, ... }
            const idToken = signInResult?.data?.idToken 
                || signInResult?.idToken 
                || signInResult?.data?.serverAuthCode
                || null;

            if (!idToken) {
                console.error('[GoogleAuth] Full result:', JSON.stringify(signInResult));
                throw new Error('Failed to get Google ID token. Please try again.');
            }

            console.log('[GoogleAuth] ID token received, signing into Supabase...');

            // Step 3: Sign into Supabase with the Google ID token (NO redirect needed!)
            const { data, error: supaError } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: idToken,
            });

            if (supaError) throw supaError;

            const access_token = data.session?.access_token;
            const refresh_token = data.session?.refresh_token;

            if (!access_token) {
                throw new Error('No access token received from Supabase.');
            }

            console.log('[GoogleAuth] Supabase session set, validating with backend...');

            // Step 4: Validate with our backend (first-login check, role check, etc.)
            const backendRes = await apiService.auth.googleLogin({
                access_token,
                refresh_token,
            });

            console.log('[GoogleAuth] ✅ Login successful!');
            return backendRes.data;

        } catch (err) {
            // Clean up Google session on error
            try { await GoogleSignin.signOut(); } catch {}

            // Handle specific Google Sign-In errors
            if (err?.code === statusCodes.SIGN_IN_CANCELLED) {
                setLoading(false);
                return null; // User cancelled, not an error
            }
            if (err?.code === statusCodes.IN_PROGRESS) {
                setError('Sign-in already in progress.');
                setLoading(false);
                return null;
            }
            if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                setError('Google Play Services not available. Please update.');
                setLoading(false);
                throw new Error('Google Play Services not available.');
            }

            // Backend or Supabase errors
            const msg = err?.response?.data?.error || err?.message || 'Google sign-in failed.';
            console.error('[GoogleAuth] ❌ Error:', msg);
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    return { signInWithGoogle, loading, error };
}
