import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import { Swipeable } from 'react-native-gesture-handler';

const MEDS = [
    { id: 1, name: 'Metformin 500mg', time: '8:00 AM', taken: true },
    { id: 2, name: 'Lisinopril 10mg', time: '8:00 AM', taken: true },
    { id: 3, name: 'Atorvastatin 20mg', time: '9:00 PM', taken: false },
    { id: 4, name: 'Aspirin 81mg', time: '12:00 PM', taken: false },
];

const PATIENT_CONDITIONS = [
    { id: 1, condition: 'Type 2 Diabetes', diagnosedDate: '2022-03-15', severity: 'Moderate', status: 'active' },
    { id: 2, condition: 'Hypertension', diagnosedDate: '2021-08-22', severity: 'Mild', status: 'active' },
    { id: 3, condition: 'High Cholesterol', diagnosedDate: '2023-01-10', severity: 'Mild', status: 'managed' },
];

export default function PatientDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [meds, setMeds] = useState(MEDS);
    const [conditions, setConditions] = useState(PATIENT_CONDITIONS);
    const [showAddMedModal, setShowAddMedModal] = useState(false);
    const [showAddConditionModal, setShowAddConditionModal] = useState(false);
    const [showDeleteMedModal, setShowDeleteMedModal] = useState(false);
    const [showDeleteConditionModal, setShowDeleteConditionModal] = useState(false);
    const [newMed, setNewMed] = useState('');
    const [newCondition, setNewCondition] = useState('');
    const [selectedMed, setSelectedMed] = useState(null);
    const [selectedCondition, setSelectedCondition] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [deleteReasonType, setDeleteReasonType] = useState('');
    const [allMedications, setAllMedications] = useState([
        { id: 1, name: 'Metformin 500mg', addedDate: '2024-01-15' },
        { id: 2, name: 'Lisinopril 10mg', addedDate: '2024-01-10' },
        { id: 3, name: 'Atorvastatin 20mg', addedDate: '2024-01-20' },
        { id: 4, name: 'Aspirin 81mg', addedDate: '2024-01-05' },
    ]);

    // Swipe to delete handlers
    const handleMedSwipeLeft = (medId) => {
        const med = allMedications.find(m => m.id === medId);
        if (med) {
            openDeleteMedModal(med);
        }
    };

    const handleConditionSwipeLeft = (conditionId) => {
        const condition = conditions.find(c => c.id === conditionId);
        if (condition) {
            openDeleteConditionModal(condition);
        }
    };

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const toggleMed = (id) => setMeds(prev => prev.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
    const takenCount = meds.filter(m => m.taken).length;

    const addMedication = () => {
        if (newMed.trim()) {
            const duplicate = allMedications.some(m => m.name.toLowerCase() === newMed.toLowerCase().trim());
            if (duplicate) {
                Alert.alert('Duplicate Medication', 'This medication is already in your list.');
                return;
            }
            const newMedication = {
                id: Date.now(),
                name: newMed.trim(),
                addedDate: new Date().toISOString().split('T')[0]
            };
            setAllMedications(prev => [...prev, newMedication]);
            setMeds(prev => [...prev, {
                ...newMedication,
                time: 'Daily',
                taken: false
            }]);
            setNewMed('');
            setShowAddMedModal(false);
        }
    };

    const addCondition = () => {
        if (newCondition.trim()) {
            const duplicate = conditions.some(c => c.condition.toLowerCase() === newCondition.toLowerCase().trim());
            if (duplicate) {
                Alert.alert('Duplicate Condition', 'This condition is already in your list.');
                return;
            }
            setConditions(prev => [...prev, {
                id: Date.now(),
                condition: newCondition.trim(),
                diagnosedDate: new Date().toISOString().split('T')[0],
                severity: 'Moderate',
                status: 'active'
            }]);
            setNewCondition('');
            setShowAddConditionModal(false);
        }
    };

    const deleteMedication = () => {
        if (selectedMed && deleteReasonType) {
            if (deleteReasonType === 'other' && !deleteReason.trim()) {
                Alert.alert('Reason Required', 'Please specify reason for deletion.');
                return;
            }
            setAllMedications(prev => prev.filter(m => m.id !== selectedMed.id));
            setMeds(prev => prev.filter(m => m.id !== selectedMed.id));
            setSelectedMed(null);
            setDeleteReason('');
            setDeleteReasonType('');
            setShowDeleteMedModal(false);
        }
    };

    const deleteCondition = () => {
        if (selectedCondition && deleteReasonType) {
            if (deleteReasonType === 'other' && !deleteReason.trim()) {
                Alert.alert('Reason Required', 'Please specify the reason for deletion.');
                return;
            }
            setConditions(prev => prev.filter(c => c.id !== selectedCondition.id));
            setSelectedCondition(null);
            setDeleteReason('');
            setDeleteReasonType('');
            setShowDeleteConditionModal(false);
        }
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


return (
        <View style={s.container}>
            <GradientHeader
                title={`Hello, ${user?.name?.split(' ')[0] || 'there'} 💙`}
                subtitle="Your Health Dashboard"
                colors={Colors.roleGradient.patient}
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
                        {/* Next Call */}
                        <View style={{ marginTop: Spacing.md }}>
                            <LinearGradient 
                                colors={['#D1FAE5', '#A7F3D0', '#6EE7B7']} 
                                style={s.nextCallCard}
                                start={{ x: 0, y: 0 }} 
                                end={{ x: 1, y: 1 }}>
                                <View style={s.nextCallHeader}>
                                    <Text style={s.nextCallLabel}>Next Scheduled Call</Text>
                                    <StatusBadge label="Today" variant="success" />
                                </View>
                                <Text style={s.nextCallTime}>📞 2:00 PM — Sarah Johnson</Text>
                                <Text style={s.nextCallNote}>Regular check-in call</Text>
                            </LinearGradient>
                        </View>

                        {/* Today's Medications */}
                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Today's Medications</Text>
                                <View style={s.headerActions}>
                                    <StatusBadge label={`${takenCount}/${meds.length} taken`} variant={takenCount === meds.length ? 'success' : 'info'} />
                                </View>
                            </View>
                            <View style={s.progressBar}>
                                <View style={[s.progressFill, { width: `${(takenCount / meds.length) * 100}%` }]} />
                            </View>
                            <PremiumCard style={{ padding: 0, marginTop: Spacing.md }}>
                                {meds.map((m, i) => (
                                    <React.Fragment key={m.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <TouchableOpacity style={s.medRow} activeOpacity={0.7} onPress={() => toggleMed(m.id)}>
                                            <View style={[s.checkBox, m.taken && s.checkBoxDone]}>
                                                {m.taken && <Text style={s.checkMark}>✓</Text>}
                                            </View>
                                            <View style={s.medContent}>
                                                <Text style={[s.medName, m.taken && s.medNameDone]}>{m.name}</Text>
                                                <Text style={s.medTime}>{m.time}</Text>
                                            </View>
                                            <View style={s.medActions}>
                                                {m.taken && <StatusBadge label="Taken" variant="success" />}
                                            </View>
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        {/* Health Conditions */}
                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>Health Conditions</Text>
                                <TouchableOpacity style={s.addBtn} onPress={() => setShowAddConditionModal(true)}>
                                    <Text style={s.addBtnText}>+ Add</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={s.swipeHint}>
                                <Text style={s.swipeHintText}>💡 Long press on any condition to remove it</Text>
                            </View>
                            <PremiumCard style={{ padding: 0, marginTop: Spacing.md }}>
                                {conditions.map((condition, i) => (
                                    <React.Fragment key={condition.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <TouchableOpacity 
                                            style={s.swipeableRow}
                                            onLongPress={() => {
                                                Alert.alert(
                                                    'Remove Condition',
                                                    `Are you sure you want to remove ${condition.condition}?`,
                                                    [
                                                        { text: 'Cancel', style: 'cancel' },
                                                        { text: 'Remove', style: 'destructive', onPress: () => openDeleteConditionModal(condition) }
                                                    ]
                                                );
                                            }}
                                        >
                                            <View style={s.conditionRow}>
                                                <View style={s.conditionIcon}>
                                                    <Text style={s.conditionIconText}>🏥</Text>
                                                </View>
                                                <View style={s.conditionContent}>
                                                    <Text style={s.conditionName}>{condition.condition}</Text>
                                                    <Text style={s.conditionDetails}>
                                                        Diagnosed: {new Date(condition.diagnosedDate).toLocaleDateString()} • {condition.severity}
                                                    </Text>
                                                </View>
                                                <View style={s.conditionActions}>
                                                    <StatusBadge 
                                                        label={condition.status} 
                                                        variant={condition.status === 'active' ? 'warning' : 'success'} 
                                                    />
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))}
                                {conditions.length === 0 && (
                                    <View style={s.emptyState}>
                                        <Text style={s.emptyText}>No conditions recorded</Text>
                                    </View>
                                )}
                            </PremiumCard>
                        </View>

                        {/* Medications Management */}
                        <View>
                            <View style={s.sectionHeader}>
                                <Text style={s.sectionTitle}>My Medications</Text>
                                <TouchableOpacity style={s.addBtn} onPress={() => setShowAddMedModal(true)}>
                                    <Text style={s.addBtnText}>+ Add</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={s.swipeHint}>
                                <Text style={s.swipeHintText}>💡 Long press on any medication to remove it</Text>
                            </View>
                            <PremiumCard style={{ padding: 0, marginTop: Spacing.md }}>
                                {allMedications.map((med, i) => (
                                    <React.Fragment key={med.id}>
                                        {i > 0 && <View style={s.divider} />}
                                        <TouchableOpacity 
                                            style={s.swipeableRow}
                                            onLongPress={() => {
                                                // Simple long press to delete for now
                                                Alert.alert(
                                                    'Remove Medication',
                                                    `Are you sure you want to remove ${med.name}?`,
                                                    [
                                                        { text: 'Cancel', style: 'cancel' },
                                                        { text: 'Remove', style: 'destructive', onPress: () => openDeleteMedModal(med) }
                                                    ]
                                                );
                                            }}
                                        >
                                            <View style={s.medRow}>
                                                <View style={s.medContent}>
                                                    <Text style={s.medName}>{med.name}</Text>
                                                    <Text style={s.medTime}>Added: {new Date(med.addedDate).toLocaleDateString()}</Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))}
                            </PremiumCard>
                        </View>

                        {/* Emergency */}
                        <View>
                            <TouchableOpacity style={s.emergencyBtn} activeOpacity={0.8}
                                onPress={() => navigation.navigate('Emergency')}>
                                <LinearGradient colors={['#DC2626', '#EF4444']} style={s.emergencyGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                    <Text style={s.emergencyIcon}>🚨</Text>
                                    <View>
                                        <Text style={s.emergencyTitle}>Emergency Help</Text>
                                        <Text style={s.emergencySub}>Tap to call for immediate help</Text>
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Add Medication Modal */}
            <Modal
                visible={showAddMedModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowAddMedModal(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <Text style={s.modalTitle}>Add Medication</Text>
                        <TextInput
                            style={s.modalInput}
                            placeholder="Enter medication name and dosage"
                            value={newMed}
                            onChangeText={setNewMed}
                            autoFocus={true}
                        />
                        <View style={s.modalActions}>
                            <TouchableOpacity style={[s.modalBtn, s.cancelBtn]} onPress={() => setShowAddMedModal(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.modalBtn, s.addModalBtn]} onPress={addMedication}>
                                <Text style={s.addModalBtnText}>Add</Text>
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
                    <View style={s.modalContent}>
                        <Text style={s.modalTitle}>Add Health Condition</Text>
                        <TextInput
                            style={s.modalInput}
                            placeholder="Enter condition name"
                            value={newCondition}
                            onChangeText={setNewCondition}
                            autoFocus={true}
                        />
                        <View style={s.modalActions}>
                            <TouchableOpacity style={[s.modalBtn, s.cancelBtn]} onPress={() => setShowAddConditionModal(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.modalBtn, s.addModalBtn]} onPress={addCondition}>
                                <Text style={s.addModalBtnText}>Add</Text>
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
    // Next Call
    nextCallCard: { 
        padding: Spacing.lg, 
        borderRadius: Radius.lg, 
        ...Shadows.lg 
    },
    nextCallHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    nextCallLabel: { ...Typography.captionBold, color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5 },
    nextCallTime: { ...Typography.h3, color: '#047857', marginBottom: Spacing.xs },
    nextCallNote: { ...Typography.body, color: '#059669' },
    // Section
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.sm },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    progressBar: { height: 6, backgroundColor: Colors.borderLight, borderRadius: 3 },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.success },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Med
    medRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: Spacing.md, 
        paddingHorizontal: Spacing.md, 
        paddingVertical: 14 
    },
    medContent: { 
        flex: 1, 
        justifyContent: 'center'
    },
    medActions: { 
        flexDirection: 'column', 
        alignItems: 'flex-end', 
        gap: Spacing.xs,
        flexShrink: 0
    },
    checkBox: { width: 28, height: 28, borderRadius: Radius.sm, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
    checkBoxDone: { borderColor: Colors.success, backgroundColor: Colors.successLight },
    checkMark: { color: Colors.success, fontSize: 14, fontWeight: '700' },
    medName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 15 },
    medNameDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
    medTime: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    // Emergency
    emergencyBtn: { marginTop: Spacing.xl, borderRadius: Radius.lg, overflow: 'hidden', ...Shadows.lg },
    emergencyGrad: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg },
    emergencyIcon: { fontSize: 32 },
    emergencyTitle: { ...Typography.h3, color: '#fff' },
    emergencySub: { ...Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    // Health Conditions
    conditionRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: Spacing.md, 
        paddingHorizontal: Spacing.md, 
        paddingVertical: Spacing.md 
    },
    conditionIcon: { 
        width: 40, 
        height: 40, 
        borderRadius: Radius.full, 
        backgroundColor: Colors.surfaceAlt, 
        justifyContent: 'center', 
        alignItems: 'center',
        flexShrink: 0
    },
    conditionIconText: { fontSize: 20 },
    conditionContent: { 
        flex: 1, 
        justifyContent: 'center'
    },
    conditionName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 15 },
    conditionDetails: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    conditionActions: { 
        flexDirection: 'column', 
        alignItems: 'flex-end', 
        gap: Spacing.xs,
        flexShrink: 0
    },
    // Add Button
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    addBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.sm, backgroundColor: Colors.primary },
    addBtnText: { ...Typography.tiny, color: '#fff', fontWeight: '600' },
    // Swipe Hint
    swipeHint: { 
        backgroundColor: '#FFF3CD', 
        borderLeftWidth: 4, 
        borderLeftColor: '#FFC107',
        paddingVertical: Spacing.sm, 
        paddingHorizontal: Spacing.md, 
        borderRadius: Radius.sm, 
        marginTop: Spacing.sm,
        marginBottom: Spacing.sm,
        shadowColor: '#FFC107',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3
    },
    swipeHintText: { ...Typography.caption, color: '#856404', textAlign: 'center', fontWeight: '600' },
    // Swipeable Row
    swipeableRow: {
        backgroundColor: 'transparent'
    },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.lg },
    modalContent: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, width: '100%', maxWidth: 400 },
    modalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.md, textAlign: 'center' },
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
    addModalBtn: { backgroundColor: Colors.primary },
    addModalBtnText: { ...Typography.body, color: '#fff', fontWeight: '600' },
    // Delete Button
    deleteBtn: { 
        paddingHorizontal: Spacing.sm, 
        paddingVertical: Spacing.xs, 
        borderRadius: Radius.sm, 
        backgroundColor: Colors.errorLight, 
        justifyContent: 'center', 
        alignItems: 'center'
    },
    deleteBtnText: { 
        fontSize: 12, 
        color: Colors.error,
        fontWeight: '600'
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
    deleteModalBtn: { backgroundColor: Colors.error },
    deleteModalBtnText: { ...Typography.body, color: '#fff', fontWeight: '600' },
    // Empty State
    emptyState: { paddingVertical: Spacing.xl, alignItems: 'center' },
    emptyText: { ...Typography.body, color: Colors.textMuted },
});
