import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
const CARDS = [
    { icon: '📞', title: 'For Caretakers', desc: 'Manage calls, track patient wellbeing, and coordinate with care teams.', color: Colors.primary },
    { icon: '👥', title: 'For Families', desc: 'Stay connected with loved ones and monitor their care journey.', color: '#059669' },
    { icon: '🏥', title: 'For Organizations', desc: 'Oversee care operations, manage teams, and ensure quality outcomes.', color: '#7C3AED' },
];

function InfoCard({ item, index }) {
return (
        <View>
            <View style={s.card}>
                <View style={[s.cardIcon, { backgroundColor: item.color + '12' }]}>
                    <Text style={{ fontSize: 24 }}>{item.icon}</Text>
                </View>
                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.cardDesc}>{item.desc}</Text>
            </View>
        </View>
    );
}

export default function GetStartedScreen({ navigation }) {

return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={s.safe}>
                <View>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                        <Text style={s.backText}>← Back</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                    <View>
                        <Text style={s.title}>How CareConnect Works</Text>
                        <Text style={s.subtitle}>Connecting care teams, families, and patients through compassionate calls.</Text>
                    </View>

                    <View style={s.cardList}>
                        {CARDS.map((c, i) => <InfoCard key={i} item={c} index={i} />)}
                    </View>

                    <View style={s.btnGroup}>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.9} style={s.loginWrap}>
                            <LinearGradient colors={Colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.loginBtn}>
                                <Text style={s.loginText}>Sign In</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => navigation.navigate('Signup')} activeOpacity={0.8} style={s.signupBtn}>
                            <Text style={s.signupText}>Create Account</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.white },
    safe: { flex: 1, paddingHorizontal: Spacing.lg },
    backBtn: { paddingVertical: Spacing.sm },
    backText: { ...Typography.bodyMedium, color: Colors.textSecondary },
    title: { ...Typography.h1, color: Colors.textPrimary, marginTop: Spacing.md },
    subtitle: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.sm, marginBottom: Spacing.lg, lineHeight: 24 },
    cardList: { gap: Spacing.md },
    card: {
        backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.lg,
        borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.card,
    },
    cardIcon: { width: 48, height: 48, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
    cardTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.xs },
    cardDesc: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22 },
    btnGroup: { gap: Spacing.md, marginTop: Spacing.xl },
    loginWrap: { borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.lg },
    loginBtn: { paddingVertical: 17, alignItems: 'center' },
    loginText: { ...Typography.button, color: '#fff' },
    signupBtn: { paddingVertical: 17, alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '30', backgroundColor: Colors.surfaceAlt },
    signupText: { ...Typography.button, color: Colors.primary },
});
