import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { isValidEmail, isValidName, isValidPhone } from '../utils/validators';
import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, Platform,
    Modal, FlatList
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme/theme';
import { Shadows } from '../theme/colors';
import { apiService } from '../lib/api';
import GradientHeader from '../components/common/GradientHeader';

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
    
    const [pickerVisible, setPickerVisible] = useState(false);

    const validate = () => {
        const errs = {};
        
        // Name: required, must be alphabetical (letters, spaces, hyphens, dots allowed for org names)
        if (!name.trim()) {
            errs.name = 'Organization name is required.';
        } else if (name.trim().length < 2) {
            errs.name = 'Name must be at least 2 characters.';
        } else if (/^\d+$/.test(name.trim())) {
            errs.name = 'Name cannot be only numbers.';
        } else if (!/^[A-Za-z][A-Za-z0-9\s\-\.&']+$/.test(name.trim())) {
            errs.name = 'Name must start with a letter and contain valid characters.';
        }
        
        // District: required
        if (!district.trim()) {
            errs.district = 'Operating district is required.';
        }
        
        // Email: optional, but must be valid if provided
        if (email.trim() && !isValidEmail(email.trim())) {
            errs.email = 'Enter a valid email (e.g. admin@org.com).';
        }
        
        // Phone: optional, but must be valid if provided
        if (phone.trim() && !isValidPhone(phone.trim())) {
            errs.phone = 'Enter a valid phone number (10-15 digits).';
        }
        
        return errs;
    };

    const clearError = (field) => {
        setErrors(prev => ({ ...prev, [field]: undefined }));
    };

    const handleSubmit = async () => {
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setLoading(true);
        try {
            const payload = { 
                name: name.trim(), 
                type: 'clinic', 
                subscriptionPlan: 'starter',
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
            
            <KeyboardAwareScrollView 
                style={{ flex: 1 }} 
                contentContainerStyle={s.scrollContent}
                enableOnAndroid={true} 
                extraScrollHeight={20} 
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Text style={s.sectionHeader}>Organization Details</Text>
                
                <View style={s.formCard}>
                    {/* Name Input */}
                    <Text style={s.inputLabel}>Organization Name <Text style={s.required}>*</Text></Text>
                    <View style={[s.inputRow, errors.name && s.inputRowError]}>
                        <View style={s.inputIconPill}>
                            <Feather name="briefcase" size={16} color={errors.name ? '#EF4444' : '#64748B'} />
                        </View>
                        <TextInput 
                            style={s.textInput} 
                            value={name}
                            onChangeText={t => { setName(t); clearError('name'); }}
                            placeholder="e.g. Apollo Pharmacy" 
                            placeholderTextColor="#94A3B8" 
                            autoCapitalize="words" 
                        />
                    </View>
                    {errors.name && <Text style={s.errorMsg}>{errors.name}</Text>}

                    <View style={s.fieldSpacer} />

                    {/* District Input */}
                    <Text style={s.inputLabel}>Operating District <Text style={s.required}>*</Text></Text>
                    <TouchableOpacity 
                        style={[s.inputRow, errors.district && s.inputRowError]} 
                        activeOpacity={0.7}
                        onPress={() => setPickerVisible(true)}
                    >
                        <View style={s.inputIconPill}>
                            <Feather name="map-pin" size={16} color={errors.district ? '#EF4444' : '#64748B'} />
                        </View>
                        <Text style={[s.selectText, { color: district ? '#0F172A' : '#94A3B8' }]}>
                            {district || "Select designated district"}
                        </Text>
                        <Feather name="chevron-down" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                    {errors.district && <Text style={s.errorMsg}>{errors.district}</Text>}

                    <View style={s.fieldSpacer} />

                    {/* Email Input */}
                    <Text style={s.inputLabel}>Email Address <Text style={s.optional}>(Optional)</Text></Text>
                    <View style={[s.inputRow, errors.email && s.inputRowError]}>
                        <View style={s.inputIconPill}>
                            <Feather name="mail" size={16} color={errors.email ? '#EF4444' : '#64748B'} />
                        </View>
                        <TextInput 
                            style={s.textInput} 
                            value={email}
                            onChangeText={t => { setEmail(t); clearError('email'); }}
                            placeholder="admin@organization.com" 
                            placeholderTextColor="#94A3B8"
                            keyboardType="email-address" 
                            autoCapitalize="none" 
                        />
                    </View>
                    {errors.email && <Text style={s.errorMsg}>{errors.email}</Text>}

                    <View style={s.fieldSpacer} />

                    {/* Phone Input */}
                    <Text style={s.inputLabel}>Phone Number <Text style={s.optional}>(Optional)</Text></Text>
                    <View style={[s.inputRow, errors.phone && s.inputRowError]}>
                        <View style={s.inputIconPill}>
                            <Feather name="smartphone" size={16} color={errors.phone ? '#EF4444' : '#64748B'} />
                        </View>
                        <TextInput 
                            style={s.textInput} 
                            value={phone} 
                            onChangeText={t => { setPhone(t); clearError('phone'); }}
                            placeholder="+91 9876543210" 
                            placeholderTextColor="#94A3B8" 
                            keyboardType="phone-pad" 
                        />
                    </View>
                    {errors.phone && <Text style={s.errorMsg}>{errors.phone}</Text>}
                </View>

                {/* Submit Button */}
                <TouchableOpacity 
                    style={[s.submitBtn, loading && { opacity: 0.7 }]} 
                    onPress={handleSubmit} 
                    disabled={loading} 
                    activeOpacity={0.8}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Feather name={editMode ? "check-square" : "database"} size={20} color="#FFFFFF" />
                            <Text style={s.submitText}>{editMode ? "Save Changes" : "Create Organization"}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                
            </KeyboardAwareScrollView>

            {/* District Picker Modal */}
            <Modal visible={pickerVisible} transparent={true} animationType="slide">
                <View style={s.modalOverlay}>
                    <TouchableOpacity style={s.modalDismiss} activeOpacity={1} onPress={() => setPickerVisible(false)} />
                    
                    <View style={s.modalSheet}>
                        <View style={s.modalHandle} />
                        
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Select Operating District</Text>
                            <Text style={s.modalSubtitle}>Andhra Pradesh jurisdictions</Text>
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
                                            clearError('district');
                                            setTimeout(() => setPickerVisible(false), 200);
                                        }}
                                    >
                                        <Text style={[s.districtText, isSel && s.districtTextActive]}>{item}</Text>
                                        <View style={[s.radio, isSel && { borderColor: '#4F46E5', backgroundColor: '#4F46E5' }]}>
                                            {isSel && <Feather name="check" size={10} color="#FFFFFF" />}
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

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 80, paddingTop: 16 },
    
    sectionHeader: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 4 },

    formCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.sm,
    },
    
    inputLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 2 },
    required: { color: '#EF4444' },
    optional: { color: '#94A3B8', fontWeight: '600', textTransform: 'none', letterSpacing: 0 },
    fieldSpacer: { height: 16 },
    
    inputRow: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#F8FAFC', 
        borderRadius: 16, 
        borderWidth: 1.5, borderColor: '#E2E8F0', 
        paddingHorizontal: 10, 
        height: 56, 
        gap: 10,
    },
    inputRowError: { borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
    inputIconPill: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
    textInput: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A', height: '100%' },
    selectText: { flex: 1, fontSize: 15, fontWeight: '600' },
    errorMsg: { fontSize: 11, fontWeight: '700', color: '#EF4444', marginTop: 6, marginLeft: 4 },

    // Submit
    submitBtn: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0F172A',
        marginTop: 28, 
        borderRadius: 20, 
        height: 60,
        ...Shadows.lg, shadowColor: '#0F172A', shadowOpacity: 0.2, shadowOffset: {width: 0, height: 8}
    },
    submitText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
    modalDismiss: { flex: 1 },
    modalSheet: { 
        backgroundColor: '#FFFFFF', 
        borderTopLeftRadius: 28, borderTopRightRadius: 28, 
        maxHeight: '75%', 
        ...Shadows.xl 
    },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 10 },
    modalHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
    modalSubtitle: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
    
    districtRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
    districtRowActive: { backgroundColor: '#EEF2FF', borderRadius: 14, borderBottomWidth: 0, paddingHorizontal: 14, marginVertical: 2 },
    districtText: { fontSize: 15, fontWeight: '600', color: '#334155' },
    districtTextActive: { color: '#4F46E5', fontWeight: '800' },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
});
