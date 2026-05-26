import { useState, useCallback, useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { supabase } from '../lib/supabase';
import { apiService } from '../lib/api';

// Dismiss any lingering browser sessions
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

/**
 * Google OAuth using direct token exchange (NO Supabase OAuth redirect).
 *
 * Flow:
 * 1. expo-auth-session opens Google sign-in directly
 * 2. Google returns an ID token
 * 3. We pass the ID token to supabase.auth.signInWithIdToken()
 * 4. Then validate with our backend /api/auth/google-login
 *
 * This completely bypasses Supabase's OAuth redirect URL validation,
 * eliminating the "requested path is invalid" error.
 */
export default function useGoogleAuth() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Configure Google Auth Request
    const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
        clientId: GOOGLE_CLIENT_ID,
    });

    // Handle the Google auth response
    useEffect(() => {
        if (response?.type === 'success') {
            const { id_token } = response.params;
            handleGoogleToken(id_token);
        } else if (response?.type === 'error') {
            console.error('[GoogleAuth] ❌ Error:', response.error);
            setError(response.error?.message || 'Google sign-in failed.');
            setLoading(false);
        } else if (response?.type === 'dismiss' || response?.type === 'cancel') {
            setLoading(false);
        }
    }, [response]);

    const handleGoogleToken = async (idToken) => {
        try {
            console.log('[GoogleAuth] ID token received, signing into Supabase...');

            // Sign into Supabase with the Google ID token (no redirect needed!)
            const { data: sessionData, error: signInError } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: idToken,
            });

            if (signInError) throw signInError;

            const access_token = sessionData.session?.access_token;
            const refresh_token = sessionData.session?.refresh_token;

            if (!access_token) {
                throw new Error('No access token received from Supabase.');
            }

            console.log('[GoogleAuth] Supabase session set, validating with backend...');

            // Validate with our backend (first-login check, role check, etc.)
            const backendRes = await apiService.auth.googleLogin({
                access_token,
                refresh_token,
            });

            console.log('[GoogleAuth] ✅ Login successful!');
            setLoading(false);
            return backendRes.data;

        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || 'Google sign-in failed.';
            console.error('[GoogleAuth] ❌ Error:', msg);
            setError(msg);
            setLoading(false);
            throw new Error(msg);
        }
    };

    const signInWithGoogle = useCallback(async () => {
        if (!request) {
            setError('Google sign-in is not ready yet. Please wait a moment.');
            return null;
        }

        setLoading(true);
        setError(null);

        console.log('[GoogleAuth] Starting sign-in...');
        const result = await promptAsync();
        console.log('[GoogleAuth] Prompt result:', result?.type);

        // The actual token handling happens in the useEffect above
        // If dismissed/cancelled, useEffect will set loading to false
        if (result?.type === 'success') {
            const { id_token } = result.params;
            return await handleGoogleToken(id_token);
        }

        return null;
    }, [request, promptAsync]);

    return { signInWithGoogle, loading, error };
}
