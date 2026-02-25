import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput, Modal } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';

import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const PATIENTS = [
    { 
        id: 'p1', 
        name: 'Robert Williams', 
        status: 'stable', 
        adherence: 92, 
        lastCall: 'Today, 9:30 AM',
        conditions: ['Type 2 Diabetes', 'Hypertension'],
        medications: ['Metformin 500mg', 'Lisinopril 10mg', 'Atorvastatin 20mg']
    },
    { 
        id: 'p2', 
        name: 'Margaret Chen', 
        status: 'attention', 
        adherence: 68, 
        lastCall: 'Yesterday',
        conditions: ['Hypertension', 'High Cholesterol'],
        medications: ['Lisinopril 10mg', 'Aspirin 81mg']
    },
    { 
        id: 'p3', 
        name: 'James Wilson', 
        status: 'stable', 
        adherence: 85, 
        lastCall: 'Today, 11:00 AM',
        conditions: ['High Cholesterol'],
        medications: ['Atorvastatin 20mg']
    },
];

const HISTORY = [
    { id: 1, patient: 'Robert Williams', date: 'Today', time: '9:30 AM', duration: '12 min', mood: '😊', outcome: 'Good' },
    { id: 2, patient: 'Margaret Chen', date: 'Yesterday', time: '2:00 PM', duration: '18 min', mood: '😐', outcome: 'Concern raised' },
];

const SUMMARY = { calls: 24, avgDuration: '14 min', adherence: '82%', concerns: 2 };

export default function MentorDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [showPatientDetailModal, setShowPatientDetailModal] = useState(false);
    const [showDeleteMedModal, setShowDeleteMedModal] = useState(false);
    const [showDeleteConditionModal, setShowDeleteConditionModal] = useState(false);
    const [selectedMed, setSelectedMed] = useState(null);
    const [selectedCondition, setSelectedCondition] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [deleteReasonType, setDeleteReasonType] = useState('');

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const openPatientDetail = (patient) => {
        setSelectedPatient(patient);
        setShowPatientDetailModal(true);
    };

    const openDeleteMedModal = (med) => {
        setSelectedMed(med);
        setDeleteReasonType('');
        setDeleteReason('');
        setShowDeleteMedModal(true);
    };

    const openDeleteConditionModal = (condition) => {
        setSelectedCondition(condition);
        setDeleteReasonType('');
        setDeleteReason('');
        setShowDeleteConditionModal(true);
    };

    const deleteMedication = () => {
        if (selectedPatient && selectedMed && deleteReasonType) {
            if (deleteReasonType === 'other' && !deleteReason.trim()) {
                Alert.alert('Reason Required', 'Please specify the reason for deletion.');
                return;
            }
            // Remove medication from patient
            selectedPatient.medications = selectedPatient.medications.filter(m => m !== selectedMed);
            setSelectedPatient({...selectedPatient});
            setSelectedMed(null);
            setDeleteReason('');
            setDeleteReasonType('');
            setShowDeleteMedModal(false);
        }
    };

    const deleteCondition = () => {
        if (selectedPatient && selectedCondition && deleteReasonType) {
            if (deleteReasonType === 'other' && !deleteReason.trim()) {
                Alert.alert('Reason Required', 'Please specify the reason for deletion.');
                return;
            }
            // Remove condition from patient
            selectedPatient.conditions = selectedPatient.conditions.filter(c => c !== selectedCondition);
            setSelectedPatient({...selectedPatient});
            setSelectedCondition(null);
            setDeleteReason('');
            setDeleteReasonType('');
            setShowDeleteConditionModal(false);
        }
    };



    return (
        <View style={s.container}>
            <GradientHeader
                title={`Hi, ${user?.name?.split(' ')[0] || 'Mentor'}`}
                subtitle="Patient Mentor"
                colors={Colors.roleGradient.mentor}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20 }}>🔔</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                {loading ? (
                    <View style={{ paddingTop: Spacing.md, gap: Spacing.md }}>
                        <SkeletonLoader variant="card" />
                        <SkeletonLoader variant="card" />
                    </View>
                ) : (
                    <>
                        {/* Weekly Summary */}
                        <View>
                            <PremiumCard style={s.summaryCard}>
                                <Text style={s.summaryTitle}>Weekly Summary</Text>
                                <View style={s.summaryGrid}>
                                    <View style={s.summaryItem}><Text style={s.sumVal}>{SUMMARY.calls}</Text><Text style={s.sumLabel}>Calls</Text></View>
                                    <View style={s.summaryItem}><Text style={s.sumVal}>{SUMMARY.avgDuration}</Text><Text style={s.sumLabel}>Avg Duration</Text></View>
                                    <View style={s.summaryItem}><Text style={s.sumVal}>{SUMMARY.adherence}</Text><Text style={s.sumLabel}>Adherence</Text></View>
                                    <View style={s.summaryItem}><Text style={s.sumVal}>{SUMMARY.concerns}</Text><Text style={s.sumLabel}>Concerns</Text></View>
                                </View>
                            </PremiumCard>
                        </View>

                        {/* Patients */}
                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>My Patients</Text>
                                <StatusBadge label={`${PATIENTS.length} assigned`} variant="primary" />
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {PATIENTS.map((p, i) => (
                                    <React.Fragment key={p.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <TouchableOpacity style={s.patRow} activeOpacity={0.7}
                                            onPress={() => openPatientDetail(p)}>
                                            <View style={s.patAvatar}><Text style={s.patAvatarText}>{p.name.charAt(0)}</Text></View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.patName}>{p.name}</Text>
                                                <Text style={s.patSub}>Last call: {p.lastCall}</Text>
                                                <View style={s.patInfo}>
                                                    <Text style={s.patInfoText}>🏥 {p.conditions.length} conditions</Text>
                                                    <Text style={s.patInfoText}>💊 {p.medications.length} medications</Text>
                                                </View>
                                            </View>
                                            <StatusBadge label={p.status === 'stable' ? 'Stable' : 'Attention'} variant={p.status === 'stable' ? 'success' : 'warning'} />
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        {/* Call History */}
                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Recent Calls</Text>
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {HISTORY.map((h, i) => (
                                    <React.Fragment key={h.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <View style={s.histRow}>
                                            <Text style={s.histMood}>{h.mood}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.histName}>{h.patient}</Text>
                                                <Text style={s.histSub}>{h.date} · {h.time} · {h.duration}</Text>
                                            </View>
                                            <StatusBadge label={h.outcome} variant={h.outcome === 'Good' ? 'success' : 'warning'} />
                                        </View>
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        {/* Actions */}
                        <View style={s.actionRow}>
                            <TouchableOpacity style={s.actionBtn} activeOpacity={0.8}
                                onPress={() => Alert.alert('Message Sent', 'Your manager has been notified.')}>
                                <Text style={s.actionIcon}>💬</Text>
                                <Text style={s.actionText}>Message Manager</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.actionBtn, s.actionBtnAlt]} activeOpacity={0.8}
                                onPress={() => Alert.alert('Concern Submitted', 'Your concern has been recorded.')}>
                                <Text style={s.actionIcon}>🚨</Text>
                                <Text style={[s.actionText, { color: Colors.warning }]}>Submit Concern</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Patient Detail Modal */}
            <Modal
                visible={showPatientDetailModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowPatientDetailModal(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        {selectedPatient && (
                            <>
                                <View style={s.modalHeader}>
                                    <Text style={s.modalTitle}>{selectedPatient.name}</Text>
                                    <TouchableOpacity style={s.closeBtn} onPress={() => setShowPatientDetailModal(false)}>
                                        <Text style={s.closeBtnText}>✕</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={s.modalSection}>
                                    <Text style={s.modalSectionTitle}>Health Conditions</Text>
                                    <View style={s.modalList}>
                                        {selectedPatient.conditions.map((condition, i) => (
                                            <View key={i} style={s.modalListItem}>
                                                <Text style={s.modalListItemText}>🏥 {condition}</Text>
                                                <View style={s.modalItemActions}>
                                                    <TouchableOpacity 
                                                        style={s.deleteBtn} 
                                                        onPress={() => openDeleteConditionModal(condition)}
                                                        activeOpacity={0.7}>
                                                        <Text style={s.deleteBtnText}>❌</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={s.modalSection}>
                                    <Text style={s.modalSectionTitle}>Medications</Text>
                                    <View style={s.modalList}>
                                        {selectedPatient.medications.map((med, i) => (
                                            <View key={i} style={s.modalListItem}>
                                                <Text style={s.modalListItemText}>💊 {med}</Text>
                                                <View style={s.modalItemActions}>
                                                    <TouchableOpacity 
                                                        style={s.deleteBtn} 
                                                        onPress={() => openDeleteMedModal(med)}
                                                        activeOpacity={0.7}>
                                                        <Text style={s.deleteBtnText}>❌</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={s.modalFooter}>
                                    <Text style={s.modalFooterText}>
                                        Adherence: {selectedPatient.adherence}% • Last call: {selectedPatient.lastCall}
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Delete Medication Modal */}
            <Modal
                visible={showDeleteMedModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowDeleteMedModal(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <Text style={s.modalTitle}>Remove Medication</Text>
                        <Text style={s.modalSubtitle}>Why are you removing this medication?</Text>
                        
                        <View style={s.reasonOptions}>
                            {[
                                { value: 'side_effects', label: 'Side effects' },
                                { value: 'no_longer_needed', label: 'No longer needed' },
                                { value: 'doctor_changed', label: 'Doctor changed prescription' },
                                { value: 'allergic_reaction', label: 'Allergic reaction' },
                                { value: 'ineffective', label: 'Not effective' },
                                { value: 'other', label: 'Other reason' }
                            ].map(option => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[s.reasonOption, deleteReasonType === option.value && s.reasonOptionSelected]}
                                    onPress={() => setDeleteReasonType(option.value)}
                                    activeOpacity={0.7}>
                                    <Text style={[s.reasonOptionText, deleteReasonType === option.value && s.reasonOptionTextSelected]}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {deleteReasonType === 'other' && (
                            <TextInput
                                style={s.modalInput}
                                placeholder="Please specify the reason"
                                value={deleteReason}
                                onChangeText={setDeleteReason}
                                multiline={true}
                                numberOfLines={3}
                            />
                        )}

                        <View style={s.modalActions}>
                            <TouchableOpacity style={[s.modalBtn, s.cancelBtn]} onPress={() => setShowDeleteMedModal(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.modalBtn, s.deleteModalBtn]} onPress={deleteMedication}>
                                <Text style={s.deleteModalBtnText}>Remove</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Delete Condition Modal */}
            <Modal
                visible={showDeleteConditionModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowDeleteConditionModal(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <Text style={s.modalTitle}>Remove Health Condition</Text>
                        <Text style={s.modalSubtitle}>Why are you removing this condition?</Text>
                        
                        <View style={s.reasonOptions}>
                            {[
                                { value: 'cured', label: 'Condition cured' },
                                { value: 'misdiagnosed', label: 'Misdiagnosed' },
                                { value: 'transferred_care', label: 'Transferred to different care' },
                                { value: 'resolved_treatment', label: 'Resolved with treatment' },
                                { value: 'other', label: 'Other reason' }
                            ].map(option => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[s.reasonOption, deleteReasonType === option.value && s.reasonOptionSelected]}
                                    onPress={() => setDeleteReasonType(option.value)}
                                    activeOpacity={0.7}>
                                    <Text style={[s.reasonOptionText, deleteReasonType === option.value && s.reasonOptionTextSelected]}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {deleteReasonType === 'other' && (
                            <TextInput
                                style={s.modalInput}
                                placeholder="Please specify the reason"
                                value={deleteReason}
                                onChangeText={setDeleteReason}
                                multiline={true}
                                numberOfLines={3}
                            />
                        )}

                        <View style={s.modalActions}>
                            <TouchableOpacity style={[s.modalBtn, s.cancelBtn]} onPress={() => setShowDeleteConditionModal(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.modalBtn, s.deleteModalBtn]} onPress={deleteCondition}>
                                <Text style={s.deleteModalBtnText}>Remove</Text>
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
    // Summary
    summaryCard: { marginTop: Spacing.md },
    summaryTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.md },
    summaryGrid: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryItem: { alignItems: 'center' },
    sumVal: { ...Typography.h2, color: Colors.textPrimary },
    sumLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    // Section
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Patient
    patRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    patAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    patAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    patName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    patSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    // History
    histRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    histMood: { fontSize: 24 },
    histName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    histSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    // Actions
    actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.surfaceAlt },
    actionBtnAlt: { backgroundColor: Colors.warningLight },
    actionIcon: { fontSize: 18 },
    actionText: { ...Typography.bodySemibold, color: Colors.primary, fontSize: 14 },
    // Patient Info
    patInfo: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
    patInfoText: { ...Typography.tiny, color: Colors.textMuted },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.lg },
    modalContent: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, width: '100%', maxWidth: 500, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
    closeBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    closeBtnText: { fontSize: 18, color: Colors.textMuted },
    modalSection: { marginBottom: Spacing.lg },
    modalSectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.md },
    modalList: { gap: Spacing.sm },
    modalListItem: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        paddingVertical: Spacing.sm 
    },
    modalItemActions: { 
        flexShrink: 0
    },
    modalListItemText: { ...Typography.body, color: Colors.textSecondary },
    modalFooter: { paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight },
    modalFooterText: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
    // Delete Button
    deleteBtn: { 
        width: 32, 
        height: 32, 
        borderRadius: Radius.full, 
        backgroundColor: Colors.errorLight, 
        justifyContent: 'center', 
        alignItems: 'center'
    },
    deleteBtnText: { 
        fontSize: 16, 
        color: Colors.error
    },
    // Delete Modal
    modalSubtitle: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
    reasonOptions: { gap: Spacing.sm, marginBottom: Spacing.lg },
    reasonOption: { 
        padding: Spacing.md, 
        borderRadius: Radius.md, 
        borderWidth: 1, 
        borderColor: Colors.border,
        backgroundColor: Colors.surface
    },
    reasonOptionSelected: { 
        borderColor: Colors.primary, 
        backgroundColor: Colors.primaryLight 
    },
    reasonOptionText: { ...Typography.body, color: Colors.textPrimary },
    reasonOptionTextSelected: { ...Typography.body, color: Colors.primary, fontWeight: '600' },
    modalInput: { 
        borderWidth: 1, 
        borderColor: Colors.border, 
        borderRadius: Radius.md, 
        padding: Spacing.md, 
        marginBottom: Spacing.lg,
        ...Typography.body,
        color: Colors.textPrimary
    },
    modalActions: { flexDirection: 'row', gap: Spacing.sm },
    modalBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center' },
    cancelBtn: { backgroundColor: Colors.surfaceAlt },
    cancelBtnText: { ...Typography.body, color: Colors.textMuted },
    deleteModalBtn: { backgroundColor: Colors.error },
    deleteModalBtnText: { ...Typography.body, color: '#fff', fontWeight: '600' },
});
