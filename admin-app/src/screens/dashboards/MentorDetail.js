import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { apiService, handleApiError } from '../../lib/api';
import { ArrowLeft, Mail, Phone, Star, Users } from 'lucide-react-native';

export default function MentorDetail({ route, navigation }) {
    const { mentorId } = route.params;
    const { user } = useAuth();

    const [mentor, setMentor] = useState(null);
    const [loading, setLoading] = useState(true);

    React.useEffect(() => {
        const fetchMentor = async () => {
            try {
                const res = await apiService.profiles.getById(mentorId);
                const data = res.data.profile || res.data;

                setMentor({
                    id: data._id,
                    name: data.fullName,
                    email: data.email,
                    phone: data.phone || 'N/A',
                    patients: data.metadata?.menteesCount || 0,
                    satisfaction: data.metadata?.rating || 4.5,
                    specialty: data.metadata?.specialty || 'General Practice',
                    status: data.isActive !== false ? 'active' : 'inactive',
                    joinDate: new Date(data.createdAt).toLocaleDateString(),
                    department: 'Patient Mentor Services'
                });
            } catch (err) {
                console.error('Failed to load mentor detail', err);
                Alert.alert('Error', handleApiError(err).message);
            } finally {
                setLoading(false);
            }
        };
        fetchMentor();
    }, [mentorId]);

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
                title={mentor?.name || 'Loading...'}
                subtitle="Mentor Details"
                colors={Colors.roleGradient.org_admin}
                onBack={() => navigation.goBack()}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                {loading || !mentor ? (
                    <View style={{ paddingTop: Spacing.md }}>
                        <SkeletonLoader variant="card" />
                        <SkeletonLoader variant="card" style={{ marginTop: Spacing.md }} />
                    </View>
                ) : (
                    <>
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
                    </>
                )}
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
