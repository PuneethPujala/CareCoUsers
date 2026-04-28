import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import CustomAlertModal from '../../components/common/CustomAlertModal';
import { apiService, handleApiError } from '../../lib/api';
import { ArrowLeft, Mail, Phone, Heart, Calendar, Activity, CheckCircle, XCircle, Plus, Edit2, Trash2, Clock } from 'lucide-react-native';

const PHASE_TIMES = {
    morning: ['08:00 AM'],
    afternoon: ['01:00 PM'],
    night: ['08:00 PM']
};

export default function PatientDetail({ route, navigation }) {
    const { patientId } = route.params;
    const { user } = useAuth();
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Medication State
    const [medications, setMedications] = useState([]);
    const [showMedModal, setShowMedModal] = useState(false);
    const [editingMed, setEditingMed] = useState(null);
    const [medForm, setMedForm] = useState({ name: '', dosage: '', frequency: '', timePhase: 'morning' });

    const [customAlert, setCustomAlert] = useState({ visible: false, title: '', message: '', buttons: [], type: 'info' });

    const showAlert = (title, message, type = 'info', buttons = []) => {
        setCustomAlert({ visible: true, title, message, type, buttons });
    };

    const fetchData = async () => {
        try {
            const [patientRes, medsRes] = await Promise.all([
                apiService.patients.getById(patientId),
                apiService.caretaker.getPatientMeds(patientId).catch(() => ({ data: { medications: [] } }))
            ]);
            
            const data = patientRes.data.patient || patientRes.data;
            setPatient({
                id: data._id,
                name: data.fullName,
                age: data.metadata?.age || 'N/A',
                condition: data.metadata?.conditions?.[0] || 'Patient',
                adherence: data.metadata?.adherence || 'N/A',
                lastCall: 'N/A',
                email: data.email,
                phone: data.phone || 'N/A',
                status: data.isActive !== false ? 'active' : 'inactive',
                joinDate: new Date(data.createdAt).toLocaleDateString(),
                department: 'Patient Care Services'
            });

            const fetchedMeds = medsRes.data?.medications || data.metadata?.medications || [];
            setMedications(fetchedMeds);
        } catch (err) {
            console.error('Failed to load patient detail', err);
            showAlert('Error', handleApiError(err).message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [patientId]);

    const handleCall = () => {
        if (!patient || !patient.phone || patient.phone === 'N/A') {
            showAlert('Phone Number Missing', 'No phone number is available for this patient.', 'warning');
            return;
        }
        Linking.openURL(`tel:${patient.phone}`);
    };

    const handleEmail = () => {
        if (!patient || !patient.email) {
            showAlert('Email Missing', 'No email address is available for this patient.', 'warning');
            return;
        }
        Linking.openURL(`mailto:${patient.email}`);
    };

    const handleLogCall = async (status, outcome) => {
        setSubmitting(true);
        try {
            await apiService.caretaker.logCall({ patientId: patient.id, status, outcome });
            showAlert('Success', `Call logged as ${status}.`, 'success');
            navigation.goBack();
        } catch (err) {
            showAlert('Error', handleApiError(err).message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // --- Medication CRUD ---
    const openAddMedModal = () => {
        setEditingMed(null);
        setMedForm({ name: '', dosage: '', frequency: 'Daily', timePhase: 'morning' });
        setShowMedModal(true);
    };

    const openEditMedModal = (med) => {
        setEditingMed(med);
        let phase = 'morning';
        const times = med.scheduledTimes || [];
        if (times.includes('01:00 PM') || times.some(t => t.includes('PM') && !t.startsWith('08:00') && !t.startsWith('09:00') && !t.startsWith('10:00'))) phase = 'afternoon';
        if (times.includes('08:00 PM') || times.some(t => t.startsWith('08:00 PM') || t.startsWith('09:00 PM') || t.startsWith('10:00') || t.startsWith('11:00'))) phase = 'night';

        setMedForm({
            name: med.name || '',
            dosage: med.dosage || '',
            frequency: med.frequency || 'Daily',
            timePhase: phase
        });
        setShowMedModal(true);
    };

    const saveMedication = async () => {
        if (!medForm.name.trim() || !medForm.dosage.trim()) {
            showAlert('Validation Error', 'Please provide name and dosage.', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            const medData = {
                name: medForm.name,
                dosage: medForm.dosage,
                frequency: medForm.frequency,
                scheduledTimes: PHASE_TIMES[medForm.timePhase],
                startDate: new Date()
            };

            if (editingMed) {
                await apiService.caretaker.updateMedication(patient.id, editingMed._id || editingMed.id, medData);
            } else {
                await apiService.caretaker.addMedication(patient.id, medData);
            }
            setShowMedModal(false);
            fetchData();
        } catch (err) {
            showAlert('Error', handleApiError(err).message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const deleteMedication = (med) => {
        showAlert('Remove Medication', `Remove ${med.name}?`, 'destructive', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Remove', 
                style: 'destructive', 
                onPress: async () => {
                    try {
                        await apiService.caretaker.deleteMedication(patient.id, med._id || med.id);
                        fetchData();
                    } catch (err) {
                        showAlert('Error', handleApiError(err).message, 'error');
                    }
                } 
            }
        ]);
    };

    return (
        <View style={s.container}>
            <GradientHeader title={patient?.name || 'Loading...'} subtitle="Patient Details" colors={Colors.roleGradient.org_admin} onBack={() => navigation.goBack()} />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                {loading || !patient ? (
                    <View style={{ paddingTop: Spacing.md }}><SkeletonLoader variant="card" /><SkeletonLoader variant="card" style={{ marginTop: Spacing.md }} /></View>
                ) : (
                    <>
                        <View style={s.profileCard}>
                            <View style={s.avatarContainer}>
                                <View style={s.avatar}><Heart size={24} color={Colors.white} /></View>
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
                                <View style={s.statItem}><Text style={s.statValue}>{patient.age}</Text><Text style={s.statLabel}>Age</Text></View>
                                <View style={s.statItem}><Text style={s.statValue}>{patient.adherence}%</Text><Text style={s.statLabel}>Adherence</Text></View>
                                <View style={s.statItem}><Text style={s.statValue}>{patient.lastCall}</Text><Text style={s.statLabel}>Last Call</Text></View>
                            </View>
                        </PremiumCard>

                        {/* Medications Management */}
                        <PremiumCard style={s.medsCard}>
                            <View style={s.sectionHeader}>
                                <Text style={s.contactTitle}>Prescribed Medications</Text>
                                <TouchableOpacity style={s.addBtn} onPress={openAddMedModal}>
                                    <Plus size={16} color={Colors.white} />
                                    <Text style={s.addBtnText}>Add Med</Text>
                                </TouchableOpacity>
                            </View>

                            {medications.length === 0 ? (
                                <Text style={s.emptyMeds}>No medications recorded.</Text>
                            ) : (
                                medications.map((med, idx) => (
                                    <View key={med._id || med.id || idx} style={[s.medRow, idx > 0 && s.medDivider]}>
                                        <View style={s.medInfo}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                                                <Text style={s.medName}>{med.name} <Text style={s.medDosage}>{med.dosage}</Text></Text>
                                                {(() => {
                                                    const today = new Date().toDateString();
                                                    const confirmedToday = med.lastConfirmed && med.lastConfirmedAt && new Date(med.lastConfirmedAt).toDateString() === today;

                                                    if (med.patientMarked) {
                                                        return (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4 }}>
                                                                <CheckCircle size={10} color="#10B981" />
                                                                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: 'bold' }}>Marked by Patient</Text>
                                                            </View>
                                                        );
                                                    } else if (confirmedToday) {
                                                        return (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4 }}>
                                                                <CheckCircle size={10} color="#6366F1" />
                                                                <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: 'bold' }}>Marked by Caller</Text>
                                                            </View>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </View>
                                            <View style={s.medSubInfo}>
                                                <Clock size={12} color={Colors.textMuted} />
                                                <Text style={s.medTime}>
                                                    {med.scheduledTimes?.length > 0 ? med.scheduledTimes.join(', ') : 'No time scheduled'}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={s.medRowActions}>
                                            <TouchableOpacity onPress={() => openEditMedModal(med)} style={s.iconBtn}>
                                                <Edit2 size={18} color={Colors.primary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => deleteMedication(med)} style={s.iconBtn}>
                                                <Trash2 size={18} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))
                            )}
                        </PremiumCard>

                        <PremiumCard style={s.contactCard}>
                            <Text style={s.contactTitle}>Contact Information</Text>
                            <View style={s.contactItem}><Mail size={20} color={Colors.primary} /><View style={s.contactInfo}><Text style={s.contactLabel}>Email</Text><Text style={s.contactValue}>{patient.email}</Text></View></View>
                            <View style={s.contactItem}><Phone size={20} color={Colors.primary} /><View style={s.contactInfo}><Text style={s.contactLabel}>Phone</Text><Text style={s.contactValue}>{patient.phone}</Text></View></View>
                        </PremiumCard>

                        <PremiumCard style={s.actionsCard}>
                            <Text style={s.actionsTitle}>Quick Actions</Text>
                            <View style={s.actionsGrid}>
                                <TouchableOpacity style={s.actionBtn} onPress={handleCall}><Phone size={20} color={Colors.white} /><Text style={s.actionText}>Call Mobile</Text></TouchableOpacity>
                                <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#64748B' }]} onPress={handleEmail}><Mail size={20} color={Colors.white} /><Text style={s.actionText}>Email</Text></TouchableOpacity>
                            </View>
                        </PremiumCard>

                        <PremiumCard style={s.actionsCard}>
                            <Text style={s.actionsTitle}>Log Call Outcome</Text>
                            <Text style={s.subtitle}>After calling, log the result to update the queue.</Text>
                            <View style={s.actionsGrid}>
                                <TouchableOpacity style={[s.outcomeBtn, { backgroundColor: '#10B981' }]} onPress={() => handleLogCall('completed', 'answered_completed')} disabled={submitting}>
                                    {submitting ? <ActivityIndicator color="#fff" /> : <CheckCircle size={20} color={Colors.white} />}<Text style={s.actionText}>Mark Completed</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.outcomeBtn, { backgroundColor: '#F59E0B' }]} onPress={() => handleLogCall('missed', 'no_answer')} disabled={submitting}>
                                    {submitting ? <ActivityIndicator color="#fff" /> : <XCircle size={20} color={Colors.white} />}<Text style={s.actionText}>No Answer (Skip)</Text>
                                </TouchableOpacity>
                            </View>
                        </PremiumCard>
                    </>
                )}
            </ScrollView>

            {/* Medication Modal */}
            <Modal visible={showMedModal} transparent={true} animationType="fade" onRequestClose={() => setShowMedModal(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <Text style={s.modalTitle}>{editingMed ? 'Edit Medication' : 'Add Medication'}</Text>
                        
                        <Text style={s.inputLabel}>Medication Name</Text>
                        <TextInput style={s.input} placeholder="e.g. Metformin" value={medForm.name} onChangeText={(t) => setMedForm({...medForm, name: t})} />
                        
                        <Text style={s.inputLabel}>Dosage</Text>
                        <TextInput style={s.input} placeholder="e.g. 500mg" value={medForm.dosage} onChangeText={(t) => setMedForm({...medForm, dosage: t})} />
                        
                        <Text style={s.inputLabel}>Time Phase</Text>
                        <View style={s.phaseOptions}>
                            {['morning', 'afternoon', 'night'].map(phase => (
                                <TouchableOpacity 
                                    key={phase} 
                                    style={[s.phaseBtn, medForm.timePhase === phase && s.phaseBtnActive]}
                                    onPress={() => setMedForm({...medForm, timePhase: phase})}>
                                    <Text style={[s.phaseBtnTxt, medForm.timePhase === phase && s.phaseBtnTxtActive]}>
                                        {phase.charAt(0).toUpperCase() + phase.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        
                        <View style={s.modalActions}>
                            <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.surfaceAlt }]} onPress={() => setShowMedModal(false)}><Text style={{ color: Colors.textMuted, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.primary }]} onPress={saveMedication} disabled={submitting}>
                                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: Colors.white, fontWeight: '600' }}>{editingMed ? 'Update' : 'Add'}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <CustomAlertModal
                {...customAlert}
                onClose={() => setCustomAlert({ ...customAlert, visible: false })}
            />
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
    medsCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.md },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    contactTitle: { ...Typography.h3, color: Colors.textPrimary },
    addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
    addBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700', marginLeft: 4 },
    emptyMeds: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', padding: Spacing.md },
    medRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
    medDivider: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    medInfo: { flex: 1 },
    medName: { ...Typography.bodySemibold, color: Colors.textPrimary, marginBottom: 2 },
    medDosage: { fontWeight: '400', color: Colors.textMuted },
    medSubInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    medTime: { fontSize: 12, color: Colors.textMuted },
    medRowActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    iconBtn: { padding: 4 },
    contactCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.md },
    contactItem: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
    contactInfo: { flex: 1, marginLeft: Spacing.md },
    contactLabel: { ...Typography.caption, color: Colors.textMuted, width: 80 },
    contactValue: { ...Typography.body, color: Colors.textPrimary },
    actionsCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.md },
    actionsTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.xs },
    subtitle: { ...Typography.caption, color: Colors.textMuted, marginBottom: Spacing.md },
    actionsGrid: { flexDirection: 'row', gap: Spacing.md },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.md, ...Shadows.sm },
    outcomeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, paddingVertical: Spacing.md, ...Shadows.sm },
    actionText: { ...Typography.button, color: Colors.white, marginLeft: Spacing.sm },
    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.xl },
    modalContent: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.xl },
    modalTitle: { ...Typography.h2, color: Colors.textPrimary, marginBottom: Spacing.lg, textAlign: 'center' },
    inputLabel: { ...Typography.captionBold, color: Colors.textSecondary, marginBottom: 6 },
    input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md, ...Typography.body },
    phaseOptions: { flexDirection: 'row', gap: 8, marginBottom: Spacing.xl },
    phaseBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: Radius.sm, alignItems: 'center' },
    phaseBtnActive: { backgroundColor: '#EEF2FF', borderColor: Colors.primary },
    phaseBtnTxt: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
    phaseBtnTxtActive: { color: Colors.primary },
    modalActions: { flexDirection: 'row', gap: Spacing.md },
    modalBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' }
});
