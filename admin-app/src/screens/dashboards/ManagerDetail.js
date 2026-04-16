import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { apiService, handleApiError } from '../../lib/api';
import { ArrowLeft, Mail, Phone, Calendar, Users, Activity, Trash2 } from 'lucide-react-native';
import { Feather } from '@expo/vector-icons';

export default function ManagerDetail({ route, navigation }) {
    const { managerId } = route.params;
    const { user } = useAuth();

    const [manager, setManager] = useState(null);
    const [loading, setLoading] = useState(true);

    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        if (deleteConfirmText !== 'DELETE') return;
        setDeleting(true);
        try {
            await apiService.profiles.delete(managerId);
            setDeleteModalVisible(false);
            Alert.alert('Deleted', 'The manager has been successfully deleted.');
            if (navigation.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.navigate('AdminSearch');
            }
        } catch (err) {
            Alert.alert('Error', handleApiError(err).message);
            setDeleting(false);
        }
    };

    React.useEffect(() => {
        const fetchManager = async () => {
            try {
                const res = await apiService.profiles.getById(managerId);
                const data = res.data.profile || res.data;

                setManager({
                    id: data._id,
                    name: data.fullName,
                    email: data.email,
                    phone: data.phone || 'N/A',
                    callers: data.metadata?.callersCount || 0,
                    patients: data.metadata?.patientsCount || 0,
                    load: data.metadata?.load || 0,
                    status: data.isActive !== false ? 'active' : 'inactive',
                    joinDate: new Date(data.createdAt).toLocaleDateString(),
                    department: 'Patient Care Services'
                });
            } catch (err) {
                console.error('Failed to load manager detail', err);
                Alert.alert('Error', handleApiError(err).message);
            } finally {
                setLoading(false);
            }
        };
        fetchManager();
    }, [managerId]);

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
                title={manager?.name || 'Loading...'}
                subtitle="Manager Details"
                colors={Colors.roleGradient.org_admin}
                onBack={() => navigation.goBack()}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                {loading || !manager ? (
                    <View style={{ paddingTop: Spacing.md }}>
                        <SkeletonLoader variant="card" />
                        <SkeletonLoader variant="card" style={{ marginTop: Spacing.md }} />
                    </View>
                ) : (
                    <>
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

                        {(user?.role === 'super_admin' || user?.role === 'org_admin') && (
                            <PremiumCard style={[s.actionsCard, { marginTop: 16, borderColor: '#EF4444', borderWidth: 1 }]}>
                                <Text style={[s.actionsTitle, { color: '#EF4444' }]}>Danger Zone</Text>
                                <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#FEF2F2', paddingVertical: 12, borderWidth: 1, borderColor: '#FECACA' }]} onPress={() => setDeleteModalVisible(true)}>
                                    <Feather name="trash-2" size={20} color="#EF4444" />
                                    <Text style={[s.actionText, { color: '#EF4444' }]}>Delete Manager</Text>
                                </TouchableOpacity>
                            </PremiumCard>
                        )}
                    </>
                )}
            </ScrollView>

            {/* Delete Modal */}
            <Modal visible={deleteModalVisible} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalIconFrame}>
                            <Feather name="alert-triangle" size={32} color="#EF4444" />
                        </View>
                        <Text style={s.modalTitle}>Delete Manager?</Text>
                        <Text style={s.modalDesc}>This action cannot be undone. Type DELETE to confirm.</Text>
                        <TextInput 
                            style={s.modalInput} 
                            value={deleteConfirmText} 
                            onChangeText={setDeleteConfirmText}
                            placeholder="DELETE"
                            autoCapitalize="characters"
                        />
                        <View style={s.modalBtnRow}>
                            <TouchableOpacity style={s.modalCancel} onPress={() => { setDeleteModalVisible(false); setDeleteConfirmText(''); }}>
                                <Text style={s.modalCancelTxt}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[s.modalDelete, deleteConfirmText !== 'DELETE' && { opacity: 0.5 }]} 
                                onPress={handleDelete}
                                disabled={deleteConfirmText !== 'DELETE' || deleting}
                            >
                                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={s.modalDeleteTxt}>Delete</Text>}
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

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', alignItems: 'center', ...Shadows.lg },
    modalIconFrame: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    modalDesc: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 20, paddingHorizontal: 10 },
    modalInput: { width: '100%', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center', marginBottom: 24 },
    modalBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
    modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
    modalCancelTxt: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    modalDelete: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#EF4444', alignItems: 'center' },
    modalDeleteTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
