import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Platform, ActivityIndicator, Modal, TextInput, ScrollView, Image, Pressable } from 'react-native';
import { Activity, AlertOctagon, PhoneMissed, MessageSquare, Plus, Trash2, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { apiService } from '../../lib/api';
import AlertManager from '../../utils/AlertManager';

const ICON_MAP = {
    missed_call: PhoneMissed,
    patient_unreachable_3attempts: PhoneMissed,
    medicine_refusal: AlertOctagon,
    medication_missed: AlertOctagon,
    medication_modification: MessageSquare,
    default: AlertOctagon,
};

export default function ActivityFeedScreen() {
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Modal state
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [medications, setMedications] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const loadFeed = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const res = await apiService.callers.getActivityFeed();
            setFeed(res.data.feed || []);
        } catch (error) {
            console.warn('Failed to load activity feed:', error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadFeed();
    }, []);

    const handleAlertPress = (alert) => {
        if (alert.type === 'medication_modification') {
            setSelectedAlert(alert);
            const meds = (alert.extracted_medicines || []).map((m, idx) => ({
                id: m.id || m._id || String(idx) + Math.random().toString(36).substring(2),
                name: m.name || '',
                dosage: m.dosage || '',
                frequency: m.frequency || '',
                duration: m.duration || ''
            }));
            setMedications(meds);
            setModalVisible(true);
        }
    };

    const handleFieldChange = (id, field, value) => {
        setMedications(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
    };

    const removeMedication = (id) => {
        setMedications(prev => prev.filter(m => m.id !== id));
    };

    const addMedication = () => {
        setMedications(prev => [...prev, {
            id: Math.random().toString(36).substring(7),
            name: '',
            dosage: '',
            frequency: '',
            duration: ''
        }]);
    };

    const saveVerifiedMedications = async () => {
        if (medications.some(m => !m.name || !m.name.trim())) {
            AlertManager.alert('Required', 'Medication Name is required for all entries.');
            return;
        }

        setIsSaving(true);
        try {
            const validMeds = medications.filter(m => m.name && m.name.trim() !== '');
            const formattedMeds = validMeds.map(m => ({
                name: m.name.trim(),
                dosage: m.dosage.trim(),
                frequency: m.frequency.trim(),
                instructions: m.duration.trim() ? `Take for ${m.duration.trim()}` : '',
                times: ['morning'],
                is_active: true
            }));

            // 1. Update patient's actual medications
            await apiService.callers.updatePatientMedications(selectedAlert.patient_id, formattedMeds);

            // 2. Resolve the alert
            await apiService.callers.resolveAlert(selectedAlert.id, {
                action_taken: 'Prescription reviewed, medications saved, and schedule updated by caller.'
            });

            AlertManager.alert('Success', 'Prescription verified and patient schedule updated successfully.');
            setModalVisible(false);
            loadFeed();
        } catch (error) {
            console.error('Failed to save verified medications:', error);
            AlertManager.alert('Error', 'Failed to update medications and resolve alert.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Activity Feed</Text>
            </View>

            {loading ? (
                <View style={styles.loaderWrap}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : feed.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <View style={styles.emptyIconBox}>
                        <Activity size={36} color={colors.primary} strokeWidth={1.5} />
                    </View>
                    <Text style={styles.emptyTitle}>No Activity Yet</Text>
                    <Text style={styles.emptyBody}>
                        Missed medications, call alerts, and escalations will appear here as they happen.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={feed}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshing={refreshing}
                    onRefresh={() => loadFeed(true)}
                    renderItem={({ item }) => {
                        const Icon = ICON_MAP[item.type] || ICON_MAP.default;
                        const isResolved = item.status === 'resolved';
                        return (
                            <Pressable 
                                style={[styles.card, isResolved && styles.cardResolved]} 
                                onPress={() => handleAlertPress(item)}
                            >
                                <View style={[styles.cardAccent, { backgroundColor: isResolved ? '#94A3B8' : item.color }]} />
                                <View style={styles.cardInner}>
                                    <View style={[styles.iconBox, { backgroundColor: (isResolved ? '#94A3B8' : item.color) + '15' }]}>
                                        <Icon size={18} color={isResolved ? '#94A3B8' : item.color} />
                                    </View>
                                    <View style={styles.cardContent}>
                                        <View style={styles.titleRow}>
                                            <Text style={[styles.titleTxt, isResolved && styles.txtResolved]} numberOfLines={1}>{item.title}</Text>
                                            {isResolved && (
                                                <View style={styles.resolvedBadge}>
                                                    <Text style={styles.resolvedBadgeTxt}>Resolved</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={[styles.patientTxt, isResolved && styles.txtResolved]} numberOfLines={1}>{item.patient}</Text>
                                        <Text style={[styles.bodyTxt, isResolved && styles.txtResolved]} numberOfLines={2}>{item.desc}</Text>
                                        <Text style={styles.timeTxt}>{item.time}</Text>
                                    </View>
                                </View>
                            </Pressable>
                        );
                    }}
                />
            )}

            {/* Verification Modal */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Prescription Review</Text>
                                <Text style={styles.modalSub}>{selectedAlert?.patient}</Text>
                            </View>
                            <Pressable style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                                <X size={20} color="#64748B" />
                            </Pressable>
                        </View>

                        <ScrollView 
                            style={styles.modalScroll}
                            contentContainerStyle={styles.modalScrollContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Prescription Image */}
                            <Text style={styles.sectionTitle}>Prescription Document</Text>
                            {selectedAlert?.prescription_url ? (
                                <View style={styles.imageFrame}>
                                    <Image
                                        source={{ uri: selectedAlert.prescription_url }}
                                        style={styles.prescriptionImage}
                                        resizeMode="contain"
                                    />
                                </View>
                            ) : (
                                <View style={styles.noImageFrame}>
                                    <Text style={styles.noImageText}>No prescription image uploaded by patient.</Text>
                                </View>
                            )}

                            {/* Medications Form */}
                            <View style={styles.medsSectionHeader}>
                                <Text style={styles.sectionTitle}>Medications Schedule</Text>
                                {selectedAlert?.status === 'open' && (
                                    <Pressable style={styles.addInlineBtn} onPress={addMedication}>
                                        <Plus size={16} color="#6366F1" />
                                        <Text style={styles.addInlineText}>Add Row</Text>
                                    </Pressable>
                                )}
                            </View>

                            {medications.length === 0 ? (
                                <View style={styles.emptyMedsFrame}>
                                    <Text style={styles.emptyMedsText}>No medicines listed. Add rows to prescribe manually.</Text>
                                </View>
                            ) : (
                                medications.map((med, index) => (
                                    <View key={med.id} style={styles.medRowCard}>
                                        <View style={styles.medCardHeader}>
                                            <Text style={styles.medNumber}>Medicine #{index + 1}</Text>
                                            {selectedAlert?.status === 'open' && (
                                                <Pressable onPress={() => removeMedication(med.id)} style={styles.deleteRowBtn}>
                                                    <Trash2 size={16} color="#EF4444" />
                                                </Pressable>
                                            )}
                                        </View>

                                        <View style={styles.rowInputGroup}>
                                            <Text style={styles.inputLabel}>Name</Text>
                                            <TextInput
                                                style={styles.modalInput}
                                                value={med.name}
                                                placeholder="e.g. Metformin"
                                                placeholderTextColor="#94A3B8"
                                                onChangeText={(val) => handleFieldChange(med.id, 'name', val)}
                                                editable={selectedAlert?.status === 'open'}
                                            />
                                        </View>

                                        <View style={styles.rowInputsContainer}>
                                            <View style={[styles.rowInputGroup, { flex: 1 }]}>
                                                <Text style={styles.inputLabel}>Dosage</Text>
                                                <TextInput
                                                    style={styles.modalInput}
                                                    value={med.dosage}
                                                    placeholder="e.g. 500mg"
                                                    placeholderTextColor="#94A3B8"
                                                    onChangeText={(val) => handleFieldChange(med.id, 'dosage', val)}
                                                    editable={selectedAlert?.status === 'open'}
                                                />
                                            </View>
                                            <View style={[styles.rowInputGroup, { flex: 1 }]}>
                                                <Text style={styles.inputLabel}>Frequency</Text>
                                                <TextInput
                                                    style={styles.modalInput}
                                                    value={med.frequency}
                                                    placeholder="e.g. Twice Daily"
                                                    placeholderTextColor="#94A3B8"
                                                    onChangeText={(val) => handleFieldChange(med.id, 'frequency', val)}
                                                    editable={selectedAlert?.status === 'open'}
                                                />
                                            </View>
                                        </View>

                                        <View style={styles.rowInputGroup}>
                                            <Text style={styles.inputLabel}>Duration</Text>
                                            <TextInput
                                                style={styles.modalInput}
                                                value={med.duration}
                                                placeholder="e.g. 30 Days"
                                                placeholderTextColor="#94A3B8"
                                                onChangeText={(val) => handleFieldChange(med.id, 'duration', val)}
                                                editable={selectedAlert?.status === 'open'}
                                            />
                                        </View>
                                    </View>
                                ))
                            )}
                        </ScrollView>

                        {/* Modal Footer Actions */}
                        <View style={styles.modalFooter}>
                            <Pressable 
                                style={[styles.actionButton, styles.buttonClose]} 
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={styles.buttonCloseText}>Close</Text>
                            </Pressable>
                            {selectedAlert?.status === 'open' && (
                                <Pressable 
                                    style={[styles.actionButton, styles.buttonSave, isSaving && styles.buttonDisabled]} 
                                    onPress={saveVerifiedMedications}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <ActivityIndicator color="#FFF" size="small" />
                                    ) : (
                                        <Text style={styles.buttonSaveText}>Save & Confirm</Text>
                                    )}
                                </Pressable>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },
    header: {
        backgroundColor: colors.primary,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16, paddingHorizontal: 20,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
    loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: 16, paddingBottom: 40 },
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
    },
    cardAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
    cardInner: { flexDirection: 'row', padding: 16, paddingLeft: 20 },
    iconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    cardContent: { flex: 1 },
    titleTxt: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
    patientTxt: { fontSize: 13, fontWeight: '600', color: colors.accent, marginTop: 4 },
    bodyTxt: { fontSize: 13, color: '#4A5568', marginTop: 4, lineHeight: 18 },
    timeTxt: { fontSize: 11, color: '#94A3B8', marginTop: 6, fontWeight: '500' },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    emptyIconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
    emptyBody: { fontSize: 14, fontWeight: '500', color: '#94A3B8', textAlign: 'center', lineHeight: 22 },

    cardResolved: { opacity: 0.75, backgroundColor: '#F8FAFC' },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    resolvedBadge: { backgroundColor: '#E2E8F0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    resolvedBadgeTxt: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
    txtResolved: { color: '#64748B' },

    // Modal styles
    modalContainer: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '90%', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    modalSub: { fontSize: 13, color: colors.accent, fontWeight: '600', marginTop: 2 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    modalScroll: { flex: 1, marginTop: 12 },
    modalScrollContent: { paddingBottom: 40 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: '#334155', marginVertical: 12, letterSpacing: 0.3 },
    imageFrame: { width: '100%', height: 220, borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1', overflow: 'hidden', backgroundColor: '#F8FAFC' },
    prescriptionImage: { width: '100%', height: '100%' },
    noImageFrame: { width: '100%', height: 100, borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
    noImageText: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
    
    medsSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
    addInlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    addInlineText: { fontSize: 13, fontWeight: '700', color: '#6366F1' },
    
    emptyMedsFrame: { padding: 24, backgroundColor: '#F8FAFC', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', marginTop: 8 },
    emptyMedsText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', fontWeight: '500' },
    
    medRowCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 12, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 },
    medCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    medNumber: { fontSize: 13, fontWeight: '800', color: '#64748B' },
    deleteRowBtn: { padding: 4 },
    rowInputGroup: { marginBottom: 10 },
    rowInputsContainer: { flexDirection: 'row', gap: 10 },
    inputLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 4, letterSpacing: 0.3 },
    modalInput: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#0F172A', fontWeight: '500' },
    
    modalFooter: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 16, marginTop: 12 },
    actionButton: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    buttonClose: { backgroundColor: '#F1F5F9' },
    buttonCloseText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
    buttonSave: { backgroundColor: '#6366F1' },
    buttonSaveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    buttonDisabled: { opacity: 0.6 }
});
