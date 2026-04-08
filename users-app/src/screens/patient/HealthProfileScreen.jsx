import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator, Animated, Pressable, Linking, Modal, TouchableWithoutFeedback, TextInput, KeyboardAvoidingView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { TriangleAlert, ShieldCheck, HeartPulse, Activity, Stethoscope, Droplet, User, CalendarDays, Watch, Flame, Phone, Plus, Edit2, X, Trash2, CheckCircle2 } from 'lucide-react-native';
import { apiService } from '../../lib/api';

const C = {
  primary: '#6366F1', primaryDark: '#4338CA', primarySoft: '#EEF2FF',
  cardBg: '#FFFFFF', pageBg: '#F8FAFC',
  dark: '#0F172A', mid: '#334155', muted: '#94A3B8', light: '#CBD5E1',
  border: '#F1F5F9', borderMid: '#E2E8F0',
  success: '#10B981', successBg: '#D1FAE5',
  danger: '#F43F5E', dangerBg: '#FFE4E6',
  warning: '#F59E0B', warningBg: '#FEF3C7',
  accent: '#06B6D4',
};

const FONT = {
  regular: { fontFamily: 'Inter_400Regular' },
  medium: { fontFamily: 'Inter_500Medium' },
  semibold: { fontFamily: 'Inter_600SemiBold' },
  bold: { fontFamily: 'Inter_700Bold' },
  heavy: { fontFamily: 'Inter_800ExtraBold' },
};

const ALLERGY_SEVERITY = {
  mild: { bg: '#FEF9C3', text: '#854D0E', border: '#FDE68A' },
  moderate: { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74' },
  severe: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
};

const CONDITION_STATUS = {
  active: { bg: '#FEE2E2', text: '#991B1B' },
  managed: { bg: '#DCFCE7', text: '#166534' },
  resolved: { bg: '#F0F9FF', text: '#075985' },
};

// UI Component for selecting options horizontally
const ChipSelector = ({ options, selected, onSelect, vertical = false }) => (
    <ScrollView 
        horizontal={!vertical} 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={vertical ? s.chipVerticalWrap : s.chipSelectorWrap}
    >
        {options.map((opt) => {
            const isSelected = selected === opt.value;
            return (
                <Pressable
                    key={opt.value}
                    style={[s.selectChip, isSelected && s.selectChipActive, vertical && { width: '100%', marginBottom: 10 }]}
                    onPress={() => onSelect(opt.value)}
                >
                    <Text style={[s.selectChipTxt, isSelected && s.selectChipTxtActive]}>{opt.label}</Text>
                </Pressable>
            );
        })}
    </ScrollView>
);

export default function HealthProfileScreen({ navigation }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const staggerAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;
    
    // Modal states
    const [modalVisible, setModalVisible] = useState(false);
    const [editingType, setEditingType] = useState(null);
    const [formState, setFormState] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    
    const backdropAnim = useRef(new Animated.Value(0)).current;
    const modalAnim = useRef(new Animated.Value(0)).current;

    const runAnimations = useCallback(() => {
        staggerAnims.forEach(anim => anim.setValue(0));
        Animated.stagger(60,
            staggerAnims.map(anim =>
                Animated.spring(anim, { toValue: 1, friction: 8, tension: 45, useNativeDriver: true })
            )
        ).start();
    }, [staggerAnims]);

    const loadProfile = async () => {
        try {
            const { data } = await apiService.patients.getProfile();
            setProfile(data);
        } catch (err) {
            console.warn('Failed to load health profile:', err.message);
            try {
               const res = await apiService.patients.getMe();
               if (res.data.patient?.subscription?.plan === 'free') {
                   setProfile({ freePlan: true });
               }
            } catch (e) {}
        } finally {
            setLoading(false);
        }
    };

    const hasAnimated = useRef(false);

    useFocusEffect(
        useCallback(() => {
            loadProfile().then(() => {
                if (!hasAnimated.current) {
                    hasAnimated.current = true;
                    runAnimations();
                }
            });
        }, [runAnimations])
    );

    const openModal = (type, item = null) => {
        setEditingType(type);
        if (item) {
            setFormState({ ...item });
        } else {
            // defaults
            if (type === 'condition') setFormState({ name: '', status: 'managed', severity: 'moderate', notes: '' });
            else if (type === 'allergy') setFormState({ name: '', severity: 'moderate', reaction: '' });
            else if (type === 'vitals') setFormState({ height_cm: profile?.lifestyle?.height_cm || '', weight_kg: profile?.lifestyle?.weight_kg || '' });
            else if (type === 'habits') setFormState({ smoking_status: profile?.lifestyle?.smoking_status || 'never', alcohol_use: profile?.lifestyle?.alcohol_use || 'none' });
            else if (type === 'activity') setFormState({ exercise_frequency: profile?.lifestyle?.exercise_frequency || 'none', mobility_level: profile?.lifestyle?.mobility_level || 'full' });
            else if (type === 'gp') setFormState({ gp_name: profile?.gp?.name || '', gp_phone: profile?.gp?.phone || '', gp_email: profile?.gp?.email || '' });
            else if (type === 'history') setFormState({ event: '', date: '', notes: '' });
            else if (type === 'medication') setFormState({ name: '', dosage: '', frequency: 'daily', times: ['morning'], prescribed_by: '', is_active: true });
            else if (type === 'vaccination') setFormState({ name: '', administered_by: '' });
            else if (type === 'appointment') setFormState({ title: '', doctor_name: '', location: '', status: 'upcoming' });
        }
        
        setModalVisible(true);
        Animated.parallel([
            Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.spring(modalAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true })
        ]).start();
    };

    const closeModal = () => {
        Animated.parallel([
            Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(modalAnim, { toValue: 0, duration: 220, useNativeDriver: true })
        ]).start(() => {
            setModalVisible(false);
            setEditingType(null);
            setFormState({});
        });
    };
    
    const getCollectionName = (type) => {
        if (type === 'history') return 'medical_history';
        if (type === 'allergy') return 'allergies';
        return type + 's';
    };

    const executeDelete = async (collection, id) => {
        try {
            setIsSaving(true);
            await apiService.patients.deleteHealthItem(collection, id);
            await loadProfile();
            closeModal();
        } catch (e) {
            if (Platform.OS === 'web') window.alert("Could not delete item");
            else Alert.alert("Error", "Could not delete item");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (collection, id) => {
        if (Platform.OS === 'web') {
            if (window.confirm("Are you sure you want to permanently delete this item?")) {
                executeDelete(collection, id);
            }
        } else {
            Alert.alert("Confirm Delete", "Are you sure you want to permanently delete this item?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => executeDelete(collection, id) }
            ]);
        }
    };

    const handleSave = async () => {
        // Validation logic to prevent empty critical fields
        if (['condition', 'allergy', 'medication', 'vaccination'].includes(editingType) && !formState.name) {
            return Platform.OS === 'web' ? window.alert('Please provide a valid name.') : Alert.alert('Missing Field', 'Please provide a valid name.');
        }
        if (editingType === 'history' && !formState.event) {
            return Platform.OS === 'web' ? window.alert('Please provide an event name.') : Alert.alert('Missing Field', 'Please provide an event name.');
        }
        if (editingType === 'appointment' && (!formState.title || !formState.doctor_name)) {
            return Platform.OS === 'web' ? window.alert('Please provide appointment details.') : Alert.alert('Missing Field', 'Please provide appointment details.');
        }
        
        setIsSaving(true);
        try {
            let payload = { ...formState };
            
            if (['vitals', 'habits', 'activity'].includes(editingType)) {
                payload = { ...profile?.lifestyle, ...formState };
            }

            let res;
            if (editingType === 'condition') res = await apiService.patients.updateConditions(payload);
            else if (editingType === 'allergy') res = await apiService.patients.updateAllergies(payload);
            else if (['vitals', 'habits', 'activity'].includes(editingType)) res = await apiService.patients.updateLifestyle(payload);
            else if (editingType === 'gp') res = await apiService.patients.updatePrimaryDoctor(payload);
            else if (editingType === 'history') res = await apiService.patients.updateMedicalHistory({ ...payload, date: payload.date ? new Date(payload.date) : new Date() });
            else if (editingType === 'medication') res = await apiService.patients.updateMedications(payload);
            else if (editingType === 'vaccination') res = await apiService.patients.updateVaccinations({ ...payload, date_given: payload.date_given ? new Date(payload.date_given) : new Date() });
            else if (editingType === 'appointment') res = await apiService.patients.updateAppointments({ ...payload, date: payload.date ? new Date(payload.date) : new Date() });
            
            await loadProfile();
            closeModal();
        } catch (error) {
            if (Platform.OS === 'web') window.alert('Failed to save data. Please check your inputs.');
            else Alert.alert('Error', 'Failed to save data. Please check your inputs.');
            console.warn(error);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={C.primary} /></View>;
    if (profile?.freePlan) return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
                <View style={s.upgradeIconWrap}><ShieldCheck size={32} color={C.primary} /></View>
                <Text style={s.upgradeTitle}>Premium Feature</Text>
                <Text style={s.upgradeBody}>Your centralized health profile is included in the Basic Plan. Upgrade on the Home screen to build your health profile.</Text>
            </View>
        );

    const { conditions = [], allergies = [], medical_history = [], medications = [], vaccinations = [], appointments = [], lifestyle = {}, gp = {}, age } = profile || {};
    
    // BMI Logic
    const calculateBMI = (h, w) => { if (!h || !w) return null; const hm = h / 100; return (w / (hm * hm)).toFixed(1); };
    const bmi = calculateBMI(lifestyle.height_cm, lifestyle.weight_kg);
    const getBmiStyle = (val) => {
        if (!val) return { bg: '#EFF6FF', text: C.dark, iconBg: '#DBEAFE', icon: C.primary, label: 'BMI' };
        const v = parseFloat(val);
        if (v < 18.5) return { bg: C.warningBg, text: C.dark, iconBg: '#FDE68A', icon: C.warning, label: 'Underweight' };
        if (v < 25) return { bg: C.successBg, text: C.dark, iconBg: '#A7F3D0', icon: C.success, label: 'Normal' };
        if (v < 30) return { bg: C.warningBg, text: C.dark, iconBg: '#FDE68A', icon: C.warning, label: 'Overweight' };
        return { bg: C.dangerBg, text: C.dark, iconBg: '#FECACA', icon: C.danger, label: 'Obese' };
    };
    const bmiTheme = getBmiStyle(bmi);

    const renderHeader = (title, typeToAdd) => (
        <View style={s.sectionHeaderRow}>
            <Text style={s.sectionHeaderBase}>{title}</Text>
            <Pressable style={({pressed}) => [s.addBtn, pressed && {opacity: 0.7}]} onPress={() => openModal(typeToAdd)}>
                <Plus size={14} color={C.primary} strokeWidth={3} />
            </Pressable>
        </View>
    );

    // Form Dropdown Options
    const severityOptions = [{label: 'Mild', value: 'mild'}, {label: 'Moderate', value: 'moderate'}, {label: 'Severe', value: 'severe'}];
    const statusOptions = [{label: 'Active', value: 'active'}, {label: 'Managed', value: 'managed'}, {label: 'Resolved/Cured', value: 'resolved'}];
    const smokeOptions = [{label: 'Non-Smoker', value: 'never'}, {label: 'Smoker', value: 'current'}, {label: 'Former', value: 'former'}];
    const alcoholOptions = [{label: 'Non-Drinker', value: 'none'}, {label: 'Occasional', value: 'occasional'}, {label: 'Frequent', value: 'heavy'}];
    const exerciseOptions = [{label: 'No Activity', value: 'none'}, {label: 'Light (Walks, Stretching)', value: 'light'}, {label: 'Moderate (Gym, Jogging)', value: 'moderate'}, {label: 'Highly Active (Heavy Cardio)', value: 'active'}];
    const mobilityOptions = [{label: 'Full', value: 'full'}, {label: 'Limited', value: 'limited'}, {label: 'Wheelchair', value: 'wheelchair'}, {label: 'Bedridden', value: 'bedridden'}];
    const frequencyOptions = [{label: 'Daily', value: 'daily'}, {label: 'Weekly', value: 'weekly'}, {label: 'As Needed', value: 'as_needed'}];
    const timeOptions = [{label: 'Morning', value: 'morning'}, {label: 'Afternoon', value: 'afternoon'}, {label: 'Evening', value: 'evening'}, {label: 'Night', value: 'night'}];

    const toggleTime = (t) => {
        let times = formState.times || [];
        if (times.includes(t)) times = times.filter(x => x !== t);
        else times = [...times, t];
        setFormState({...formState, times});
    };

    return (
        <LinearGradient colors={[C.pageBg, C.primarySoft]} style={s.container}>
            <View style={s.headerWrap}>
                <Animated.View style={[s.minimalHeader, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
                    <View style={s.mainHeaderRow}>
                        <View style={s.headerLeft}>
                            <Text style={s.headerLabel}>CARE RECORD</Text>
                            <Text style={s.headerTitle}>Health Profile</Text>
                        </View>
                        <View style={s.headerRight}>
                            <View style={s.ageBadge}>
                                <Text style={s.ageBadgeTxt}>{age ? `${age} Yrs` : 'No Age Set'}</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>
            </View>

            <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
                {/* 1. CONDITIONS */}
                <Animated.View style={{ opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('CURRENT CONDITIONS', 'condition')}
                        <View style={s.cardStack}>
                            {conditions.map((c, i) => {
                                const statStyle = CONDITION_STATUS[c.status] || CONDITION_STATUS.active;
                                return (
                                    <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('condition', c)}>
                                        <View style={[s.iconBg, { backgroundColor: statStyle.bg }]}><Activity size={18} color={statStyle.text} /></View>
                                        <View style={s.rowInfo}>
                                            <Text style={s.rowTitle}>{c.name}</Text>
                                            <Text style={s.rowSub}>{c.diagnosed_on ? new Date(c.diagnosed_on).getFullYear() : 'Unknown'} • <Text style={{textTransform: 'capitalize'}}>{c.severity || 'Unspecified'}</Text></Text>
                                        </View>
                                        <View style={[s.pill, { backgroundColor: statStyle.bg }]}><Text style={[s.pillTxt, { color: statStyle.text, textTransform: 'capitalize' }]}>{c.status}</Text></View>
                                    </Pressable>
                                );
                            })}
                            {conditions.length === 0 && <Text style={s.emptyRowTxt}>No active conditions</Text>}
                        </View>
                    </View>
                </Animated.View>

                {/* 2. ALLERGIES */}
                <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('ALLERGIES', 'allergy')}
                        <View style={s.card}>
                            <View style={s.chipWrap}>
                                {allergies.map((a, i) => {
                                    const sevStyle = ALLERGY_SEVERITY[a.severity] || ALLERGY_SEVERITY.moderate;
                                    return (
                                        <Pressable key={i} style={[s.chipEnhanced, { backgroundColor: sevStyle.bg, borderColor: sevStyle.border }]} onPress={() => openModal('allergy', a)}>
                                            <TriangleAlert size={14} color={sevStyle.text} style={{ marginRight: 6 }} />
                                            <Text style={[s.chipTxt, { color: sevStyle.text }]}>{a.name}</Text>
                                        </Pressable>
                                    );
                                })}
                                {allergies.length === 0 && <Text style={s.emptyRowTxt}>No known allergies</Text>}
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* 3. MEDICAL HISTORY */}
                <Animated.View style={{ opacity: staggerAnims[3], transform: [{ translateY: staggerAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('MEDICAL HISTORY', 'history')}
                        <View style={s.card}>
                            <View style={s.timelineContainer}>
                                {medical_history.map((h, i) => (
                                    <Pressable key={i} style={s.timelineRow} onPress={() => openModal('history', h)}>
                                        <View style={s.timelineLeft}>
                                            <View style={s.timelineDot} />
                                            {i < medical_history.length - 1 && <View style={s.timelineLine} />}
                                        </View>
                                        <View style={s.timelineContent}>
                                            <Text style={s.timelineDate}>{h.date ? new Date(h.date).toLocaleDateString('en-IN') : 'Unknown'}</Text>
                                            <Text style={s.timelineTitle}>{h.event}</Text>
                                            {h.notes && <Text style={s.timelineDesc}>{h.notes}</Text>}
                                        </View>
                                    </Pressable>
                                ))}
                                {medical_history.length === 0 && <Text style={s.emptyRowTxt}>No medical history recorded</Text>}
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* 4. CURRENT MEDS */}
                <Animated.View style={{ opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('ACTIVE MEDICATIONS', 'medication')}
                        <View style={s.cardStack}>
                            {medications.map((m, i) => (
                                <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('medication', m)}>
                                    <View style={[s.iconBg, { backgroundColor: C.primarySoft }]}><HeartPulse size={18} color={C.primaryDark} /></View>
                                    <View style={s.rowInfo}>
                                        <Text style={s.rowTitle}>{m.name} — {m.dosage}</Text>
                                        <Text style={[s.rowSub, {textTransform:'capitalize', color:C.muted, fontSize: 13, ...FONT.medium}]}>{m.frequency} • {(m.times||[]).join(', ')}</Text>
                                    </View>
                                </Pressable>
                            ))}
                            {medications.length === 0 && <Text style={s.emptyRowTxt}>No active medications</Text>}
                        </View>
                    </View>
                </Animated.View>

                {/* 5. VACCINATIONS */}
                <Animated.View style={{ opacity: staggerAnims[5], transform: [{ translateY: staggerAnims[5].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('VACCINATIONS', 'vaccination')}
                        <View style={s.cardStack}>
                            {vaccinations.map((vac, i) => (
                                <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('vaccination', vac)}>
                                    <View style={[s.iconBg, { backgroundColor: '#F0FDF4' }]}><ShieldCheck size={18} color="#16A34A" /></View>
                                    <View style={s.rowInfo}>
                                        <Text style={s.rowTitle}>{vac.name}</Text>
                                        <Text style={s.rowSub}>Given: {vac.date_given ? new Date(vac.date_given).toLocaleDateString() : 'Unknown'}</Text>
                                    </View>
                                    {vac.next_due && new Date(vac.next_due) > new Date() && (
                                        <View style={[s.pill, { backgroundColor: '#FEF3C7' }]}><Text style={[s.pillTxt, { color: '#B45309' }]}>Due {new Date(vac.next_due).getFullYear()}</Text></View>
                                    )}
                                </Pressable>
                            ))}
                            {vaccinations.length === 0 && <Text style={s.emptyRowTxt}>No vaccinations recorded</Text>}
                        </View>
                    </View>
                </Animated.View>

                {/* 6. APPOINTMENTS */}
                <Animated.View style={{ opacity: staggerAnims[6], transform: [{ translateY: staggerAnims[6].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        {renderHeader('UPCOMING APPOINTMENTS', 'appointment')}
                        <View style={s.cardStack}>
                            {appointments.map((app, i) => (
                                <Pressable key={i} style={s.rowItemEnhanced} onPress={() => openModal('appointment', app)}>
                                    <View style={[s.iconBg, { backgroundColor: '#FFF7ED' }]}><CalendarDays size={18} color="#EA580C" /></View>
                                    <View style={s.rowInfo}>
                                        <Text style={s.rowTitle}>{app.title}</Text>
                                        <Text style={s.rowSub}>{app.doctor_name} • {new Date(app.date).toLocaleDateString()}</Text>
                                    </View>
                                </Pressable>
                            ))}
                            {appointments.length === 0 && <Text style={s.emptyRowTxt}>No upcoming appointments</Text>}
                        </View>
                    </View>
                </Animated.View>

                {/* 7. LIFESTYLE (BENTO CLICKABLES) */}
                <Animated.View style={{ opacity: staggerAnims[7], transform: [{ translateY: staggerAnims[7].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        <View style={s.sectionHeaderRow}>
                            <Text style={s.sectionHeaderBase}>VITALS & HABITS</Text>
                        </View>
                        <View style={s.bentoGrid}>
                            <Pressable style={[s.bentoBox, { backgroundColor: bmiTheme.bg }]} onPress={() => openModal('vitals')}>
                                <View style={[s.bentoIcon, { backgroundColor: bmiTheme.iconBg }]}><User size={16} color={bmiTheme.icon} /></View>
                                <Text style={[s.bentoVal, { color: bmiTheme.text }]}>{bmi ? bmi : '—'}</Text>
                                <Text style={s.bentoLbl}>{bmiTheme.label}</Text>
                            </Pressable>
                            <Pressable style={[s.bentoBox, { backgroundColor: '#FDF2F8' }]} onPress={() => openModal('habits')}>
                                <View style={[s.bentoIcon, { backgroundColor: '#FCE7F3' }]}><Flame size={16} color="#DB2777" /></View>
                                <Text style={s.bentoVal} numberOfLines={1}>{lifestyle.smoking_status === 'current' ? 'Smoker' : 'Clean'}</Text>
                                <Text style={s.bentoLbl}>Habits</Text>
                            </Pressable>
                            <Pressable style={[s.bentoBox, { backgroundColor: '#F0FDF4' }]} onPress={() => openModal('activity')}>
                                <View style={[s.bentoIcon, { backgroundColor: '#DCFCE7' }]}><Activity size={16} color="#16A34A" /></View>
                                <Text numberOfLines={1} style={[s.bentoVal, { textTransform: 'capitalize' }]}>{lifestyle.exercise_frequency || 'None'}</Text>
                                <Text style={s.bentoLbl}>Mobility & Exs</Text>
                            </Pressable>
                        </View>
                    </View>
                </Animated.View>

                {/* 8. PRIMARY DOCTOR */}
                <Animated.View style={{ opacity: staggerAnims[8], transform: [{ translateY: staggerAnims[8].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <View style={s.section}>
                        <View style={s.sectionHeaderRow}>
                            <Text style={s.sectionHeaderBase}>PRIMARY DOCTOR</Text>
                            <Pressable style={({pressed}) => [s.addBtn, pressed && {opacity: 0.7}]} onPress={() => openModal('gp')}>
                                <Edit2 size={14} color={C.primary} strokeWidth={3} />
                            </Pressable>
                        </View>
                        <View style={s.cardStack}>
                            {gp.name ? (
                                <View style={s.gpCard}>
                                    <View style={s.gpProfileRow}>
                                        <View style={s.gpAvatar}><Text style={s.gpAvatarTxt}>{gp.name.charAt(0)}</Text></View>
                                        <View style={s.gpInfo}>
                                            <Text style={s.gpName}>{gp.name}</Text>
                                            {gp.email && <Text style={s.gpDetail}>{gp.email}</Text>}
                                            {gp.phone && <Text style={s.gpDetail}>{gp.phone}</Text>}
                                        </View>
                                    </View>
                                    <View style={s.gpActionRow}>
                                        <Pressable style={({ pressed }) => [s.btnCall, pressed && s.btnCallPressed]} onPress={() => gp.phone && Linking.openURL(`tel:${gp.phone}`)}>
                                            <Phone size={16} color="#FFF" />
                                            <Text style={s.btnCallText}>Call Clinic</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            ) : <Text style={s.emptyRowTxt}>No Primary Doctor assigned.</Text>}
                        </View>
                    </View>
                </Animated.View>

            </ScrollView>

            {/* Dynamic Modal Form */}
            <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                    <TouchableWithoutFeedback onPress={closeModal}>
                        <Animated.View style={[s.backdrop, { opacity: backdropAnim }]} />
                    </TouchableWithoutFeedback>
                    <View style={s.modalWrapper}>
                        <Animated.View style={[s.modalSheet, { transform: [{ translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [800, 0] }) }] }]}>
                            <View style={s.modalHandleWrap}><View style={s.modalHandle} /></View>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalBody}>
                                <View style={s.modalHeader}>
                                    <Text style={[s.modalTitle, {textTransform:'capitalize', fontSize: 20, ...FONT.heavy, color: C.dark}]}>
                                        {formState._id ? 'Edit ' : 'Update '}
                                        {['vitals', 'habits', 'activity'].includes(editingType) ? 'Lifestyle' : editingType}
                                    </Text>
                                    <View style={{flexDirection: 'row', gap: 12}}>
                                        {/* Show Trash Can Delete Button Only For Existing Collection Items */}
                                        {formState._id && ['condition', 'allergy', 'medication', 'vaccination', 'history', 'appointment'].includes(editingType) && (
                                            <Pressable onPress={() => handleDelete(getCollectionName(editingType), formState._id)} style={s.trashBtn}>
                                                <Trash2 size={20} color={C.danger} />
                                            </Pressable>
                                        )}
                                        <Pressable onPress={closeModal} style={s.closeIconBtn}><X size={20} color="#64748B" /></Pressable>
                                    </View>
                                </View>
                                
                                {/* Form Fields Matrix */}
                                {editingType === 'condition' && (
                                    <>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Condition Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Type 2 Diabetes" /></View>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Status</Text>
                                            <ChipSelector options={statusOptions} selected={formState.status} onSelect={v => setFormState({...formState, status: v})} />
                                        </View>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Severity</Text>
                                            <ChipSelector options={severityOptions} selected={formState.severity} onSelect={v => setFormState({...formState, severity: v})} />
                                        </View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Notes</Text><TextInput style={[s.input, s.inputMulti]} placeholderTextColor={C.muted} multiline value={formState.notes} onChangeText={(t) => setFormState({...formState, notes: t})} placeholder="Write any personal notes here..." /></View>
                                    </>
                                )}
                                {editingType === 'allergy' && (
                                    <>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Allergy Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Peanuts, Penicillin" /></View>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Severity</Text>
                                            <ChipSelector options={severityOptions} selected={formState.severity} onSelect={v => setFormState({...formState, severity: v})} />
                                        </View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Reaction Details</Text><TextInput style={[s.input, s.inputMulti]} placeholderTextColor={C.muted} multiline value={formState.reaction} onChangeText={(t) => setFormState({...formState, reaction: t})} placeholder="Describe the physical reaction (e.g., Hives, Anaphylaxis)" /></View>
                                    </>
                                )}
                                {editingType === 'vitals' && (
                                    <>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Height (cm)</Text><TextInput style={s.input} placeholderTextColor={C.muted} keyboardType="numeric" value={String(formState.height_cm||'')} onChangeText={(t) => setFormState({...formState, height_cm: Number(t)})} placeholder="170" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Weight (kg)</Text><TextInput style={s.input} placeholderTextColor={C.muted} keyboardType="numeric" value={String(formState.weight_kg||'')} onChangeText={(t) => setFormState({...formState, weight_kg: Number(t)})} placeholder="70" /></View>
                                    </>
                                )}
                                {editingType === 'habits' && (
                                    <>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Smoking Habits</Text>
                                            <ChipSelector options={smokeOptions} selected={formState.smoking_status} onSelect={v => setFormState({...formState, smoking_status: v})} />
                                        </View>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Drinking Habits</Text>
                                            <ChipSelector options={alcoholOptions} selected={formState.alcohol_use} onSelect={v => setFormState({...formState, alcohol_use: v})} />
                                        </View>
                                    </>
                                )}
                                {editingType === 'activity' && (
                                    <>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Mobility Level</Text>
                                            <ChipSelector options={mobilityOptions} selected={formState.mobility_level} onSelect={v => setFormState({...formState, mobility_level: v})} />
                                        </View>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Activity Intensity & Duration</Text>
                                            <ChipSelector vertical options={exerciseOptions} selected={formState.exercise_frequency} onSelect={v => setFormState({...formState, exercise_frequency: v})} />
                                        </View>
                                    </>
                                )}
                                {editingType === 'gp' && (
                                    <>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Doctor's Name</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.gp_name} onChangeText={(t) => setFormState({...formState, gp_name: t})} placeholder="Dr. John Doe" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Phone Number</Text><TextInput style={s.input} placeholderTextColor={C.muted} keyboardType="phone-pad" value={formState.gp_phone} onChangeText={(t) => setFormState({...formState, gp_phone: t})} placeholder="+91 999 999 9999" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Email</Text><TextInput style={s.input} placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none" value={formState.gp_email} onChangeText={(t) => setFormState({...formState, gp_email: t})} placeholder="doctor@clinic.com" /></View>
                                    </>
                                )}
                                {editingType === 'medication' && (
                                    <>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Medication Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Paracetamol" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Dosage</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.dosage} onChangeText={(t) => setFormState({...formState, dosage: t})} placeholder="e.g. 500mg" /></View>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Frequency</Text>
                                            <ChipSelector options={frequencyOptions} selected={formState.frequency} onSelect={v => setFormState({...formState, frequency: v})} />
                                        </View>
                                        <View style={s.formGroup}>
                                            <Text style={s.formLabel}>Times of Day (Select Multiple)</Text>
                                            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
                                                {timeOptions.map(opt => {
                                                    const isSelected = (formState.times || []).includes(opt.value);
                                                    return (
                                                        <Pressable key={opt.value} onPress={() => toggleTime(opt.value)} style={[s.selectChip, isSelected && s.selectChipActive]}>
                                                            <Text style={[s.selectChipTxt, isSelected && s.selectChipTxtActive]}>{opt.label}</Text>
                                                        </Pressable>
                                                    )
                                                })}
                                            </View>
                                        </View>
                                    </>
                                )}
                                {editingType === 'history' && (
                                    <>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Event / Surgery / Diagnosis *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.event} onChangeText={(t) => setFormState({...formState, event: t})} placeholder="e.g. Knee Replacement" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Date (YYYY-MM-DD)</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.date ? formState.date.toString().substring(0,10) : ''} onChangeText={(t) => setFormState({...formState, date: t})} placeholder="2023-10-15" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Detailed Notes</Text><TextInput style={[s.input, s.inputMulti]} placeholderTextColor={C.muted} multiline value={formState.notes} onChangeText={(t) => setFormState({...formState, notes: t})} placeholder="How did the procedure go? Who was the doctor?" /></View>
                                    </>
                                )}
                                {editingType === 'vaccination' && (
                                    <>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Vaccine Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.name} onChangeText={(t) => setFormState({...formState, name: t})} placeholder="e.g. Influenza, COVID-19" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Date Given (YYYY-MM-DD)</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.date_given ? formState.date_given.toString().substring(0,10) : ''} onChangeText={(t) => setFormState({...formState, date_given: t})} placeholder="2024-01-01" /></View>
                                    </>
                                )}
                                {editingType === 'appointment' && (
                                    <>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Reason / Title *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.title} onChangeText={(t) => setFormState({...formState, title: t})} placeholder="General Checkup" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Doctor / Specialist Name *</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.doctor_name} onChangeText={(t) => setFormState({...formState, doctor_name: t})} placeholder="Dr. Smith" /></View>
                                        <View style={s.formGroup}><Text style={s.formLabel}>Date & Time (YYYY-MM-DD HH:MM)</Text><TextInput style={s.input} placeholderTextColor={C.muted} value={formState.date ? formState.date.toString().substring(0,16).replace('T', ' ') : ''} onChangeText={(t) => setFormState({...formState, date: t})} placeholder="2024-05-15 10:30" /></View>
                                    </>
                                )}

                                {editingType === 'dob' && (
                                    <View style={s.pickerContainer}>
                                        <View style={s.pickerHeader}>
                                            <Text style={s.pickerPreview}>
                                                {new Date(formState.year, formState.month, formState.day).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}
                                            </Text>
                                        </View>
                                        
                                        <Text style={s.pickerLabel}>Birth Year</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.yearScroll}>
                                            {Array.from({length: 101}, (_, i) => new Date().getFullYear() - i).map(y => (
                                                <Pressable key={y} onPress={() => setFormState({...formState, year: y})} style={[s.yearChip, formState.year === y && s.yearChipActive]}>
                                                    <Text style={[s.yearChipTxt, formState.year === y && s.yearChipTxtActive]}>{y}</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>

                                        <Text style={[s.pickerLabel, {marginTop: 20}]}>Month</Text>
                                        <View style={s.monthGrid}>
                                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                                                <Pressable key={m} onPress={() => setFormState({...formState, month: i})} style={[s.monthChip, formState.month === i && s.monthChipActive]}>
                                                    <Text style={[s.monthChipTxt, formState.month === i && s.monthChipTxtActive]}>{m}</Text>
                                                </Pressable>
                                            ))}
                                        </View>

                                        <Text style={[s.pickerLabel, {marginTop: 20}]}>Day</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll}>
                                            {Array.from({length: new Date(formState.year, formState.month + 1, 0).getDate()}, (_, i) => i + 1).map(d => (
                                                <Pressable key={d} onPress={() => setFormState({...formState, day: d})} style={[s.dayChip, formState.day === d && s.dayChipActive]}>
                                                    <Text style={[s.dayChipTxt, formState.day === d && s.dayChipTxtActive]}>{d}</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}

                                <Pressable style={s.btnSaveLg} onPress={handleSave} disabled={isSaving}>
                                    {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnSaveTextLg}>Save Profile Data</Text>}
                                </Pressable>
                                <View style={{height: 40}} />
                            </ScrollView>
                        </Animated.View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </LinearGradient>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    headerWrap: { zIndex: 10 },
    minimalHeader: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: 'transparent' },
    mainHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerLeft: { flex: 1 },
    headerLabel: { fontSize: 13, fontWeight: '800', color: C.primary, letterSpacing: 1.5, marginBottom: 4 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: C.dark, letterSpacing: -1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    ageBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' },
    editIconInBadge: { marginRight: 6, opacity: 0.8 },
    ageBadgeTxt: { color: C.primaryDark, ...FONT.bold, fontSize: 13 },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 120 },
    section: { marginBottom: 24, width: '100%' },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
    sectionHeaderBase: { fontSize: 13, ...FONT.bold, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
    addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
    card: { backgroundColor: C.cardBg, borderRadius: 28, padding: 24, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4 },
    cardStack: { backgroundColor: C.cardBg, borderRadius: 28, padding: 8, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4 },
    rowItemEnhanced: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    iconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    rowInfo: { flex: 1 },
    rowTitle: { fontSize: 16, ...FONT.bold, color: C.dark, marginBottom: 4 },
    rowSub: { fontSize: 13, ...FONT.medium, color: C.muted },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    pillTxt: { fontSize: 12, ...FONT.bold },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chipEnhanced: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
    chipTxt: { fontSize: 14, ...FONT.bold },
    timelineContainer: { marginTop: 4 },
    timelineRow: { flexDirection: 'row', gap: 20 },
    timelineLeft: { alignItems: 'center', width: 20 },
    timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.primary, borderWidth: 3, borderColor: C.primarySoft },
    timelineLine: { width: 2, flex: 1, backgroundColor: C.borderMid, marginVertical: 4 },
    timelineContent: { flex: 1, paddingBottom: 24 },
    timelineDate: { fontSize: 12, ...FONT.bold, color: C.muted, marginBottom: 4 },
    timelineTitle: { fontSize: 16, ...FONT.bold, color: C.dark },
    timelineDesc: { fontSize: 14, color: C.mid, marginTop: 6, lineHeight: 22, ...FONT.medium },
    emptyRowTxt: { fontSize: 14, color: C.muted, fontStyle: 'italic', padding: 16, textAlign: 'center' },
    bentoGrid: { flexDirection: 'row', gap: 12 },
    bentoBox: { flex: 1, borderRadius: 24, padding: 16, alignItems: 'center' },
    bentoIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    bentoVal: { fontSize: 18, ...FONT.heavy, color: C.dark, marginBottom: 4 },
    bentoLbl: { fontSize: 12, ...FONT.bold, color: C.muted },
    gpCard: { padding: 16 },
    gpProfileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    gpAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    gpAvatarTxt: { fontSize: 24, ...FONT.heavy, color: C.primaryDark },
    gpInfo: { flex: 1 },
    gpName: { fontSize: 18, ...FONT.bold, color: C.dark, marginBottom: 4 },
    gpDetail: { fontSize: 14, ...FONT.medium, color: C.muted },
    gpActionRow: { flexDirection: 'row', marginTop: 4 },
    btnCall: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 100, backgroundColor: C.primary },
    btnCallPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    btnCallText: { fontSize: 15, ...FONT.bold, color: '#FFF' },
    upgradeIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    upgradeTitle: { fontSize: 24, ...FONT.bold, color: C.dark, marginBottom: 12, letterSpacing: -0.5 },
    upgradeBody: { fontSize: 16, ...FONT.regular, color: C.muted, textAlign: 'center', lineHeight: 24 },
    
    // Modal Details
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)' },
    modalWrapper: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 36, borderTopRightRadius: 36, maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 12 },
    modalHandleWrap: { alignItems: 'center', paddingVertical: 16 },
    modalHandle: { width: 48, height: 6, borderRadius: 3, backgroundColor: '#E2E8F0' },
    modalBody: { paddingHorizontal: 24, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    formGroup: { marginBottom: 20 },
    formLabel: { fontSize: 13, ...FONT.bold, color: C.muted, marginBottom: 10, letterSpacing: 0.5 },
    input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, paddingHorizontal: 16, height: 56, fontSize: 16, ...FONT.medium, color: C.dark },
    inputMulti: { height: 100, paddingTop: 16, textAlignVertical: 'top' },
    btnSaveLg: { height: 60, borderRadius: 100, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
    btnSaveTextLg: { fontSize: 17, ...FONT.bold, color: '#FFF' },
    trashBtn: { padding: 4, backgroundColor: C.dangerBg, borderRadius: 8 },
    closeIconBtn: { padding: 4 },
    
    // Custom Selector Chips
    chipSelectorWrap: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
    chipVerticalWrap: { flexDirection: 'column', paddingBottom: 4 },
    selectChip: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: C.borderMid, borderRadius: 12, backgroundColor: '#FFF' },
    selectChipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
    selectChipTxt: { fontSize: 14, ...FONT.bold, color: C.muted },
    selectChipTxtActive: { color: C.primaryDark },

    // Picker Styles
    pickerContainer: { paddingBottom: 20 },
    pickerHeader: { backgroundColor: C.primarySoft, padding: 16, borderRadius: 20, marginBottom: 20, alignItems: 'center' },
    pickerPreview: { fontSize: 18, ...FONT.bold, color: C.primaryDark },
    pickerLabel: { fontSize: 13, ...FONT.bold, color: C.muted, marginBottom: 12, letterSpacing: 0.5 },
    yearScroll: { marginBottom: 10 },
    yearChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 10 },
    yearChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    yearChipTxt: { fontSize: 16, ...FONT.bold, color: C.mid },
    yearChipTxtActive: { color: '#FFF' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    monthChip: { width: '31%', paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
    monthChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    monthChipTxt: { fontSize: 14, ...FONT.bold, color: C.mid },
    monthChipTxtActive: { color: '#FFF' },
    dayScroll: { marginTop: 10 },
    dayChip: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    dayChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    dayChipTxt: { fontSize: 16, ...FONT.bold, color: C.mid },
    dayChipTxtActive: { color: '#FFF' },
});
