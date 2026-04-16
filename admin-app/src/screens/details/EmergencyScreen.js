import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, StatusBar, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
const CONTACTS = [
    { id: 1, label: 'Your Caller', name: 'Sarah Johnson', phone: '555-0101', icon: '📞', color: Colors.primary, gradient: Colors.gradient },
    { id: 2, label: 'Care Manager', name: 'Alice Manager', phone: '555-0100', icon: '📋', color: '#059669', gradient: Colors.roleGradient.care_manager },
    { id: 3, label: 'Emergency Services', name: '911', phone: '911', icon: '🚨', color: Colors.error, gradient: ['#DC2626', '#EF4444'] },
];

function ContactCard({ item, index }) {
const handleCall = () => {
        Alert.alert(`Call ${item.name}?`, `This will call ${item.phone}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Call', onPress: () => Linking.openURL(`tel:${item.phone}`) },
        ]);
    };

    return (
        <View>
            <TouchableOpacity onPress={handleCall} activeOpacity={0.8}>
                <LinearGradient colors={item.gradient} style={s.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={s.cardIcon}>{item.icon}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardLabel}>{item.label}</Text>
                        <Text style={s.cardName}>{item.name}</Text>
                        <Text style={s.cardPhone}>{item.phone}</Text>
                    </View>
                    <View style={s.callCircle}>
                        <Text style={{ fontSize: 24 }}>📞</Text>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );
}

export default function EmergencyScreen({ navigation }) {
return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={['#7F1D1D', '#991B1B']} style={StyleSheet.absoluteFill} />

            <SafeAreaView style={s.safe}>
                <View style={s.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                        <Text style={s.backText}>←</Text>
                    </TouchableOpacity>
                </View>

                <View style={s.titleArea}>
                    <Text style={s.emergencyIcon}>🚨</Text>
                    <Text style={s.title}>Emergency Help</Text>
                    <Text style={s.subtitle}>Tap a contact below to call immediately</Text>
                </View>

                <View style={s.contacts}>
                    {CONTACTS.map((c, i) => <ContactCard key={c.id} item={c} index={i} />)}
                </View>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1 },
    header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    backBtn: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    backText: { fontSize: 20, color: '#fff', fontWeight: '700' },
    titleArea: { alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
    emergencyIcon: { fontSize: 56, marginBottom: Spacing.md },
    title: { ...Typography.h1, color: '#fff' },
    subtitle: { ...Typography.body, color: 'rgba(255,255,255,0.7)', marginTop: Spacing.sm, textAlign: 'center' },
    contacts: { flex: 1, paddingHorizontal: Spacing.lg, gap: Spacing.md },
    card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.xl, ...Shadows.lg },
    cardIcon: { fontSize: 36 },
    cardLabel: { ...Typography.tiny, color: 'rgba(255,255,255,0.7)' },
    cardName: { ...Typography.h3, color: '#fff', marginTop: 2 },
    cardPhone: { ...Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    callCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
});
