/**
 * NetworkContext.jsx — §11 FIX
 *
 * Provides offline detection and an offline banner throughout the app.
 * Uses @react-native-community/netinfo.
 */

import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff, Wifi } from 'lucide-react-native';

const NetworkContext = createContext({ isOnline: true, isInternetReachable: true });

export function NetworkProvider({ children }) {
    const [isOnline, setIsOnline] = useState(true);
    const [isInternetReachable, setIsInternetReachable] = useState(true);
    const [showBanner, setShowBanner] = useState(false);
    const [bannerMessage, setBannerMessage] = useState('');
    const [bannerType, setBannerType] = useState('offline'); // 'offline' | 'online'

    const slideAnim = useRef(new Animated.Value(-60)).current;
    const bannerTimeout = useRef(null);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state) => {
            const online = state.isConnected ?? true;
            const reachable = state.isInternetReachable ?? true;

            setIsOnline(online);
            setIsInternetReachable(reachable);

            if (!online || !reachable) {
                setBannerType('offline');
                setBannerMessage('No internet connection');
                setShowBanner(true);
                Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
                // Clear any Auto-dismiss timer
                if (bannerTimeout.current) clearTimeout(bannerTimeout.current);
            } else if (showBanner || bannerType === 'offline') {
                // Came back online
                setBannerType('online');
                setBannerMessage('Back online');
                Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
                // Auto-dismiss after 3s
                if (bannerTimeout.current) clearTimeout(bannerTimeout.current);
                bannerTimeout.current = setTimeout(() => {
                    Animated.timing(slideAnim, { toValue: -60, duration: 300, useNativeDriver: true }).start(() => {
                        setShowBanner(false);
                    });
                }, 3000);
            }
        });

        return () => {
            unsubscribe();
            if (bannerTimeout.current) clearTimeout(bannerTimeout.current);
        };
    }, []);

    return (
        <NetworkContext.Provider value={{ isOnline, isInternetReachable }}>
            {children}
            {/* Offline / Online Banner */}
            {(showBanner || !isOnline) && (
                <Animated.View
                    style={[
                        styles.banner,
                        bannerType === 'offline' ? styles.bannerOffline : styles.bannerOnline,
                        { transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {bannerType === 'offline' ? (
                        <WifiOff size={16} color="#FFFFFF" />
                    ) : (
                        <Wifi size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.bannerText}>{bannerMessage}</Text>
                </Animated.View>
            )}
        </NetworkContext.Provider>
    );
}

export const useNetwork = () => useContext(NetworkContext);

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingTop: 10,
        zIndex: 9999,
    },
    bannerOffline: {
        backgroundColor: '#DC2626',
    },
    bannerOnline: {
        backgroundColor: '#22C55E',
    },
    bannerText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
});
