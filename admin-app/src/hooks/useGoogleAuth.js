import { useState, useCallback, useMemo } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { apiService, getApiBaseUrl } from '../lib/api';

// Dismiss any lingering browser sessions
WebBrowser.maybeCompleteAuthSession();

/**
 * Google OAuth via Supabase + backend trampoline.
 *
 * Flow:
 * 1. Supabase generates the Google OAuth URL
 * 2. redirectTo → backend /api/auth/google-callback (plain HTTP, no query params)
 * 3. After Google auth, Supabase redirects to our backend (exact URL match ✅)
 * 4. Backend trampoline page reads tokens from URL hash, redirects to exp:// deep link
 * 5. WebBrowser catches the deep link, returns tokens to the app
 */
export default function useGoogleAuth() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // The deep link URI that the BACKEND trampoline will redirect to
    const appRedirectUri = useMemo(() => {
        const uri = Linking.createURL('auth/callback');
        console.log('[GoogleAuth] App deep link:', uri);
        return uri;
    }, []);

    // The backend trampoline URL (plain HTTP — Supabase accepts this)
    const trampolineUrl = useMemo(() => {
        const apiBase = getApiBaseUrl();
        const url = `${apiBase}/auth/google-callback`;
        console.log('[GoogleAuth] Supabase redirectTo:', url);
        return url;
    }, []);

    const signInWithGoogle = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            console.log('[GoogleAuth] Starting sign-in...');

            // Step 1: Get the Google OAuth URL from Supabase
            // redirectTo is the plain backend URL — NO query params
            const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: trampolineUrl,
                    skipBrowserRedirect: true,
                },
            });

            if (oauthError) throw oauthError;
            if (!data?.url) throw new Error('No OAuth URL returned.');

            console.log('[GoogleAuth] Opening browser...');

            // Step 2: Open the browser
            // Watch for the app deep link (exp://...) — the trampoline page will redirect there
            const result = await WebBrowser.openAuthSessionAsync(data.url, appRedirectUri);

            console.log('[GoogleAuth] Browser result:', result.type);

            if (result.type === 'cancel' || result.type === 'dismiss') {
                return null;
            }

            if (result.type !== 'success' || !result.url) {
                throw new Error('Google sign-in was not completed.');
            }

            // Step 3: Extract tokens from the redirect URL
            const url = result.url;
            let access_token = null;
            let refresh_token = null;

            // Hash fragment: #access_token=xxx&refresh_token=xxx
            if (url.includes('#')) {
                const params = new URLSearchParams(url.split('#')[1]);
                access_token = params.get('access_token');
                refresh_token = params.get('refresh_token');
            }

            // Fallback: query params
            if (!access_token && url.includes('?')) {
                const params = new URLSearchParams(url.split('?')[1]?.split('#')[0]);
                access_token = params.get('access_token');
                refresh_token = params.get('refresh_token');

                const errorDesc = params.get('error_description') || params.get('error');
                if (errorDesc && !access_token) throw new Error(errorDesc);
            }

            if (!access_token) {
                console.error('[GoogleAuth] No token in URL:', url);
                throw new Error('No access token received.');
            }

            console.log('[GoogleAuth] Token received, setting session...');

            // Step 4: Set Supabase session
            await supabase.auth.setSession({ access_token, refresh_token });

            // Step 5: Get MongoDB profile from backend
            const backendRes = await apiService.auth.googleLogin({
                access_token,
                refresh_token,
            });

            console.log('[GoogleAuth] ✅ Login successful!');
            return backendRes.data;

        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || 'Google sign-in failed.';
            console.error('[GoogleAuth] ❌ Error:', msg);
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, [trampolineUrl, appRedirectUri]);

    return { signInWithGoogle, loading, error };
}
