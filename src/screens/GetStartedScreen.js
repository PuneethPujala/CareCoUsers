import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../theme/colors';
const CARDS = [
    { 
        icon: '📞', 
        title: 'For Caretakers', 
        desc: 'Manage calls, track patient wellbeing, and coordinate with care teams.',
        color: Colors.primary 
    },
    { 
        icon: '👥', 
        title: 'For Families', 
        desc: 'Stay connected with loved ones and monitor their care journey.',
        color: '#059669' 
    },
    { 
        icon: '🏥', 
        title: 'For Organizations', 
        desc: 'Oversee care operations, manage teams, and ensure quality outcomes.',
        color: '#7C3AED' 
    },
];

function InfoCard({ item, index }) {
return (
        <View style={s.roleCard}>
            <TouchableOpacity style={s.tile} activeOpacity={0.8}>
                <LinearGradient 
                    colors={[item.color + '15', item.color + '05']} 
                    start={{ x: 0, y: 0 }} 
                    end={{ x: 1, y: 1 }}
                    style={[s.tileGradient, { borderColor: item.color + '30' }]}
                >
                    <Text style={s.tileIcon}>{item.icon}</Text>
                </LinearGradient>
            </TouchableOpacity>
            
            <View style={s.descriptionContainer}>
                <LinearGradient
                    colors={[item.color + '08', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.descriptionGradient}
                >
                    <View style={s.descriptionContent}>
                        <Text style={[s.descriptionTitle, { color: item.color }]}>{item.title}</Text>
                        <Text style={s.descriptionText}>{item.desc}</Text>
                    </View>
                </LinearGradient>
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

                <View style={s.content}>
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
                </View>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.white },
    safe: { flex: 1, paddingHorizontal: Spacing.lg },
    backBtn: { paddingVertical: Spacing.xs },
    backText: { ...Typography.bodyMedium, color: Colors.textSecondary },
    content: { flex: 1, justifyContent: 'space-between', paddingVertical: Spacing.md },
    title: { ...Typography.h1, color: Colors.textPrimary, fontSize: 26 },
    subtitle: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.lg, lineHeight: 20, fontSize: 14 },
    cardList: { gap: Spacing.lg, flex: 1, justifyContent: 'center', marginVertical: Spacing.md },
    roleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.lg,
        backgroundColor: Colors.white,
        borderRadius: Radius.xl,
        padding: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        ...Shadows.card,
    },
    tile: { 
        width: 90, 
        height: 90,
        borderRadius: Radius.xl,
        overflow: 'hidden',
        ...Shadows.md,
    },
    tileGradient: {
        flex: 1,
        borderWidth: 1.5,
        borderRadius: Radius.xl,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tileIcon: { 
        fontSize: 36,
    },
    descriptionContainer: {
        flex: 1,
        height: 90,
    },
    descriptionGradient: {
        flex: 1,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.md,
        justifyContent: 'center',
    },
    descriptionContent: {
        gap: Spacing.xs,
    },
    descriptionTitle: {
        ...Typography.h2,
        fontWeight: '700',
        fontSize: 16,
        marginBottom: Spacing.xs,
    },
    descriptionText: {
        ...Typography.body,
        color: Colors.textSecondary,
        lineHeight: 18,
        fontSize: 13,
    },
    btnGroup: { gap: Spacing.md },
    loginWrap: { borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.lg },
    loginBtn: { paddingVertical: 16, alignItems: 'center' },
    loginText: { ...Typography.button, color: '#fff', fontSize: 16 },
    signupBtn: { paddingVertical: 16, alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '30', backgroundColor: Colors.surfaceAlt },
    signupText: { ...Typography.button, color: Colors.primary, fontSize: 16 },
});
