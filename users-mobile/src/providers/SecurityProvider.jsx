/**
 * SecurityProvider.jsx — Centralized Device Security Layer
 *
 * Handles root/jailbreak detection and screenshot prevention.
 * Wraps the entire app to enforce security policies on startup.
 *
 * Audit items: 10.1 (root detection), 9.8 (FLAG_SECURE)
 */

import React, { useEffect, useState } from 'react';
import { Alert, Platform, View, Text, StyleSheet, BackHandler } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import * as ScreenCapture from 'expo-screen-capture';

let JailMonkey = null;
let EncryptedStorage = null;

// Safe dynamic imports — these require native modules
try {
    JailMonkey = require('jail-monkey').default;
} catch (e) {
    console.warn('[Security] jail-monkey not available:', e.message);
}

try {
    EncryptedStorage = require('react-native-encrypted-storage').default;
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
        try {
            // Enforce screenshot prevention (Audit 9.8 - FLAG_SECURE)
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
            const isDebugMode = __DEV__;

            if (isRooted && !isDebugMode) {
                // Check if the user previously dismissed this warning
                let dismissed = false;
                try {
                    if (EncryptedStorage) {
                        const val = await EncryptedStorage.getItem(SECURITY_DISMISSED_KEY);
                        dismissed = val === 'true';
                    }
                } catch {}

                if (!dismissed) {
                    Alert.alert(
                        '⚠️ Security Warning',
                        'This device appears to be rooted/jailbroken. ' +
                        'For the safety of your health data, some features may be restricted.\n\n' +
                        'We strongly recommend using a non-modified device.',
                        [
                            {
                                text: 'Exit App',
                                style: 'destructive',
                                onPress: () => BackHandler.exitApp(),
                            },
                            {
                                text: 'Continue Anyway',
                                style: 'cancel',
                                onPress: async () => {
                                    try {
                                        if (EncryptedStorage) {
                                            await EncryptedStorage.setItem(SECURITY_DISMISSED_KEY, 'true');
                                        }
                                    } catch {}
                                    setSecurityChecked(true);
                                },
                            },
                        ],
                        { cancelable: false }
                    );
                    return; // Wait for user response
                }
            }

            // Log device info (non-PII) for security audit trail
            if (isRooted) {
                console.warn('[Security] Running on rooted/jailbroken device');
            }
        } catch (err) {
            console.warn('[Security] Device check failed:', err.message);
        }

        setSecurityChecked(true);
    }

    // Show loading while security check runs
    if (!securityChecked) {
        return (
            <View style={styles.container}>
                <ShieldAlert color="#F59E0B" size={48} />
                <Text style={styles.text}>Performing security checks...</Text>
            </View>
        );
    }

    if (securityBlocked) {
        return (
            <View style={styles.container}>
                <ShieldAlert color="#EF4444" size={64} />
                <Text style={styles.title}>Security Alert</Text>
                <Text style={styles.text}>
                    This device does not meet security requirements.
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
