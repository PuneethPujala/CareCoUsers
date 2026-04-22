import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, Dimensions, StatusBar, Modal, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';

import HeroStatCard from '../../components/premium/HeroStatCard';
import StatCard from '../../components/premium/StatCard';
import SkeletonCard from '../../components/common/SkeletonCard';
import RecentActivity from '../../components/premium/RecentActivity';
import GradientHeader from '../../components/common/GradientHeader';

const { width: SW } = Dimensions.get('window');

const ORG_TYPES = [
    { value: 'hospital', label: 'Hospital', icon: 'business', color: '#4F46E5' },
    { value: 'clinic', label: 'Pharmacy', icon: 'medical', color: '#10B981' },
];
const getGridWidth = () => '48.5%'; 
const CARD_WIDTH = getGridWidth();

const KPI_LIST = [
    { type: 'care_managers', key: 'care_manager', progress: 85, change: +4.2 },
    { type: 'callers', key: 'caller', progress: 92, change: +8.4 },
    { type: 'patients', key: 'patient', progress: 78, change: +15.2 },
    { type: 'revenue', key: 'revenue', progress: 95, change: +22.1 },
];

const QUICK_ACTIONS = [
    { key: 'admin', label: 'New Manager', icon: 'user-plus', route: 'CreateUser', params: { allowedRole: 'care_manager' } },
    { key: 'collab', label: 'Add Deal', icon: 'briefcase', action: 'ADD_COLLAB' },
    { key: 'search', label: 'Search Users', icon: 'search', route: 'AdminSearch' },
    { key: 'deactivate', label: 'Remove Tie-Up', icon: 'slash', action: 'REMOVE_TIEUP', color: '#EF4444' },
];

export default function OrgAdminDashboard({ navigation }) {
    const { user, profile, logout } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState({
        stats: {},
        managers: [],
        routingQueue: [],
        recentActivity: []
    });
    
    // Collaboration States
    const [orgDetails, setOrgDetails] = useState(null);
    const [showCollabModal, setShowCollabModal] = useState(false);
    const [partnerName, setPartnerName] = useState('');
    const [tieUpType, setTieUpType] = useState('hospital');
    const [dealAmount, setDealAmount] = useState('');
    const [submittingCollab, setSubmittingCollab] = useState(false);
    const [showAllTieups, setShowAllTieups] = useState(false);
    const [showAllPatients, setShowAllPatients] = useState(false);
    
    // Deletion states
    const [showRemoveTieupModal, setShowRemoveTieupModal] = useState(false);
    const [selectedTieups, setSelectedTieups] = useState([]);
    const [submittingRemove, setSubmittingRemove] = useState(false);

    const fullName = profile?.fullName || user?.user_metadata?.full_name || 'Organization Admin';
    const orgIdStr = typeof profile?.organizationId === 'object' ? (profile.organizationId._id || profile.organizationId.id) : profile?.organizationId;

    const fetchData = useCallback(async (isRefresh = false) => {
        try { 
            if (!isRefresh) setLoading(true); 
            setError(null);
            
            // Auto-reconcile: silently assign any unassigned patients to available callers
            try { await apiService.org.reconcile(); } catch (e) { /* non-blocking */ }

            const [res, orgRes] = await Promise.all([
                apiService.dashboard.getOrgAdminStats(),
                orgIdStr ? apiService.organizations.getById(orgIdStr) : Promise.resolve({ data: null })
            ]);

            setStats(res.data || {}); 
            setOrgDetails(orgRes.data);
        } catch (err) { 
            const m = err?.response?.data?.error || 'Failed to load organization data.'; 
            setError(m); 
            if (isRefresh) Alert.alert('Error', m);
        } finally { 
            setLoading(false); 
            setRefreshing(false); 
        }
    }, [profile?.organizationId]);

    // Re-fetch data every time the screen comes into focus (e.g. after deleting a user)
    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [fetchData])
    );

    const onRefresh = useCallback(() => { 
        setRefreshing(true); 
        fetchData(true); 
    }, [fetchData]);

    const renderQuickActions = () => (
        <View style={s.quickActionsSection}>
            <Text style={[s.sectionTitle, Theme.typography.common]}>Quick Actions</Text>
            <View style={s.actionsGrid}>
                {QUICK_ACTIONS.map(action => (
                    <TouchableOpacity 
                        key={action.key}
                        style={s.actionCard}
                        onPress={() => {
                            if (action.action === 'ADD_COLLAB') {
                                setPartnerName('');
                                setDealAmount('');
                                setShowCollabModal(true);
                            } else if (action.action === 'REMOVE_TIEUP') {
                                setSelectedTieups([]);
                                setShowRemoveTieupModal(true);
                            } else {
                                navigation.navigate(action.route, action.params);
                            }
                        }}
                        activeOpacity={0.8}
                    >
                        <View style={[s.actionIconContainer, action.color && { backgroundColor: action.color + '1A' }]}>
                            <Feather name={action.icon} size={22} color={action.color || "#6366F1"} />
                        </View>
                        <Text style={[s.actionLabel, Theme.typography.common, action.color && { color: action.color }]}>{action.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    const confirmRemoveTieUp = async () => {
        if (selectedTieups.length === 0) {
            if (Platform.OS === 'web') {
                window.alert('Please select at least one tie-up to remove.');
            } else {
                Alert.alert('Validation', 'Please select at least one tie-up to remove.');
            }
            return;
        }

        const executeDeletion = async () => {
            setSubmittingRemove(true);
            try {
                await apiService.organizations.removeCollaborations(orgIdStr, selectedTieups);
                setShowRemoveTieupModal(false);
                setSelectedTieups([]);
                if (Platform.OS === 'web') {
                    window.alert('Selected Tie-Ups have been successfully deleted.');
                } else {
                    Alert.alert('Success', 'Selected Tie-Ups have been successfully deleted.');
                }
                fetchData();
            } catch (e) {
                if (Platform.OS === 'web') {
                    window.alert(e.message || 'Failed to remove tie-ups');
                } else {
                    Alert.alert('Error', e.message || 'Failed to remove tie-ups');
                }
            } finally {
                setSubmittingRemove(false);
            }
        };

        if (Platform.OS === 'web') {
            const confirmed = window.confirm(`Are you sure you want to permanently delete ${selectedTieups.length} tie-ups? Their revenue will be immediately deducted from the platform.`);
            if (confirmed) {
                executeDeletion();
            }
        } else {
            Alert.alert(
                'Remove Deals',
                `Are you sure you want to permanently delete ${selectedTieups.length} tie-ups? Their revenue will be immediately deducted from the platform.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: executeDeletion }
                ]
            );
        }
    };

    const toggleTieupSelection = (id) => {
        setSelectedTieups(prev => 
            prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
        );
    };

    const handleAmountChange = (text) => {
        // Strip everything except numbers
        const numericValue = text.replace(/[^0-9]/g, '');
        if (numericValue) {
            // Instantly format with commas using Indian numbering system
            setDealAmount(Number(numericValue).toLocaleString('en-IN'));
        } else {
            setPartnerName('');
            setTieUpType('hospital');
            setDealAmount('');
        }
    };

    const handleCollabSubmit = async () => {
        if (submittingCollab) return;
        if (!partnerName.trim() || !dealAmount.trim()) {
            Alert.alert('Validation', 'Please provide both a Partner Name and the Deal Amount.');
            return;
        }
        setSubmittingCollab(true);
        try {
            const rawAmount = Number(dealAmount.replace(/,/g, ''));
            await apiService.organizations.addCollaboration(orgIdStr, {
                partnerName: partnerName.trim(),
                type: tieUpType,
                dealAmount: rawAmount
            });
            setShowCollabModal(false);
            Alert.alert('Success', 'Collaboration established successfully! Revenue augmented in INR.');
            fetchData();
        } catch (error) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to secure tie-up deal.');
        } finally {
            setSubmittingCollab(false);
        }
    };

    const renderCollaborations = () => {
        const collabs = orgDetails?.collaborations || [];
        const sortedCollabs = [...collabs].sort((a, b) => new Date(b.date) - new Date(a.date));
        const limit = 3;
        const displayCollabs = showAllTieups ? sortedCollabs : sortedCollabs.slice(0, limit);
        const hasMore = sortedCollabs.length > limit;

        return (
            <View style={s.listSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={[s.sectionTitle, Theme.typography.common, { marginBottom: 0 }]}>Active Tie-Ups & Collaborations</Text>
                    {hasMore && (
                        <TouchableOpacity onPress={() => setShowAllTieups(!showAllTieups)} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EEF2FF', borderRadius: 8 }}>
                            <Text style={{ color: '#6366F1', fontWeight: '700', fontSize: 13 }}>{showAllTieups ? 'View Less' : 'View All'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {collabs.length === 0 ? (
                    <View style={s.emptyStateCard}>
                        <Feather name="briefcase" size={32} color="#CBD5E1" style={{ marginBottom: 12 }} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#64748B', textAlign: 'center' }}>No active tie-ups</Text>
                        <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>Add a deal to grow organizational revenue</Text>
                    </View>
                ) : (
                    <View style={s.collabContainer}>
                        {displayCollabs.map((collab, i) => (
                        <View key={i} style={s.collabCard}>
                            <View style={s.collabHeader}>
                                <View style={[s.collabIconBox, collab.type === 'clinic' ? { backgroundColor: 'rgba(16, 185, 129, 0.1)' } : {}]}>
                                    <Ionicons name={collab.type === 'clinic' ? "medical" : "business"} size={18} color={collab.type === 'clinic' ? "#10B981" : "#6366F1"} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[s.collabPartner, Theme.typography.common]}>{collab.partnerName}</Text>
                                    <Text style={[s.collabDate, Theme.typography.common]}>
                                        {collab.type === 'clinic' ? 'Pharmacy Tie-Up' : 'Hospital Tie-Up'} • {new Date(collab.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </Text>
                                </View>
                                <View style={s.collabAmountBox}>
                                    <Text style={[s.collabAmount, Theme.typography.common]}>
                                        ₹ {collab.dealAmount?.toLocaleString('en-IN')}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
                )}
            </View>
        );
    };

    const renderPatientSubscriptions = () => {
        const subscriptions = stats?.recentSubscriptions || [];
        const limit = 3;
        const displaySubs = showAllPatients ? subscriptions : subscriptions.slice(0, limit);
        const hasMore = subscriptions.length > limit;

        return (
            <View style={s.listSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={[s.sectionTitle, Theme.typography.common, { marginBottom: 0 }]}>Recent Patient Subscriptions</Text>
                    {hasMore && (
                        <TouchableOpacity onPress={() => setShowAllPatients(!showAllPatients)} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EEF2FF', borderRadius: 8 }}>
                            <Text style={{ color: '#6366F1', fontWeight: '700', fontSize: 13 }}>{showAllPatients ? 'View Less' : 'View All'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {subscriptions.length === 0 ? (
                    <View style={s.emptyStateCard}>
                        <Feather name="users" size={32} color="#CBD5E1" style={{ marginBottom: 12 }} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#64748B', textAlign: 'center' }}>No active patient subscriptions</Text>
                        <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>Revenue from patients will appear here</Text>
                    </View>
                ) : (
                    <View style={s.collabContainer}>
                        {displaySubs.map((sub, i) => (
                        <View key={i} style={s.collabCard}>
                            <View style={s.collabHeader}>
                                <View style={[s.collabIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.08)' }]}>
                                    <Feather name="user-check" size={18} color="#10B981" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[s.collabPartner, Theme.typography.common]}>
                                        {sub.name || (sub.first_name ? `${sub.first_name} ${sub.last_name || ''}`.trim() : 'Unknown Patient')}
                                    </Text>
                                    <Text style={[s.collabDate, Theme.typography.common]}>
                                        {new Date(sub.subscription?.startDate || sub.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </Text>
                                </View>
                                <View style={[s.collabAmountBox, { backgroundColor: '#F0FDF4', borderColor: '#D1FAE5' }]}>
                                    <Text style={[s.collabAmount, Theme.typography.common]}>
                                        ₹ {sub.subscription?.amount?.toLocaleString('en-IN') || 0}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
                )}
            </View>
        );
    };

    const renderManagerWorkload = () => {
        if (!stats.managers || stats.managers.length === 0) return null;
        
        const STATUS_CONFIG = {
            IDLE:       { color: '#94A3B8', bg: '#F8FAFC', label: 'IDLE' },
            LOW:        { color: '#3B82F6', bg: '#EFF6FF', label: 'LOW' },
            OPTIMAL:    { color: '#10B981', bg: '#ECFDF5', label: 'OPTIMAL' },
            HIGH:       { color: '#F59E0B', bg: '#FFFBEB', label: 'HIGH' },
            OVERLOADED: { color: '#EF4444', bg: '#FEF2F2', label: 'OVERLOADED' },
        };
        
        return (
            <View style={s.listSection}>
                <Text style={[s.sectionTitle, Theme.typography.common]}>Manager Workload</Text>
                {stats.managers.map((m, i) => {
                    const sc = STATUS_CONFIG[m.status] || STATUS_CONFIG.OPTIMAL;
                    return (
                        <View key={m.id} style={s.premiumRow}>
                            <View style={s.rowIconBox}>
                                <Feather name="clipboard" size={20} color="#6366F1" />
                            </View>
                            <View style={s.rowInfo}>
                                <Text style={s.rowTitle}>{m.name}</Text>
                                <Text style={s.rowSub}>Load: {m.load}%  ·  {m.patients} Patients  ·  {m.callers} Callers</Text>
                            </View>
                            <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                                <Text style={[s.statusText, { color: sc.color }]}>
                                    {sc.label}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </View>
        );
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="dark-content" />
            <GradientHeader />

            <ScrollView 
                style={s.scrollView} 
                contentContainerStyle={s.contentContainer} 
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
                }
            >
                {/* Reusing exact Hero Card styling to show Active Users */}
                <HeroStatCard 
                    title="ACTIVE ORGANIZATION USERS"
                    value={
                        (stats.stats?.care_manager || 0) + 
                        (stats.stats?.caller || 0) + 
                        (stats.stats?.patient_mentor || 0) + 
                        (stats.stats?.patient || 0)
                    }
                    suffix=""
                    changeText="Total Workforce & Patients"
                    changeSub=""
                    data={[
                        // Dynamic-looking sparkline indicating growth
                        40, 45, 52, 60, 70, 85, 95, 
                        (stats.stats?.patient || 110), 
                        (stats.stats?.caller || 120), 
                        130
                    ]}
                />

                {/* KPI Grid (2 Columns x 2 Rows) */}
                <View style={s.gridContainer}>
                    {loading && !refreshing
                        ? KPI_LIST.map((_, i) => <SkeletonCard key={i} width={CARD_WIDTH} />)
                        : KPI_LIST.map((kpi, index) => (
                            <StatCard 
                                key={kpi.type}
                                type={kpi.type}
                                value={stats.stats?.[kpi.key] || 0}
                                change={stats.stats?.[`${kpi.key}_change`] || 0}
                                progress={kpi.progress}
                                index={index}
                                width={CARD_WIDTH}
                                onClick={() => {
                                   if (kpi.key === 'patient') navigation.navigate('PatientsList');
                                   else navigation.navigate('TeamList', { role: kpi.key });
                                }}
                            />
                        ))
                    }
                </View>

                {/* Revenue Breakdowns */}
                <View style={s.revenueSplitBox}>
                    <View style={s.revenueSplitHalf}>
                        <View style={[s.collabIconBox, { width: 36, height: 36, marginBottom: 8, backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                            <Feather name="users" size={16} color="#10B981" />
                        </View>
                        <Text style={[s.actionLabel, Theme.typography.common, { color: '#64748B' }]}>Patient Revenue</Text>
                        <Text style={[s.sectionTitle, Theme.typography.common, { marginBottom: 0, marginTop: 4, color: '#10B981' }]}>
                            ₹ {(stats.stats?.patientRevenue || 0).toLocaleString('en-IN')}
                        </Text>
                    </View>
                    <View style={s.revenueSplitDivider} />
                    <View style={s.revenueSplitHalf}>
                        <View style={[s.collabIconBox, { width: 36, height: 36, marginBottom: 8, backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
                            <Feather name="briefcase" size={16} color="#6366F1" />
                        </View>
                        <Text style={[s.actionLabel, Theme.typography.common, { color: '#64748B' }]}>Tie-Up Revenue</Text>
                        <Text style={[s.sectionTitle, Theme.typography.common, { marginBottom: 0, marginTop: 4, color: '#6366F1' }]}>
                            ₹ {(stats.stats?.tieupRevenue || 0).toLocaleString('en-IN')}
                        </Text>
                    </View>
                </View>

                {renderQuickActions()}

                {renderCollaborations()}
                
                {renderPatientSubscriptions()}

                {renderManagerWorkload()}

                <RecentActivity data={stats.recentActivity || []} />
            </ScrollView>

            {/* Tie-Up Deal Modal - Premium Apple Bottom Sheet */}
            <Modal animationType="slide" transparent visible={showCollabModal}>
                <View style={s.modalOverlay}>
                    <TouchableOpacity style={s.modalDismissLayer} activeOpacity={1} onPress={() => setShowCollabModal(false)} />
                    
                    <View style={s.modalSheet}>
                        {submittingCollab && (
                            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.85)', zIndex: 10, borderRadius: 36, justifyContent: 'center', alignItems: 'center' }]}>
                                <ActivityIndicator size="large" color="#4F46E5" />
                                <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '800', color: '#0F172A' }}>Processing Deal...</Text>
                                <Text style={{ marginTop: 8, fontSize: 13, fontWeight: '600', color: '#64748B', textAlign: 'center', paddingHorizontal: 40 }}>Synchronizing revenue securely and registering new partnership terms.</Text>
                            </View>
                        )}
                        <View style={s.modalHandle} />

                        <View style={s.modalHeaderBlock}>
                            <View style={s.modalIconWrapCollab}>
                                <Feather name="briefcase" size={32} color="#4F46E5" />
                            </View>
                            <Text style={s.modalTitleCollab}>Establish Partnership</Text>
                            <Text style={s.modalDescCollab}>
                                Documenting a tie-up will instantly integrate the INR deal payout into your overall system revenue blocks.
                            </Text>
                        </View>
                        
                        <View style={s.modalInputForm}>
                            <Text style={s.inputLabel}>TYPE OF ORGANIZATION</Text>
                            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                                {ORG_TYPES.map(t => {
                                    const isSelected = tieUpType === t.value;
                                    return (
                                        <TouchableOpacity key={t.value} activeOpacity={0.8}
                                            onPress={() => setTieUpType(t.value)}
                                            style={[
                                                s.typeCardInline,
                                                isSelected ? { borderColor: t.color, backgroundColor: `${t.color}0A` } : {}
                                            ]}>
                                            <Ionicons name={t.icon} size={20} color={isSelected ? t.color : '#94A3B8'} style={{ marginRight: 8 }} />
                                            <Text style={[s.typeCardLabelInline, isSelected ? { color: '#0F172A' } : {}]}>{t.label}</Text>
                                            <View style={[s.typeRadioCircleInline, isSelected && { borderColor: t.color }]}>
                                                {isSelected && <View style={[s.typeRadioInnerInline, { backgroundColor: t.color }]} />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={s.inputLabel}>PARTNER NAME</Text>
                            <View style={[s.inputWrap, !partnerName && s.inputWrapEmpty]}>
                                <View style={s.inputIconWrap}>
                                    <Feather name="briefcase" size={18} color={partnerName ? '#4F46E5' : '#64748B'} />
                                </View>
                                <TextInput 
                                    style={s.inputNative}
                                    placeholder="Apollo Hospitals, MediPlus, etc."
                                    placeholderTextColor="#CBD5E1"
                                    value={partnerName}
                                    onChangeText={setPartnerName}
                                />
                            </View>

                            <Text style={s.inputLabel}>DEAL VALUATION (INR)</Text>
                            <View style={[s.inputWrap, !dealAmount && s.inputWrapEmpty]}>
                                <View style={s.inputIconWrap}>
                                    <Text style={[s.currencySymbol, !dealAmount && { color: '#64748B' }]}>₹</Text>
                                </View>
                                <TextInput 
                                    style={s.inputNativeCurrency}
                                    placeholder="5,00,000"
                                    placeholderTextColor="#CBD5E1"
                                    keyboardType="numeric"
                                    value={dealAmount}
                                    onChangeText={handleAmountChange}
                                />
                            </View>
                        </View>

                        <View style={s.modalActions}>
                            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowCollabModal(false)}>
                                <Text style={s.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[s.modalConfirmBtn, (!partnerName || !dealAmount) && s.modalBtnDisabled]}
                                onPress={handleCollabSubmit}
                                disabled={!partnerName || !dealAmount || submittingCollab}
                            >
                                {submittingCollab ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={[s.modalConfirmText, (!partnerName || !dealAmount) && { color: '#94A3B8' }]}>Confirm Deal</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Tie-Up Removal Checklist Modal */}
            <Modal animationType="slide" transparent visible={showRemoveTieupModal}>
                <View style={s.modalOverlay}>
                    <TouchableOpacity style={s.modalDismissLayer} activeOpacity={1} onPress={() => setShowRemoveTieupModal(false)} />
                    
                    <View style={s.modalSheet}>
                        <View style={s.modalHandle} />

                        <View style={s.modalHeaderBlock}>
                            <View style={[s.modalIconWrapCollab, { backgroundColor: '#FEF2F2' }]}>
                                <Feather name="slash" size={32} color="#EF4444" />
                            </View>
                            <Text style={s.modalTitleCollab}>Remove Tie-Ups</Text>
                            <Text style={s.modalDescCollab}>
                                Select the partnerships you wish to dissolve. Revenue metrics will forcefully reverse upon deletion.
                            </Text>
                        </View>
                        
                        <ScrollView style={{ maxHeight: 300, marginBottom: 20 }} showsVerticalScrollIndicator={false}>
                            {(orgDetails?.collaborations || []).length === 0 ? (
                                <View style={[s.emptyStateCard, { marginTop: 10 }]}>
                                    <Text style={{ fontSize: 13, color: '#64748B' }}>No active tie-ups exist for this organization.</Text>
                                </View>
                            ) : (
                                (orgDetails?.collaborations || []).map(collab => {
                                    const isSelected = selectedTieups.includes(collab._id);
                                    return (
                                        <TouchableOpacity 
                                            key={collab._id}
                                            style={[
                                                s.premiumRow, 
                                                { marginBottom: 8, padding: 12 },
                                                isSelected && { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }
                                            ]}
                                            activeOpacity={0.7}
                                            onPress={() => toggleTieupSelection(collab._id)}
                                        >
                                            <View style={{ marginRight: 12 }}>
                                                <Feather 
                                                    name={isSelected ? "check-circle" : "circle"} 
                                                    size={24} 
                                                    color={isSelected ? "#EF4444" : "#CBD5E1"} 
                                                />
                                            </View>
                                            <View style={s.rowInfo}>
                                                <Text style={[s.rowTitle, { fontSize: 15 }]}>{collab.partnerName}</Text>
                                                <Text style={s.rowSub}>₹ {(collab.dealAmount || 0).toLocaleString('en-IN')}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>

                        <View style={s.modalActions}>
                            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowRemoveTieupModal(false)}>
                                <Text style={s.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[
                                    s.modalConfirmBtn, 
                                    { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
                                    submittingRemove && s.modalBtnDisabled
                                ]}
                                onPress={confirmRemoveTieUp}
                                disabled={submittingRemove}
                            >
                                {submittingRemove ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={s.modalConfirmText}>
                                        Delete Selected
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: '#F8FAFC', 
    },
    scrollView: { 
        flex: 1, 
    },
    contentContainer: {
        paddingTop: 20,
        paddingBottom: 120, 
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    quickActionsSection: {
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 16,
        letterSpacing: -0.3,
    },
    actionsGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    actionCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Theme.shadows.sharp,
    },
    actionIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    actionLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0F172A',
        textAlign: 'center',
        letterSpacing: -0.2,
    },
    // Premium Row overrides for Workloads
    listSection: {
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    premiumRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Theme.shadows.sharp,
    },
    rowIconBox: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: '#F0F6FF',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 16,
    },
    rowInfo: { flex: 1 },
    rowTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
    rowSub: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },

    // Collab Module Overrides
    collabContainer: { gap: 12 },
    collabCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, ...Theme.shadows.sharp, borderWidth: 1, borderColor: '#F1F5F9' },
    collabHeader: { flexDirection: 'row', alignItems: 'center' },
    collabIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(99, 102, 241, 0.08)', justifyContent: 'center', alignItems: 'center' },
    collabPartner: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
    collabDate: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
    collabAmountBox: { backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#D1FAE5' },
    collabAmount: { fontSize: 14, fontWeight: '800', color: '#059669' },

    // Modal Overrides - Apple Style Bottom Sheet
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    modalDismissLayer: { flex: 1 },
    modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 28, paddingBottom: 40, ...Theme.shadows.sharp },
    modalHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 24 },
    modalHeaderBlock: { alignItems: 'center', marginBottom: 24, paddingHorizontal: 10 },
    modalIconWrapCollab: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    modalTitleCollab: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 6, textAlign: 'center', letterSpacing: -0.5 },
    modalDescCollab: { fontSize: 13, fontWeight: '600', color: '#64748B', textAlign: 'center', lineHeight: 20 },
    
    modalInputForm: { width: '100%', marginBottom: 10 },
    inputLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase' },
    
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 24, borderWidth: 1.5, borderColor: '#4F46E5', paddingHorizontal: 8, height: 68, marginBottom: 20 },
    inputWrapEmpty: { borderColor: '#F1F5F9' },
    inputIconWrap: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, ...Theme.shadows.sharp, shadowOpacity: 0.04 },
    inputNative: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A' },
    
    currencySymbol: { fontSize: 18, fontWeight: '800', color: '#4F46E5', marginLeft: 1 },
    inputNativeCurrency: { flex: 1, fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: 0.5 },
    
    modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
    modalCancelBtn: { flex: 1, height: 64, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    modalCancelText: { fontSize: 16, fontWeight: '800', color: '#64748B' },
    modalConfirmBtn: { flex: 1, height: 64, borderRadius: 20, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', ...Theme.shadows.sharp, shadowColor: '#0F172A', shadowOpacity: 0.25 },
    modalConfirmText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
    modalBtnDisabled: { backgroundColor: '#F8FAFC', shadowOpacity: 0, borderWidth: 1, borderColor: '#E2E8F0' },
    
    // Revenue Splitting Custom Utilities
    revenueSplitBox: { flexDirection: 'row', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 24, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', ...Theme.shadows.sharp },
    revenueSplitHalf: { flex: 1, alignItems: 'center' },
    revenueSplitDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 16 },
    emptyStateCard: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' },

    typeCardInline: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 14, paddingHorizontal: 12, borderWidth: 2, borderColor: '#F1F5F9' },
    typeCardLabelInline: { flex: 1, fontSize: 13, fontWeight: '800', color: '#64748B' },
    typeRadioCircleInline: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
    typeRadioInnerInline: { width: 10, height: 10, borderRadius: 5 }
});