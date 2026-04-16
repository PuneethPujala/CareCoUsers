import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';

export default function LandingScreen({ navigation }) {
    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={['#0A2463', '#1E3A8A', '#1E40AF']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} />

            {/* Floating background elements */}
            <View style={[s.floatDot, s.dot1]} />
            <View style={[s.floatDot, s.dot2]} />
            <View style={[s.glowCircle, { top: -100, left: -100 }]} />
            <View style={[s.glowCircle, { bottom: -80, right: -120, opacity: 0.04 }]} />

            <SafeAreaView style={s.safe}>
                <View style={s.logoSection}>
                    <View style={s.logoOuter}>
                        <View style={s.logoInner}>
                            <Text style={s.heart}>🛡️</Text>
                        </View>
                    </View>

                    <Text style={s.appName}>
                        CareCo Admin
                    </Text>

                    <Text style={s.tagline}>
                        Operations & Hierarchy{'\n'}Management Portal
                    </Text>
                </View>

                <View style={s.bottom}>
                    <View>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Login')}
                            activeOpacity={0.9}
                            style={s.ctaBtn}
                        >
                            <Text style={s.ctaText}>Admin Login</Text>
                            <Text style={s.ctaArrow}>→</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.badgeRow}>
                        {['🔒 RBAC', '🛡️ Enterprise', '📊 Ops Dashboard'].map((b, i) => (
                            <View key={i} style={s.badge}><Text style={s.badgeText}>{b}</Text></View>
                        ))}
                    </View>

                    <Text style={s.footer}>
                        © 2026 CareCo Admin Portal. Internal Use Only.
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1, justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg, paddingTop: Spacing.xxl },
    floatDot: { position: 'absolute', borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.08)' },
    dot1: { top: '18%', right: 40, width: 80, height: 80, opacity: 0.6 },
    dot2: { bottom: '30%', left: 30, width: 50, height: 50, opacity: 0.5 },
    glowCircle: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: '#fff', opacity: 0.06 },
    logoSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    logoOuter: { marginBottom: Spacing.lg },
    logoInner: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    },
    heart: { fontSize: 40, color: '#fff' },
    appName: { ...Typography.h1, fontSize: 36, color: '#fff', letterSpacing: 1.5, marginBottom: Spacing.sm },
    tagline: { ...Typography.body, fontSize: 17, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 26 },
    bottom: { gap: Spacing.md },
    ctaBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#fff', paddingVertical: 18, borderRadius: Radius.lg, gap: Spacing.sm,
        ...Shadows.lg,
    },
    ctaText: { ...Typography.button, color: '#0A2463' },
    ctaArrow: { fontSize: 20, color: '#0A2463' },
    badgeRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm },
    badge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
    badgeText: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600' },
    footer: { textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 11 },
});
