/**
 * SecurityProvider.jsx — Centralized Device Security Layer
 *
 * CRITICAL FIX: SecurityProvider previously blocked the entire React tree
 * (including AuthProvider and AppNavigator) while performing async security
 * checks. If any check hung or the AlertManager ref wasn't set yet, the app
 * would stay on the splash screen indefinitely.
 *
 * Fix: children are ALWAYS rendered immediately. Security checks run
 * non-blocking in the background. Only an explicit "Exit App" tap on a
 * rooted device blocks the UI with the security alert screen.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import * as ScreenCapture from 'expo-screen-capture';

import AlertManager from '../utils/AlertManager';

let JailMonkey = null;
let EncryptedStorage = null;

try {
    const jm = require('jail-monkey');
    JailMonkey = jm.default || jm;
} catch (e) {
    if (__DEV__) console.warn('[Security] jail-monkey not available:', e.message);
}

try {
    const es = require('react-native-encrypted-storage');
    EncryptedStorage = es.default || es;
} catch (e) {
    if (__DEV__) console.warn('[Security] react-native-encrypted-storage not available:', e.message);
}

const SECURITY_DISMISSED_KEY = 'security_root_dismissed';

export default function SecurityProvider({ children }) {
    const [securityBlocked, setSecurityBlocked] = useState(false);

    useEffect(() => {
        checkDeviceSecurity();
    }, []);

    async function checkDeviceSecurity() {
        try {
            // Enable screenshot prevention (best-effort, non-blocking)
            try {
                await ScreenCapture.preventScreenCaptureAsync();
                if (__DEV__) console.log('[Security] Screenshot prevention enabled');
            } catch (scErr) {
                if (__DEV__) console.warn('[Security] Could not enable screenshot prevention:', scErr.message);
            }

            if (!JailMonkey) return;

            const isRooted = JailMonkey.isJailBroken();

            if (isRooted && !__DEV__) {
                let dismissed = false;
                try {
                    if (EncryptedStorage) {
                        const val = await EncryptedStorage.getItem(SECURITY_DISMISSED_KEY);
                        dismissed = val === 'true';
                    }
                } catch { }

                if (!dismissed) {
                    // Show a non-blocking security alert. The app tree is already
                    // rendered behind this so AuthProvider + AppNavigator can
                    // mount, bootstrap, and hide the splash screen normally.
                    // We delay briefly to let AlertManager ref be set by AppNavigator.
                    setTimeout(() => {
                        AlertManager.alert(
                            '⚠️ Security Warning',
                            'This device appears to be rooted/jailbroken. ' +
                            'For the safety of your health data, some features may be restricted.\n\n' +
                            'We strongly recommend using a non-modified device.',
                            [
                                {
                                    text: 'Exit App',
                                    style: 'destructive',
                                    onPress: () => {
                                        BackHandler.exitApp();
                                        setSecurityBlocked(true); // iOS fallback
                                    },
                                },
                                {
                                    text: 'Continue Anyway',
                                    style: 'cancel',
                                    onPress: async () => {
                                        try {
                                            if (EncryptedStorage) {
                                                await EncryptedStorage.setItem(SECURITY_DISMISSED_KEY, 'true');
                                            }
                                        } catch { }
                                    },
                                },
                            ],
                            { cancelable: false }
                        );
                    }, 2000); // Delay to ensure AlertManager ref is ready
                    return;
                }

                if (__DEV__) console.warn('[Security] Running on rooted/jailbroken device (previously dismissed)');
            }
        } catch (err) {
            if (__DEV__) console.warn('[Security] Device check failed:', err.message);
        }
    }

    // Only block the entire UI if the user explicitly tapped "Exit App" on iOS
    if (securityBlocked) {
        return (
            <View style={styles.container}>
                <ShieldAlert color="#EF4444" size={64} />
                <Text style={styles.title}>Security Alert</Text>
                <Text style={styles.text}>
                    This device does not meet security requirements.
                    Please use a non-rooted device to protect your health data.
                </Text>
            </View>
        );
    }

    // Always render children immediately — security checks are non-blocking.
    // This ensures AuthProvider and AppNavigator mount instantly,
    // preventing splash screen hangs.
    return children;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '700',
        marginTop: 16,
    },
    text: {
        color: '#94A3B8',
        fontSize: 16,
        marginTop: 12,
        textAlign: 'center',
        lineHeight: 24,
    },
});