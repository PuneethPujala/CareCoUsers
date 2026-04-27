/**
 * SecurityProvider.jsx — Centralized Device Security Layer
 *
 * BUG 15 FIX: securityBlocked was declared but setSecurityBlocked(true) was
 *   never called. The "Security Alert" blocked screen was dead UI that could
 *   never render. Now setSecurityBlocked(true) is called when isRooted and the
 *   user taps "Exit App" (BackHandler.exitApp() doesn't always work on iOS, so
 *   the block screen is the correct fallback there).
 *
 * BUG 16 FIX: The finally block ran even while the Alert was still pending,
 *   so setSecurityChecked(true) fired immediately — the security loading screen
 *   disappeared and the app rendered behind the alert before the user responded.
 *   Fixed by returning early before the finally when showing the alert, and
 *   calling setSecurityChecked(true) explicitly inside each alert button handler.
 */

import React, { useEffect, useState } from 'react';
import { Alert, Platform, View, Text, StyleSheet, BackHandler } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import * as ScreenCapture from 'expo-screen-capture';

let JailMonkey = null;
let EncryptedStorage = null;

try {
    const jm = require('jail-monkey');
    JailMonkey = jm.default || jm;
} catch (e) {
    console.warn('[Security] jail-monkey not available:', e.message);
}

try {
    const es = require('react-native-encrypted-storage');
    EncryptedStorage = es.default || es;
} catch (e) {
    console.warn('[Security] react-native-encrypted-storage not available:', e.message);
}

const SECURITY_DISMISSED_KEY = 'security_root_dismissed';

export default function SecurityProvider({ children }) {
    const [securityBlocked, setSecurityBlocked] = useState(false);
    const [securityChecked, setSecurityChecked] = useState(false);

    useEffect(() => {
        checkDeviceSecurity();
    }, []);

    async function checkDeviceSecurity() {
        // BUG 16 FIX: Track whether we're showing an alert so the finally block
        // doesn't prematurely set securityChecked=true while the user is reading it.
        let showingAlert = false;

        try {
            try {
                await ScreenCapture.preventScreenCaptureAsync();
                console.log('[Security] Screenshot prevention enabled');
            } catch (scErr) {
                console.warn('[Security] Could not enable screenshot prevention:', scErr.message);
            }

            if (!JailMonkey) {
                setSecurityChecked(true);
                return;
            }

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
                    // BUG 16 FIX: Set the flag BEFORE showing the alert so the
                    // finally block knows not to resolve securityChecked here.
                    showingAlert = true;

                    Alert.alert(
                        '⚠️ Security Warning',
                        'This device appears to be rooted/jailbroken. ' +
                        'For the safety of your health data, some features may be restricted.\n\n' +
                        'We strongly recommend using a non-modified device.',
                        [
                            {
                                text: 'Exit App',
                                style: 'destructive',
                                onPress: () => {
                                    // BUG 15 FIX: Block the app on iOS where BackHandler
                                    // doesn't terminate the process. The block screen is
                                    // the correct fallback when the OS won't exit.
                                    BackHandler.exitApp();
                                    setSecurityBlocked(true);  // iOS fallback
                                    setSecurityChecked(true);
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
                                    // BUG 16 FIX: Only mark as checked after user responds.
                                    setSecurityChecked(true);
                                },
                            },
                        ],
                        { cancelable: false }
                    );
                    return; // BUG 16 FIX: Return before finally to prevent premature resolve
                }

                console.warn('[Security] Running on rooted/jailbroken device (previously dismissed)');
            }
        } catch (err) {
            console.warn('[Security] Device check failed:', err.message);
        } finally {
            // BUG 16 FIX: Only resolve here if we didn't hand off to the alert.
            // If showingAlert is true, the alert button handlers call setSecurityChecked.
            if (!showingAlert) {
                setSecurityChecked(true);
            }
        }
    }

    if (!securityChecked) {
        return (
            <View style={styles.container}>
                <ShieldAlert color="#F59E0B" size={48} />
                <Text style={styles.text}>Performing security checks...</Text>
            </View>
        );
    }

    // BUG 15 FIX: This screen can now actually render — setSecurityBlocked(true)
    // is called when the user taps "Exit App" on iOS (where the process doesn't
    // actually terminate). Previously this was dead code.
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