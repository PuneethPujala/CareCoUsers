import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiService } from '../../lib/api';
import { colors, spacing, radius, shadows, layout } from '../../theme';
import { ShieldCheck, UserPlus, ChevronRight, LogOut } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionHomeScreen() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [linkCode, setLinkCode] = useState('');
    const [linking, setLinking] = useState(false);
    
    const setCompanionSelectedPatientId = usePatientStore(s => s.setCompanionSelectedPatientId);
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { signOut } = useAuth();

    const loadData = async () => {
        try {
            // Fetch only basic linked patient info using the lightweight endpoint
            const res = await apiService.companion.getLinkedPatients();
            setData(res.data);
        } catch (err) {
            console.warn('Failed to load companion home data', err);
            // Fallback to empty patients list so the layout renders instead of showing a white screen
            if (!data) {
                setData({ linked_patients: [] });
            }
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleLinkPatient = async () => {
        if (!linkCode || linkCode.length < 6) {
            AlertManager.alert('Invalid Code', 'Please enter a valid 6-character invite code.');
            return;
        }
        setLinking(true);
        try {
            await apiService.companion.linkPatient({ invite_code: linkCode });
            setLinkCode('');
            AlertManager.alert('Success', 'Patient successfully linked to your care circle!');
            await loadData();
        } catch (err) {
            AlertManager.alert('Link Failed', err.response?.data?.error || 'Failed to link patient. Please check the code.');
        } finally {
            setLinking(false);
        }
    };

    const handleSelectPatient = (patient) => {
        setCompanionSelectedPatientId(patient.id);
        navigation.navigate('CompanionTabs');
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Premium Linear Gradient Background */}
            <LinearGradient
                colors={['#EEF2FF', '#F8FAFC']}
                style={StyleSheet.absoluteFill}
            />
            <View style={[styles.header, { paddingTop: Math.max(60, insets.top + 20) }]}>
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.headerSub}>Family Care Portal</Text>
                        <Text style={styles.title}>Welcome!</Text>
                    </View>
                    <Pressable 
                        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]} 
                        onPress={async () => {
                            AlertManager.alert(
                                'Logout',
                                'Are you sure you want to log out?',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { 
                                        text: 'Logout', 
                                        style: 'destructive', 
                                        onPress: async () => {
                                            try {
                                                const res = await signOut();
                                                if (res?.error) {
                                                    AlertManager.alert('Logout Failed', res.error);
                                                }
                                            } catch (err) {
                                                AlertManager.alert('Logout Failed', err.message);
                                            }
                                        } 
                                    }
                                ]
                            );
                        }}
                    >
                        <LogOut color={colors.danger} size={22} />
                    </Pressable>
                </View>
            </View>

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                {/* Link New Patient Container */}
                <View style={styles.linkContainer}>
                    <View style={styles.linkHeader}>
                        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 }}>
                            <UserPlus color={colors.primary} size={16} />
                        </View>
                        <View>
                            <Text style={styles.linkTitle}>Link a Patient</Text>
                            <Text style={{ fontSize: 12, ...FONT.medium, color: colors.textSecondary, marginTop: 2 }}>Enter their 6-digit invite code</Text>
                        </View>
                    </View>
                    <View style={styles.linkInputRow}>
                        <TextInput
                            style={styles.linkInput}
                            placeholder="Enter 6-char Invite Code"
                            placeholderTextColor={colors.textMuted}
                            value={linkCode}
                            onChangeText={(v) => setLinkCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                            autoCapitalize="characters"
                        />
                        <Pressable 
                            style={({ pressed }) => [
                                styles.linkBtn, 
                                (!linkCode || linkCode.length < 6 || linking) && { opacity: 0.7 },
                                pressed && { opacity: 0.5 }
                            ]} 
                            onPress={handleLinkPatient}
                            disabled={!linkCode || linkCode.length < 6 || linking}
                        >
                            {linking ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.linkBtnText}>Link</Text>}
                        </Pressable>
                    </View>
                </View>

                {/* Patient List */}
                <Text style={styles.sectionTitle}>Your Care Circle</Text>
                
                {(!data.linked_patients || data.linked_patients.length === 0) ? (
                    <View style={styles.emptyStateContainer}>
                        <ShieldCheck size={64} color={colors.primarySoft} style={{ marginBottom: 20 }} />
                        <Text style={styles.emptyStateTitle}>No Patients Linked</Text>
                        <Text style={styles.emptyStateDesc}>Enter an invite code above to start monitoring your loved one's health.</Text>
                    </View>
                ) : (
                    <View style={styles.patientsList}>
                        {[...data.linked_patients].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
                            const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                            return (
                                <Pressable
                                    key={p.id}
                                    style={({ pressed }) => [styles.patientCard, pressed && { opacity: 0.7 }]}
                                    onPress={() => handleSelectPatient(p)}
                                >
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{initials}</Text>
                                        {p.health_score !== undefined && (
                                            <View style={[
                                                styles.scoreBadge,
                                                p.visibility_label === 'Low' ? styles.scoreBadgeLowVisibility : styles.scoreBadgeNormal,
                                                { backgroundColor: p.visibility_label === 'Low' ? '#94A3B8' : (p.health_score > 70 ? colors.success : colors.warning) }
                                            ]}>
                                                <Text style={[styles.scoreText, p.visibility_label === 'Low' && styles.scoreTextLowVisibility]}>{p.health_score}</Text>
                                                {p.visibility_label === 'Low' && (
                                                    <Text style={styles.scoreBadgeEstimatedLabel}>Estimated</Text>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.patientInfo}>
                                        <Text style={styles.patientName}>{p.name}</Text>
                                        {p.health_score !== undefined && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                                <Text style={styles.patientStatus}>
                                                    Health Score: {p.health_score}
                                                </Text>
                                                {p.visibility_label === 'Low' && (
                                                    <View style={{ backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5, borderColor: '#FDE68A' }}>
                                                        <Text style={{ fontSize: 9, color: '#B45309', fontWeight: 'bold' }}>Low Confidence</Text>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.arrowBox}>
                                        <ChevronRight color={colors.textSecondary} size={20} />
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { 
        paddingHorizontal: 24, 
        paddingBottom: 24, 
        backgroundColor: 'transparent',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    logoutBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: colors.dangerLight,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerSub: {
        fontSize: 12,
        ...FONT.semibold,
        color: colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    title: { fontSize: 24, ...FONT.heavy, color: colors.textPrimary },
    content: { padding: 24, gap: 24 },
    
    // Link Container Styles
    linkContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0A2463',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 2,
    },
    linkHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 18,
    },
    linkTitle: {
        fontSize: 16,
        ...FONT.heavy,
        color: colors.primary,
    },
    linkInputRow: {
        flexDirection: 'row',
        gap: 12,
    },
    linkInput: {
        flex: 1,
        height: 52,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        paddingHorizontal: 16,
        fontSize: 15,
        ...FONT.bold,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        letterSpacing: 2,
        textAlign: 'center',
    },
    linkBtn: {
        height: 52,
        backgroundColor: colors.primary,
        paddingHorizontal: 28,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary,
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    linkBtnText: {
        color: '#FFF',
        fontSize: 14,
        ...FONT.bold,
    },

    // Patient List Styles
    sectionTitle: {
        fontSize: 18,
        ...FONT.heavy,
        color: colors.textPrimary,
        marginTop: 8,
    },
    patientsList: {
        gap: 12,
    },
    patientCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0A2463',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 2,
        gap: 16,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.primary,
        position: 'relative',
    },
    avatarText: {
        fontSize: 18,
        ...FONT.bold,
        color: colors.primary,
    },
    scoreBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        borderWidth: 1.5,
        borderColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreBadgeNormal: {
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 8,
    },
    scoreBadgeLowVisibility: {
        bottom: -6,
        right: -10,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 10,
        minWidth: 50,
    },
    scoreText: {
        color: colors.surface,
        fontSize: 9,
        fontWeight: 'bold',
    },
    scoreTextLowVisibility: {
        fontSize: 10,
        lineHeight: 11,
    },
    scoreBadgeEstimatedLabel: {
        color: colors.surface,
        fontSize: 6.5,
        lineHeight: 8,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginTop: 1,
    },
    patientInfo: {
        flex: 1,
        gap: 4,
    },
    patientName: {
        fontSize: 16,
        ...FONT.bold,
        color: colors.textPrimary,
    },
    patientStatus: {
        fontSize: 13,
        ...FONT.medium,
        color: colors.textSecondary,
    },
    arrowBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Empty State
    emptyStateContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        paddingHorizontal: 20,
    },
    emptyStateTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 8,
    },
    emptyStateDesc: {
        fontSize: 14,
        ...FONT.medium,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
