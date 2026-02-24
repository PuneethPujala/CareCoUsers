import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import { ArrowLeft, Mail, Phone, Star, Users } from 'lucide-react-native';

export default function MentorDetail({ route, navigation }) {
    const { mentorId } = route.params;
    const { user } = useAuth();
    
    // Mock data - in real app, this would come from API
    const mentor = {
        id: mentorId,
        name: mentorId === 'm1' ? 'Dr. John Smith' : 
              mentorId === 'm2' ? 'Nurse Jane Doe' : 
              mentorId === 'm3' ? 'Dr. Mike Wilson' : 
              mentorId === 'm4' ? 'Dr. Sarah Brown' : '',
        email: mentorId === 'm1' ? 'john@careconnect.com' : 
               mentorId === 'm2' ? 'jane@careconnect.com' : 
               mentorId === 'm3' ? 'mike@careconnect.com' : 
               mentorId === 'm4' ? 'sarah@careconnect.com' : '',
        phone: mentorId === 'm1' ? '+1234567890' : 
               mentorId === 'm2' ? '+1234567891' : 
               mentorId === 'm3' ? '+1234567892' : 
               mentorId === 'm4' ? '+1234567893' : '',
        patients: mentorId === 'm1' ? 25 : 
                 mentorId === 'm2' ? 18 : 
                 mentorId === 'm3' ? 32 : 
                 mentorId === 'm4' ? 22 : 0,
        satisfaction: mentorId === 'm1' ? 4.8 : 
                     mentorId === 'm2' ? 4.9 : 
                     mentorId === 'm3' ? 4.7 : 
                     mentorId === 'm4' ? 4.6 : 0,
        specialty: mentorId === 'm1' ? 'Cardiology' : 
                   mentorId === 'm2' ? 'Diabetes' : 
                   mentorId === 'm3' ? 'General Practice' : 
                   mentorId === 'm4' ? 'Pediatrics' : '',
        status: mentorId === 'm3' ? 'away' : 'active',
        joinDate: mentorId === 'm1' ? 'Jan 5, 2024' : 
                mentorId === 'm2' ? 'Feb 12, 2024' : 
                mentorId === 'm3' ? 'Mar 18, 2024' : 
                mentorId === 'm4' ? 'Jan 8, 2024' : '',
        department: 'Patient Mentor Services'
    };

    const handleCall = () => {
        Alert.alert('Call Mentor', `Calling ${mentor.name} at ${mentor.phone}...`);
    };

    const handleEmail = () => {
        Alert.alert('Email Mentor', `Sending email to ${mentor.email}...`);
    };

    const handleViewPatients = () => {
        Alert.alert('View Patients', `Showing ${mentor.patients} patients assigned to ${mentor.name}...`);
    };

    return (
        <View style={s.container}>
            <GradientHeader
                title={mentor.name}
                subtitle="Mentor Details"
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
                            <Text style={s.avatarText}>{mentor.name.split(' ').map(n => n[0]).join('').charAt(0)}</Text>
                        </View>
                    </View>
                    <View style={s.profileInfo}>
                        <Text style={s.profileName}>{mentor.name}</Text>
                        <Text style={s.profileRole}>{mentor.specialty}</Text>
                        <Text style={s.profileStatus}>Status: {mentor.status}</Text>
                    </View>
                </View>

                <PremiumCard style={s.statsCard}>
                    <Text style={s.statsTitle}>Mentor Metrics</Text>
                    <View style={s.statsGrid}>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{mentor.patients}</Text>
                            <Text style={s.statLabel}>Patients</Text>
                        </View>
                        <View style={s.statItem}>
                            <View style={s.ratingContainer}>
                                <Star size={16} color={Colors.warning} fill={Colors.warning} />
                                <Text style={s.ratingText}>{mentor.satisfaction}</Text>
                            </View>
                            <Text style={s.statLabel}>Rating</Text>
                        </View>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{mentor.specialty}</Text>
                            <Text style={s.statLabel}>Specialty</Text>
                        </View>
                    </View>
                </PremiumCard>

                <PremiumCard style={s.contactCard}>
                    <Text style={s.contactTitle}>Contact Information</Text>
                    <View style={s.contactItem}>
                        <Mail size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Email</Text>
                            <Text style={s.contactValue}>{mentor.email}</Text>
                        </View>
                    </View>
                    <View style={s.contactItem}>
                        <Phone size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Phone</Text>
                            <Text style={s.contactValue}>{mentor.phone}</Text>
                        </View>
                    </View>
                    <View style={s.contactItem}>
                        <Users size={20} color={Colors.primary} />
                        <View style={s.contactInfo}>
                            <Text style={s.contactLabel}>Joined</Text>
                            <Text style={s.contactValue}>{mentor.joinDate}</Text>
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
                        <TouchableOpacity style={s.actionBtn} onPress={handleViewPatients}>
                            <Users size={20} color={Colors.white} />
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
    ratingContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    ratingText: { ...Typography.h3, fontWeight: '700', fontSize: 16, color: Colors.warning },
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
