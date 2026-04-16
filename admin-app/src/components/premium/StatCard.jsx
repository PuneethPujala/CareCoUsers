// admin-app/src/components/premium/StatCard.jsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import AnimatedNumber from './AnimatedNumber';

const CARD_CONFIGS = {
    organizations: { icon: 'briefcase', grad: Theme.colors.accents.primary, label: 'Organizations' },
    patients: { icon: 'heart', grad: Theme.colors.accents.success, label: 'Patients' },
    revenue: { icon: 'dollar-sign', grad: Theme.colors.accents.success, label: 'Revenue' },
    care_managers: { icon: 'clipboard', grad: Theme.colors.accents.warning, label: 'Care Managers' },
    callers: { icon: 'phone', grad: Theme.colors.accents.info, label: 'Callers' },
    org_admins: { icon: 'shield', grad: Theme.colors.accents.secondary, label: 'Org Admins' },
    patient_mentors: { icon: 'users', grad: Theme.colors.accents.warning, label: 'Mentors' },
};

export default function StatCard({ type, value, change, progress, index = 0, width = '48%', onClick }) {
    const config = CARD_CONFIGS[type] || CARD_CONFIGS.organizations;
    
    // Animations
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;
    const scale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const delay = index * 80;
        setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.spring(translateY, {
                    toValue: 0,
                    damping: 15,
                    useNativeDriver: true,
                }),
            ]).start();
        }, delay);
    }, [index]);

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.98,
            useNativeDriver: true,
        }).start();
    };
    const handlePressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
        }).start();
    };

    return (
        <Animated.View style={[s.wrapper, { width, opacity, transform: [{ translateY }, { scale }] }]}>
            <TouchableOpacity 
                activeOpacity={0.9} 
                onPress={onClick}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={s.touchable}
            >
                <View style={s.card}>
                    <View style={s.header}>
                        <View style={[s.iconContainer, { backgroundColor: config.grad[0] + '10' }]}>
                            <Feather name={config.icon} size={22} color={config.grad[0]} />
                        </View>
                        <View style={s.trendContainer}>
                            <Text style={[s.trendText, Theme.typography.common, { color: change >= 0 ? '#10B981' : '#EF4444' }]}>
                                {change >= 0 ? '+' : ''}{change}%
                            </Text>
                        </View>
                    </View>

                    <View style={s.mainBody}>
                        <Text style={[s.label, Theme.typography.common]} numberOfLines={1}>{config.label}</Text>
                        <AnimatedNumber 
                            value={value} 
                            style={[s.value, Theme.typography.common]} 
                            prefix={type === 'revenue' ? '₹' : ''} 
                        />
                    </View>

                    <View style={s.footer}>
                        <View style={s.progressBarBg}>
                            <View 
                                style={[
                                    s.progressBarFill, 
                                    { width: `${progress}%`, backgroundColor: config.grad[0] }
                                ]} 
                            />
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    wrapper: {
        marginBottom: 12,
    },
    touchable: {
        flex: 1,
    },
    card: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Theme.shadows.sharp,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    trendContainer: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
    },
    trendText: {
        fontSize: 11,
        fontWeight: '800',
    },
    mainBody: {
        marginBottom: 12,
    },
    label: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
    },
    value: {
        fontSize: 28,
        color: '#0F172A',
        fontWeight: '800',
        letterSpacing: -1,
    },
    footer: {
        marginTop: 4,
    },
    progressBarBg: {
        height: 4,
        width: '100%',
        backgroundColor: '#F1F5F9',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
});
