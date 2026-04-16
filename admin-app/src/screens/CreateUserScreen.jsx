import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
    Modal, FlatList
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme/theme';
import { Shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../lib/api';
import GradientHeader from '../components/common/GradientHeader';

const ROLE_LABELS = { org_admin: 'Organization Admin', care_manager: 'Care Manager', caretaker: 'Caretaker', caller: 'Caller', mentor: 'Patient Mentor' };
const ROLE_META = {
    org_admin: { icon: 'shield-checkmark', color: '#4F46E5' },
    care_manager: { icon: 'medkit', color: '#059669' },
    caretaker: { icon: 'people', color: '#2563EB' },
    caller: { icon: 'call', color: '#4F46E5' },
    mentor: { icon: 'star', color: '#E11D48' },
};
const ROLES_NEEDING_ORG = ['org_admin', 'care_manager', 'caretaker', 'caller', 'mentor'];

export default function CreateUserScreen({ navigation, route }) {
    const allowedRole = route?.params?.allowedRole || 'org_admin';
    const roleLabel = ROLE_LABELS[allowedRole] || allowedRole;
    const meta = ROLE_META[allowedRole] || { icon: 'person', color: '#2563EB' };
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
                    // Sort descending by creation date (newest first)
                    const sorted = (Array.isArray(orgs) ? orgs : []).sort((a, b) => {
                        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                    });
                    setOrganizations(sorted); 
                })
                .catch(() => setOrganizations([]))
                .finally(() => setOrgsLoading(false));
        }
    }, [needsOrgPicker]);

    // Filter organizations based on search query
    const filteredOrgs = useMemo(() => {
        if (!orgSearchQuery) return organizations;
        const q = orgSearchQuery.toLowerCase();
        return organizations.filter(o => o.name && o.name.toLowerCase().includes(q));
    }, [organizations, orgSearchQuery]);

    const validate = () => {
        const errs = {};
        if (!fullName.trim()) errs.fullName = 'Full name is required.';
        if (!email.trim()) errs.email = 'Email address is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email structure.';
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
            
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView style={s.body} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                    {/* ─── Ultra Polished Role Context Banner ─── */}
                    <View style={[s.roleBanner, { borderLeftColor: meta.color }]}>
                        <View style={[s.roleIconSolid, { backgroundColor: `${meta.color}15` }]}>
                            <Ionicons name={meta.icon} size={28} color={meta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.roleTitle}>{roleLabel} Account</Text>
                            <Text style={s.roleDesc}>Platform credentials will be routed electronically to the user's inbox.</Text>
                        </View>
                    </View>

                    {/* ─── Master Form Card ─── */}
                    <Text style={s.sectionHeader}>Account Properties</Text>
                    
                    <View style={s.masterCard}>
                        
                        {/* Interactive Org Picker */}
                        {needsOrgPicker && (
                            <>
                                <Text style={s.inputLabel}>Assigned Organization</Text>
                                <TouchableOpacity 
                                    style={[s.inputWrap, errors.org && s.inputWrapError]} 
                                    activeOpacity={0.8}
                                    onPress={() => setOrgPickerVisible(true)}
                                >
                                    <View style={s.inputIconWrap}>
                                        <Feather name="briefcase" size={18} color={errors.org ? '#EF4444' : '#64748B'} />
                                    </View>
                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                        <Text style={[s.input, { color: selectedOrgId ? '#0F172A' : '#CBD5E1', marginTop: Platform.OS==='android'? 4: 0 }]} numberOfLines={1}>
                                            {orgsLoading ? 'Loading databases...' : (selectedOrgIndex ? selectedOrgIndex.name : "Select Target Organization")}
                                        </Text>
                                    </View>
                                    <Feather name="chevron-down" size={20} color="#94A3B8" style={{ marginRight: 6 }} />
                                </TouchableOpacity>
                                {errors.org && <Text style={s.errorMessage}>{errors.org}</Text>}
                            </>
                        )}

                        {/* Name Input */}
                        <Text style={s.inputLabel}>Full Name</Text>
                        <View style={[s.inputWrap, errors.fullName && s.inputWrapError]}>
                            <View style={s.inputIconWrap}>
                                <Feather name="user" size={18} color={errors.fullName ? '#EF4444' : '#64748B'} />
                            </View>
                            <TextInput style={s.input} value={fullName}
                                onChangeText={t => { setFullName(t); setErrors(e => ({ ...e, fullName: undefined })); }}
                                placeholder="e.g. Dr. Jane Rossi" placeholderTextColor="#CBD5E1"
                                autoCapitalize="words" returnKeyType="next" />
                        </View>
                        {errors.fullName && <Text style={s.errorMessage}>{errors.fullName}</Text>}

                        {/* Email Input */}
                        <Text style={s.inputLabel}>Email Address</Text>
                        <View style={[s.inputWrap, errors.email && s.inputWrapError]}>
                            <View style={s.inputIconWrap}>
                                <Feather name="mail" size={18} color={errors.email ? '#EF4444' : '#64748B'} />
                            </View>
                            <TextInput style={s.input} value={email}
                                onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: undefined })); }}
                                placeholder="jane.rossi@platform.com" placeholderTextColor="#CBD5E1"
                                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
                        </View>
                        {errors.email && <Text style={s.errorMessage}>{errors.email}</Text>}
                    </View>

                    {/* ─── Status Feedback Layer ─── */}
                    {statusBanner && (
                        <View style={[s.statusBanner, statusBanner.type === 'success' ? s.statusSuccess : s.statusError]}>
                            <View style={[s.statusIconWrap, statusBanner.type === 'success' ? { backgroundColor: '#DCFCE7' } : { backgroundColor: '#FEF2F2' }]}>
                                <Feather name={statusBanner.type === 'success' ? 'check-circle' : 'alert-circle'} size={24} color={statusBanner.type === 'success' ? '#16A34A' : '#EF4444'} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[s.statusTitle, statusBanner.type === 'success' ? { color: '#16A34A' } : { color: '#EF4444' }]}>
                                    {statusBanner.type === 'success' ? 'Operation Successful' : 'Action Denied'}
                                </Text>
                                <Text style={s.statusMsg} numberOfLines={2}>{statusBanner.message}</Text>
                            </View>
                        </View>
                    )}

                    {/* ─── Submit Button ─── */}
                    <TouchableOpacity 
                        style={[s.submitBtn, loading && { opacity: 0.8 }]} 
                        onPress={handleSubmit} 
                        disabled={loading} 
                        activeOpacity={0.8}
                    >
                        {loading ? <ActivityIndicator color="#FFFFFF" size="large" /> : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Feather name="user-check" size={22} color="#FFFFFF" style={{ marginRight: 12 }} />
                                <Text style={s.submitText}>Authorize {roleLabel}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                    
                </ScrollView>
            </KeyboardAvoidingView>

            {/* ─── HD HALF-SHEET MODAL FOR ORG SELECTION ─── */}
            <Modal visible={orgPickerVisible} transparent={true} animationType="fade">
                <View style={s.modalOverlay}>
                    <TouchableOpacity style={s.modalDismissLayer} activeOpacity={1} onPress={() => {setOrgPickerVisible(false); setOrgSearchQuery('');}} />
                    
                    <View style={s.modalSheet}>
                        <View style={s.modalHandle} />
                        
                        <View style={s.modalHeader}>
                            <View>
                                <Text style={s.modalTitle}>Organization Database</Text>
                                <Text style={s.modalSubtitle}>Recently added organizations are shown first</Text>
                            </View>
                            <TouchableOpacity onPress={() => {setOrgPickerVisible(false); setOrgSearchQuery('');}} style={s.closeBtn}>
                                <Feather name="x" size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        
                        {/* ─── MODAL SEARCH BAR ─── */}
                        <View style={s.modalSearchBox}>
                            <Feather name="search" size={18} color="#94A3B8" style={{ marginRight: 10 }} />
                            <TextInput 
                                style={s.modalSearchInput}
                                placeholder="Search by organization name..."
                                placeholderTextColor="#94A3B8"
                                value={orgSearchQuery}
                                onChangeText={setOrgSearchQuery}
                                autoCorrect={false}
                            />
                            {orgSearchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setOrgSearchQuery('')}>
                                    <Feather name="x-circle" size={18} color="#CBD5E1" />
                                </TouchableOpacity>
                            )}
                        </View>
                        
                        {filteredOrgs.length === 0 && !orgsLoading ? (
                            <View style={s.warnBanner}>
                                <Feather name="alert-triangle" size={24} color="#D97706" />
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400E' }}>No Matches Found</Text>
                                    <Text style={{ fontSize: 14, color: '#B45309', marginTop: 4 }}>We couldn't find an organization matching '{orgSearchQuery}'.</Text>
                                </View>
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
                                            style={[s.pickerRow, isSel && s.pickerRowActive]} 
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                setSelectedOrgId(id);
                                                setErrors(e => ({ ...e, org: undefined }));
                                                setTimeout(() => {
                                                    setOrgPickerVisible(false);
                                                    setOrgSearchQuery('');
                                                }, 200);
                                            }}
                                        >
                                            <View style={[s.pickerIconWrap, isSel && { backgroundColor: '#FFFFFF' }]}>
                                                <Feather name="briefcase" size={16} color={isSel ? '#4F46E5' : '#64748B'} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[s.pickerText, isSel && s.pickerTextActive]} numberOfLines={1}>{item.name}</Text>
                                            </View>
                                            
                                            <View style={[s.typeRadioCircle, { width: 22, height: 22 }, isSel ? { borderColor: '#4F46E5', backgroundColor: '#4F46E5' } : {}]}>
                                                {isSel && <Feather name="check" size={12} color="#FFFFFF" />}
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

// ══════════════════════════════════════════
// Solid HD Premium Aesthetic (Ultra Polish)
// ══════════════════════════════════════════
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    body: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 80, paddingTop: 6 },
    
    // Banner Replacements
    roleBanner: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#FFFFFF', 
        borderRadius: 24, 
        paddingVertical: 24, paddingHorizontal: 20, marginTop: 24, gap: 18, 
        borderWidth: 1, borderLeftWidth: 8, borderColor: '#F1F5F9',
        ...Shadows.md
    },
    roleIconSolid: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    roleTitle: { fontSize: 19, fontWeight: '800', color: '#0F172A', marginBottom: 6, letterSpacing: -0.4 },
    roleDesc: { fontSize: 14, fontWeight: '600', color: '#64748B', lineHeight: 22 },

    sectionHeader: { fontSize: 12, fontWeight: '800', color: '#64748B', marginTop: 36, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: 6 },

    // The Master Input Card
    masterCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 32,
        padding: 28,
        paddingBottom: 20,
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

    // Status Banner
    statusBanner: { 
        flexDirection: 'row', alignItems: 'center', gap: 16, 
        borderRadius: 24, padding: 20, marginTop: 24, 
        borderWidth: 2, ...Shadows.sm 
    },
    statusSuccess: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
    statusError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    statusIconWrap: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    statusTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4, letterSpacing: -0.3 },
    statusMsg: { fontSize: 13, fontWeight: '600', color: '#64748B', lineHeight: 20 },

    // iOS Style Bottom Sheet Selector
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    modalDismissLayer: { flex: 1 },
    modalSheet: { 
        backgroundColor: '#FFFFFF', 
        borderTopLeftRadius: 36, borderTopRightRadius: 36, 
        maxHeight: '90%', height: '80%',
        ...Shadows.xl 
    },
    modalHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
    modalSubtitle: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 4 },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
    
    modalSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', marginHorizontal: 20, marginBottom: 16, borderRadius: 16, paddingHorizontal: 16, height: 52, borderWidth: 1, borderColor: '#F1F5F9' },
    modalSearchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },

    warnBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 20, padding: 24, margin: 24, marginTop: 10, borderWidth: 1, borderColor: '#FDE68A' },
    
    pickerRow: { 
        flexDirection: 'row', alignItems: 'center', 
        paddingVertical: 14, paddingHorizontal: 12,
        borderBottomWidth: 1, borderBottomColor: '#F8FAFC' 
    },
    pickerRowActive: { backgroundColor: '#EEF2FF', borderRadius: 20, borderBottomWidth: 0, paddingHorizontal: 16, marginTop: 4, marginBottom: 4 },
    pickerIconWrap: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    pickerText: { fontSize: 16, fontWeight: '700', color: '#334155' },
    pickerTextActive: { color: '#4F46E5', fontWeight: '800' },
    
    typeRadioCircle: {
        width: 24, height: 24,
        borderRadius: 12, borderWidth: 2, borderColor: '#CBD5E1',
        justifyContent: 'center', alignItems: 'center',
        marginLeft: 16
    },
});
