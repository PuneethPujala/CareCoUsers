import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Modal, Platform } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { apiService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABELS = { super_admin: 'Super Admin', org_admin: 'Organization Admin', care_manager: 'Care Manager', caller: 'Healthcare Caller', mentor: 'Patient Mentor', patient: 'Patient' };
const ROLE_COLORS = { super_admin: '#8B5CF6', org_admin: '#6366F1', care_manager: '#10B981', caller: '#4F46E5', mentor: '#F59E0B', patient: '#06B6D4' };

export default function AdminSearchScreen({ navigation }) {
    const { profile: myProfile } = useAuth();
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [selectedAdmin, setSelectedAdmin] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deleteText, setDeleteText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [statusBanner, setStatusBanner] = useState(null);

    const handleSearch = useCallback(async (query) => {
        setSearch(query);
        if (query.length < 2) { setResults([]); return; }
        try {
            setLoading(true);
            const res = await apiService.profiles.getAll({ search: query, limit: 50 });
            const profiles = res.data?.profiles || res.data || [];
            setResults(profiles.filter(p => ['super_admin', 'org_admin', 'care_manager', 'caller'].includes(p.role)));
        } catch (error) { console.error('[AdminSearch] Failed:', error);
        } finally { setLoading(false); }
    }, []);

    const handleSelectAdmin = useCallback(async (admin) => {
        try { setLoadingProfile(true);
            const res = await apiService.profiles.getById(admin._id);
            setSelectedAdmin(res.data?.profile || res.data);
        } catch (error) { setSelectedAdmin(admin);
        } finally { setLoadingProfile(false); }
    }, []);

    const handleCall = (phone) => {
        if (!phone) { setStatusBanner({ type: 'error', message: 'This administrator has not linked a telecom vector.' }); return; }
        Linking.openURL(`tel:${phone}`).catch(() => setStatusBanner({ type: 'error', message: 'Dialer module unavailable.' }));
    };

    const isOwn = selectedAdmin && myProfile && (selectedAdmin._id === myProfile._id || selectedAdmin.supabaseUid === myProfile.supabaseUid);

    const handleDeleteAdmin = async () => {
        if (deleteText !== 'DELETE') return;
        setDeleting(true);
        try {
            await apiService.profiles.delete(selectedAdmin._id || selectedAdmin.id);
            setDeleteModalVisible(false);
            setStatusBanner({ type: 'success', message: 'Administrator successfully deleted.' });
            setTimeout(() => { setSelectedAdmin(null); handleSearch(search); }, 1500);
        } catch (error) {
            console.error('Failed to delete admin:', error);
            const msg = error.response?.data?.error || error.response?.data?.message || 'Failed to delete administrator.';
            setDeleteModalVisible(false);
            setStatusBanner({ type: 'error', message: msg });
        } finally {
            setDeleting(false);
        }
    };

    // ─── PROFILE VIEW ───
    if (selectedAdmin) {
        const a = selectedAdmin;
        const phone = a.phone || a.phoneNumber;
        const roleColor = ROLE_COLORS[a.role] || '#4F46E5';
        
        return (
            <View style={s.container}>
                <GradientHeader title={a.fullName || a.email?.split('@')[0]} subtitle={ROLE_LABELS[a.role] || a.role} onBack={() => setSelectedAdmin(null)} />
                {loadingProfile ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#4F46E5" /></View>
                ) : (
                    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 60, paddingTop: 10 }} showsVerticalScrollIndicator={false}>
                        
                        {/* Status Banner Output */}
                        {statusBanner && (
                            <View style={[s.sBanner, statusBanner.type === 'success' ? s.sBannerOk : s.sBannerErr]}>
                                <View style={[s.sBannerIconWrap, { backgroundColor: statusBanner.type === 'success' ? '#DCFCE7' : '#FEF2F2' }]}>
                                    <Feather name={statusBanner.type === 'success' ? 'check-circle' : 'alert-circle'} size={20} color={statusBanner.type === 'success' ? '#16A34A' : '#EF4444'} />
                                </View>
                                <Text style={s.sBannerText}>{statusBanner.message}</Text>
                                <TouchableOpacity onPress={() => setStatusBanner(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <Feather name="x" size={16} color="#94A3B8" />
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* HD Profile Banner */}
                        <View style={[s.profileBanner, { borderLeftColor: roleColor }]}>
                            <View style={[s.pbAvatarBox, { backgroundColor: `${roleColor}15` }]}>
                                <Text style={[s.pbAvatarText, { color: roleColor }]}>{(a.fullName || 'U').charAt(0).toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.pbName}>{a.fullName || 'Unknown User'}</Text>
                                <View style={[s.pbRoleBadge, { backgroundColor: `${roleColor}12`, borderColor: `${roleColor}25` }]}>
                                    <Text style={[s.pbRoleText, { color: roleColor }]}>{ROLE_LABELS[a.role] || a.role}</Text>
                                </View>
                            </View>
                        </View>

                        <Text style={s.sectionHeader}>Contact Information</Text>

                        {/* HD Info Card */}
                        <View style={s.masterCard}>
                            <View style={s.infoRow}>
                                <View style={s.infoIconWrap}><Feather name="mail" size={18} color="#0EA5E9" /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.infoLabel}>Email Address</Text>
                                    <Text style={s.infoValue}>{a.email}</Text>
                                </View>
                            </View>
                            
                            <View style={s.infoDivider} />
                            
                            <View style={s.infoRow}>
                                <View style={s.infoIconWrap}><Feather name="phone-call" size={18} color="#10B981" /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.infoLabel}>Phone Number</Text>
                                    <Text style={[s.infoValue, !phone && { color: '#94A3B8', fontWeight: '500' }]}>{phone || 'Not added'}</Text>
                                </View>
                            </View>
                            
                            {a.organizationId && (<>
                                <View style={s.infoDivider} />
                                <View style={s.infoRow}>
                                    <View style={s.infoIconWrap}><Feather name="briefcase" size={18} color="#8B5CF6" /></View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.infoLabel}>Organization</Text>
                                        <Text style={s.infoValue}>{a.organizationId?.name || 'Platform Wide'}</Text>
                                    </View>
                                </View>
                            </>)}
                            
                            <View style={s.infoDivider} />
                            
                            <View style={s.infoRow}>
                                <View style={s.infoIconWrap}><Feather name="activity" size={18} color="#F59E0B" /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.infoLabel}>Account Status</Text>
                                    <StatusBadge label={a.isActive !== false ? 'Active' : 'Suspended'} variant={a.isActive !== false ? 'success' : 'error'} style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 12 }} />
                                </View>
                            </View>
                        </View>

                        {/* Action Framework */}
                        {!isOwn && (
                            <TouchableOpacity style={s.initiateCallBtn} activeOpacity={0.8} onPress={() => handleCall(phone)}>
                                <View style={s.initiateCallSolid}>
                                    <Feather name="phone" size={20} color="#FFFFFF" style={{ marginRight: 12 }} />
                                    <Text style={s.initiateCallText}>Call {a.fullName?.split(' ')[0] || 'Administrator'}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        {isOwn && (
                            <View style={s.ownNote}><Feather name="user-check" size={20} color="#4F46E5" style={{ marginBottom: 6 }} /><Text style={s.ownText}>This is your profile</Text></View>
                        )}

                        {/* Danger Zone */}
                        {!isOwn && (
                            <View style={{ marginTop: 36 }}>
                                <Text style={s.dangerTitle}>Account Management</Text>
                                <View style={s.dangerCard}>
                                    <View style={s.dangerHeader}>
                                        <View style={s.dangerIconWrap}>
                                            <Feather name="shield" size={20} color="#EF4444" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.dangerActionTitle}>Delete Administrator</Text>
                                            <Text style={s.dangerActionDesc}>
                                                Remove this user from the platform permanently. They will lose all access.
                                            </Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity style={s.deleteBtn} activeOpacity={0.8} onPress={() => {
                                        setDeleteText('');
                                        setDeleteModalVisible(true);
                                    }}>
                                        <Feather name="trash-2" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
                                        <Text style={s.deleteBtnText}>Delete User</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </ScrollView>
                )}

                <Modal animationType="slide" transparent={true} visible={deleteModalVisible}>
                    <View style={s.modalOverlay}>
                        <TouchableOpacity style={s.modalDismissLayer} activeOpacity={1} onPress={() => setDeleteModalVisible(false)} />
                        
                        <View style={s.modalSheet}>
                            <View style={s.modalHandle} />
                            
                            <View style={s.modalHeaderBlock}>
                                <View style={s.modalIconWrapAlert}>
                                    <Feather name="alert-triangle" size={32} color="#EF4444" />
                                </View>
                                <Text style={s.modalTitleAlert}>Confirm Deletion</Text>
                                <Text style={s.modalDescAlert}>
                                    This action cannot be undone. Type <Text style={{ fontWeight: '800', color: '#EF4444' }}>DELETE</Text> to proceed.
                                </Text>
                            </View>
                            
                            <TextInput 
                                style={[s.modalInput, { borderColor: deleteText === 'DELETE' ? '#EF4444' : '#E2E8F0' }]}
                                placeholder="Type DELETE to confirm"
                                placeholderTextColor="#94A3B8"
                                value={deleteText}
                                onChangeText={setDeleteText}
                                autoCapitalize="characters"
                                autoCorrect={false}
                            />

                            <View style={s.modalActions}>
                                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setDeleteModalVisible(false)}>
                                    <Text style={s.modalCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[s.modalConfirmBtn, deleteText !== 'DELETE' && s.modalConfirmDisabled]}
                                    onPress={handleDeleteAdmin}
                                    disabled={deleteText !== 'DELETE' || deleting}
                                >
                                    <Text style={[s.modalConfirmText, deleteText !== 'DELETE' && { color: '#94A3B8' }]}>
                                        {deleting ? 'Deleting...' : 'Confirm'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        );
    }

    // ─── SEARCH VIEW ───
    return (
        <View style={s.container}>
            <GradientHeader title="System Administrators" subtitle="Find and manage staff accounts" onBack={() => navigation.goBack()} />

            {/* Premium Deep Search Bar */}
            <View style={s.searchContainerBlock}>
                <Text style={s.searchInputLabel}>Search Admins</Text>
                <View style={[s.inputWrap, search.length > 0 && { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' }]}>
                    <View style={s.inputIconWrap}>
                        <Feather name="search" size={18} color={search.length > 0 ? '#4F46E5' : '#64748B'} />
                    </View>
                    <TextInput 
                        style={s.inputNative} 
                        placeholder="Search by name or email..."
                        placeholderTextColor="#CBD5E1" 
                        value={search} 
                        onChangeText={handleSearch} 
                        autoFocus 
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => { setSearch(''); setResults([]); }} style={s.hdClearBtn}>
                            <Feather name="x" size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                {search.length < 2 ? (
                    <View style={s.emptyStateBlock}>
                        <View style={s.emptyStateIcon}><Feather name="search" size={36} color="#94A3B8" /></View>
                        <Text style={s.emptyStateTitle}>Search Ready</Text>
                        <Text style={s.emptyStateDesc}>Type at least 2 characters to search for administrators.</Text>
                    </View>
                ) : loading ? (
                    <View style={{ paddingVertical: 80, alignItems: 'center' }}><ActivityIndicator size="large" color="#4F46E5" /></View>
                ) : results.length === 0 ? (
                    <View style={s.emptyStateBlock}>
                        <View style={[s.emptyStateIcon, { backgroundColor: '#FEF2F2' }]}><Feather name="user-x" size={36} color="#EF4444" /></View>
                        <Text style={s.emptyStateTitle}>No Results Found</Text>
                        <Text style={s.emptyStateDesc}>We couldn't find any administrators matching your search.</Text>
                    </View>
                ) : (
                    <View style={s.resultsList}>
                        <Text style={s.sectionHeader}>Search Results ({results.length})</Text>
                        {results.map((admin, idx) => {
                            const rc = ROLE_COLORS[admin.role] || '#4F46E5';
                            return (
                                <TouchableOpacity key={admin._id || idx} onPress={() => handleSelectAdmin(admin)} style={s.hdResultCard} activeOpacity={0.8}>
                                    <View style={[s.hdResultAvatar, { backgroundColor: `${rc}15` }]}>
                                        <Text style={[s.hdResultAvatarText, { color: rc }]}>{(admin.fullName || 'U').charAt(0).toUpperCase()}</Text>
                                    </View>
                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                        <Text style={s.hdResultName} numberOfLines={1}>{admin.fullName || 'Unknown User'}</Text>
                                        <Text style={s.hdResultEmail} numberOfLines={1}>{admin.email}</Text>
                                    </View>
                                    <View style={[s.hdRolePill, { backgroundColor: `${rc}12`, borderColor: `${rc}25` }]}>
                                        <Text style={[s.hdRoleText, { color: rc }]}>{ROLE_LABELS[admin.role] || admin.role}</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

// ══════════════════════════════════════════
// Solid HD Premium Aesthetic (Ultra Polish)
// ══════════════════════════════════════════
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    body: { flex: 1, paddingHorizontal: 24 },
    
    sectionHeader: { fontSize: 12, fontWeight: '800', color: '#64748B', marginTop: 12, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: 6 },

    // Top Search Input Master
    searchContainerBlock: { paddingHorizontal: 24, paddingVertical: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    searchInputLabel: { fontSize: 12, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginLeft: 6 },
    inputWrap: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#F8FAFC', 
        borderRadius: 20, 
        borderWidth: 1.5, borderColor: '#F1F5F9', 
        paddingHorizontal: 8, 
        height: 64, 
    },
    inputIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, ...Shadows.sm, shadowOpacity: 0.05 },
    inputNative: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A', ...Platform.select({ web: { outlineStyle: 'none' } }) },
    hdClearBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },

    // Empty States
    emptyStateBlock: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
    emptyStateIcon: { width: 96, height: 96, borderRadius: 32, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyStateTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8, letterSpacing: -0.5 },
    emptyStateDesc: { fontSize: 15, fontWeight: '500', color: '#64748B', textAlign: 'center', lineHeight: 22 },

    // Results HD List
    resultsList: { gap: 14, paddingTop: 10 },
    hdResultCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.06
    },
    hdResultAvatar: { width: 56, height: 56, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    hdResultAvatarText: { fontSize: 24, fontWeight: '800' },
    hdResultName: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 4, letterSpacing: -0.3 },
    hdResultEmail: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
    hdRolePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
    hdRoleText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    // Detail HD Profile Banner
    profileBanner: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#FFFFFF', borderRadius: 24, 
        paddingVertical: 24, paddingHorizontal: 24, marginTop: 16, gap: 18, 
        borderLeftWidth: 8, borderWidth: 1, borderColor: '#F1F5F9',
        ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.05
    },
    pbAvatarBox: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    pbAvatarText: { fontSize: 26, fontWeight: '800' },
    pbName: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 8, letterSpacing: -0.4 },
    pbRoleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
    pbRoleText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    // Master Info Card
    masterCard: { backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, paddingBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md, shadowOpacity: 0.06 },
    infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 16 },
    infoIconWrap: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
    infoLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    infoValue: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
    infoDivider: { height: 1.5, backgroundColor: '#F1F5F9', marginVertical: 12 },

    // Call Button
    initiateCallBtn: { marginTop: 32, borderRadius: 24, overflow: 'hidden', ...Shadows.xl, shadowColor: '#10B981', shadowOpacity: 0.2 },
    initiateCallSolid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981', height: 72 },
    initiateCallText: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },

    ownNote: { marginTop: 24, paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#E0E7FF' },
    ownText: { fontSize: 14, fontWeight: '700', color: '#4F46E5' },

    // Status Banner Replacements
    sBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18, marginTop: 14, borderWidth: 1.5 },
    sBannerOk: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
    sBannerErr: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    sBannerIconWrap: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    sBannerText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 20 },

    // Danger Zone (Ultra Modern)
    dangerTitle: { fontSize: 12, fontWeight: '800', color: '#EF4444', marginBottom: 12, paddingHorizontal: 6, textTransform: 'uppercase', letterSpacing: 1 },
    dangerCard: { backgroundColor: '#FFFFFF', borderColor: '#FEE2E2', borderWidth: 2, borderRadius: 32, padding: 28, ...Shadows.md, shadowColor: '#EF4444', shadowOpacity: 0.1 },
    dangerHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, gap: 16 },
    dangerIconWrap: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' },
    dangerActionTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 6, letterSpacing: -0.3 },
    dangerActionDesc: { fontSize: 14, color: '#64748B', lineHeight: 22, fontWeight: '600' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', borderRadius: 20, height: 64, ...Shadows.xl, shadowColor: '#0F172A', shadowOpacity: 0.3 },
    deleteBtnText: { fontSize: 17, color: '#fff', fontWeight: '800' },

    // Apple Bottom Sheet Style Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    modalDismissLayer: { flex: 1 },
    modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 24, paddingBottom: 40, ...Shadows.xl },
    modalHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 24 },
    
    modalHeaderBlock: { alignItems: 'center', marginBottom: 24 },
    modalIconWrapAlert: { width: 64, height: 64, borderRadius: 24, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    modalTitleAlert: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center', letterSpacing: -0.5 },
    modalDescAlert: { fontSize: 15, fontWeight: '600', color: '#64748B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },
    
    modalInput: { width: '100%', backgroundColor: '#F8FAFC', borderWidth: 2, borderRadius: 20, padding: 20, fontSize: 18, fontWeight: '800', textAlign: 'center', color: '#0F172A', marginBottom: 28 },
    
    modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
    modalCancelBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, backgroundColor: '#F8FAFC', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    modalCancelText: { fontSize: 16, fontWeight: '800', color: '#64748B' },
    modalConfirmBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, backgroundColor: '#EF4444', alignItems: 'center', ...Shadows.md, shadowColor: '#EF4444' },
    modalConfirmDisabled: { backgroundColor: '#E2E8F0', shadowOpacity: 0 },
    modalConfirmText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
