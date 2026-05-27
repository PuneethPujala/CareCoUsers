import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import usePatientStore from '../../store/usePatientStore';
import OfflineSyncService from '../../lib/OfflineSyncService';
import { CloudOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react-native';

export default function GlobalSyncBanner() {
    const { syncState, pendingSyncCount } = usePatientStore();
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-100)).current;

    useEffect(() => {
        if (syncState === 'synced' && pendingSyncCount === 0) {
            // Hide banner
            Animated.timing(translateY, {
                toValue: -100,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            // Show banner
            Animated.timing(translateY, {
                toValue: insets.top || 44, // Just below the status bar
                duration: 400,
                useNativeDriver: true,
            }).start();
        }
    }, [syncState, pendingSyncCount, insets.top]);

    const handlePress = () => {
        if (syncState === 'failed' || syncState === 'offline') {
            OfflineSyncService.flushQueue();
        }
    };

    let bgColor = '#334155';
    let text = 'Syncing...';
    let Icon = RefreshCw;
    let iconColor = '#FFFFFF';

    if (syncState === 'offline') {
        bgColor = '#475569';
        text = `Offline — ${pendingSyncCount} changes will sync automatically`;
        Icon = CloudOff;
    } else if (syncState === 'failed') {
        bgColor = '#DC2626';
        text = `Couldn't sync ${pendingSyncCount} updates. Tap to retry`;
        Icon = AlertCircle;
    } else if (syncState === 'syncing') {
        bgColor = '#2563EB';
        text = `Syncing ${pendingSyncCount} updates...`;
        Icon = RefreshCw;
    } else {
        bgColor = '#16A34A';
        text = 'Everything backed up';
        Icon = CheckCircle2;
    }

    return (
        <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
            <Pressable onPress={handlePress} style={[styles.banner, { backgroundColor: bgColor }]}>
                <Icon size={14} color={iconColor} strokeWidth={2.5} style={styles.icon} />
                <Text style={styles.text}>{text}</Text>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 9999, // Ensure it's above everything
    },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    icon: {
        marginRight: 8,
    },
    text: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
});
