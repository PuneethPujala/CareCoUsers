import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import StatusBadge from '../../components/common/StatusBadge';
import SkeletonLoader from '../../components/common/SkeletonLoader';

const ROLE_STATS = [
    { label: 'Care Managers', value: '8', icon: '👨‍⚕️', role: 'care_manager' },
    { label: 'Callers', value: '42', icon: '📞', role: 'caller' },
    { label: 'Patient Mentors', value: '15', icon: '👥', role: 'patient_mentor' },
    { label: 'Total Patients', value: '420', icon: '🏥', role: 'patient' },
];

const QUEUE = [
    { id: 'q1', patient: 'Robert Williams', priority: 'high', waitTime: '15 min' },
    { id: 'q2', patient: 'Margaret Chen', priority: 'medium', waitTime: '8 min' },
    { id: 'q3', patient: 'James Wilson', priority: 'low', waitTime: '3 min' },
];

const MANAGERS = [
    { id: 'm1', name: 'Alice Manager', callers: 12, patients: 85, load: 78 },
    { id: 'm2', name: 'Bob Director', callers: 8, patients: 62, load: 55 },
    { id: 'm3', name: 'Carol Lead', callers: 15, patients: 110, load: 92 },
];

const MOCK_USERS = {
    care_manager: [
        { id: 'cm1', name: 'Alice Johnson', email: 'alice@hospital.com', phone: '+1234567890', patients: 25, status: 'active' },
        { id: 'cm2', name: 'Bob Smith', email: 'bob@hospital.com', phone: '+1234567891', patients: 30, status: 'active' },
        { id: 'cm3', name: 'Carol Davis', email: 'carol@hospital.com', phone: '+1234567892', patients: 18, status: 'inactive' },
    ],
    caller: [
        { id: 'c1', name: 'David Wilson', email: 'david@hospital.com', phone: '+1234567893', callsToday: 45, status: 'active' },
        { id: 'c2', name: 'Emma Brown', email: 'emma@hospital.com', phone: '+1234567894', callsToday: 38, status: 'active' },
        { id: 'c3', name: 'Frank Miller', email: 'frank@hospital.com', phone: '+1234567895', callsToday: 52, status: 'active' },
    ],
    patient_mentor: [
        { id: 'pm1', name: 'Grace Taylor', email: 'grace@hospital.com', phone: '+1234567896', mentees: 12, status: 'active' },
        { id: 'pm2', name: 'Henry Anderson', email: 'henry@hospital.com', phone: '+1234567897', mentees: 8, status: 'active' },
        { id: 'pm3', name: 'Ivy Thomas', email: 'ivy@hospital.com', phone: '+1234567898', mentees: 15, status: 'inactive' },
    ],
    patient: [
        { id: 'p1', name: 'Jack Martinez', email: 'jack@patient.com', phone: '+1234567899', condition: 'Diabetes', status: 'active' },
        { id: 'p2', name: 'Karen Garcia', email: 'karen@patient.com', phone: '+1234567900', condition: 'Hypertension', status: 'active' },
        { id: 'p3', name: 'Liam Rodriguez', email: 'liam@patient.com', phone: '+1234567901', condition: 'Asthma', status: 'inactive' },
    ],
};

function UserRow({ item, role, navigation }) {
    const getRoleSpecificInfo = () => {
        switch(role) {
            case 'care_manager':
                return `${item.patients} patients`;
            case 'caller':
                return `${item.callsToday} calls today`;
            case 'patient_mentor':
                return `${item.mentees} mentees`;
            case 'patient':
                return item.condition;
            default:
                return '';
        }
    };

    return (
        <TouchableOpacity onPress={() => navigation.navigate('RoleDetail', { role, userId: item.id })}
            activeOpacity={0.7} style={s.userRow}>
            <View style={s.userAvatar}>
                <Text style={s.userAvatarText}>{item.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.userName}>{item.name}</Text>
                <Text style={s.userSub}>{getRoleSpecificInfo()}</Text>
                <Text style={s.userEmail}>{item.email}</Text>
            </View>
            <StatusBadge label={item.status} variant={item.status === 'active' ? 'success' : 'neutral'} />
        </TouchableOpacity>
    );
}

function ManagerRow({ item, navigation }) {
    const loadColor = item.load > 85 ? Colors.error : item.load > 65 ? Colors.warning : Colors.success;
    return (
        <TouchableOpacity onPress={() => navigation.navigate('ManagerDetail', { managerId: item.id })}
            activeOpacity={0.7} style={s.mgrRow}>
            <View style={s.mgrAvatar}><Text style={s.mgrAvatarText}>{item.name.charAt(0)}</Text></View>
            <View style={{ flex: 1 }}>
                <Text style={s.mgrName}>{item.name}</Text>
                <Text style={s.mgrSub}>{item.callers} callers · {item.patients} patients</Text>
                <View style={s.loadBar}><View style={[s.loadFill, { width: `${item.load}%`, backgroundColor: loadColor }]} /></View>
            </View>
            <Text style={[s.loadPct, { color: loadColor }]}>{item.load}%</Text>
        </TouchableOpacity>
    );
}

export default function OrgAdminDashboard({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);
    const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 800); }, []);

    const handleRolePress = (role) => {
        setSelectedRole(role);
    };

    const getFilteredUsers = () => {
        if (!selectedRole) return [];
        let users = MOCK_USERS[selectedRole] || [];
        
        // Filter by search query
        if (searchQuery) {
            users = users.filter(user => 
                user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.email.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        
        // Filter by status
        if (statusFilter !== 'all') {
            users = users.filter(user => user.status === statusFilter);
        }
        
        return users;
    };

    const handleBackToRoles = () => {
        setSelectedRole(null);
        setSearchQuery('');
        setStatusFilter('all');
    };

    const handleAssign = (patient) => {
        Alert.alert('Assign Patient', `Assign ${patient} to:`, [
            ...MANAGERS.map(m => ({ text: m.name, onPress: () => Alert.alert('Assigned', `${patient} assigned to ${m.name}`) })),
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    return (
        <View style={s.container}>
            <GradientHeader
                title={selectedRole ? ROLE_STATS.find(r => r.role === selectedRole)?.label : "Organization"}
                subtitle={selectedRole ? "Role Management" : "Admin Dashboard"}
                colors={Colors.roleGradient.org_admin}
                onBack={selectedRole ? handleBackToRoles : undefined}
                rightAction={
                    <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
                        <Text style={{ fontSize: 20, color: 'white' }}>🔔</Text>
                    </TouchableOpacity>
                }
            />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
                {loading ? (
                    <View style={{ paddingTop: Spacing.md }}>
                        <View style={s.statsGrid}>{[0, 1, 2, 3].map(i => <SkeletonLoader key={i} variant="stat" />)}</View>
                    </View>
                ) : (
                    <>
                        {!selectedRole ? (
                            <>
                                <View style={s.statsContainer}>
                                    <View style={s.statsRow}>
                                        <TouchableOpacity style={s.statCard} onPress={() => handleRolePress('care_manager')}>
                                            <Text style={s.statIcon}>{ROLE_STATS[0].icon}</Text>
                                            <Text style={s.statValue}>{ROLE_STATS[0].value}</Text>
                                            <Text style={s.statLabel}>{ROLE_STATS[0].label}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.statCard} onPress={() => handleRolePress('caller')}>
                                            <Text style={s.statIcon}>{ROLE_STATS[1].icon}</Text>
                                            <Text style={s.statValue}>{ROLE_STATS[1].value}</Text>
                                            <Text style={s.statLabel}>{ROLE_STATS[1].label}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={s.statsRow}>
                                        <TouchableOpacity style={s.statCard} onPress={() => handleRolePress('patient_mentor')}>
                                            <Text style={s.statIcon}>{ROLE_STATS[2].icon}</Text>
                                            <Text style={s.statValue}>{ROLE_STATS[2].value}</Text>
                                            <Text style={s.statLabel}>{ROLE_STATS[2].label}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.statCard} onPress={() => handleRolePress('patient')}>
                                            <Text style={s.statIcon}>{ROLE_STATS[3].icon}</Text>
                                            <Text style={s.statValue}>{ROLE_STATS[3].value}</Text>
                                            <Text style={s.statLabel}>{ROLE_STATS[3].label}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View>
                                    <View style={s.sectionHeader}>
                                        <Text style={s.sectionTitle}>Routing Queue</Text>
                                        <StatusBadge label={`${QUEUE.length} pending`} variant="warning" />
                                    </View>
                                    <PremiumCard style={{ padding: 0 }}>
                                        {QUEUE.map((q, i) => (
                                            <React.Fragment key={q.id}>
                                                {i > 0 && <View style={s.divider} />}
                                                <View style={s.queueRow}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={s.queueName}>{q.patient}</Text>
                                                        <Text style={s.queueWait}>Waiting {q.waitTime}</Text>
                                                    </View>
                                                    <StatusBadge label={q.priority} variant={q.priority === 'high' ? 'error' : q.priority === 'medium' ? 'warning' : 'neutral'} />
                                                    <TouchableOpacity style={s.assignBtn} onPress={() => handleAssign(q.patient)}>
                                                        <Text style={s.assignText}>Assign</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </React.Fragment>
                                        ))}
                                    </PremiumCard>
                                </View>

                                <View>
                                    <View style={s.sectionHeader}>
                                        <Text style={s.sectionTitle}>Manager Workload</Text>
                                    </View>
                                    <PremiumCard style={{ padding: 0 }}>
                                        {MANAGERS.map((m, i) => (
                                            <React.Fragment key={m.id}>
                                                {i > 0 && <View style={s.divider} />}
                                                <ManagerRow item={m} navigation={navigation} />
                                            </React.Fragment>
                                        ))}
                                    </PremiumCard>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={s.filterContainer}>
                                    <TextInput
                                        style={s.searchInput}
                                        placeholder="Search by name or email..."
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        placeholderTextColor={Colors.textMuted}
                                    />
                                    <View style={s.filterRow}>
                                        <TouchableOpacity
                                            style={[s.filterBtn, statusFilter === 'all' && s.filterBtnActive]}
                                            onPress={() => setStatusFilter('all')}
                                        >
                                            <Text style={[s.filterBtnText, statusFilter === 'all' && s.filterBtnTextActive]}>All</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.filterBtn, statusFilter === 'active' && s.filterBtnActive]}
                                            onPress={() => setStatusFilter('active')}
                                        >
                                            <Text style={[s.filterBtnText, statusFilter === 'active' && s.filterBtnTextActive]}>Active</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.filterBtn, statusFilter === 'inactive' && s.filterBtnActive]}
                                            onPress={() => setStatusFilter('inactive')}
                                        >
                                            <Text style={[s.filterBtnText, statusFilter === 'inactive' && s.filterBtnTextActive]}>Inactive</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <PremiumCard style={{ padding: 0 }}>
                                    {getFilteredUsers().map((user, i) => (
                                        <React.Fragment key={user.id}>
                                            {i > 0 && <View style={s.divider} />}
                                            <UserRow item={user} role={selectedRole} navigation={navigation} />
                                        </React.Fragment>
                                    ))}
                                    {getFilteredUsers().length === 0 && (
                                        <View style={s.emptyState}>
                                            <Text style={s.emptyText}>No users found</Text>
                                        </View>
                                    )}
                                </PremiumCard>
                            </>
                        )}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    bellBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    headerBackBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    headerBackText: { fontSize: 20, color: 'white', fontWeight: 'bold' },
    statsGrid: { 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        marginTop: Spacing.lg,
        marginHorizontal: Spacing.sm
    },
    statsContainer: {
        marginTop: Spacing.lg,
        paddingHorizontal: Spacing.sm
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.md
    },
    statCard: { 
        width: '48%', 
        alignItems: 'center', 
        paddingVertical: Spacing.lg, 
        paddingHorizontal: Spacing.sm, 
        borderRadius: Radius.lg, 
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        minHeight: 120
    },
    statIcon: { fontSize: 28, marginBottom: Spacing.sm },
    statValue: { ...Typography.h2, color: Colors.textPrimary },
    statLabel: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md },
    sectionTitle: { ...Typography.h3, color: Colors.textPrimary },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    // Queue
    queueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    queueName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    queueWait: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    assignBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt },
    assignText: { ...Typography.tiny, color: Colors.primary, fontWeight: '700' },
    // Manager
    mgrRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    mgrAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    mgrAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    mgrName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    mgrSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    loadBar: { height: 4, backgroundColor: Colors.borderLight, borderRadius: 2, marginTop: Spacing.sm, width: '100%' },
    loadFill: { height: 4, borderRadius: 2 },
    loadPct: { ...Typography.captionBold, minWidth: 36, textAlign: 'right' },
    // Role Header
    roleHeader: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg },
    backBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
    backText: { ...Typography.body, color: Colors.primary, fontWeight: '600' },
    roleTitle: { ...Typography.h2, color: Colors.textPrimary, marginLeft: Spacing.sm },
    // Filters
    filterContainer: { marginTop: Spacing.lg, marginBottom: Spacing.lg },
    searchInput: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        marginBottom: Spacing.md,
        ...Typography.body,
        color: Colors.textPrimary,
        borderWidth: 1,
        borderColor: Colors.borderLight,
    },
    filterRow: { flexDirection: 'row', gap: Spacing.sm },
    filterBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.sm,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.borderLight,
    },
    filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    filterBtnText: { ...Typography.tiny, color: Colors.textMuted, fontWeight: '600' },
    filterBtnTextActive: { color: Colors.surface },
    // User Row
    userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    userAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
    userAvatarText: { ...Typography.bodySemibold, color: Colors.primary },
    userName: { ...Typography.bodySemibold, color: Colors.textPrimary, fontSize: 14 },
    userSub: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    userEmail: { ...Typography.tiny, color: Colors.textMuted, marginTop: 2 },
    // Empty State
    emptyState: { paddingVertical: Spacing.xl, alignItems: 'center' },
    emptyText: { ...Typography.body, color: Colors.textMuted },
});