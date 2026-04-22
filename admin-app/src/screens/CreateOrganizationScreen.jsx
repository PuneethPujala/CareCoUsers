import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Dimensions,
    Modal, FlatList
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme/theme';
import { Shadows } from '../theme/colors';
import { apiService } from '../lib/api';
import GradientHeader from '../components/common/GradientHeader';

const { width: SW } = Dimensions.get('window');

// Limited to the 2 requested options


const AP_DISTRICTS = [
    "Anantapur", "Chittoor", "East Godavari", "Guntur", "YSR Kadapa", "Krishna", 
    "Kurnool", "Sri Potti Sriramulu Nellore", "Prakasam", "Srikakulam", 
    "Visakhapatnam", "Vizianagaram", "West Godavari"
].sort();

export default function CreateOrganizationScreen({ navigation, route }) {
    const { editMode, orgData } = route?.params || {};
    
    const [name, setName] = useState(orgData?.name || '');
    const [email, setEmail] = useState(orgData?.email || '');
    const [phone, setPhone] = useState(orgData?.phone || '');
    const [district, setDistrict] = useState(orgData?.district || orgData?.address?.district || '');
    
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    
    // Modal state for District Picker
    const [pickerVisible, setPickerVisible] = useState(false);

    const validate = () => {
        const errs = {};
        if (!name.trim()) errs.name = 'Please provide an entity name.';
        if (!district.trim()) errs.district = 'Operating District is required.';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email structure.';
        return errs;
    };

    const handleSubmit = async () => {
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length > 0) {
            // Scroll to top or handle error visual feedback naturally via state
            return;
        }
        setLoading(true);
        try {
            const payload = { 
                name: name.trim(), 
                type: 'clinic', 
                subscriptionPlan: 'starter', // Default hardcoded
                district: district.trim(),
                address: { district: district.trim() }
            };
            if (email.trim()) payload.email = email.trim().toLowerCase();
            if (phone.trim()) payload.phone = phone.trim();
            
            if (editMode) {
                const result = await apiService.organizations.update(orgData._id, payload);
                Alert.alert('Success', result.data?.message || `"${name}" has been updated.`,
                    [{ text: 'OK', onPress: () => navigation.goBack() }]);
            } else {
                const result = await apiService.organizations.create(payload);
                Alert.alert('Success', result.data?.message || `"${name}" has been established.`,
                    [{ text: 'OK', onPress: () => navigation.goBack() }]);
            }
        } catch (error) {
            Alert.alert('Error', error?.response?.data?.error || error?.message || `Operation failed.`);
        } finally { setLoading(false); }
    };

    return (
        <View style={s.container}>
            <GradientHeader 
                title={editMode ? "Edit Organization" : "Create Organization"} 
                subtitle={editMode ? "Update organization details" : "Add a new organization to the platform"} 
                onBack={() => navigation.goBack()} 
            />
            
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView style={s.body} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                    <Text style={[s.sectionHeader, { marginTop: 12 }]}>Organization Details</Text>
                    
                    <View style={s.masterCard}>
                        {/* Name Input */}
                        <Text style={s.inputLabel}>Organization Name</Text>
                        <View style={[s.inputWrap, errors.name && s.inputWrapError]}>
                            <View style={s.inputIconWrap}>
                                <Feather name="briefcase" size={18} color={errors.name ? '#EF4444' : '#64748B'} />
                            </View>
                            <TextInput 
                                style={s.input} 
                                value={name}
                                onChangeText={t => { setName(t); setErrors(e => ({ ...e, name: undefined })); }}
                                placeholder="e.g. Apollo Pharmacy" 
                                placeholderTextColor="#CBD5E1" 
                                autoCapitalize="words" 
                            />
                        </View>
                        {errors.name && <Text style={s.errorMessage}>{errors.name}</Text>}

                        {/* District Input */}
                        <Text style={s.inputLabel}>Operating District</Text>
                        <TouchableOpacity 
                            style={[s.inputWrap, errors.district && s.inputWrapError]} 
                            activeOpacity={0.8}
                            onPress={() => setPickerVisible(true)}
                        >
                            <View style={s.inputIconWrap}>
                                <Feather name="map" size={18} color={errors.district ? '#EF4444' : '#64748B'} />
                            </View>
                            <Text style={[s.input, { color: district ? '#0F172A' : '#CBD5E1', marginTop: Platform.OS==='android'? 4: 0 }]}>
                                {district || "Select designated district"}
                            </Text>
                            <Feather name="chevron-down" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                        {errors.district && <Text style={s.errorMessage}>{errors.district}</Text>}

                        {/* Email Input */}
                        <Text style={s.inputLabel}>Email Address (Optional)</Text>
                        <View style={[s.inputWrap, errors.email && s.inputWrapError]}>
                            <View style={s.inputIconWrap}>
                                <Feather name="mail" size={18} color={errors.email ? '#EF4444' : '#64748B'} />
                            </View>
                            <TextInput 
                                style={s.input} 
                                value={email}
                                onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: undefined })); }}
                                placeholder="admin@organization.com" 
                                placeholderTextColor="#CBD5E1"
                                keyboardType="email-address" 
                                autoCapitalize="none" 
                            />
                        </View>
                        {errors.email && <Text style={s.errorMessage}>{errors.email}</Text>}

                        {/* Phone Input */}
                        <Text style={s.inputLabel}>Phone Number (Optional)</Text>
                        <View style={s.inputWrap}>
                            <View style={s.inputIconWrap}>
                                <Feather name="smartphone" size={18} color="#64748B" />
                            </View>
                            <TextInput 
                                style={s.input} 
                                value={phone} 
                                onChangeText={setPhone}
                                placeholder="+91 9876543210" 
                                placeholderTextColor="#CBD5E1" 
                                keyboardType="phone-pad" 
                            />
                        </View>
                    </View>

                    {/* Submit Button */}
                    <TouchableOpacity 
                        style={[s.submitBtn, loading && { opacity: 0.8 }]} 
                        onPress={handleSubmit} 
                        disabled={loading} 
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFFFFF" size="large" />
                        ) : (
                            <>
                                <Feather name={editMode ? "check-square" : "database"} size={22} color="#FFFFFF" style={{ marginRight: 12 }} />
                                <Text style={s.submitText}>{editMode ? "Save Changes" : "Create Organization"}</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    
                </ScrollView>
            </KeyboardAvoidingView>

            {/* ─── HD HALF-SHEET MODAL FOR DISTRICT ─── */}
            <Modal visible={pickerVisible} transparent={true} animationType="slide">
                <View style={s.modalOverlay}>
                    <TouchableOpacity style={s.modalDismissLayer} activeOpacity={1} onPress={() => setPickerVisible(false)} />
                    
                    <View style={s.modalSheet}>
                        <View style={s.modalHandle} />
                        
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Select Operating District</Text>
                            <Text style={s.modalSubtitle}>Confined to Andhra Pradesh jurisdictions</Text>
                        </View>
                        
                        <FlatList
                            data={AP_DISTRICTS}
                            keyExtractor={(item) => item}
                            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => {
                                const isSel = district === item;
                                return (
                                    <TouchableOpacity 
                                        style={[s.districtRow, isSel && s.districtRowActive]} 
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            setDistrict(item);
                                            setErrors(e => ({ ...e, district: undefined }));
                                            setTimeout(() => setPickerVisible(false), 200); // 200ms delay for visual confirmation
                                        }}
                                    >
                                        <Text style={[s.districtText, isSel && s.districtTextActive]}>{item}</Text>
                                        <View style={[s.typeRadioCircle, { width: 20, height: 20 }, isSel ? { borderColor: '#4F46E5', backgroundColor: '#4F46E5' } : {}]}>
                                            {isSel && <Feather name="check" size={12} color="#FFFFFF" />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ══════════════════════════════════════════
// Solid HD Premium Aesthetic (Ultra Polish)
// ══════════════════════════════════════════
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    body: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 80, paddingTop: 10 },
    
    sectionHeader: { fontSize: 12, fontWeight: '800', color: '#64748B', marginTop: 24, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: 6 },



    // The Master Input Card
    masterCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 32,
        padding: 24,
        paddingBottom: 16,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.08
    },
    
    inputLabel: { fontSize: 12, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginLeft: 4, marginTop: 8 },
    
    inputWrap: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#F8FAFC', 
        borderRadius: 20, 
        borderWidth: 1.5, borderColor: '#F1F5F9', 
        paddingHorizontal: 8, 
        height: 64, 
        marginBottom: 16 
    },
    inputWrapError: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
    inputIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, ...Shadows.sm, shadowOpacity: 0.05 },
    input: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A' },
    errorMessage: { fontSize: 11, fontWeight: '800', color: '#EF4444', marginTop: -10, marginBottom: 16, marginLeft: 16, textTransform: 'uppercase', letterSpacing: 0.5 },

    // Mega Submit Button
    submitBtn: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0F172A',
        marginTop: 36, 
        borderRadius: 24, 
        height: 72,
        ...Shadows.xl, shadowColor: '#0F172A', shadowOpacity: 0.25, shadowOffset: {width: 0, height: 10}
    },
    submitText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },

    // iOS Style Bottom Sheet Selector
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
    modalDismissLayer: { flex: 1 },
    modalSheet: { 
        backgroundColor: '#FFFFFF', 
        borderTopLeftRadius: 36, borderTopRightRadius: 36, 
        maxHeight: '75%', 
        ...Shadows.xl 
    },
    modalHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12 },
    modalHeader: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    modalTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    modalSubtitle: { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginTop: 4 },
    
    districtRow: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        paddingVertical: 18, paddingHorizontal: 8,
        borderBottomWidth: 1, borderBottomColor: '#F8FAFC' 
    },
    districtRowActive: { backgroundColor: '#EEF2FF', borderRadius: 16, borderBottomWidth: 0, paddingHorizontal: 16, marginTop: 4, marginBottom: 4 },
    districtText: { fontSize: 17, fontWeight: '600', color: '#334155' },
    districtTextActive: { color: '#4F46E5', fontWeight: '800' }
});
