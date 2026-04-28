import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, TextInput, ScrollView } from 'react-native';
import { Pill, Clock, Plus, Edit2, Trash2, X, Info } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { apiService } from '../../lib/api';

import AlertManager from '../../utils/AlertManager';
const TIME_OPTIONS = ['morning', 'afternoon', 'evening', 'night', 'as_needed'];

const PatientMedicationsEditor = ({ patientId }) => {
    const [medications, setMedications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saveLoading, setSaveLoading] = useState(false);
    
    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [editingIndex, setEditingIndex] = useState(-1); // -1 for Add, index for Edit
    const [formData, setFormData] = useState({
        name: '',
        dosage: '',
        instructions: '',
        times: []
    });

    useEffect(() => {
        if (patientId) fetchMedications();
    }, [patientId]);

    const fetchMedications = async () => {
        try {
            setLoading(true);
            const { data } = await apiService.callers.getPatientProfile(patientId);
            setMedications(data.patient?.medications || []);
        } catch (error) {
            console.error('Failed to fetch medications:', error);
            AlertManager.alert('Error', 'Could not load medications list.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveBackend = async (newMedicationsArray) => {
        try {
            setSaveLoading(true);
            // Optimistic update
            setMedications(newMedicationsArray);
            await apiService.callers.updatePatientMedications(patientId, newMedicationsArray);
        } catch (error) {
            console.error('Failed to save medications:', error);
            AlertManager.alert('Save Error', 'Failed to update medications array.');
            fetchMedications(); // Rollback to actual backend state
        } finally {
            setSaveLoading(false);
            setModalVisible(false);
        }
    };

    const handleRemove = (index) => {
        AlertManager.alert(
            "Remove Medication",
            "Are you sure you want to remove this medication?",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Remove", 
                    style: "destructive",
                    onPress: () => {
                        const newArray = [...medications];
                        // Soft delete instead of full splice to preserve API history maps if needed elsewhere
                        newArray[index].is_active = false;
                        handleSaveBackend(newArray);
                    }
                }
            ]
        );
    };

    const openEditModal = (med, index) => {
        setFormData({
            name: med.name || '',
            dosage: med.dosage || '',
            instructions: med.instructions || '',
            times: med.times || []
        });
        setEditingIndex(index);
        setModalVisible(true);
    };

    const openAddModal = () => {
        setFormData({ name: '', dosage: '', instructions: '', times: [] });
        setEditingIndex(-1);
        setModalVisible(true);
    };

    const handleToggleTime = (timeOption) => {
        setFormData(prev => {
            const has = prev.times.includes(timeOption);
            if (has) return { ...prev, times: prev.times.filter(t => t !== timeOption) };
            return { ...prev, times: [...prev.times, timeOption] };
        });
    };

    const submitModal = () => {
        if (!formData.name.trim()) {
            AlertManager.alert("Required", "Medicine name is required.");
            return;
        }

        const newArray = [...medications];
        const medObj = {
            name: formData.name.trim(),
            dosage: formData.dosage.trim(),
            instructions: formData.instructions.trim(),
            times: formData.times,
            is_active: true
        };

        if (editingIndex >= 0) {
            newArray[editingIndex] = medObj;
        } else {
            newArray.push(medObj);
        }

        handleSaveBackend(newArray);
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#1E3A8A" />
                <Text style={styles.loadingText}>Loading Medications...</Text>
            </View>
        );
    }

    const activeMeds = medications.filter(m => m.is_active !== false);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Medications</Text>
                    <Text style={styles.subtitle}>{activeMeds.length} active prescriptions</Text>
                </View>
                <Pressable style={styles.addButton} onPress={openAddModal}>
                    <LinearGradient
                        colors={['#1E3A8A', '#0F172A']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.gradientBtn}
                    >
                        <Plus color="#FFF" size={18} />
                        <Text style={styles.addText}>Add</Text>
                    </LinearGradient>
                </Pressable>
            </View>

            {activeMeds.length === 0 ? (
                <View style={styles.emptyState}>
                    <Pill color="#94A3B8" size={32} />
                    <Text style={styles.emptyTitle}>No Medications</Text>
                    <Text style={styles.emptySub}>Add a prescription to track patient adherence.</Text>
                </View>
            ) : (
                activeMeds.map((med, index) => {
                    // We need original array index to properly map modifications/deletions back to the full list array
                    const originalIndex = medications.findIndex(m => m.name === med.name && m.is_active !== false);
                    return (
                    <View key={`${med.name}_${originalIndex}`} style={styles.medCard}>
                        <View style={styles.medHeader}>
                            <View style={styles.medTitleRow}>
                                <View style={styles.medIconBg}>
                                    <Pill color="#1E3A8A" size={16} />
                                </View>
                                <Text style={styles.medName}>{med.name}</Text>
                            </View>
                            <View style={styles.actionRow}>
                                <Pressable style={styles.actionBtn} onPress={() => openEditModal(med, originalIndex)}>
                                    <Edit2 color="#64748B" size={16} />
                                </Pressable>
                                <Pressable style={styles.actionBtn} onPress={() => handleRemove(originalIndex)}>
                                    <Trash2 color="#EF4444" size={16} />
                                </Pressable>
                            </View>
                        </View>
                        
                        {(med.dosage || med.instructions) && (
                            <View style={styles.medDetails}>
                                {!!med.dosage && (
                                    <View style={styles.detailItem}>
                                        <Info color="#94A3B8" size={14} />
                                        <Text style={styles.detailText}>{med.dosage}</Text>
                                    </View>
                                )}
                                {!!med.instructions && (
                                    <View style={styles.detailItem}>
                                        <Info color="#94A3B8" size={14} />
                                        <Text style={styles.detailText}>{med.instructions}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {med.times && med.times.length > 0 && (
                            <View style={styles.timesRow}>
                                <Clock color="#64748B" size={14} />
                                <View style={styles.chipList}>
                                    {med.times.map(t => (
                                        <View key={t} style={styles.timeChip}>
                                            <Text style={styles.timeChipText}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                )})
            )}

            {/* Editor Modal */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {editingIndex >= 0 ? 'Edit Medication' : 'Add Medication'}
                            </Text>
                            <Pressable style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                                <X color="#64748B" size={20} />
                            </Pressable>
                        </View>
                        
                        <ScrollView style={styles.formScroll}>
                            <Text style={styles.label}>Medicine Name</Text>
                            <TextInput 
                                style={styles.input}
                                placeholder="e.g. Aspirin"
                                placeholderTextColor="#94A3B8"
                                value={formData.name}
                                onChangeText={t => setFormData(p => ({ ...p, name: t }))}
                            />

                            <Text style={styles.label}>Dosage (Optional)</Text>
                            <TextInput 
                                style={styles.input}
                                placeholder="e.g. 500mg"
                                placeholderTextColor="#94A3B8"
                                value={formData.dosage}
                                onChangeText={t => setFormData(p => ({ ...p, dosage: t }))}
                            />

                            <Text style={styles.label}>Instructions (Optional)</Text>
                            <TextInput 
                                style={styles.input}
                                placeholder="e.g. Take after meals"
                                placeholderTextColor="#94A3B8"
                                value={formData.instructions}
                                onChangeText={t => setFormData(p => ({ ...p, instructions: t }))}
                            />

                            <Text style={styles.label}>Schedule Times</Text>
                            <View style={styles.timesGrid}>
                                {TIME_OPTIONS.map(time => {
                                    const isSelected = formData.times.includes(time);
                                    return (
                                        <Pressable 
                                            key={time}
                                            onPress={() => handleToggleTime(time)}
                                            style={[styles.timeToggle, isSelected && styles.timeToggleActive]}
                                        >
                                            <Text style={[styles.timeToggleText, isSelected && styles.timeToggleTextActive]}>
                                                {time.charAt(0).toUpperCase() + time.slice(1).replace('_', ' ')}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </ScrollView>

                        <Pressable 
                            style={[styles.submitWrap, saveLoading && { opacity: 0.7 }]} 
                            onPress={submitModal}
                            disabled={saveLoading}
                        >
                            <LinearGradient
                                colors={['#1E3A8A', '#0F172A']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.submitBtn}
                            >
                                {saveLoading ? (
                                    <ActivityIndicator color="#FFF" size="small" />
                                ) : (
                                    <Text style={styles.submitText}>Save Medication</Text>
                                )}
                            </LinearGradient>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 24,
        marginBottom: 32,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    title: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 18,
        color: '#0F172A',
    },
    subtitle: {
        fontFamily: 'Inter-Medium',
        fontSize: 13,
        color: '#64748B',
        marginTop: 2,
    },
    addButton: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    gradientBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 6,
    },
    addText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 14,
        color: '#FFFFFF',
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: {
        fontFamily: 'Inter-Medium',
        fontSize: 14,
        color: '#64748B',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
    },
    emptyTitle: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 16,
        color: '#334155',
        marginTop: 12,
    },
    emptySub: {
        fontFamily: 'Inter-Regular',
        fontSize: 14,
        color: '#64748B',
        marginTop: 4,
    },
    medCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    medHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    medTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    medIconBg: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    medName: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 16,
        color: '#0F172A',
        flexShrink: 1,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    medDetails: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
        paddingLeft: 44,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    detailText: {
        fontFamily: 'Inter-Medium',
        fontSize: 12,
        color: '#475569',
    },
    timesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    chipList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    timeChip: {
        backgroundColor: '#F0FDF4',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#BBF7D0',
    },
    timeChipText: {
        fontFamily: 'Inter-Medium',
        fontSize: 12,
        color: '#15803D',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    modalTitle: {
        fontFamily: 'Inter-Bold',
        fontSize: 18,
        color: '#0F172A',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    formScroll: {
        marginBottom: 20,
    },
    label: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 14,
        color: '#334155',
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: 'Inter-Medium',
        fontSize: 15,
        color: '#0F172A',
    },
    timesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    timeToggle: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    timeToggleActive: {
        backgroundColor: '#EFF6FF',
        borderColor: '#3B82F6',
    },
    timeToggleText: {
        fontFamily: 'Inter-Medium',
        fontSize: 14,
        color: '#64748B',
    },
    timeToggleTextActive: {
        color: '#1E3A8A',
        fontFamily: 'Inter-SemiBold',
    },
    submitWrap: {
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 8,
    },
    submitBtn: {
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});

export default PatientMedicationsEditor;
