import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import { ArrowLeft, Mail, Phone, Calendar, Users, Activity } from 'lucide-react-native';

export default function ManagerDetail({ route, navigation }) {
    const { managerId } = route.params;
    const { user } = useAuth();
    
    // Mock data - in real app, this would come from API
    const manager = {
        id: managerId,
        name: managerId === 'cm1' ? 'Alice Manager' : managerId === 'cm2' ? 'Bob Director' : managerId === 'cm3' ? 'Carol Lead' : 'David Supervisor',
        email: managerId === 'cm1' ? 'alice@careconnect.com' : managerId === 'cm2' ? 'bob@careconnect.com' : managerId === 'cm3' ? 'carol@careconnect.com' : 'david@careconnect.com',
        phone: managerId === 'cm1' ? '+1234567890' : managerId === 'cm2' ? '+1234567891' : managerId === 'cm3' ? '+1234567892' : '+1234567893',
        callers: managerId === 'cm1' ? 12 : managerId === 'cm2' ? 8 : managerId === 'cm3' ? 15 : 10,
        patients: managerId === 'cm1' ? 85 : managerId === 'cm2' ? 62 : managerId === 'cm3' ? 110 : 95,
        load: managerId === 'cm1' ? 78 : managerId === 'cm2' ? 55 : managerId === 'cm3' ? 92 : 68,
        status: managerId === 'cm3' ? 'break' : 'active',
        joinDate: managerId === 'cm1' ? 'Jan 15, 2024' : managerId === 'cm2' ? 'Feb 20, 2024' : managerId === 'cm3' ? 'Mar 10, 2024' : 'Jan 5, 2024',
        department: 'Patient Care Services'
    };

    const handleCall = () => {
        Alert.alert('Call Manager', `Calling ${manager.name} at ${manager.phone}...`);
    };

    const handleEmail = () => {
        Alert.alert('Email Manager', `Sending email to ${manager.email}...`);
    };

    const handleViewTeam = () => {
        Alert.alert('View Team', `Showing ${manager.callers} team members managed by ${manager.name}...`);
    };

    const handleViewPatients = () => {
        Alert.alert('View Patients', `Showing ${manager.patients} patients managed by ${manager.name}...`);
    };

    return (
        <View style={s.container}>
            <GradientHeader
                title={manager.name}
                subtitle="Manager Details"
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
                            <Text style={s.avatarText}>{manager.name.charAt(0)}</Text>
                        </View>
                    </View>
                    <View style={s.profileInfo}>
                        <Text style={s.profileName}>{manager.name}</Text>
                        <Text style={s.profileRole}>{manager.department}</Text>
                        <Text style={s.profileStatus}>Status: {manager.status}</Text>
                    </View>
                </View>

                <PremiumCard style={s.statsCard}>
                    <Text style={s.statsTitle}>Performance Metrics</Text>
                    <View style={s.statsGrid}>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{manager.callers}</Text>
                            <Text style={s.statLabel}>Team Members</Text>
                        </View>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{manager.patients}</Text>
                            <Text style={s.statLabel}>Patients</Text>
                        </View>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{manager.load}%</Text>
                            <Text style={s.statLabel}>Workload</Text>
                        </View>
                    </View>
                </PremiumCard>

                <PremiumCard style={s.contactCard}>
                    <Text style={s.contactTitle}>Contact Information</Text>
                    <View style={s.contactItem}>
                        <Mail size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Email</Text>
                            <Text style={s.contactValue}>{manager.email}</Text>
                        </View>
                    </View>
                    <View style={s.contactItem}>
                        <Phone size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Phone</Text>
                            <Text style={s.contactValue}>{manager.phone}</Text>
                        </View>
                    </View>
                    <View style={s.contactItem}>
                        <Calendar size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Joined</Text>
                            <Text style={s.contactValue}>{manager.joinDate}</Text>
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
                        <TouchableOpacity style={s.actionBtn} onPress={handleViewTeam}>
                            <Users size={20} color={Colors.white} />
                            <Text style={s.actionText}>View Team</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionBtn} onPress={handleViewPatients}>
                            <Activity size={20} color={Colors.white} />
                            <Text style={s.actionText}>View Patients</Text>
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
    avatarText: { ...Typography.h1, color: Colors.white, fontSize: 32 },
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
