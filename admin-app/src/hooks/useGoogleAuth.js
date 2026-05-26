import { useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { apiService } from '../lib/api';

WebBrowser.maybeCompleteAuthSession();

/**
 * Google OAuth via Supabase.
 *
 * IMPORTANT: Google OAuth does NOT work in Expo Go (Google blocks exp:// redirects).
 * This flow only works in standalone APK/IPA builds where the custom scheme
 * (careco-admin://) is natively registered.
 *
 * Flow:
 * 1. Ask Supabase for Google OAuth URL with redirectTo = careco-admin://auth/callback
 * 2. Open browser for Google sign-in
 * 3. After auth, Supabase redirects to careco-admin://auth/callback#access_token=...
 * 4. App catches the deep link, extracts tokens
 * 5. Validate with our backend (first-login check, role check, etc.)
 */
export default function useGoogleAuth() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const signInWithGoogle = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Use the app's native deep link as redirect target
            const redirectUri = Linking.createURL('auth/callback');
            console.log('[GoogleAuth] Redirect URI:', redirectUri);
            console.log('[GoogleAuth] Starting sign-in...');

            // Step 1: Get Google OAuth URL from Supabase
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

            // Step 2: Open browser and wait for redirect back to app
            const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
            console.log('[GoogleAuth] Browser result:', result.type);

            if (result.type === 'cancel' || result.type === 'dismiss') {
                return null;
            }

            if (result.type !== 'success' || !result.url) {
                throw new Error('Google sign-in was not completed.');
            }

            // Step 3: Extract tokens from redirect URL
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

            // Step 4: Set Supabase session
            await supabase.auth.setSession({ access_token, refresh_token });

            // Step 5: Validate with backend (first-login check, role check)
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
    }, []);

    return { signInWithGoogle, loading, error };
}
