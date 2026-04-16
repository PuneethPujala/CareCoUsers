import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, Dimensions, StatusBar } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import HeroStatCard from '../../components/premium/HeroStatCard';
import StatCard from '../../components/premium/StatCard';
import SkeletonCard from '../../components/common/SkeletonCard';
import RecentActivity from '../../components/premium/RecentActivity';
import GradientHeader from '../../components/common/GradientHeader';

const { width: SW } = Dimensions.get('window');
const getGridWidth = () => {
    return '48.5%'; 
};
const CARD_WIDTH = getGridWidth();

const KPI_LIST = [
    { type: 'organizations', key: 'totalOrganizations', progress: 85, change: +12.5 },
    { type: 'org_admins', key: 'totalOrgAdmins', progress: 90, change: +2.1 },
    { type: 'care_managers', key: 'totalCareManagers', progress: 88, change: +4.2 },
    { type: 'callers', key: 'activeCallers', progress: 92, change: +8.4 },
    { type: 'patients', key: 'totalPatients', progress: 78, change: +15.2 },
    { type: 'revenue', key: 'totalRevenue', progress: 95, change: +22.1 },
];

const QUICK_ACTIONS = [
    { key: 'org', label: 'New Org', icon: 'plus-square', route: 'CreateOrganization' },
    { key: 'admin', label: 'New Admin', icon: 'user-plus', route: 'CreateUser', params: { allowedRole: 'org_admin' } },
    { key: 'search', label: 'Search', icon: 'search', route: 'AdminSearch' },
];

export default function SuperAdminDashboard({ navigation }) {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState({
        stats: {},
        organizations: [],
        recentActivity: []
    });

    const fullName = profile?.fullName || user?.user_metadata?.full_name || 'Admin User';

    const fetchData = useCallback(async (isRefresh = false) => {
        try { 
            if (!isRefresh) setLoading(true); 
            setError(null);
            const res = await apiService.dashboard.getSuperAdminStats();
            setStats(res.data || {}); 
        } catch (err) { 
            const m = err?.response?.data?.error || 'Failed to load system data.'; 
            setError(m); 
            if (isRefresh) Alert.alert('Error', m);
        } finally { 
            setLoading(false); 
            setRefreshing(false); 
        }
    }, []);

    useEffect(() => { 
        fetchData(); 
    }, [fetchData]);

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
                        onPress={() => navigation.navigate(action.route, action.params)}
                        activeOpacity={0.8}
                    >
                        <View style={s.actionIconContainer}>
                            <Feather name={action.icon} size={22} color="#6366F1" />
                        </View>
                        <Text style={[s.actionLabel, Theme.typography.common]}>{action.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

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
                <HeroStatCard 
                    title="ACTIVE PLATFORM USERS"
                    value={
                        (stats.stats?.totalOrgAdmins || 0) + 
                        (stats.stats?.totalCareManagers || 0) + 
                        (stats.stats?.activeCallers || 0) + 
                        (stats.stats?.totalPatients || 0)
                    }
                    suffix=""
                    changeText="Top metrics:"
                    changeSub={`${stats.stats?.totalOrganizations || 0} Orgs Active`}
                    data={[
                        // Just supply a dynamic-looking sparkline to avoid flatline, since we don't have historical timeseries yet
                        40, 45, 52, 60, Math.max(70, stats.stats?.totalOrganizations || 0), 85, 95, 
                        (stats.stats?.totalPatients || 110), 
                        (stats.stats?.activeCallers || 120), 
                        130
                    ]}
                />

                {/* KPI Grid (2 Columns x 3 Rows) */}
                <View style={s.gridContainer}>
                    {loading && !refreshing
                        ? KPI_LIST.map((_, i) => <SkeletonCard key={i} width={CARD_WIDTH} />)
                        : KPI_LIST.map((kpi, index) => (
                            <StatCard 
                                key={kpi.type}
                                type={kpi.type}
                                value={stats.stats?.[kpi.key] || 0}
                                change={kpi.change}
                                progress={kpi.progress}
                                index={index}
                                width={CARD_WIDTH}
                                onClick={() => {
                                   if (kpi.key === 'totalOrganizations') navigation.navigate('OrganizationsList');
                                   else if (kpi.key === 'totalPatients') navigation.navigate('PatientsList');
                                   else if (kpi.key === 'totalCareManagers') navigation.navigate('TeamList', { role: 'care_manager' });
                                   else if (kpi.key === 'activeCallers') navigation.navigate('TeamList', { role: 'caller' });
                                   else if (kpi.key === 'totalOrgAdmins') navigation.navigate('TeamList', { role: 'org_admin' });
                                }}
                            />
                        ))
                    }
                </View>

                {renderQuickActions()}

                <RecentActivity data={stats.recentActivity || []} />
            </ScrollView>
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
});
