import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, StatusBar, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import { Shadows } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import EmptyState from '../../components/common/EmptyState';
import { apiService } from '../../lib/api';

function OrgCard({ org, index, navigation }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 60, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 60, useNativeDriver: true })
        ]).start();
    }, []);

    const patientCount = org.currentPatientCount || 0;
    const staffCount = org.currentCaretakerCount || 0;
    const initial = org.name ? org.name.charAt(0).toUpperCase() : 'O';
    
    const isActive = org.isActive !== false;
    const statusLabel = isActive ? 'ACTIVE' : 'SUSPENDED';
    
    const sColors = isActive 
        ? { text: '#10B981', bg: '#F0FDF4', border: '#D1FAE5', grad: ['#EEF2FF', '#E0E7FF'], primary: '#4F46E5', icon: '#3B82F6' } 
        : { text: '#EF4444', bg: '#FEF2F2', border: '#FECACA', grad: ['#F8FAFC', '#F1F5F9'], primary: '#64748B', icon: '#94A3B8' };

    return (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <TouchableOpacity
                onPress={() => navigation.navigate('OrgDetail', { orgId: org._id })}
                activeOpacity={0.8}
                style={s.cardWrapper}
            >
                {/* Background Watermark */}
                <Ionicons name="business" size={120} color="#F8FAFC" style={s.cardWatermark} />

                <View style={[s.orgCard, { borderLeftColor: sColors.primary }]}>
                    
                    <View style={s.cardHeader}>
                        <View style={s.avatarBox}>
                            <LinearGradient colors={sColors.grad} style={StyleSheet.absoluteFill} />
                            <Text style={[s.avatarLetter, { color: sColors.icon }]}>{initial}</Text>
                        </View>
                        
                        <View style={s.headerInfo}>
                            <Text style={s.orgName} numberOfLines={1}>{org.name}</Text>
                            <View style={s.statusPill}>
                                <View style={[s.statusDot, { backgroundColor: sColors.text }]} />
                                <Text style={[s.statusText, { color: sColors.text }]}>{statusLabel}</Text>
                            </View>
                        </View>

                        <View style={s.actionArrowBox}>
                            <Feather name="chevron-right" size={16} color="#CBD5E1" />
                        </View>
                    </View>

                    <View style={s.cardFooter}>
                        <View style={s.footerItem}>
                            <View style={s.footerIconBox}>
                                <Feather name="map-pin" size={12} color="#64748B" />
                            </View>
                            <Text style={s.footerText} numberOfLines={1}>{org.district || org.address || 'Regional Hub'}</Text>
                        </View>
                        
                        <View style={s.footerDivider} />

                        <View style={s.footerItem}>
                            <View style={s.footerIconBox}>
                                <Feather name="users" size={12} color="#64748B" />
                            </View>
                            <Text style={s.footerText}>{patientCount} Pts • {staffCount} Staff</Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}


export default function OrganizationsListScreen({ navigation }) {
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [organizations, setOrganizations] = useState([]);

    const fetchOrganizations = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const res = await apiService.organizations.getAll({ isActive: '' });
            const orgs = res.data?.organizations || res.data || [];
            setOrganizations(Array.isArray(orgs) ? orgs : []);
        } catch (error) {
            console.error('[OrganizationsList] Failed to fetch:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchOrganizations();
    }, [fetchOrganizations]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchOrganizations(true);
    }, [fetchOrganizations]);

    const filtered = organizations.filter(o =>
        (o.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (o.district || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            <GradientHeader
                title="Super Admin Registry"
                subtitle={`${organizations.filter(o => o.isActive !== false).length} Active Orgs · ${organizations.filter(o => o.isActive === false).length} Suspended`}
                onBack={() => navigation.goBack()}
            />

            {/* Floating Search Bar */}
            <View style={s.searchSection}>
                <View style={s.searchContainer}>
                    <Feather name="search" size={20} color="#6366F1" style={s.searchIcon} />
                    <TextInput
                        style={s.searchInput}
                        placeholder="Query database..."
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
                        <Text style={s.loadingText}>Fetching secure registry...</Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={s.emptyBoxCard}>
                        <Ionicons name="folder-open-outline" size={80} color="#F1F5F9" style={s.emptyBgIcon} />
                        <View style={s.emptyIconWrap}>
                            <Feather name="database" size={32} color="#94A3B8" />
                        </View>
                        <Text style={s.emptyTitle}>Registry Empty</Text>
                        <Text style={s.emptySubtitle}>{`No matching organizations found under your query parameters.`}</Text>
                    </View>
                ) : (
                    <View style={s.listContainer}>
                        {filtered.map((org, index) => (
                            <OrgCard key={org._id || index} org={org} index={index} navigation={navigation} />
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
    scrollContent: { paddingBottom: 140 },
    
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

    // Empty state
    loadingBox: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
    loadingText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 16 },
    emptyBoxCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', ...Shadows.md, marginTop: 20, overflow: 'hidden', marginHorizontal: 20 },
    emptyBgIcon: { position: 'absolute', left: -20, top: -20, transform: [{rotate: '-20deg'}] },
    emptyIconWrap: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, fontWeight: '500' },

    // List
    listContainer: { paddingHorizontal: 20, gap: 16, paddingTop: 10 },
    
    cardWrapper: {
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        ...Shadows.md, shadowColor: '#64748B', shadowOpacity: 0.08,
        borderWidth: 1, borderColor: '#F1F5F9',
        overflow: 'hidden'
    },
    cardWatermark: { position: 'absolute', right: -25, top: -15, opacity: 0.6, transform: [{rotate: '10deg'}] },

    orgCard: {
        paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20,
        borderLeftWidth: 6,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    avatarBox: {
        width: 54, height: 54, borderRadius: 18,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E0E7FF'
    },
    avatarLetter: { fontSize: 22, fontWeight: '800' },
    
    headerInfo: { flex: 1, paddingRight: 12 },
    orgName: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 6, letterSpacing: -0.3 },
    
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

    actionArrowBox: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },

    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    footerItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    footerIconBox: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
    footerText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    footerDivider: { width: 1, height: 20, backgroundColor: '#E2E8F0', marginHorizontal: 16 }
});
