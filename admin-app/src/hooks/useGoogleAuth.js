import { useState, useCallback, useMemo } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../lib/supabase';
import { apiService } from '../lib/api';

// Dismiss any lingering browser sessions
WebBrowser.maybeCompleteAuthSession();

/**
 * Google OAuth via Supabase (clean implementation).
 *
 * Uses expo-auth-session's makeRedirectUri to generate the correct
 * redirect URL for the current environment (Expo Go vs standalone APK).
 *
 * Flow:
 * 1. Generate redirect URI using makeRedirectUri (handles exp:// vs custom scheme)
 * 2. Ask Supabase for a Google OAuth URL with that redirect
 * 3. Open the browser for Google sign-in
 * 4. Browser redirects back to the app with tokens
 * 5. Extract tokens, set Supabase session, then validate with our backend
 */
export default function useGoogleAuth() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Generate the redirect URI using expo-auth-session
    // This automatically handles:
    //   - Expo Go: exp://10.x.x.x:8081/--/auth/callback
    //   - Standalone APK: careco-admin://auth/callback
    const redirectUri = useMemo(() => {
        const uri = makeRedirectUri({
            scheme: 'careco-admin',
            path: 'auth/callback',
        });
        console.log('[GoogleAuth] Redirect URI:', uri);
        return uri;
    }, []);

    const signInWithGoogle = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            console.log('[GoogleAuth] Starting sign-in...');
            console.log('[GoogleAuth] Using redirectTo:', redirectUri);

            // Step 1: Get the Google OAuth URL from Supabase
            const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUri,
                    skipBrowserRedirect: true,
                },
            });

            if (oauthError) throw oauthError;
            if (!data?.url) throw new Error('No OAuth URL returned.');

            console.log('[GoogleAuth] Opening browser...');

            // Step 2: Open the browser for Google sign-in
            // The second argument tells WebBrowser what URL pattern to watch for
            // to know when to close the browser and return to the app
            const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

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
    }, [redirectUri]);

    return { signInWithGoogle, loading, error };
}
