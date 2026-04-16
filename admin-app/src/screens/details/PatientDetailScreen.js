import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, TouchableOpacity, ActivityIndicator, Linking, Alert, Modal, TextInput } from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import GradientHeader from '../../components/common/GradientHeader';
import PatientHealthView from '../../components/common/PatientHealthView';
import { apiService, handleApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const PHASE_TIMES = {
    morning: ['08:00 AM'],
    afternoon: ['01:00 PM'],
    night: ['08:00 PM']
};

const InfoRow = ({ icon, color, label, value, isLast }) => {
    if (!value && value !== 0) return null; // hide if no data
    return (
        <View>
            <View style={s.infoRow}>
                <View style={[s.infoIconBox, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
                    <Feather name={icon} size={16} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[s.infoLabel, Theme.typography.common]}>{label}</Text>
                    <Text style={[s.infoValue, Theme.typography.common]}>{String(value)}</Text>
                </View>
            </View>
            {!isLast && <View style={s.cardDivider} />}
        </View>
    );
};

const ArrayCardList = ({ items, icon, color, title, renderItem }) => {
    if (!items || items.length === 0) return null;
    return (
        <View style={{ marginTop: 24 }}>
            <Text style={[s.sectionTitle, Theme.typography.common]}>{title}</Text>
            <View style={s.infoCard}>
                {items.map((item, idx) => (
                    <View key={idx}>
                        <View style={s.infoRow}>
                            <View style={[s.infoIconBox, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
                                <Feather name={icon} size={16} color={color} />
                            </View>
                            <View style={{ flex: 1, paddingTop: 4 }}>
                                {renderItem(item)}
                            </View>
                        </View>
                        {idx < items.length - 1 && <View style={s.cardDivider} />}
                    </View>
                ))}
            </View>
        </View>
    );
};

export default function PatientDetailScreen({ navigation, route }) {
    const { patientId } = route.params;
    const { profile } = useAuth();
    const userRole = profile?.role || 'caller';
    const isCallerRole = ['caller', 'caretaker'].includes(userRole);
    
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Caller Medication Management
    const [showMedModal, setShowMedModal] = useState(false);
    const [editingMed, setEditingMed] = useState(null);
    const [medForm, setMedForm] = useState({ name: '', dosage: '', frequency: 'Daily', timePhase: 'morning' });
    const [submitting, setSubmitting] = useState(false);

    const getCurrentPhase = () => {
        const hour = new Date().getHours();
        if (hour >= 17) return 'Night';
        if (hour >= 12) return 'Afternoon';
        return 'Morning';
    };
    const currentPhase = getCurrentPhase();

    const fetchPatient = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await apiService.patients.getById(patientId);
            setPatient(res.data);
        } catch (err) {
            console.error('Failed to load patient detail', err);
            setError(handleApiError(err).message || 'Failed to load patient details');
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        fetchPatient();
    }, [fetchPatient]);

    const handleCall = (phone) => {
        if (!phone) return Alert.alert('No Phone', 'No phone on file.');
        Linking.openURL(`tel:${phone}`);
    };

    const handleEmail = (email) => {
        if (!email) return Alert.alert('No Email', 'No email on file.');
        Linking.openURL(`mailto:${email}`);
    };

    const openAddMedModal = () => {
        setEditingMed(null);
        setMedForm({ name: '', dosage: '', frequency: 'Daily', timePhase: 'morning' });
        setShowMedModal(true);
    };

    const openEditMedModal = (med) => {
        setEditingMed(med);
        let phase = 'morning';
        const times = med.scheduledTimes || [];
        if (times.includes('01:00 PM') || times.some(t => t.includes('PM') && parseInt(t.split(':')[0]) !== 12 && parseInt(t.split(':')[0]) < 5)) phase = 'afternoon';
        if (times.includes('08:00 PM') || times.some(t => t.includes('PM') && parseInt(t.split(':')[0]) >= 5 && parseInt(t.split(':')[0]) !== 12)) phase = 'night';

        setMedForm({
            name: med.name || '',
            dosage: med.dosage || '',
            frequency: med.frequency || 'Daily',
            timePhase: phase
        });
        setShowMedModal(true);
    };

    const saveMedication = async () => {
        if (!medForm.name.trim()) {
            Alert.alert('Validation Error', 'Please provide a medication name.');
            return;
        }
        setSubmitting(true);
        try {
            const todayStr = new Date().toLocaleDateString('en-CA');
            let updatedLogs = editingMed ? [...(editingMed.takenLogs || [])] : [];
            let updatedDates = editingMed ? [...(editingMed.takenDates || [])] : [];
            
            // "but it should be default marked as not completed" - clear today's completion when updating timing
            updatedLogs = updatedLogs.filter(l => l.date !== todayStr);
            updatedDates = updatedDates.filter(d => d !== todayStr);

            const medData = {
                name: medForm.name,
                dosage: medForm.dosage || 'As prescribed',
                frequency: medForm.frequency,
                scheduledTimes: PHASE_TIMES[medForm.timePhase],
                startDate: editingMed ? (editingMed.startDate || new Date()) : new Date(),
                takenLogs: updatedLogs,
                takenDates: updatedDates
            };

            if (editingMed) {
                await apiService.caretaker.updateMedication(patientId, editingMed._id || editingMed.id, medData);
            } else {
                await apiService.caretaker.addMedication(patientId, medData);
            }
            setShowMedModal(false);
            fetchPatient(); 
        } catch (err) {
            Alert.alert('Error', handleApiError(err).message);
        } finally {
            setSubmitting(false);
        }
    };

    const deleteMedication = (med) => {
        Alert.alert('Remove Medication', `Remove ${med.name}?`, [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Remove', 
                style: 'destructive', 
                onPress: async () => {
                    try {
                        await apiService.caretaker.deleteMedication(patientId, med._id || med.id);
                        fetchPatient();
                    } catch (err) {
                        Alert.alert('Error', handleApiError(err).message);
                    }
                } 
            }
        ]);
    };

    const handleToggleMedication = async (med) => {
        // Block callers from toggling meds outside Active Call screen
        if (isCallerRole) {
            Alert.alert(
                'Action Not Allowed',
                'Medications can only be confirmed during an active call. Please use the Routing Queue to start a call with this patient.',
                [{ text: 'OK' }]
            );
            return;
        }

        const medId = typeof med === 'object' ? (med._id || med.id) : null;
        if (!medId) return Alert.alert('Error', 'Cannot toggle this medication, ID is missing.');
        
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-CA'); // Gets local YYYY-MM-DD
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false }); // HH:MM:SS
        
        const rootMeds = patient.medications || [];
        const metadataMeds = (patient.metadata && patient.metadata.medications) || [];
        const allMeds = unique([...metadataMeds, ...rootMeds]);

        const currentPhaseObj = getCurrentPhase();
        const phaseMeds = allMeds.filter(med => {
            const times = med.scheduledTimes || [];
            if (times.length === 0) return currentPhaseObj === 'Morning';
            if (currentPhaseObj === 'Morning') return times.some(t => t.includes('AM') || t.toLowerCase().includes('morning'));
            if (currentPhaseObj === 'Afternoon') return times.some(t => {
                if (!t.includes('PM')) return false;
                let h = parseInt(t.split(':')[0]);
                if (h === 12) h = 0;
                return h < 5;
            });
            if (currentPhaseObj === 'Night') return times.some(t => {
                if (!t.includes('PM')) return false;
                let h = parseInt(t.split(':')[0]);
                if (h === 12) return false;
                return h >= 5;
            });
            return true;
        });
        
        const totalMeds = phaseMeds.length;
        let previousCompleted = 0;
        let isCurrentMedAlreadyTaken = false;
        
        phaseMeds.forEach(m => {
            const isMedObj = typeof m === 'object';
            if (isMedObj) {
                const hasLog = m.takenLogs && m.takenLogs.some(l => l.date === todayStr);
                const hasDate = m.takenDates && m.takenDates.includes(todayStr);
                if (hasLog || hasDate) {
                    previousCompleted++;
                    if ((m._id || m.id) === medId) {
                        isCurrentMedAlreadyTaken = true;
                    }
                }
            }
        });

        try {
            // Update state optimistically
            setPatient(prev => {
                const p = { ...prev };
                const updateMedList = (medList) => {
                    if (!medList) return [];
                    return medList.map(m => {
                        const mId = typeof m === 'object' ? (m._id || m.id) : null;
                        if (mId === medId) {
                            let logs = m.takenLogs ? [...m.takenLogs] : [];
                            const hasTaken = logs.some(l => l.date === todayStr);
                            if (hasTaken) {
                                logs = logs.filter(l => l.date !== todayStr);
                            } else {
                                logs.push({ date: todayStr, timestamp: now.toISOString() });
                            }
                            return { ...m, takenLogs: logs };
                        }
                        return m;
                    });
                };
                
                if (p.metadata && p.metadata.medications) p.metadata.medications = updateMedList(p.metadata.medications);
                if (p.medications) p.medications = updateMedList(p.medications);
                return p;
            });
            
            // Backend commit
            await apiService.patients.toggleMedication(patientId, medId, todayStr, timeStr);
        } catch (err) {
            console.error('Toggle medication failed', err);
            Alert.alert('Error', 'Failed to update medication status.');
            fetchPatient(); // Reset state on failure
        }
    };


    if (loading) {
        return (
            <View style={[s.container, s.center]}>
                <StatusBar barStyle="dark-content" />
                <ActivityIndicator size="large" color="#6366F1" />
            </View>
        );
    }

    if (error || !patient) {
        return (
            <View style={s.container}>
                <StatusBar barStyle="dark-content" />
                <GradientHeader title="Error" subtitle="Patient Not Found" onBack={() => navigation.goBack()} />
                <View style={[s.center, { marginTop: 40 }]}>
                    <Feather name="alert-triangle" size={48} color="#EF4444" />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#1E293B', marginTop: 16 }}>Failed to Load</Text>
                    <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
                        {error || "Could not find the patient record."}
                    </Text>
                    <TouchableOpacity style={s.retryBtn} onPress={fetchPatient}>
                        <Text style={s.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const {
        metadata = {}, conditions: rootCond = [], medications: rootMeds = [],
        medical_history = [], allergies = [], vaccinations = [], appointments = [],
        gp_name, gp_email, gp_phone, blood_type, risk_level, mobility_level,
        weight_kg, height_cm, smoking_status, alcohol_use, exercise_frequency,
        city, address, timezone, gender, language, date_of_birth
    } = patient;

    const unique = (arr) => {
        const map = new Map();
        arr.forEach(item => {
            if (!item) return;
            const key = typeof item === 'object' ? (item._id || item.id || JSON.stringify(item)) : item;
            if (!map.has(key)) map.set(key, item);
        });
        return Array.from(map.values());
    };

    const conditions = unique([...(metadata.conditions || []), ...rootCond]);
    const medications = unique([...(metadata.medications || []), ...rootMeds]);

    const phaseMedications = medications.filter(med => {
        const times = med.scheduledTimes || [];
        if (times.length === 0) return currentPhase === 'Morning';
        if (currentPhase === 'Morning') return times.some(t => t.includes('AM') || t.toLowerCase().includes('morning'));
        if (currentPhase === 'Afternoon') return times.some(t => {
            if (!t.includes('PM')) return false;
            let h = parseInt(t.split(':')[0]);
            if (h === 12) h = 0;
            return h < 5;
        });
        if (currentPhase === 'Night') return times.some(t => {
            if (!t.includes('PM')) return false;
            let h = parseInt(t.split(':')[0]);
            if (h === 12) return false;
            return h >= 5;
        });
        return true;
    });

    const joinDate = patient.created_at ? new Date(patient.created_at).toLocaleDateString() : 'Unknown';
    const dobFormatted = date_of_birth ? new Date(date_of_birth).toLocaleDateString() : null;

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            <GradientHeader 
                title={patient.fullName || patient.name || 'Patient Profile'} 
                subtitle={`Patient ID: ${patient._id ? patient._id.slice(-6).toUpperCase() : ''}`} 
                onBack={() => navigation.goBack()}
            >
                <View style={s.headerStats}>
                    <View style={s.hStat}>
                        <Text style={[s.hStatVal, Theme.typography.common, { color: patient.isActive || patient.is_active ? '#10B981' : '#F59E0B' }]}>
                            {patient.isActive || patient.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </Text>
                        <Text style={[s.hStatLbl, Theme.typography.common]}>SYSTEM STATUS</Text>
                    </View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}>
                        <Text style={[s.hStatVal, Theme.typography.common, { color: risk_level === 'high' ? '#EF4444' : risk_level === 'medium' ? '#F59E0B' : '#10B981' }]}>
                            {risk_level ? risk_level.toUpperCase() : 'N/A'}
                        </Text>
                        <Text style={[s.hStatLbl, Theme.typography.common]}>RISK LEVEL</Text>
                    </View>
                    <View style={s.hStatDivider} />
                    <View style={s.hStat}>
                        <Text style={[s.hStatVal, Theme.typography.common, { color: '#EF4444' }]}>
                            {blood_type || '--'}
                        </Text>
                        <Text style={[s.hStatLbl, Theme.typography.common]}>BLOOD TYPE</Text>
                    </View>
                </View>
            </GradientHeader>

            <ScrollView style={s.body} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* Contact Actions */}
                <View style={s.actionGrid}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => handleCall(patient.phone)}>
                        <Feather name="phone-call" size={20} color="#FFFFFF" />
                        <Text style={s.actionText}>Call Patient</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, s.actionBtnAlt]} onPress={() => handleEmail(patient.email)}>
                        <Feather name="mail" size={20} color="#3B82F6" />
                        <Text style={[s.actionText, { color: '#3B82F6' }]}>Email</Text>
                    </TouchableOpacity>
                </View>

                {/* Core Medical Data: PatientHealthView */}
                <View style={{ marginTop: 8, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={[s.sectionTitle, Theme.typography.common, { marginTop: 12, marginBottom: 0 }]}>{currentPhase} Focus</Text>
                    </View>
                    <PatientHealthView 
                        conditions={conditions} 
                        medications={phaseMedications} 
                        editable={false} 
                        currentShift={currentPhase}
                        onToggleMedication={handleToggleMedication}
                    />
                </View>

                {/* Patient Profile & Demographics */}
                <Text style={[s.sectionTitle, Theme.typography.common]}>Demographics & Location</Text>
                <View style={s.infoCard}>
                    <InfoRow icon="user" color="#6366F1" label="FULL NAME" value={patient.fullName || patient.name} />
                    <InfoRow icon="mail" color="#10B981" label="EMAIL ADDRESS" value={patient.email} />
                    <InfoRow icon="phone" color="#F59E0B" label="PHONE NUMBER" value={patient.phone} />
                    <InfoRow icon="calendar" color="#8B5CF6" label="DATE OF BIRTH" value={dobFormatted} />
                    <InfoRow icon="users" color="#EC4899" label="GENDER" value={gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : null} />
                    <InfoRow icon="globe" color="#06B6D4" label="LANGUAGE" value={language} />
                    <InfoRow icon="map-pin" color="#64748B" label="LOCATION" value={`${city || ''} ${address ? typeof address === 'string' ? address : '' : ''}`.trim()} />
                    <InfoRow icon="clock" color="#64748B" label="TIMEZONE" value={timezone} isLast />
                </View>

                {/* Vitals & Lifestyle */}
                {(weight_kg || height_cm || smoking_status || alcohol_use || exercise_frequency || mobility_level) ? (
                    <>
                        <Text style={[s.sectionTitle, Theme.typography.common]}>Vitals & Lifestyle</Text>
                        <View style={s.infoCard}>
                            <InfoRow icon="activity" color="#EF4444" label="VITALS" value={weight_kg && height_cm ? `${height_cm} cm, ${weight_kg} kg` : weight_kg ? `${weight_kg} kg` : `${height_cm} cm`} />
                            <InfoRow icon="refresh-cw" color="#F59E0B" label="MOBILITY" value={mobility_level ? mobility_level.charAt(0).toUpperCase() + mobility_level.slice(1) : null} />
                            <InfoRow icon="wind" color="#64748B" label="SMOKING STATUS" value={smoking_status} />
                            <InfoRow icon="droplet" color="#64748B" label="ALCOHOL USE" value={alcohol_use} />
                            <InfoRow icon="heart" color="#10B981" label="EXERCISE FREQUENCY" value={exercise_frequency} isLast />
                        </View>
                    </>
                ) : null}

                {/* Additional Clinical Arrays */}
                <ArrayCardList 
                    title="Medical History" items={medical_history} icon="file-text" color="#6366F1"
                    renderItem={(item) => {
                        const isObj = typeof item === 'object';
                        const title = isObj ? (item.event || item.condition || item.name || 'Medical Event') : item;
                        const dateStr = isObj && item.date ? new Date(item.date).toLocaleDateString(undefined, {month:'short', year:'numeric'}) : '';
                        const notes = isObj ? item.notes : '';
                        return (
                            <View>
                                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                                    <Text style={[s.infoValue, Theme.typography.common, {flex: 1}]}>{title}</Text>
                                    {!!dateStr && <Text style={[s.infoLabel, Theme.typography.common, {marginLeft: 8}]}>{dateStr}</Text>}
                                </View>
                                {!!notes && <Text style={[s.infoLabel, Theme.typography.common, {marginTop: 6, color: '#64748B'}]}>{notes}</Text>}
                            </View>
                        );
                    }}
                />

                <ArrayCardList 
                    title="Allergies" items={allergies} icon="alert-octagon" color="#EF4444"
                    renderItem={(item) => {
                        const isObj = typeof item === 'object';
                        const name = isObj ? (item.name || item.allergen) : item;
                        const reaction = isObj ? item.reaction : '';
                        const severity = isObj ? item.severity : '';
                        return (
                            <View>
                                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                                    <Text style={[s.infoValue, Theme.typography.common, { color: '#EF4444' }]}>{name}</Text>
                                    {!!severity && (
                                        <View style={{backgroundColor:'#FEF2F2', paddingHorizontal:6, paddingVertical:2, borderRadius:4}}>
                                            <Text style={{fontSize:10, fontWeight:'700', color:'#EF4444'}}>{severity.toUpperCase()}</Text>
                                        </View>
                                    )}
                                </View>
                                {!!reaction && <Text style={[s.infoLabel, Theme.typography.common, {marginTop: 4}]}>Reaction: {reaction}</Text>}
                            </View>
                        );
                    }}
                />

                <ArrayCardList 
                    title="Vaccinations" items={vaccinations} icon="shield" color="#10B981"
                    renderItem={(item) => {
                        const isObj = typeof item === 'object';
                        const name = isObj ? (item.name || item.vaccine) : item;
                        const dateStr = isObj && item.date_given ? new Date(item.date_given).toLocaleDateString() : '';
                        return (
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                                <Text style={[s.infoValue, Theme.typography.common, {flex:1}]}>{name}</Text>
                                {!!dateStr && <Text style={[s.infoLabel, Theme.typography.common, {color:'#10B981', fontWeight:'700'}]}>{dateStr}</Text>}
                            </View>
                        );
                    }}
                />

                {/* General Practitioner */}
                {(gp_name || gp_phone || gp_email) && (
                    <>
                        <Text style={[s.sectionTitle, Theme.typography.common]}>General Practitioner</Text>
                        <View style={s.infoCard}>
                            <InfoRow icon="user-plus" color="#8B5CF6" label="PHYSICIAN NAME" value={gp_name} />
                            <InfoRow icon="phone" color="#10B981" label="CLINIC PHONE" value={gp_phone} />
                            <InfoRow icon="mail" color="#3B82F6" label="CLINIC EMAIL" value={gp_email} isLast />
                        </View>
                    </>
                )}

                {/* Appointments */}
                <ArrayCardList 
                    title="Upcoming Appointments" items={appointments} icon="calendar" color="#F59E0B"
                    renderItem={(app) => {
                        const isObj = typeof app === 'object';
                        const title = isObj ? (app.title || app.doctor || app.type || 'Appointment') : app;
                        const dateStr = isObj && app.date ? new Date(app.date).toLocaleDateString() : '';
                        return (
                            <View>
                                <Text style={[s.infoValue, Theme.typography.common]}>{title}</Text>
                                {!!dateStr && <Text style={[s.infoLabel, Theme.typography.common, { marginTop: 4 }]}>{dateStr}</Text>}
                            </View>
                        );
                    }}
                />

                {/* Organization Details */}
                {patient.organization_id && typeof patient.organization_id === 'object' && (
                    <>
                        <Text style={[s.sectionTitle, Theme.typography.common]}>Associated Organization</Text>
                        <View style={s.orgCard}>
                            <View style={s.orgIconBox}>
                                <Feather name="grid" size={24} color="#6366F1" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.orgName}>{patient.organization_id.name}</Text>
                                {patient.organization_id.type && <Text style={s.orgType}>{patient.organization_id.type.toUpperCase()}</Text>}
                            </View>
                        </View>
                    </>
                )}

                {/* Overall Medications Management */}
                <View style={{ marginTop: 24 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[s.sectionTitle, Theme.typography.common, { marginTop: 0 }]}>All Prescribed Medications</Text>
                        <TouchableOpacity style={s.addMedBtn} onPress={openAddMedModal}>
                            <Feather name="plus" size={14} color="#FFF" />
                            <Text style={s.addMedBtnText}>Add Med</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={s.infoCard}>
                        {medications.length === 0 ? (
                            <View style={{ padding: 24, alignItems: 'center' }}>
                                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>No medications found on record.</Text>
                            </View>
                        ) : (
                            medications.map((med, idx) => (
                                <View key={med._id || med.id || idx}>
                                    <View style={[s.infoRow, { alignItems: 'center' }]}>
                                        <View style={[s.infoIconBox, { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', borderColor: '#E0E7FF' }]}>
                                            <Feather name="clock" size={14} color="#6366F1" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.infoValue, { fontSize: 14 }]}>{med.name} {med.dosage ? <Text style={{ fontWeight: '600', color: '#64748B' }}>{med.dosage}</Text> : null}</Text>
                                            <Text style={s.infoLabel}>{med.scheduledTimes?.length > 0 ? med.scheduledTimes.join(', ') : 'No schedule set'}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            <TouchableOpacity onPress={() => openEditMedModal(med)} style={{ padding: 8, backgroundColor: '#EEF2FF', borderRadius: 8 }}>
                                                <Feather name="edit-2" size={16} color="#6366F1" />
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => deleteMedication(med)} style={{ padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8 }}>
                                                <Feather name="trash-2" size={16} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    {idx < medications.length - 1 && <View style={s.cardDivider} />}
                                </View>
                            ))
                        )}
                    </View>
                </View>

            </ScrollView>

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
                            <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#F1F5F9' }]} onPress={() => setShowMedModal(false)}>
                                <Text style={{ color: '#64748B', fontWeight: '700' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#6366F1' }]} onPress={saveMedication} disabled={submitting}>
                                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#FFF', fontWeight: '700' }}>{editingMed ? 'Update' : 'Add'}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    center: { justifyContent: 'center', alignItems: 'center' },
    body: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },
    
    headerStats: { 
        flexDirection: 'row', 
        justifyContent: 'space-around', 
        marginTop: 20, 
        backgroundColor: '#FFFFFF', 
        borderRadius: 20, 
        paddingVertical: 20,
        ...Theme.shadows.sharp,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    hStat: { alignItems: 'center' },
    hStatVal: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
    hStatLbl: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginTop: 4, letterSpacing: 0.5 },
    hStatDivider: { width: 1, backgroundColor: '#F1F5F9' },

    actionGrid: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 8 },
    actionBtn: { 
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#6366F1', borderRadius: 16, paddingVertical: 16,
        ...Theme.shadows.sharp
    },
    actionBtnAlt: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', shadowOpacity: 0, elevation: 0 },
    actionText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

    sectionTitle: { fontSize: 13, fontWeight: '800', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 24, marginBottom: 12, paddingLeft: 4 },
    infoCard: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 20, 
        ...Theme.shadows.sharp, 
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 16 },
    infoIconBox: { 
        width: 44, height: 44, borderRadius: 12, 
        backgroundColor: '#EEF2FF', 
        justifyContent: 'center', alignItems: 'center', 
        borderWidth: 1, borderColor: '#E0E7FF' 
    },
    infoLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
    infoValue: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginTop: 4 },
    cardDivider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 76 },

    orgCard: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Theme.shadows.sharp 
    },
    orgIconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    orgName: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
    orgType: { fontSize: 12, fontWeight: '700', color: '#6366F1', marginTop: 4, letterSpacing: 0.5 },

    retryBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#6366F1', borderRadius: 8 },
    retryText: { color: '#FFFFFF', fontWeight: '700' },

    addMedBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    addMedBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700', marginLeft: 4 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#FFF', borderRadius: 20, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 20, textAlign: 'center' },
    inputLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 6, textTransform: 'uppercase' },
    input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 15, color: '#1E293B' },
    phaseOptions: { flexDirection: 'row', gap: 8, marginBottom: 24 },
    phaseBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, alignItems: 'center' },
    phaseBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
    phaseBtnTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    phaseBtnTxtActive: { color: '#6366F1' },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
});
