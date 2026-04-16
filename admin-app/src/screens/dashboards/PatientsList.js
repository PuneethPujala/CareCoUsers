import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput, Animated, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import EmptyState from '../../components/common/EmptyState';
import { apiService } from '../../lib/api';

function PatientRow({ item, index, navigation }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 50, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 50, useNativeDriver: true })
        ]).start();
    }, []);

    const name = item.fullName || (item.profileId?.fullName) || 'Unknown Patient';
    const email = item.email || item.profileId?.email || '';
    const phone = item.phone || item.profileId?.phone || 'N/A';
    const initial = name.charAt(0).toUpperCase();
    
    const isActive = item.status !== 'inactive';
    const statusLabel = isActive ? 'ACTIVE' : 'INACTIVE';
    
    // Status colors
    const sColors = isActive 
        ? { text: '#10B981', bg: '#F0FDF4', border: '#D1FAE5', grad: ['#EEF2FF', '#E0E7FF'] }
        : { text: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', grad: ['#F1F5F9', '#E2E8F0'] };

    return (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <TouchableOpacity 
                onPress={() => navigation.navigate('PatientDetail', { patientId: item._id || item.id })}
                activeOpacity={0.8} 
                style={s.cardWrapper}
            >
                {/* ── Background Watermark ── */}
                <Ionicons name="people" size={120} color="#F8FAFC" style={s.cardWatermark} />

                <View style={[s.patientCard, { borderLeftColor: isActive ? '#4F46E5' : '#CBD5E1' }]}>
                    
                    <View style={s.avatarBox}>
                        <LinearGradient colors={sColors.grad} style={StyleSheet.absoluteFill} />
                        <Text style={[s.avatarText, !isActive && { color: '#64748B' }]}>{initial}</Text>
                    </View>

                    <View style={s.infoSection}>
                        <Text style={s.patientName} numberOfLines={1}>{name}</Text>
                        <View style={s.metaRow}>
                            <Feather name="mail" size={12} color="#94A3B8" />
                            <Text style={s.metaText} numberOfLines={1}>{email || 'No email provided'}</Text>
                        </View>
                        <View style={s.metaRow}>
                            <Feather name="phone" size={12} color="#94A3B8" />
                            <Text style={s.metaText} numberOfLines={1}>{phone}</Text>
                        </View>
                    </View>

                    <View style={s.statusSection}>
                        <View style={[s.statusPill, { backgroundColor: sColors.bg, borderColor: sColors.border }]}>
                            <View style={[s.statusDot, { backgroundColor: sColors.text }]} />
                            <Text style={[s.statusLabel, { color: sColors.text }]}>{statusLabel}</Text>
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

export default function PatientsList({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [patients, setPatients] = useState([]);
    const [search, setSearch] = useState('');
    const [adherenceFilter, setAdherenceFilter] = useState('all');

    const fetchPatients = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const res = await apiService.patients.getAll();
            setPatients(res.data.data || res.data || []);
        } catch (error) {
            console.error('[PatientsList] Failed to fetch:', error);
            if (isRefresh) Alert.alert('Error', 'Failed to refresh patients.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchPatients(); }, [fetchPatients]);
    const onRefresh = useCallback(() => { setRefreshing(true); fetchPatients(true); }, [fetchPatients]);

    const filteredPatients = patients.filter(p => {
        const name = (p.fullName || p.profileId?.fullName || '').toLowerCase();
        const email = (p.email || p.profileId?.email || '').toLowerCase();
        const phone = (p.phone || p.profileId?.phone || '');
        const condition = (p.conditions?.[0] || '').toLowerCase();

        const matchesSearch = name.includes(search.toLowerCase()) ||
            email.includes(search.toLowerCase()) ||
            phone.includes(search) ||
            condition.includes(search.toLowerCase());

        const adherence = p.metrics?.adherenceRate || 0;
        const matchesAdherence = adherenceFilter === 'all' ||
            (adherenceFilter === 'high' && adherence >= 90) ||
            (adherenceFilter === 'medium' && adherence >= 80 && adherence < 90) ||
            (adherenceFilter === 'low' && adherence < 80);
        return matchesSearch && matchesAdherence;
    });

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            <GradientHeader
                title="Patient Master List"
                subtitle={`${filteredPatients.length} Active Records`}
                onBack={() => navigation.goBack()}
            />

            {/* ── Search Bar ── */}
            <View style={s.searchSection}>
                <View style={s.searchContainer}>
                    <Feather name="search" size={20} color="#6366F1" style={s.searchIcon} />
                    <TextInput 
                        style={s.searchInput} 
                        placeholder="Search perfect patient..." 
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

            {/* ── Adherence Filters ── */}
            <View style={s.filterWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
                    <TouchableOpacity onPress={() => setAdherenceFilter('all')} style={[s.filterChip, adherenceFilter === 'all' && s.filterChipActive]}>
                        <Text style={[s.filterText, adherenceFilter === 'all' && s.filterTextActive]}>All Records</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAdherenceFilter('high')} style={[s.filterChip, adherenceFilter === 'high' && s.filterChipActive]}>
                        <Text style={[s.filterText, adherenceFilter === 'high' && s.filterTextActive]}>High (≥90%)</Text>
                        {adherenceFilter === 'high' && <Feather name="check" size={12} color="#FFFFFF" style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAdherenceFilter('medium')} style={[s.filterChip, adherenceFilter === 'medium' && s.filterChipActive]}>
                        <Text style={[s.filterText, adherenceFilter === 'medium' && s.filterTextActive]}>Medium (80-89%)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAdherenceFilter('low')} style={[s.filterChip, adherenceFilter === 'low' && s.filterChipActive]}>
                        <Text style={[s.filterText, adherenceFilter === 'low' && s.filterTextActive]}>Low (&lt;80%)</Text>
                        {adherenceFilter === 'low' && <Feather name="alert-circle" size={12} color="#FFFFFF" style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>
                </ScrollView>
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
                        <Text style={s.loadingText}>Fetching registry data...</Text>
                    </View>
                ) : (
                    <View style={s.listContainer}>
                        {filteredPatients.length === 0 ? (
                            <EmptyState icon="users" title="No Patients Found" subtitle="Adjust search or filters to see more results." />
                        ) : (
                            filteredPatients.map((p, idx) => (
                                <PatientRow key={p._id || p.id} item={p} index={idx} navigation={navigation} />
                            ))
                        )}
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
    scrollContent: { paddingBottom: 140 },
    
    // Search
    searchSection: {
        paddingHorizontal: 20,
        marginTop: 20,
        marginBottom: 16,
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

    // Filters
    filterWrapper: { marginBottom: 16 },
    filterScroll: { paddingHorizontal: 20, gap: 10 },
    filterChip: { 
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: '#FFFFFF', borderRadius: 14,
        borderWidth: 1, borderColor: '#E2E8F0',
        ...Shadows.sm
    },
    filterChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
    filterText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    filterTextActive: { color: '#FFFFFF' },

    loadingBox: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
    loadingText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 16 },

    // List Items
    listContainer: { paddingHorizontal: 20, gap: 16 },
    cardWrapper: {
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.08,
        borderWidth: 1, borderColor: '#F1F5F9',
        overflow: 'hidden'
    },
    cardWatermark: { position: 'absolute', right: -25, top: -15, opacity: 0.6, transform: [{rotate: '10deg'}] },
    
    patientCard: { 
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderLeftWidth: 6,
    },
    avatarBox: {
        width: 54, height: 54, borderRadius: 18,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E0E7FF'
    },
    avatarText: { fontSize: 22, fontWeight: '800', color: '#4F46E5' },
    
    infoSection: { flex: 1, marginRight: 12 },
    patientName: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 6, letterSpacing: -0.3 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    metaText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    
    statusSection: { alignItems: 'flex-end', justifyContent: 'space-between', height: 50 },
    statusPill: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 8, borderWidth: 1, gap: 4,
    },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    
    actionArrowBox: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
});
