import { useState, useCallback, useMemo } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { apiService, getApiBaseUrl } from '../lib/api';

WebBrowser.maybeCompleteAuthSession();

/**
 * Google OAuth via Supabase.
 *
 * For Expo Go: Uses backend HTTP trampoline because Supabase rejects exp:// URLs.
 * For APK: Uses careco-admin:// direct redirect (no trampoline needed).
 */
export default function useGoogleAuth() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // The deep link the app listens for (exp:// in Expo Go, careco-admin:// in APK)
    const appDeepLink = useMemo(() => {
        const uri = makeRedirectUri({ path: 'auth/callback' });
        console.log('[GoogleAuth] App deep link:', uri);
        return uri;
    }, []);

    // What we tell Supabase to redirect to:
    // - Expo Go (exp://): Supabase rejects this, so use backend HTTP trampoline
    // - APK (careco-admin://): Supabase accepts this, redirect directly
    const supabaseRedirectTo = useMemo(() => {
        if (appDeepLink.startsWith('exp://')) {
            const apiBase = getApiBaseUrl();
            const url = `${apiBase}/auth/google-callback`;
            console.log('[GoogleAuth] Expo Go mode → using trampoline:', url);
            return url;
        }
        console.log('[GoogleAuth] Standalone mode → direct redirect:', appDeepLink);
        return appDeepLink;
    }, [appDeepLink]);

    const signInWithGoogle = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            console.log('[GoogleAuth] Starting sign-in...');
            console.log('[GoogleAuth] redirectTo:', supabaseRedirectTo);

            const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: supabaseRedirectTo,
                    skipBrowserRedirect: true,
                },
            });

            if (oauthError) throw oauthError;
            if (!data?.url) throw new Error('No OAuth URL returned.');

            console.log('[GoogleAuth] Opening browser...');

            // Always watch for the app deep link (exp:// or careco-admin://)
            const result = await WebBrowser.openAuthSessionAsync(data.url, appDeepLink);

            console.log('[GoogleAuth] Browser result:', result.type);

            if (result.type === 'cancel' || result.type === 'dismiss') {
                return null;
            }

            if (result.type !== 'success' || !result.url) {
                throw new Error('Google sign-in was not completed.');
            }

            // Extract tokens from the redirect URL
            const url = result.url;
            let access_token = null;
            let refresh_token = null;

            if (url.includes('#')) {
                const params = new URLSearchParams(url.split('#')[1]);
                access_token = params.get('access_token');
                refresh_token = params.get('refresh_token');
            }

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
            await supabase.auth.setSession({ access_token, refresh_token });

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
    }, [supabaseRedirectTo, appDeepLink]);

    return { signInWithGoogle, loading, error };
}
