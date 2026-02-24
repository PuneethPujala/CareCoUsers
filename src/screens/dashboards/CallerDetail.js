import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import { ArrowLeft, Mail, Phone, Activity, TrendingUp } from 'lucide-react-native';

export default function CallerDetail({ route, navigation }) {
    const { callerId } = route.params;
    const { user } = useAuth();
    
    // Mock data - in real app, this would come from API
    const caller = {
        id: callerId,
        name: callerId === 'c1' ? 'Sarah Johnson' : callerId === 'c2' ? 'Mike Chen' : callerId === 'c3' ? 'Emily Davis' : 'John Wilson',
        email: callerId === 'c1' ? 'sarah@careconnect.com' : callerId === 'c2' ? 'mike@careconnect.com' : callerId === 'c3' ? 'emily@careconnect.com' : 'john@careconnect.com',
        phone: callerId === 'c1' ? '+1234567890' : callerId === 'c2' ? '+1234567891' : callerId === 'c3' ? '+1234567892' : '+1234567893',
        calls: callerId === 'c1' ? 28 : callerId === 'c2' ? 24 : callerId === 'c3' ? 22 : 30,
        patients: callerId === 'c1' ? 12 : callerId === 'c2' ? 8 : callerId === 'c3' ? 15 : 18,
        performance: callerId === 'c1' ? 96 : callerId === 'c2' ? 91 : callerId === 'c3' ? 88 : 94,
        status: callerId === 'c3' ? 'offline' : 'active',
        joinDate: callerId === 'c1' ? 'Jan 10, 2024' : callerId === 'c2' ? 'Feb 15, 2024' : callerId === 'c3' ? 'Mar 20, 2024' : 'Jan 5, 2024',
        department: 'Patient Outreach Services'
    };

    const handleCall = () => {
        Alert.alert('Call Caller', `Calling ${caller.name} at ${caller.phone}...`);
    };

    const handleEmail = () => {
        Alert.alert('Email Caller', `Sending email to ${caller.email}...`);
    };

    const handleViewPerformance = () => {
        Alert.alert('Performance', `${caller.name} has a performance score of ${caller.performance}%...`);
    };

    return (
        <View style={s.container}>
            <GradientHeader
                title={caller.name}
                subtitle="Caller Details"
                colors={Colors.roleGradient.org_admin}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                <View style={s.profileCard}>
                    <View style={s.avatarContainer}>
                        <View style={s.avatar}>
                            <Phone size={24} color={Colors.white} />
                        </View>
                    </View>
                    <View style={s.profileInfo}>
                        <Text style={s.profileName}>{caller.name}</Text>
                        <Text style={s.profileRole}>{caller.department}</Text>
                        <Text style={s.profileStatus}>Status: {caller.status}</Text>
                    </View>
                </View>

                <PremiumCard style={s.statsCard}>
                    <Text style={s.statsTitle}>Performance Metrics</Text>
                    <View style={s.statsGrid}>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{caller.calls}</Text>
                            <Text style={s.statLabel}>Calls Today</Text>
                        </View>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{caller.patients}</Text>
                            <Text style={s.statLabel}>Patients</Text>
                        </View>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{caller.performance}%</Text>
                            <Text style={s.statLabel}>Score</Text>
                        </View>
                    </View>
                </PremiumCard>

                <PremiumCard style={s.contactCard}>
                    <Text style={s.contactTitle}>Contact Information</Text>
                    <View style={s.contactItem}>
                        <Mail size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Email</Text>
                            <Text style={s.contactValue}>{caller.email}</Text>
                        </View>
                    </View>
                    <View style={s.contactItem}>
                        <Phone size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Phone</Text>
                            <Text style={s.contactValue}>{caller.phone}</Text>
                        </View>
                    </View>
                    <View style={s.contactItem}>
                        <Activity size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Joined</Text>
                            <Text style={s.contactValue}>{caller.joinDate}</Text>
                        </View>
                    </View>
                </PremiumCard>

                <PremiumCard style={s.actionsCard}>
                    <Text style={s.actionsTitle}>Quick Actions</Text>
                    <View style={s.actionsGrid}>
                        <TouchableOpacity style={s.actionBtn} onPress={handleCall}>
                            <Phone size={20} color={Colors.white} />
                            <Text style={s.actionText}>Call</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionBtn} onPress={handleEmail}>
                            <Mail size={20} color={Colors.white} />
                            <Text style={s.actionText}>Email</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionBtn} onPress={handleViewPerformance}>
                            <TrendingUp size={20} color={Colors.white} />
                            <Text style={s.actionText}>View Stats</Text>
                        </TouchableOpacity>
                    </View>
                </PremiumCard>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    bellBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    profileCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.md },
    avatarContainer: { alignItems: 'center', marginBottom: Spacing.md },
    avatar: { width: 80, height: 80, borderRadius: Radius.full, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
    profileInfo: { flex: 1, marginLeft: Spacing.md },
    profileName: { ...Typography.h2, color: Colors.textPrimary, marginBottom: Spacing.xs },
    profileRole: { ...Typography.body, color: Colors.textMuted, marginBottom: Spacing.sm },
    profileStatus: { ...Typography.caption, color: Colors.textMuted },
    statsCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.md },
    statsTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.md },
    statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
    statItem: { alignItems: 'center' },
    statValue: { ...Typography.h2, color: Colors.primary, marginBottom: Spacing.xs },
    statLabel: { ...Typography.caption, color: Colors.textMuted },
    contactCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.md },
    contactTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.md },
    contactItem: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
    contactInfo: { flex: 1, marginLeft: Spacing.md },
    contactLabel: { ...Typography.caption, color: Colors.textMuted, width: 80 },
    contactValue: { ...Typography.body, color: Colors.textPrimary },
    actionsCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.md },
    actionsTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.md },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, minWidth: 120, ...Shadows.sm },
    actionText: { ...Typography.button, color: Colors.white, marginLeft: Spacing.sm },
});
