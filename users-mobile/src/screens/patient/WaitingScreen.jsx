import React, { useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Platform, Pressable,
    Animated, Image, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    PhoneCall, Shield, HeartPulse, Pill, Users,
    Clock, ChevronRight, Sparkles, Star, CheckCircle2
} from 'lucide-react-native';
import { colors } from '../../theme';

const { width } = Dimensions.get('window');

const FEATURES = [
    {
        icon: PhoneCall,
        title: 'Daily Check-in Calls',
        desc: 'Your dedicated care coordinator calls you every day to check on your health, mood, and medication.',
        color: colors.accent,
        bg: '#EFF6FF',
    },
    {
        icon: Pill,
        title: 'Medication Tracking',
        desc: 'Never miss a dose. We track your medications and send you smart reminders throughout the day.',
        color: '#22C55E',
        bg: '#DCFCE7',
    },
    {
        icon: HeartPulse,
        title: 'Health Monitoring',
        desc: 'Track your vitals, conditions, and health trends. Share your profile securely with your doctor.',
        color: '#EF4444',
        bg: '#FEE2E2',
    },
    {
        icon: Shield,
        title: 'Emergency Support',
        desc: 'One-tap access to your emergency contacts and instant alert to your care coordinator.',
        color: '#F59E0B',
        bg: '#FEF3C7',
    },
];

const TEAM_STATS = [
    { value: '500+', label: 'Patients Cared For' },
    { value: '50+', label: 'Care Coordinators' },
    { value: '98%', label: 'Satisfaction Rate' },
    { value: '10+', label: 'Cities Covered' },
];

export default function WaitingScreen({ navigation, route }) {
    const plan = route.params?.plan;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();

        // Pulsing animation for the waiting badge
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Success Banner */}
                <LinearGradient
                    colors={['#059669', '#16A34A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.successBanner}
                >
                    <View style={styles.bannerDecor1} />
                    <View style={styles.bannerDecor2} />
                    <CheckCircle2 size={28} color="#FFFFFF" fill="rgba(255,255,255,0.3)" />
                    <View style={styles.bannerTextGroup}>
                        <Text style={styles.bannerTitle}>Payment Successful!</Text>
                        <Text style={styles.bannerDesc}>
                            {plan?.name || 'Basic'} Plan activated
                        </Text>
                    </View>
                </LinearGradient>

                {/* Waiting Card */}
                <Animated.View style={[styles.waitingCard, { transform: [{ scale: pulseAnim }] }]}>
                    <LinearGradient
                        colors={['#4338CA', '#38BDF8']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.waitingGradient}
                    >
                        <View style={styles.waitingIconWrap}>
                            <PhoneCall size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.waitingTitle}>Your Coordinator Will Call Soon</Text>
                        <Text style={styles.waitingDesc}>
                            A Samvaya care coordinator from your city will call you shortly to complete your health profile and get you started.
                        </Text>
                        <View style={styles.waitingTimeline}>
                            <Clock size={16} color="rgba(255,255,255,0.6)" />
                            <Text style={styles.waitingTimeText}>Usually within 30 minutes</Text>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* About Samvaya */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <Text style={styles.sectionEyebrow}>WHILE YOU WAIT</Text>
                    <Text style={styles.sectionTitle}>Discover Samvaya</Text>
                    <View style={styles.content}>
                        <Text style={styles.title}>Welcome to CareMyMed</Text>
                        <Text style={styles.subtitle}>
                            Your dedicated platform for personalized health management and continuous care.
                        </Text>
                        <LinearGradient
                            colors={['transparent', 'rgba(244,247,251,0.9)']}
                            style={styles.heroImageOverlay}
                        />
                    </View>

                    {/* Feature Cards */}
                    <Text style={styles.featuresSectionTitle}>What's Included</Text>
                    {FEATURES.map((feat, i) => {
                        const IconCmp = feat.icon;
                        return (
                            <View key={i} style={styles.featureCard}>
                                <View style={[styles.featureIconWrap, { backgroundColor: feat.bg }]}>
                                    <IconCmp size={24} color={feat.color} />
                                </View>
                                <View style={styles.featureTextGroup}>
                                    <Text style={styles.featureTitle}>{feat.title}</Text>
                                    <Text style={styles.featureDesc}>{feat.desc}</Text>
                                </View>
                            </View>
                        );
                    })}

                    {/* Stats Row */}
                    <View style={styles.statsCard}>
                        <LinearGradient
                            colors={['#4338CA', '#38BDF8']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.statsGradient}
                        >
                            <Text style={styles.statsTitle}>Trusted by Families Across India</Text>
                            <View style={styles.statsGrid}>
                                {TEAM_STATS.map((stat, i) => (
                                    <View key={i} style={styles.statItem}>
                                        <Text style={styles.statValue}>{stat.value}</Text>
                                        <Text style={styles.statLabel}>{stat.label}</Text>
                                    </View>
                                ))}
                            </View>
                        </LinearGradient>
                    </View>

                    {/* How It Works */}
                    <Text style={styles.featuresSectionTitle}>How It Works</Text>
                    {[
                        { step: '1', title: 'Coordinator Calls You', desc: 'Your assigned coordinator calls to understand your health needs.' },
                        { step: '2', title: 'Health Profile Setup', desc: 'We set up your medications, conditions, and emergency contacts.' },
                        { step: '3', title: 'Daily Support Begins', desc: 'Enjoy daily check-ins, medication reminders, and health tracking.' },
                    ].map((item, i) => (
                        <View key={i} style={styles.howItWorksRow}>
                            <View style={styles.stepCircle}>
                                <Text style={styles.stepNumber}>{item.step}</Text>
                            </View>
                            <View style={styles.stepTextGroup}>
                                <Text style={styles.stepTitle}>{item.title}</Text>
                                <Text style={styles.stepDesc}>{item.desc}</Text>
                            </View>
                        </View>
                    ))}
                </Animated.View>

                {/* Spacer for button */}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* CTA */}
            <View style={styles.ctaContainer}>
                <Pressable onPress={() => navigation.reset({ index: 0, routes: [{ name: 'PatientTabs' }] })}>
                    <LinearGradient
                        colors={[colors.accent, '#1E5FAD']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.ctaBtn}
                    >
                        <Sparkles size={20} color="#FFFFFF" />
                        <Text style={styles.ctaBtnText}>Continue to Dashboard</Text>
                        <ChevronRight size={20} color="#FFFFFF" />
                    </LinearGradient>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },
    scrollContent: { paddingBottom: 40 },

    successBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingTop: Platform.OS === 'ios' ? 64 : 48,
        paddingBottom: 20, paddingHorizontal: 20,
        overflow: 'hidden',
    },
    bannerDecor1: {
        position: 'absolute', top: -30, right: -30,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    bannerDecor2: {
        position: 'absolute', bottom: -20, left: 40,
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    bannerTextGroup: { flex: 1 },
    bannerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
    bannerDesc: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

    waitingCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 24, overflow: 'hidden' },
    waitingGradient: { padding: 28, alignItems: 'center' },
    waitingIconWrap: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    waitingTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
    waitingDesc: {
        fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center',
        lineHeight: 22, marginBottom: 16,
    },
    waitingTimeline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    waitingTimeText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

    sectionEyebrow: {
        fontSize: 12, fontWeight: '700', color: '#94A3B8',
        letterSpacing: 2, marginTop: 32, marginHorizontal: 20, marginBottom: 6,
    },
    sectionTitle: { fontSize: 24, fontWeight: '800', color: '#1A202C', marginHorizontal: 20 },
    sectionDesc: {
        fontSize: 15, color: '#64748B', lineHeight: 24,
        marginHorizontal: 20, marginTop: 8,
    },

    heroImageWrap: {
        marginHorizontal: 16, marginTop: 20, borderRadius: 20,
        overflow: 'hidden', height: 200,
    },
    heroImage: { width: '100%', height: '100%' },
    heroImageOverlay: {
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
    },

    featuresSectionTitle: {
        fontSize: 18, fontWeight: '700', color: '#1A202C',
        marginHorizontal: 20, marginTop: 28, marginBottom: 16,
    },
    featureCard: {
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
        marginHorizontal: 16, marginBottom: 12,
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    featureIconWrap: {
        width: 48, height: 48, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    featureTextGroup: { flex: 1 },
    featureTitle: { fontSize: 16, fontWeight: '700', color: '#1A202C', marginBottom: 4 },
    featureDesc: { fontSize: 13, color: '#64748B', lineHeight: 20 },

    statsCard: { marginHorizontal: 16, marginTop: 24, borderRadius: 20, overflow: 'hidden' },
    statsGradient: { padding: 24 },
    statsTitle: {
        fontSize: 16, fontWeight: '700', color: '#FFFFFF',
        textAlign: 'center', marginBottom: 20,
    },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    statItem: { width: '48%', alignItems: 'center', marginBottom: 16 },
    statValue: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
    statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, textAlign: 'center' },

    howItWorksRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        marginHorizontal: 20, marginBottom: 20, gap: 14,
    },
    stepCircle: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    },
    stepNumber: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
    stepTextGroup: { flex: 1 },
    stepTitle: { fontSize: 15, fontWeight: '700', color: '#1A202C', marginBottom: 2 },
    stepDesc: { fontSize: 13, color: '#64748B', lineHeight: 20 },

    ctaContainer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
        paddingTop: 12,
        backgroundColor: 'rgba(244,247,251,0.95)',
        borderTopWidth: 1, borderTopColor: '#E2E8F0',
    },
    ctaBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingVertical: 16, borderRadius: 16,
    },
    ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
});
