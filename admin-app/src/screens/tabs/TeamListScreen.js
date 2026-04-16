import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, RefreshControl, TouchableOpacity, StatusBar, ActivityIndicator, Animated } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../theme/theme';
import { Shadows, Colors, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import EmptyState from '../../components/common/EmptyState';
import { apiService } from '../../lib/api';

function mapRoleToLabel(role) {
    const map = {
        'super_admin': 'Super Admins',
        'org_admin': 'Org Admins',
        'care_manager': 'Care Managers',
        'caretaker': 'Caretakers',
        'caller': 'Callers',
        'patient_mentor': 'Patient Mentors',
    };
    return map[role] || 'Team Members';
}

export default function TeamListScreen({ navigation, route }) {
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);

    const targetRole = route?.params?.role || 'caller';
    const orgFilter = route?.params?.organizationId;
    const screenTitle = mapRoleToLabel(targetRole);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    const fetchTeam = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const queryParams = { role: targetRole, limit: 100 };
            if (orgFilter) queryParams.organizationId = orgFilter;
            
            const res = await apiService.profiles.getAll(queryParams);
            const data = res.data?.profiles || res.data || [];
            setTeam(Array.isArray(data) ? data : []);

            // Trigger enter animation once data is loaded
            if (!isRefresh) {
                fadeAnim.setValue(0);
                slideAnim.setValue(25);
                Animated.parallel([
                    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                    Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
                ]).start();
            }
        } catch (error) {
            console.error('Failed to load team', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [targetRole]);

    useEffect(() => {
        fetchTeam();
    }, [fetchTeam]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchTeam(true);
    }, [fetchTeam]);

    const filtered = team.filter(c => 
        (c.fullName || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleMemberPress = (member) => {
        const id = member._id || member.id;
        if (targetRole === 'care_manager') {
            navigation.navigate('ManagerDetail', { managerId: id });
        } else {
            navigation.navigate('CallerDetail', { callerId: id });
        }
    };

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" />
            <GradientHeader
                title={screenTitle}
                subtitle={`${team.length} Active System Users`}
                onBack={() => navigation.goBack()}
            />

            {/* ── Search Bar ── */}
            <View style={s.searchSection}>
                <View style={s.searchHighlightLayer} />
                <View style={s.searchContainer}>
                    <Feather name="search" size={20} color="#94A3B8" style={s.searchIcon} />
                    <TextInput
                        style={[s.searchInput, Theme.typography.common]}
                        placeholder={`Search records...`}
                        placeholderTextColor="#94A3B8"
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                            <View style={s.clearBtn}>
                                <Feather name="x" size={14} color="#64748B" />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <ScrollView 
                style={s.body} 
                contentContainerStyle={s.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
            >
                {loading && !refreshing ? (
                    <View style={s.loadingBox}>
                        <ActivityIndicator size="large" color="#4F46E5" />
                        <Text style={s.loadingText}>Fetching Records...</Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <Animated.View style={{ opacity: fadeAnim }}>
                        <EmptyState 
                            icon="inbox" 
                            title="No Members Found" 
                            subtitle={search ? "Adjust your search terms and try again." : "No staff found assigned to this role yet."} 
                        />
                    </Animated.View>
                ) : (
                    <Animated.View style={[s.listContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                        {filtered.map((member, index) => {
                            const isActive = member.isActive !== false;
                            const initial = member.fullName ? member.fullName.charAt(0).toUpperCase() : 'U';
                            
                            return (
                                <TouchableOpacity 
                                    key={member._id || member.id} 
                                    onPress={() => handleMemberPress(member)} 
                                    activeOpacity={0.8} 
                                    style={s.premiumCardWrapper}
                                >
                                    <View style={s.memberCard}>
                                        
                                        {/* Abstract Backdrop Icon */}
                                        <Ionicons name="person-outline" size={120} color="#F1F5F9" style={s.backdropIcon} />

                                        <View style={s.cardTopRow}>
                                            <View style={s.avatarContainer}>
                                                <LinearGradient 
                                                    colors={isActive ? ['#EEF2FF', '#E0E7FF'] : ['#F1F5F9', '#E2E8F0']} 
                                                    style={StyleSheet.absoluteFill} 
                                                />
                                                <Text style={[s.avatarInitial, { color: isActive ? '#4F46E5' : '#64748B' }]}>{initial}</Text>
                                                {isActive && (
                                                    <View style={s.activeDotBorder}>
                                                        <View style={s.activeDot} />
                                                    </View>
                                                )}
                                            </View>
                                            
                                            <View style={s.infoBlock}>
                                                <Text style={[s.memberName, Theme.typography.common]} numberOfLines={1}>{member.fullName}</Text>
                                                <Text style={[s.roleDisplay, Theme.typography.common]}>{screenTitle}</Text>
                                            </View>

                                            <View style={[s.statusPill, { backgroundColor: isActive ? '#F0FDF4' : '#F8FAFC', borderColor: isActive ? '#D1FAE5' : '#E2E8F0' }]}>
                                                <Text style={[s.statusText, { color: isActive ? '#059669' : '#64748B' }]}>
                                                    {isActive ? 'ACTIVE' : 'OFFLINE'}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={s.contactDivider} />

                                        <View style={s.contactGrid}>
                                            <View style={s.contactItem}>
                                                <View style={s.contactIconSquare}><Feather name="mail" size={12} color="#64748B" /></View>
                                                <Text style={[s.contactText, Theme.typography.common]} numberOfLines={1}>{member.email}</Text>
                                            </View>
                                            <View style={s.contactItem}>
                                                <View style={s.contactIconSquare}><Feather name="phone" size={12} color="#64748B" /></View>
                                                <Text style={[s.contactText, Theme.typography.common]} numberOfLines={1}>{member.phone || 'N/A'}</Text>
                                            </View>
                                        </View>

                                        <View style={s.arrowBox}>
                                            <Feather name="arrow-right" size={16} color="#CBD5E1" />
                                        </View>
                                        
                                    </View>
                                </TouchableOpacity>
                            )
                        })}
                    </Animated.View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7F9' },
    body: { flex: 1 },
    scrollContent: { paddingBottom: 120 },
    
    // ── Search Input ──
    searchSection: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, backgroundColor: '#F4F7F9' },
    searchHighlightLayer: { position: 'absolute', top: 30, left: 24, right: 24, bottom: 12, backgroundColor: '#4F46E5', borderRadius: 16, opacity: 0.1, transform: [{translateY: 4}] },
    searchContainer: { 
        flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#FFFFFF', borderRadius: 16,
        paddingHorizontal: 16, height: 56,
        borderWidth: 1, borderColor: '#FFFFFF',
        ...Shadows.md, shadowColor: '#4F46E5', shadowOpacity: 0.08
    },
    searchIcon: { marginRight: 12 },
    searchInput: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '600', paddingVertical: 10 },
    clearBtn: { backgroundColor: '#F1F5F9', padding: 6, borderRadius: 12 },

    loadingBox: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 16, fontSize: 13, fontWeight: '600', color: '#64748B', letterSpacing: 0.5 },
    
    listContainer: { paddingHorizontal: 20, gap: 16, paddingVertical: 12 },
    
    // ── Premium Card ──
    premiumCardWrapper: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        ...Shadows.lg, shadowColor: '#64748B', shadowOpacity: 0.08, shadowRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        overflow: 'hidden'
    },
    memberCard: { padding: 20, position: 'relative' },
    
    backdropIcon: { position: 'absolute', right: -20, top: -20, opacity: 0.3, transform: [{ rotate: '-15deg' }] },

    cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    avatarContainer: { 
        width: 52, height: 52, borderRadius: 16, 
        justifyContent: 'center', alignItems: 'center',
        marginRight: 16,
        overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF', ...Shadows.sm
    },
    avatarInitial: { fontSize: 22, fontWeight: '800' },
    activeDotBorder: { position: 'absolute', bottom: -2, right: -2, borderRadius: 10, backgroundColor: '#FFFFFF', padding: 2 },
    activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' },
    
    infoBlock: { flex: 1 },
    memberName: { fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3, marginBottom: 2 },
    roleDisplay: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
    
    statusPill: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

    contactDivider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 16 },
    
    contactGrid: { flexDirection: 'row', gap: 12, marginRight: 40 },
    contactItem: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#F1F5F9' },
    contactIconSquare: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginRight: 8, ...Shadows.sm },
    contactText: { flex: 1, fontSize: 12, color: '#475569', fontWeight: '600' },

    arrowBox: { position: 'absolute', bottom: 20, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
});
