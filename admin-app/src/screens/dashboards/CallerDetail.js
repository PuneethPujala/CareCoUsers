import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { apiService, handleApiError } from '../../lib/api';
import { ArrowLeft, Mail, Phone, Activity, TrendingUp, AlertTriangle, Trash2 } from 'lucide-react-native';

import { Feather } from '@expo/vector-icons';
import { Modal, TextInput } from 'react-native';

export default function CallerDetail({ route, navigation }) {
    const { callerId } = route.params;
    const { user } = useAuth();

    const [caller, setCaller] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deleteText, setDeleteText] = useState('');
    const [deleting, setDeleting] = useState(false);

    React.useEffect(() => {
        const fetchCaller = async () => {
            try {
                const res = await apiService.profiles.getById(callerId);
                const data = res.data.profile || res.data;

                setCaller({
                    id: data._id,
                    name: data.fullName,
                    email: data.email,
                    phone: data.phone || 'N/A',
                    calls: data.metadata?.callsToday || data.metadata?.totalCalls || 0,
                    patients: data.metadata?.assignedPatients || 0,
                    performance: data.metadata?.score || 'N/A',
                    status: data.isActive !== false ? 'active' : 'inactive',
                    joinDate: new Date(data.createdAt).toLocaleDateString(),
                    department: 'Patient Outreach Services'
                });
            } catch (err) {
                console.error('Failed to load caller detail', err);
                Alert.alert('Error', handleApiError(err).message);
            } finally {
                setLoading(false);
            }
        };
        fetchCaller();
    }, [callerId]);

    const handleCall = () => {
        Alert.alert('Call Caller', `Calling ${caller.name} at ${caller.phone}...`);
    };

    const handleEmail = () => {
        Alert.alert('Email Caller', `Sending email to ${caller.email}...`);
    };

    const handleViewPerformance = () => {
        Alert.alert('Performance', `${caller.name} has a performance score of ${caller.performance}%...`);
    };

    const handleDeleteUser = async () => {
        if (deleteText !== 'DELETE') return;
        setDeleting(true);
        try {
            await apiService.profiles.delete(callerId);
            setDeleteModalVisible(false);
            Alert.alert('Success', 'User has been permanently deleted.');
            if (navigation.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.replace('TeamListScreen');
            }
        } catch (error) {
            console.error('Failed to delete user:', error);
            Alert.alert('Error', handleApiError(error).message);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <View style={s.container}>
            <GradientHeader
                title={caller?.name || 'Loading...'}
                subtitle="Caller Details"
                colors={Colors.roleGradient.org_admin}
                onBack={() => navigation.goBack()}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                {loading || !caller ? (
                    <View style={{ paddingTop: Spacing.md }}>
                        <SkeletonLoader variant="card" />
                        <SkeletonLoader variant="card" style={{ marginTop: Spacing.md }} />
                    </View>
                ) : (
                    <>
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

                        <View style={s.dangerZone}>
                            <Text style={s.dangerTitle}>Account Management</Text>
                            <PremiumCard style={s.dangerCard}>
                                <View style={s.dangerHeader}>
                                    <Feather name="shield" size={22} color="#0F172A" style={{ marginRight: 12 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.dangerActionTitle}>Delete User Account</Text>
                                        <Text style={s.dangerActionDesc}>
                                            This action is irreversible. All data, assignments, and histories will be permanently removed.
                                        </Text>
                                    </View>
                                </View>
                                <TouchableOpacity style={s.deleteBtn} onPress={() => {
                                    setDeleteText('');
                                    setDeleteModalVisible(true);
                                }}>
                                    <Feather name="trash-2" size={18} color="#FFFFFF" />
                                    <Text style={s.deleteBtnText}>Delete Contact</Text>
                                </TouchableOpacity>
                            </PremiumCard>
                        </View>
                    </>
                )}
            </ScrollView>

            <Modal
                animationType="fade"
                transparent={true}
                visible={deleteModalVisible}
                onRequestClose={() => setDeleteModalVisible(false)}
            >
                <View style={s.modalOverlay}>
                    <View style={s.modalContainer}>
                        <View style={s.modalIconWrap}>
                            <Feather name="alert-triangle" size={32} color="#0F172A" />
                        </View>
                        <Text style={s.modalTitle}>Delete {caller?.name}?</Text>
                        <Text style={s.modalDesc}>
                            This action cannot be undone. To confirm deletion, please type <Text style={{ fontWeight: '800', color: '#EF4444' }}>DELETE</Text> below.
                        </Text>
                        
                        <TextInput 
                            style={s.modalInput}
                            placeholder="Type DELETE to confirm"
                            placeholderTextColor="#94A3B8"
                            value={deleteText}
                            onChangeText={setDeleteText}
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />

                        <View style={s.modalActions}>
                            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setDeleteModalVisible(false)}>
                                <Text style={s.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[s.modalConfirmBtn, deleteText !== 'DELETE' && s.modalConfirmDisabled]}
                                onPress={handleDeleteUser}
                                disabled={deleteText !== 'DELETE' || deleting}
                            >
                                <Text style={[s.modalConfirmText, deleteText !== 'DELETE' && { color: '#94A3B8' }]}>
                                    {deleting ? 'Deleting...' : 'Confirm'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
       // Danger Zone (Professional Grayscale/Dark)
    dangerZone: { marginTop: Spacing.xl, marginBottom: Spacing.xl },
    dangerTitle: { fontSize: 13, fontWeight: '800', color: '#64748B', marginBottom: 12, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    dangerCard: { 
        backgroundColor: '#FFFFFF', 
        borderColor: '#E2E8F0', borderWidth: 1,
        borderRadius: 24, padding: 24, 
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.03, shadowRadius: 16, elevation: 2
    },
    dangerHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
    dangerActionTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 4, letterSpacing: -0.3 },
    dangerActionDesc: { fontSize: 14, color: '#64748B', lineHeight: 20, fontWeight: '500' },
    deleteBtn: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0F172A', borderRadius: 16, 
        paddingVertical: 16, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4
    },
    deleteBtnText: { fontSize: 16, color: '#fff', marginLeft: 10, fontWeight: '700' },

    // Glass Modal
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContainer: { 
        width: '100%', maxWidth: 400, 
        backgroundColor: '#FFFFFF', borderRadius: 32, 
        padding: 32, alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.2, shadowRadius: 40, elevation: 10
    },
    modalIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#F1F5F9' },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 10, textAlign: 'center', letterSpacing: -0.5 },
    modalDesc: { fontSize: 15, fontWeight: '500', color: '#64748B', textAlign: 'center', marginBottom: 28, lineHeight: 22 },
    modalInput: {
        width: '100%', backgroundColor: '#F8FAFC', 
        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16,
        padding: 18, fontSize: 16, fontWeight: '700', textAlign: 'center', color: '#0F172A',
        marginBottom: 28
    },
    modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
    modalCancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#F8FAFC', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    modalCancelText: { fontSize: 16, fontWeight: '700', color: '#475569' },
    modalConfirmBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: '#0F172A', alignItems: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 },
    modalConfirmDisabled: { backgroundColor: '#E2E8F0', shadowOpacity: 0 },
    modalConfirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
