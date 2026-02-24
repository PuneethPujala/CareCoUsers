import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import { ArrowLeft, Mail, Phone, Heart, Calendar, Activity } from 'lucide-react-native';

export default function PatientDetail({ route, navigation }) {
    const { patientId } = route.params;
    const { user } = useAuth();
    
    // Mock data - in real app, this would come from API
    const patient = {
        id: patientId,
        name: patientId === 'p1' ? 'Robert Williams' : 
              patientId === 'p2' ? 'Margaret Chen' : 
              patientId === 'p3' ? 'James Wilson' : 
              patientId === 'p4' ? 'Linda Garcia' : '',
        age: patientId === 'p1' ? 65 : 
              patientId === 'p2' ? 72 : 
              patientId === 'p3' ? 58 : 
              patientId === 'p4' ? 69 : 0,
        condition: patientId === 'p1' ? 'Diabetes' : 
                    patientId === 'p2' ? 'Hypertension' : 
                    patientId === 'p3' ? 'Post-Surgery' : 
                    patientId === 'p4' ? 'Arthritis' : '',
        adherence: patientId === 'p1' ? 95 : 
                   patientId === 'p2' ? 87 : 
                   patientId === 'p3' ? 92 : 
                   patientId === 'p4' ? 78 : 0,
        lastCall: patientId === 'p1' ? '2 days ago' : 
                   patientId === 'p2' ? '1 day ago' : 
                   patientId === 'p3' ? '3 days ago' : 
                   patientId === 'p4' ? '5 days ago' : '',
        email: patientId === 'p1' ? 'robert@careconnect.com' : 
                   patientId === 'p2' ? 'margaret@careconnect.com' : 
                   patientId === 'p3' ? 'james@careconnect.com' : 
                   patientId === 'p4' ? 'linda@careconnect.com' : '',
        phone: patientId === 'p1' ? '+1234567890' : 
                   patientId === 'p2' ? '+1234567891' : 
                   patientId === 'p3' ? '+1234567892' : 
                   patientId === 'p4' ? '+1234567893' : '',
        status: patientId === 'p4' ? 'warning' : 'active',
        joinDate: patientId === 'p1' ? 'Jan 20, 2024' : 
                   patientId === 'p2' ? 'Feb 10, 2024' : 
                   patientId === 'p3' ? 'Mar 15, 2024' : 
                   patientId === 'p4' ? 'Jan 5, 2024' : '',
        department: 'Patient Care Services'
    };

    const handleCall = () => {
        Alert.alert('Call Patient', `Calling ${patient.name} at ${patient.phone}...`);
    };

    const handleEmail = () => {
        Alert.alert('Email Patient', `Sending email to ${patient.email}...`);
    };

    const handleViewHistory = () => {
        Alert.alert('Call History', `Showing call history for ${patient.name}...`);
    };

    const handleViewMedications = () => {
        Alert.alert('Medications', `Showing medications for ${patient.name}...`);
    };

    return (
        <View style={s.container}>
            <GradientHeader
                title={patient.name}
                subtitle="Patient Details"
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
                            <Heart size={24} color={Colors.white} />
                        </View>
                    </View>
                    <View style={s.profileInfo}>
                        <Text style={s.profileName}>{patient.name}</Text>
                        <Text style={s.profileRole}>{patient.condition}</Text>
                        <Text style={s.profileStatus}>Status: {patient.status}</Text>
                    </View>
                </View>

                <PremiumCard style={s.statsCard}>
                    <Text style={s.statsTitle}>Health Metrics</Text>
                    <View style={s.statsGrid}>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{patient.age}</Text>
                            <Text style={s.statLabel}>Age</Text>
                        </View>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{patient.adherence}%</Text>
                            <Text style={s.statLabel}>Adherence</Text>
                        </View>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{patient.lastCall}</Text>
                            <Text style={s.statLabel}>Last Call</Text>
                        </View>
                    </View>
                </PremiumCard>

                <PremiumCard style={s.contactCard}>
                    <Text style={s.contactTitle}>Contact Information</Text>
                    <View style={s.contactItem}>
                        <Mail size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Email</Text>
                            <Text style={s.contactValue}>{patient.email}</Text>
                        </View>
                    </View>
                    <View style={s.contactItem}>
                        <Phone size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Phone</Text>
                            <Text style={s.contactValue}>{patient.phone}</Text>
                        </View>
                    </View>
                    <View style={s.contactItem}>
                        <Calendar size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Joined</Text>
                            <Text style={s.contactValue}>{patient.joinDate}</Text>
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
                        <TouchableOpacity style={s.actionBtn} onPress={handleViewHistory}>
                            <Activity size={20} color={Colors.white} />
                            <Text style={s.actionText}>Call History</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionBtn} onPress={handleViewMedications}>
                            <Heart size={20} color={Colors.white} />
                            <Text style={s.actionText}>Medications</Text>
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
