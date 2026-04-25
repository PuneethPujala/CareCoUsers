import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, Platform,
    Modal, FlatList
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme/theme';
import { Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../lib/api';
import GradientHeader from '../components/common/GradientHeader';
import { isValidEmail, isValidName } from '../utils/validators';

const ROLE_LABELS = { org_admin: 'Organization Admin', care_manager: 'Care Manager', caretaker: 'Caretaker', caller: 'Caller', mentor: 'Patient Mentor' };
const ROLE_META = {
    org_admin: { icon: 'shield-checkmark', color: '#4F46E5', bg: '#EEF2FF' },
    care_manager: { icon: 'medkit', color: '#059669', bg: '#ECFDF5' },
    caretaker: { icon: 'people', color: '#2563EB', bg: '#EFF6FF' },
    caller: { icon: 'call', color: '#4F46E5', bg: '#EEF2FF' },
    mentor: { icon: 'star', color: '#E11D48', bg: '#FFF1F2' },
};
const ROLES_NEEDING_ORG = ['org_admin', 'care_manager', 'caretaker', 'caller', 'mentor'];

export default function CreateUserScreen({ navigation, route }) {
    const allowedRole = route?.params?.allowedRole || 'org_admin';
    const roleLabel = ROLE_LABELS[allowedRole] || allowedRole;
    const meta = ROLE_META[allowedRole] || { icon: 'person', color: '#2563EB', bg: '#EFF6FF' };
    const { createUser, organizationId: callerOrgId, profile } = useAuth();

    const isSuperAdmin = profile?.role === 'super_admin';
    const needsOrgPicker = isSuperAdmin && ROLES_NEEDING_ORG.includes(allowedRole);

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    
    // Org Picker State
    const [organizations, setOrganizations] = useState([]);
    const [selectedOrgId, setSelectedOrgId] = useState(null);
    const [orgsLoading, setOrgsLoading] = useState(false);
    const [orgPickerVisible, setOrgPickerVisible] = useState(false);
    const [orgSearchQuery, setOrgSearchQuery] = useState('');
    
    const [statusBanner, setStatusBanner] = useState(null);

    useEffect(() => {
        if (needsOrgPicker) {
            setOrgsLoading(true);
            apiService.organizations.getAll({ isActive: true })
                .then(res => { 
                    const orgs = res.data?.organizations || res.data || [];
                    const sorted = (Array.isArray(orgs) ? orgs : []).sort((a, b) => {
                        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                    });
                    setOrganizations(sorted); 
                })
                .catch(() => setOrganizations([]))
                .finally(() => setOrgsLoading(false));
        }
    }, [needsOrgPicker]);

    const filteredOrgs = useMemo(() => {
        if (!orgSearchQuery) return organizations;
        const q = orgSearchQuery.toLowerCase();
        return organizations.filter(o => o.name && o.name.toLowerCase().includes(q));
    }, [organizations, orgSearchQuery]);

    const validate = () => {
        const errs = {};
        if (!fullName.trim() || !isValidName(fullName.trim())) errs.fullName = 'Please provide a valid full name (letters/spaces only).';
        if (!email.trim() || !isValidEmail(email.trim())) errs.email = 'Enter a strictly valid email structure (e.g. name@domain.com).';
        if (needsOrgPicker && !selectedOrgId) errs.org = 'Please select an assigned organization.';
        return errs;
    };

    const handleSubmit = async () => {
        const errs = validate();
        setErrors(errs);
        setStatusBanner(null);
        if (Object.keys(errs).length > 0) return;
        
        const targetOrgId = needsOrgPicker ? selectedOrgId : callerOrgId;
        setLoading(true);
        try {
            const result = await createUser(email.trim().toLowerCase(), fullName.trim(), allowedRole, targetOrgId);
            setStatusBanner({ type: 'success', message: result?.message || `${roleLabel} account established successfully. A temporary password was dispatched.` });
            setTimeout(() => navigation.goBack(), 2000);
        } catch (error) {
            setStatusBanner({ type: 'error', message: error?.message || 'Account generation failed. Please review the network and try again.' });
        } finally { setLoading(false); }
    };

    const selectedOrgIndex = organizations.find(o => (o._id || o.id) === selectedOrgId);

    return (
        <View style={s.container}>
            <GradientHeader title={`Create ${roleLabel}`} subtitle="Generate a new system access account" onBack={() => navigation.goBack()} />
            
            <KeyboardAwareScrollView 
                style={{ flex: 1 }} 
                contentContainerStyle={s.scrollContent}
                enableOnAndroid={true} 
                extraScrollHeight={20} 
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* ─── Role Context Chip ─── */}
                <View style={s.roleChip}>
                    <View style={[s.roleIconWrap, { backgroundColor: meta.bg }]}>  
                        <Ionicons name={meta.icon} size={22} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.roleTitle}>{roleLabel} Account</Text>
                        <Text style={s.roleDesc}>Credentials will be sent to the user's email inbox.</Text>
                    </View>
                </View>

                {/* ─── Form Section ─── */}
                <View style={s.formCard}>

                    {/* Org Picker */}
                    {needsOrgPicker && (
                        <>
                            <Text style={s.inputLabel}>Assigned Organization</Text>
                            <TouchableOpacity 
                                style={[s.inputRow, errors.org && s.inputRowError]} 
                                activeOpacity={0.7}
                                onPress={() => setOrgPickerVisible(true)}
                            >
                                <View style={s.inputIconPill}>
                                    <Feather name="briefcase" size={16} color={errors.org ? '#EF4444' : '#64748B'} />
                                </View>
                                <Text style={[s.inputText, { color: selectedOrgId ? '#0F172A' : '#94A3B8' }]} numberOfLines={1}>
                                    {orgsLoading ? 'Loading...' : (selectedOrgIndex ? selectedOrgIndex.name : "Select Organization")}
                                </Text>
                                <Feather name="chevron-down" size={18} color="#94A3B8" />
                            </TouchableOpacity>
                            {errors.org && <Text style={s.errorMsg}>{errors.org}</Text>}
                            <View style={s.fieldSpacer} />
                        </>
                    )}

                    {/* Full Name */}
                    <Text style={s.inputLabel}>Full Name</Text>
                    <View style={[s.inputRow, errors.fullName && s.inputRowError]}>
                        <View style={s.inputIconPill}>
                            <Feather name="user" size={16} color={errors.fullName ? '#EF4444' : '#64748B'} />
                        </View>
                        <TextInput 
                            style={s.textInput} 
                            value={fullName}
                            onChangeText={t => { setFullName(t); setErrors(e => ({ ...e, fullName: undefined })); }}
                            placeholder="e.g. Dr. Jane Rossi" 
                            placeholderTextColor="#94A3B8"
                            autoCapitalize="words" 
                            returnKeyType="next" 
                        />
                    </View>
                    {errors.fullName && <Text style={s.errorMsg}>{errors.fullName}</Text>}
                    <View style={s.fieldSpacer} />

                    {/* Email */}
                    <Text style={s.inputLabel}>Email Address</Text>
                    <View style={[s.inputRow, errors.email && s.inputRowError]}>
                        <View style={s.inputIconPill}>
                            <Feather name="mail" size={16} color={errors.email ? '#EF4444' : '#64748B'} />
                        </View>
                        <TextInput 
                            style={s.textInput} 
                            value={email}
                            onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: undefined })); }}
                            placeholder="jane.rossi@platform.com" 
                            placeholderTextColor="#94A3B8"
                            keyboardType="email-address" 
                            autoCapitalize="none" 
                            autoCorrect={false} 
                            returnKeyType="done" 
                        />
                    </View>
                    {errors.email && <Text style={s.errorMsg}>{errors.email}</Text>}
                </View>

                {/* ─── Status Feedback ─── */}
                {statusBanner && (
                    <View style={[s.statusBanner, statusBanner.type === 'success' ? s.statusSuccess : s.statusError]}>
                        <View style={[s.statusIconWrap, { backgroundColor: statusBanner.type === 'success' ? '#DCFCE7' : '#FEF2F2' }]}>
                            <Feather name={statusBanner.type === 'success' ? 'check-circle' : 'alert-circle'} size={22} color={statusBanner.type === 'success' ? '#16A34A' : '#EF4444'} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.statusTitle, { color: statusBanner.type === 'success' ? '#16A34A' : '#EF4444' }]}>
                                {statusBanner.type === 'success' ? 'Account Created' : 'Action Failed'}
                            </Text>
                            <Text style={s.statusMsg} numberOfLines={2}>{statusBanner.message}</Text>
                        </View>
                    </View>
                )}

                {/* ─── Submit Button ─── */}
                <TouchableOpacity 
                    style={[s.submitBtn, loading && { opacity: 0.7 }]} 
                    onPress={handleSubmit} 
                    disabled={loading} 
                    activeOpacity={0.8}
                >
                    {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Feather name="user-check" size={20} color="#FFFFFF" />
                            <Text style={s.submitText}>Authorize {roleLabel}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                
            </KeyboardAwareScrollView>

            {/* ─── Org Selection Modal ─── */}
            <Modal visible={orgPickerVisible} transparent={true} animationType="slide">
                <View style={s.modalOverlay}>
                    <TouchableOpacity style={s.modalDismiss} activeOpacity={1} onPress={() => {setOrgPickerVisible(false); setOrgSearchQuery('');}} />
                    
                    <View style={s.modalSheet}>
                        <View style={s.modalHandle} />
                        
                        <View style={s.modalHeader}>
                            <View>
                                <Text style={s.modalTitle}>Select Organization</Text>
                                <Text style={s.modalSubtitle}>Recently added shown first</Text>
                            </View>
                            <TouchableOpacity onPress={() => {setOrgPickerVisible(false); setOrgSearchQuery('');}} style={s.closeBtn}>
                                <Feather name="x" size={18} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        
                        {/* Search */}
                        <View style={s.modalSearch}>
                            <Feather name="search" size={16} color="#94A3B8" />
                            <TextInput 
                                style={s.modalSearchInput}
                                placeholder="Search organizations..."
                                placeholderTextColor="#94A3B8"
                                value={orgSearchQuery}
                                onChangeText={setOrgSearchQuery}
                                autoCorrect={false}
                            />
                            {orgSearchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setOrgSearchQuery('')}>
                                    <Feather name="x-circle" size={16} color="#CBD5E1" />
                                </TouchableOpacity>
                            )}
                        </View>
                        
                        {filteredOrgs.length === 0 && !orgsLoading ? (
                            <View style={s.emptyState}>
                                <Feather name="inbox" size={32} color="#CBD5E1" />
                                <Text style={s.emptyTitle}>No results</Text>
                                <Text style={s.emptyDesc}>Try a different search term</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={filteredOrgs}
                                keyExtractor={(item) => item._id || item.id}
                                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                                showsVerticalScrollIndicator={true}
                                keyboardShouldPersistTaps="handled"
                                renderItem={({ item }) => {
                                    const id = item._id || item.id;
                                    const isSel = selectedOrgId === id;
                                    return (
                                        <TouchableOpacity 
                                            style={[s.orgRow, isSel && s.orgRowActive]} 
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                setSelectedOrgId(id);
                                                setErrors(e => ({ ...e, org: undefined }));
                                                setTimeout(() => { setOrgPickerVisible(false); setOrgSearchQuery(''); }, 200);
                                            }}
                                        >
                                            <View style={[s.orgIcon, isSel && { backgroundColor: '#FFFFFF' }]}>
                                                <Feather name="briefcase" size={14} color={isSel ? '#4F46E5' : '#64748B'} />
                                            </View>
                                            <Text style={[s.orgName, isSel && s.orgNameActive]} numberOfLines={1}>{item.name}</Text>
                                            <View style={[s.radio, isSel && { borderColor: '#4F46E5', backgroundColor: '#4F46E5' }]}>
                                                {isSel && <Feather name="check" size={10} color="#FFFFFF" />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 80, paddingTop: 20 },
    
    // Role Chip
    roleChip: { 
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: '#FFFFFF', 
        borderRadius: 20, 
        paddingVertical: 18, paddingHorizontal: 18,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.sm,
    },
    roleIconWrap: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    roleTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 3, letterSpacing: -0.3 },
    roleDesc: { fontSize: 13, fontWeight: '500', color: '#64748B', lineHeight: 18 },

    // Form Card
    formCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginTop: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.sm,
    },
    
    inputLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 2 },
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
    inputText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
    textInput: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A', height: '100%' },
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

    // Status
    statusBanner: { 
        flexDirection: 'row', alignItems: 'center', gap: 14, 
        borderRadius: 20, padding: 16, marginTop: 20, 
        borderWidth: 1.5,
    },
    statusSuccess: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
    statusError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    statusIconWrap: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    statusTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
    statusMsg: { fontSize: 12, fontWeight: '500', color: '#64748B', lineHeight: 18 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
    modalDismiss: { flex: 1 },
    modalSheet: { 
        backgroundColor: '#FFFFFF', 
        borderTopLeftRadius: 28, borderTopRightRadius: 28, 
        maxHeight: '85%', 
        ...Shadows.xl 
    },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 10 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
    modalSubtitle: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
    
    modalSearch: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', marginHorizontal: 20, marginBottom: 12, borderRadius: 14, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: '#F1F5F9' },
    modalSearchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F172A' },

    emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#94A3B8' },
    emptyDesc: { fontSize: 13, fontWeight: '500', color: '#CBD5E1' },
    
    orgRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 12 },
    orgRowActive: { backgroundColor: '#EEF2FF', borderRadius: 16, borderBottomWidth: 0, marginVertical: 2 },
    orgIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
    orgName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#334155' },
    orgNameActive: { color: '#4F46E5', fontWeight: '800' },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
});
