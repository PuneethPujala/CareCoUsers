import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput, Modal } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';

import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import PatientHealthView from '../../components/common/PatientHealthView';

const PATIENTS = [
    {
        id: 'p1',
        name: 'Robert Williams',
        status: 'stable',
        adherence: 92,
        lastCall: 'Today, 9:30 AM',
        conditions: [
            { id: 'c1', condition: 'Type 2 Diabetes', diagnosedDate: '2022-03-15', severity: 'Moderate', status: 'active' },
            { id: 'c2', condition: 'Hypertension', diagnosedDate: '2021-08-22', severity: 'Mild', status: 'active' },
        ],
        medications: [
            { id: 'm1', name: 'Metformin 500mg', frequency: 'Twice daily', addedDate: '2022-03-15', adherence: 94 },
            { id: 'm2', name: 'Lisinopril 10mg', frequency: 'Once daily', addedDate: '2021-08-22', adherence: 88 },
            { id: 'm3', name: 'Atorvastatin 20mg', frequency: 'Once daily', addedDate: '2023-01-10', adherence: 92 },
        ]
    },
    {
        id: 'p2',
        name: 'Margaret Chen',
        status: 'attention',
        adherence: 68,
        lastCall: 'Yesterday',
        conditions: [
            { id: 'c3', condition: 'Hypertension', diagnosedDate: '2020-06-10', severity: 'Moderate', status: 'active' },
            { id: 'c4', condition: 'High Cholesterol', diagnosedDate: '2021-11-05', severity: 'Mild', status: 'managed' },
        ],
        medications: [
            { id: 'm4', name: 'Lisinopril 10mg', frequency: 'Once daily', addedDate: '2020-06-10', adherence: 72 },
            { id: 'm5', name: 'Aspirin 81mg', frequency: 'Once daily', addedDate: '2021-11-05', adherence: 65 },
        ]
    },
    {
        id: 'p3',
        name: 'James Wilson',
        status: 'stable',
        adherence: 85,
        lastCall: 'Today, 11:00 AM',
        conditions: [
            { id: 'c5', condition: 'High Cholesterol', diagnosedDate: '2023-02-20', severity: 'Mild', status: 'managed' },
        ],
        medications: [
            { id: 'm6', name: 'Atorvastatin 20mg', frequency: 'Once daily', addedDate: '2023-02-20', adherence: 85 },
        ]
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
    const [patients, setPatients] = useState(PATIENTS);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [showPatientDetailModal, setShowPatientDetailModal] = useState(false);

    // Delete modals
    const [showDeleteMedModal, setShowDeleteMedModal] = useState(false);
    const [showDeleteConditionModal, setShowDeleteConditionModal] = useState(false);
    const [selectedMed, setSelectedMed] = useState(null);
    const [selectedCondition, setSelectedCondition] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [deleteReasonType, setDeleteReasonType] = useState('');

    // Add modals
    const [showAddMedModal, setShowAddMedModal] = useState(false);
    const [showAddConditionModal, setShowAddConditionModal] = useState(false);
    const [newMed, setNewMed] = useState('');
    const [newMedFrequency, setNewMedFrequency] = useState('');
    const [newCondition, setNewCondition] = useState('');
    const [newConditionSeverity, setNewConditionSeverity] = useState('Mild');

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const openPatientDetail = (patient) => {
        setSelectedPatient({ ...patient });
        setShowPatientDetailModal(true);
    };

    // ─── Add Handlers ──────────────────────────────────────
    const addMedication = () => {
        if (!newMed.trim()) return;
        if (!selectedPatient) return;

        const duplicate = selectedPatient.medications.some(
            m => m.name.toLowerCase() === newMed.toLowerCase().trim()
        );
        if (duplicate) {
            Alert.alert('Duplicate Medication', 'This medication is already in the patient\'s list.');
            return;
        }

        const newMedication = {
            id: `m_${Date.now()}`,
            name: newMed.trim(),
            frequency: newMedFrequency.trim() || 'As prescribed',
            addedDate: new Date().toISOString().split('T')[0],
            adherence: null,
        };

        const updatedPatient = {
            ...selectedPatient,
            medications: [...selectedPatient.medications, newMedication],
        };
        setSelectedPatient(updatedPatient);
        setPatients(prev => prev.map(p => p.id === updatedPatient.id ? updatedPatient : p));
        setNewMed('');
        setNewMedFrequency('');
        setShowAddMedModal(false);
    };

    const addCondition = () => {
        if (!newCondition.trim()) return;
        if (!selectedPatient) return;

        const duplicate = selectedPatient.conditions.some(
            c => c.condition.toLowerCase() === newCondition.toLowerCase().trim()
        );
        if (duplicate) {
            Alert.alert('Duplicate Condition', 'This condition is already in the patient\'s list.');
            return;
        }

        const newCond = {
            id: `c_${Date.now()}`,
            condition: newCondition.trim(),
            diagnosedDate: new Date().toISOString().split('T')[0],
            severity: newConditionSeverity,
            status: 'active',
        };

        const updatedPatient = {
            ...selectedPatient,
            conditions: [...selectedPatient.conditions, newCond],
        };
        setSelectedPatient(updatedPatient);
        setPatients(prev => prev.map(p => p.id === updatedPatient.id ? updatedPatient : p));
        setNewCondition('');
        setNewConditionSeverity('Mild');
        setShowAddConditionModal(false);
    };

    // ─── Delete Handlers ────────────────────────────────────
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
            const updatedPatient = {
                ...selectedPatient,
                medications: selectedPatient.medications.filter(m => m.id !== selectedMed.id),
            };
            setSelectedPatient(updatedPatient);
            setPatients(prev => prev.map(p => p.id === updatedPatient.id ? updatedPatient : p));
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
            const updatedPatient = {
                ...selectedPatient,
                conditions: selectedPatient.conditions.filter(c => c.id !== selectedCondition.id),
            };
            setSelectedPatient(updatedPatient);
            setPatients(prev => prev.map(p => p.id === updatedPatient.id ? updatedPatient : p));
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
                                <StatusBadge label={`${patients.length} assigned`} variant="primary" />
                            </View>
                            <PremiumCard style={{ padding: 0 }}>
                                {patients.map((p, i) => (
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
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {selectedPatient && (
                                <>
                                    <View style={s.modalHeader}>
                                        <View style={s.modalPatientInfo}>
                                            <View style={s.modalAvatar}>
                                                <Text style={s.modalAvatarText}>{selectedPatient.name.charAt(0)}</Text>
                                            </View>
                                            <View>
                                                <Text style={s.modalTitle}>{selectedPatient.name}</Text>
                                                <View style={s.modalSubRow}>
                                                    <StatusBadge
                                                        label={selectedPatient.status === 'stable' ? 'Stable' : 'Needs Attention'}
                                                        variant={selectedPatient.status === 'stable' ? 'success' : 'warning'}
                                                    />
                                                    <Text style={s.modalAdherence}>
                                                        Adherence: {selectedPatient.adherence}%
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                        <TouchableOpacity style={s.closeBtn} onPress={() => setShowPatientDetailModal(false)}>
                                            <Text style={s.closeBtnText}>✕</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={s.modalStatsRow}>
                                        <View style={s.modalStat}>
                                            <Text style={s.modalStatVal}>{selectedPatient.conditions.length}</Text>
                                            <Text style={s.modalStatLabel}>Conditions</Text>
                                        </View>
                                        <View style={s.modalStatDivider} />
                                        <View style={s.modalStat}>
                                            <Text style={s.modalStatVal}>{selectedPatient.medications.length}</Text>
                                            <Text style={s.modalStatLabel}>Medications</Text>
                                        </View>
                                        <View style={s.modalStatDivider} />
                                        <View style={s.modalStat}>
                                            <Text style={s.modalStatVal}>{selectedPatient.adherence}%</Text>
                                            <Text style={s.modalStatLabel}>Adherence</Text>
                                        </View>
                                    </View>

                                    <View style={{ marginTop: Spacing.lg }}>
                                        <PatientHealthView
                                            conditions={selectedPatient.conditions}
                                            medications={selectedPatient.medications}
                                            editable={true}
                                            onAddCondition={() => {
                                                setNewCondition('');
                                                setNewConditionSeverity('Mild');
                                                setShowAddConditionModal(true);
                                            }}
                                            onRemoveCondition={openDeleteConditionModal}
                                            onAddMedication={() => {
                                                setNewMed('');
                                                setNewMedFrequency('');
                                                setShowAddMedModal(true);
                                            }}
                                            onRemoveMedication={openDeleteMedModal}
                                        />
                                    </View>

                                    <View style={s.modalFooter}>
                                        <Text style={s.modalFooterText}>
                                            Last call: {selectedPatient.lastCall}
                                        </Text>
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Add Medication Modal */}
            <Modal
                visible={showAddMedModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowAddMedModal(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.formModalContent}>
                        <Text style={s.formModalTitle}>Add Medication</Text>
                        <Text style={s.formModalSubtitle}>
                            Add a new medication for {selectedPatient?.name}
                        </Text>
                        <Text style={s.inputLabel}>Medication Name *</Text>
                        <TextInput
                            style={s.modalInput}
                            placeholder="e.g. Metformin 500mg"
                            placeholderTextColor={Colors.textMuted}
                            value={newMed}
                            onChangeText={setNewMed}
                            autoFocus={true}
                        />
                        <Text style={s.inputLabel}>Frequency</Text>
                        <TextInput
                            style={s.modalInput}
                            placeholder="e.g. Twice daily"
                            placeholderTextColor={Colors.textMuted}
                            value={newMedFrequency}
                            onChangeText={setNewMedFrequency}
                        />
                        <View style={s.formActions}>
                            <TouchableOpacity style={[s.formBtn, s.cancelBtn]} onPress={() => setShowAddMedModal(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.formBtn, s.addFormBtn]} onPress={addMedication}>
                                <Text style={s.addFormBtnText}>Add Medication</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Add Condition Modal */}
            <Modal
                visible={showAddConditionModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowAddConditionModal(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.formModalContent}>
                        <Text style={s.formModalTitle}>Add Health Condition</Text>
                        <Text style={s.formModalSubtitle}>
                            Add a new condition for {selectedPatient?.name}
                        </Text>
                        <Text style={s.inputLabel}>Condition Name *</Text>
                        <TextInput
                            style={s.modalInput}
                            placeholder="e.g. Type 2 Diabetes"
                            placeholderTextColor={Colors.textMuted}
                            value={newCondition}
                            onChangeText={setNewCondition}
                            autoFocus={true}
                        />
                        <Text style={s.inputLabel}>Severity</Text>
                        <View style={s.severityRow}>
                            {['Mild', 'Moderate', 'Severe'].map(sev => (
                                <TouchableOpacity
                                    key={sev}
                                    style={[s.severityBtn, newConditionSeverity === sev && s.severityBtnActive]}
                                    onPress={() => setNewConditionSeverity(sev)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        s.severityBtnText,
                                        newConditionSeverity === sev && s.severityBtnTextActive
                                    ]}>{sev}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={s.formActions}>
                            <TouchableOpacity style={[s.formBtn, s.cancelBtn]} onPress={() => setShowAddConditionModal(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.formBtn, s.addFormBtn]} onPress={addCondition}>
                                <Text style={s.addFormBtnText}>Add Condition</Text>
                            </TouchableOpacity>
                        </View>
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
                    <View style={s.formModalContent}>
                        <Text style={s.formModalTitle}>Remove Medication</Text>
                        <Text style={s.formModalSubtitle}>Why are you removing this medication?</Text>

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
                                style={[s.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
                                placeholder="Please specify the reason"
                                placeholderTextColor={Colors.textMuted}
                                value={deleteReason}
                                onChangeText={setDeleteReason}
                                multiline={true}
                                numberOfLines={3}
                            />
                        )}

                        <View style={s.formActions}>
                            <TouchableOpacity style={[s.formBtn, s.cancelBtn]} onPress={() => setShowDeleteMedModal(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.formBtn, s.deleteFormBtn]} onPress={deleteMedication}>
                                <Text style={s.deleteFormBtnText}>Remove</Text>
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
                    <View style={s.formModalContent}>
                        <Text style={s.formModalTitle}>Remove Health Condition</Text>
                        <Text style={s.formModalSubtitle}>Why are you removing this condition?</Text>

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
                                style={[s.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
                                placeholder="Please specify the reason"
                                placeholderTextColor={Colors.textMuted}
                                value={deleteReason}
                                onChangeText={setDeleteReason}
                                multiline={true}
                                numberOfLines={3}
                            />
                        )}

                        <View style={s.formActions}>
                            <TouchableOpacity style={[s.formBtn, s.cancelBtn]} onPress={() => setShowDeleteConditionModal(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.formBtn, s.deleteFormBtn]} onPress={deleteCondition}>
                                <Text style={s.deleteFormBtnText}>Remove</Text>
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
    // Modal Overlay
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.md },
    // Patient Detail Modal
    modalContent: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, width: '100%', maxWidth: 500, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
    modalPatientInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
    modalAvatar: { width: 48, height: 48, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    modalAvatarText: { ...Typography.h3, color: Colors.primary },
    modalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.xs },
    modalSubRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    modalAdherence: { ...Typography.tiny, color: Colors.textMuted },
    closeBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    closeBtnText: { fontSize: 18, color: Colors.textMuted },
    // Modal Stats
    modalStatsRow: { flexDirection: 'row', backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, paddingVertical: Spacing.md, marginBottom: Spacing.sm },
    modalStat: { flex: 1, alignItems: 'center' },
    modalStatVal: { ...Typography.h3, color: Colors.primary },
    modalStatLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    modalStatDivider: { width: 1, backgroundColor: Colors.borderLight },
    modalFooter: { paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: Spacing.lg },
    modalFooterText: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
    // Form Modal
    formModalContent: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, width: '100%', maxWidth: 400, maxHeight: '85%' },
    formModalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.xs, textAlign: 'center' },
    formModalSubtitle: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
    inputLabel: { ...Typography.caption, color: Colors.textSecondary, marginBottom: Spacing.xs, fontWeight: '600' },
    modalInput: {
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: Radius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        ...Typography.body,
        color: Colors.textPrimary,
        backgroundColor: Colors.background,
    },
    // Severity Picker
    severityRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    severityBtn: {
        flex: 1,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
        backgroundColor: Colors.surface,
    },
    severityBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceAlt },
    severityBtnText: { ...Typography.caption, color: Colors.textMuted },
    severityBtnTextActive: { color: Colors.primary, fontWeight: '700' },
    // Form Actions
    formActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
    formBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center' },
    cancelBtn: { backgroundColor: Colors.surfaceAlt },
    cancelBtnText: { ...Typography.body, color: Colors.textMuted },
    addFormBtn: { backgroundColor: Colors.primary },
    addFormBtnText: { ...Typography.body, color: '#fff', fontWeight: '700' },
    deleteFormBtn: { backgroundColor: Colors.error },
    deleteFormBtnText: { ...Typography.body, color: '#fff', fontWeight: '700' },
    // Reason Options
    reasonOptions: { gap: Spacing.sm, marginBottom: Spacing.md },
    reasonOption: {
        padding: Spacing.md,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    reasonOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.surfaceAlt },
    reasonOptionText: { ...Typography.body, color: Colors.textPrimary },
    reasonOptionTextSelected: { color: Colors.primary, fontWeight: '600' },
});
