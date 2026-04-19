import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable,
    Animated, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Crown, Check, PhoneCall, Pill, Shield, HeartPulse,
    Users, Sparkles, ChevronRight, Star, AlertCircle, LogOut
} from 'lucide-react-native';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');

const PLANS = [
    {
        id: 'basic',
        name: 'Basic',
        price: '₹500',
        period: '/month',
        tagline: 'Perfect to get started',
        color: colors.accent,
        gradient: ['#6366F1', '#4338CA'],
        icon: PhoneCall,
        features: [
            'Daily check-in call from care coordinator',
            'Medication tracking & reminders',
            '1 Emergency contact support',
            'Basic health profile',
            'Monthly health summary',
        ],
    },
    {
        id: 'premium',
        name: 'Premium',
        price: '₹999',
        period: '/month',
        tagline: 'Best value for complete care',
        color: '#9333EA',
        gradient: ['#9333EA', '#7C3AED'],
        icon: Crown,
        popular: true,
        features: [
            'Everything in Basic +',
            'Priority support & faster response',
            'Detailed health insights & analytics',
            'Family dashboard access',
            'Specialist referral assistance',
            'Quarterly doctor consultation',
        ],
    },
];

const FeatureRow = ({ text, color }) => (
    <View style={styles.featureRow}>
        <Check size={16} color={color} strokeWidth={3} />
        <Text style={styles.featureText}>{text}</Text>
    </View>
);

export default function SubscribePlansScreen({ navigation }) {
    const { subscriptionStatus, signOut } = useAuth();
    const [selected, setSelected] = useState('basic');
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, []);

    const handleSelect = (id) => {
        setSelected(id);
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
    };

    const selectedPlan = PLANS.find(p => p.id === selected);

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#4338CA', '#38BDF8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
            >
                <View style={styles.decorCircle1} />
                <View style={styles.decorCircle2} />
                <Text style={styles.heroEyebrow}>SAMVAYA</Text>
                <Text style={styles.heroTitle}>Choose Your Plan</Text>
                <Text style={styles.heroSubtitle}>
                    Start your journey to better health with a dedicated care coordinator
                </Text>
            </LinearGradient>

            {subscriptionStatus === 'expired' && (
                <View style={styles.expiredBanner}>
                    <View style={styles.expiredRow}>
                        <AlertCircle size={20} color="#DC2626" />
                        <Text style={styles.expiredText}>Your subscription has expired. Please renew to continue.</Text>
                    </View>
                    <Pressable onPress={signOut} style={styles.logoutBtn}>
                        <LogOut size={16} color="#64748B" />
                        <Text style={styles.logoutText}>Sign Out</Text>
                    </Pressable>
                </View>
            )}

            <Animated.View style={[styles.bodyWrap, { opacity: fadeAnim }]}>
                <ScrollView
                    style={styles.body}
                    contentContainerStyle={styles.bodyContent}
                    showsVerticalScrollIndicator={false}
                >
                    {PLANS.map((plan) => {
                        const isActive = selected === plan.id;
                        const IconCmp = plan.icon;

                        return (
                            <Pressable
                                key={plan.id}
                                onPress={() => handleSelect(plan.id)}
                                style={[
                                    styles.planCard,
                                    isActive && { borderColor: plan.color, borderWidth: 2.5 },
                                ]}
                            >
                                {plan.popular && (
                                    <View style={[styles.popularBadge, { backgroundColor: plan.color }]}>
                                        <Star size={12} color="#FFFFFF" fill="#FFFFFF" />
                                        <Text style={styles.popularText}>MOST POPULAR</Text>
                                    </View>
                                )}

                                <View style={styles.planHeader}>
                                    <View style={[styles.planIconWrap, { backgroundColor: plan.color + '15' }]}>
                                        <IconCmp size={24} color={plan.color} />
                                    </View>
                                    <View style={styles.planTitleGroup}>
                                        <Text style={styles.planName}>{plan.name}</Text>
                                        <Text style={[styles.planTagline, { color: plan.color }]}>{plan.tagline}</Text>
                                    </View>
                                    <View style={styles.planPriceGroup}>
                                        <Text style={[styles.planPrice, { color: plan.color }]}>{plan.price}</Text>
                                        <Text style={styles.planPeriod}>{plan.period}</Text>
                                    </View>
                                </View>

                                <View style={styles.divider} />

                                {plan.features.map((f, i) => (
                                    <FeatureRow key={i} text={f} color={plan.color} />
                                ))}

                                {isActive && (
                                    <View style={[styles.selectedIndicator, { backgroundColor: plan.color + '15' }]}>
                                        <Check size={16} color={plan.color} strokeWidth={3} />
                                        <Text style={[styles.selectedText, { color: plan.color }]}>Selected</Text>
                                    </View>
                                )}
                            </Pressable>
                        );
                    })}

                    {/* Reassurance */}
                    <View style={styles.reassureRow}>
                        <Shield size={16} color="#64748B" />
                        <Text style={styles.reassureText}>Cancel anytime • No hidden fees</Text>
                    </View>
                </ScrollView>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },

    expiredBanner: {
        backgroundColor: '#FEF2F2',
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderColor: '#FEE2E2',
    },
    expiredRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    expiredText: { color: '#991B1B', fontSize: 13, fontWeight: '600', flexShrink: 1 },
    logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    logoutText: { fontSize: 12, fontWeight: '600', color: '#64748B' },

    hero: {
        paddingTop: Platform.OS === 'ios' ? 64 : 48,
        paddingBottom: 36,
        paddingHorizontal: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        overflow: 'hidden',
    },
    decorCircle1: {
        position: 'absolute', top: -50, right: -50,
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    decorCircle2: {
        position: 'absolute', bottom: -30, left: -30,
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    heroEyebrow: {
        fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)',
        letterSpacing: 2, marginBottom: 8,
    },
    heroTitle: {
        fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: 8,
    },
    heroSubtitle: {
        fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 22,
    },

    bodyWrap: { flex: 1 },
    body: { flex: 1 },
    bodyContent: { padding: 16, paddingBottom: 120 },

    planCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 4,
        overflow: 'hidden',
    },
    popularBadge: {
        position: 'absolute', top: 0, right: 0,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 12, paddingVertical: 6,
        borderBottomLeftRadius: 12,
    },
    popularText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },

    planHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    planIconWrap: {
        width: 48, height: 48, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    planTitleGroup: { flex: 1, flexShrink: 1 },
    planName: { fontSize: 20, fontWeight: '700', color: '#1A202C' },
    planTagline: { fontSize: 13, fontWeight: '500', marginTop: 2 },
    planPriceGroup: { alignItems: 'flex-end', flexShrink: 0, marginLeft: 8 },
    planPrice: { fontSize: 24, fontWeight: '800' },
    planPeriod: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

    divider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 12 },

    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    featureText: { fontSize: 14, color: '#475569', flex: 1 },

    selectedIndicator: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, marginTop: 16, paddingVertical: 10, borderRadius: 12,
    },
    selectedText: { fontSize: 14, fontWeight: '700' },

    reassureRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, marginTop: 8, marginBottom: 20,
    },
    reassureText: { fontSize: 13, color: '#64748B' },

    ctaContainer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
        paddingTop: 12,
        backgroundColor: 'rgba(244,247,251,0.95)',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    ctaBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 16, borderRadius: 16,
    },
    ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
});
