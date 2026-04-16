import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, StatusBar, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';

function PatientRow({ item, index, navigation }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 60, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 60, useNativeDriver: true })
        ]).start();
    }, []);

    const name = item.fullName || item.name || (item.profileId?.fullName) || 'Patient User';
    const email = item.email || item.profileId?.email || 'No email provided';
    const initial = name.charAt(0).toUpperCase();
    const statusLabel = item.status?.toUpperCase() || 'STABLE';
    const isCritical = statusLabel === 'CRITICAL';
    const isMonitoring = statusLabel === 'MONITORING';
    
    // Status colors
    const sColors = isCritical 
        ? { text: '#EF4444', bg: '#FEF2F2', border: '#FECACA' }
        : isMonitoring
        ? { text: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' }
        : { text: '#10B981', bg: '#F0FDF4', border: '#D1FAE5' };

    return (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <TouchableOpacity 
                onPress={() => navigation.navigate('PatientDetail', { patientId: item._id || item.id })}
                activeOpacity={0.8} 
                style={s.cardWrapper}
            >
                {/* ── Background Watermark ── */}
                <Ionicons name="pulse" size={100} color="#F8FAFC" style={s.cardWatermark} />

                <View style={s.patientCard}>
                    <View style={s.avatarBox}>
                        <LinearGradient colors={isCritical ? ['#FEF2F2', '#FEE2E2'] : ['#EEF2FF', '#E0E7FF']} style={StyleSheet.absoluteFill} />
                        <Text style={[s.avatarText, isCritical && { color: '#EF4444' }]}>{initial}</Text>
                    </View>

                    <View style={s.infoSection}>
                        <Text style={[s.patientName, Theme.typography.common]} numberOfLines={1}>{name}</Text>
                        <View style={s.metaRow}>
                            <Feather name="mail" size={12} color="#94A3B8" />
                            <Text style={[s.metaText, Theme.typography.common]} numberOfLines={1}>{email}</Text>
                        </View>
                    </View>

                    <View style={s.statusSection}>
                        <View style={[s.statusPill, { backgroundColor: sColors.bg, borderColor: sColors.border }]}>
                            <View style={[s.statusDot, { backgroundColor: sColors.text }]} />
                            <Text style={[s.statusLabel, { color: sColors.text }, Theme.typography.common]}>{statusLabel}</Text>
                        </View>
                        <View style={s.actionArrowBox}>
                            <Feather name="chevron-right" size={16} color="#CBD5E1" />
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

export default function PatientsListScreen({ navigation, route }) {
    const { profile } = useAuth();
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);

    const orgFilter = route?.params?.organizationId;
    const unassignedFilter = route?.params?.unassigned;

    // Determine if the current user is a caller/caretaker
    const isCaller = profile?.role === 'caller' || profile?.role === 'caretaker';

    const fetchPatients = useCallback(async () => {
        try {
            const queryParams = { limit: 100 };

            let data = [];

            if (isCaller) {
                // Callers: Use the caretaker-specific endpoint that queries both
                // Patient and Profile collections for assigned patients
                if (search) queryParams.search = search;
                const res = await apiService.caretaker.getMyPatients(queryParams);
                data = res.data?.patients || [];
            } else {
                // Other roles: use the generic patients endpoint
                if (orgFilter) queryParams.organizationId = orgFilter;
                if (unassignedFilter) queryParams.unassigned = 'true';
                const res = await apiService.patients.getAll(queryParams);
                data = res.data?.patients || res.data?.data || res.data || [];
            }

            setPatients(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load patients', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [orgFilter, unassignedFilter, isCaller, search]);

    useEffect(() => {
        fetchPatients();
    }, [fetchPatients]);

    const onRefresh = useCallback(() => { 
        setRefreshing(true); 
        fetchPatients(); 
    }, [fetchPatients]);

    // Client-side filter for non-caller roles (callers send search to backend)
    const filtered = isCaller
        ? patients
        : patients.filter(p => 
            (p.fullName || p.name || '').toLowerCase().includes(search.toLowerCase())
        );

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            <GradientHeader
                title={isCaller ? "My Patients" : "Patients Subsystem"}
                subtitle={`${filtered.length} ${isCaller ? 'assigned' : 'actively monitored'} records`}
                onBack={() => navigation.goBack()}
            />

            {/* ── Floating Search Bar ── */}
            <View style={s.searchSection}>
                <View style={s.searchContainer}>
                    <Feather name="search" size={20} color="#6366F1" style={s.searchIcon} />
                    <TextInput 
                        style={[s.searchInput, Theme.typography.common]} 
                        placeholder="Search patient records..." 
                        placeholderTextColor="#94A3B8"
                        value={search} 
                        onChangeText={setSearch} 
                        autoCorrect={false}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}>
                            <Feather name="x" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <ScrollView 
                style={s.body} 
                contentContainerStyle={s.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
            >
                {loading && !refreshing ? (
                    <View style={s.loadingBox}>
                        <ActivityIndicator size="large" color="#4F46E5" />
                        <Text style={s.loadingText}>Loading patient registry...</Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <EmptyState icon="users" title="No Records Found" subtitle={search.length > 0 ? "No records match your search criteria." : "There are currently no patients assigned to this view."} />
                ) : (
                    <View style={s.listContainer}>
                        {filtered.map((p, idx) => (
                            <PatientRow key={p._id || p.id} item={p} index={idx} navigation={navigation} />
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

// ══════════════════════════════════════════
// Solid HD Premium Aesthetic
// ══════════════════════════════════════════
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7F9' },
    body: { flex: 1 },
    scrollContent: { paddingBottom: 140 }, // Breathing room for tab bar
    
    // Search
    searchSection: {
        paddingHorizontal: 20,
        marginTop: 20,
        marginBottom: 10,
        zIndex: 10,
    },
    searchContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#FFFFFF', 
        borderRadius: 20,
        paddingHorizontal: 20,
        height: 60,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Shadows.md, shadowColor: '#4F46E5', shadowOpacity: 0.1
    },
    searchIcon: { marginRight: 14 },
    searchInput: { 
        flex: 1, 
        color: '#0F172A', 
        fontSize: 16, 
        fontWeight: '600' 
    },
    clearBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },

    loadingBox: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
    loadingText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 16 },

    // List Items
    listContainer: { paddingHorizontal: 20, gap: 16, paddingTop: 10 },
    cardWrapper: {
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.08,
        borderWidth: 1, borderColor: '#F1F5F9',
        overflow: 'hidden'
    },
    cardWatermark: { position: 'absolute', right: -20, top: -10, opacity: 0.8, transform: [{rotate: '10deg'}] },
    
    patientCard: { 
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
    },
    avatarBox: {
        width: 52, height: 52, borderRadius: 16,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E0E7FF'
    },
    avatarText: { fontSize: 20, fontWeight: '800', color: '#4F46E5' },
    infoSection: { flex: 1, marginRight: 12 },
    patientName: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 4, letterSpacing: -0.2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
    
    statusSection: { alignItems: 'flex-end', justifyContent: 'space-between', height: 48 },
    statusPill: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 8, borderWidth: 1, gap: 4,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    
    actionArrowBox: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
});
