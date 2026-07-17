import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiService } from '../../lib/api';
import { colors, spacing, radius, shadows, layout } from '../../theme';
import { ShieldCheck, UserPlus, ChevronRight, LogOut, Heart, Lock, ArrowRight, Sliders } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

function ProgressCircle({ percentage, size = 68, strokeWidth = 2.5, children }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    
    // Track color: soft lavender
    const trackColor = '#EEF2FF';
    // Active stroke color: primary purple-blue
    const strokeColor = '#818CF8';
    
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={{ position: 'absolute' }}>
                {/* Background track circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                {/* Active progress circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
            {children}
        </View>
    );
}

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
            const res = await apiService.companion.getLinkedPatients();
            setData(res.data);
        } catch (err) {
            console.warn('Failed to load companion home data', err);
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
                colors={['#F8FAFC', '#EEF2FF']}
                style={StyleSheet.absoluteFill}
            />
            <View style={[styles.header, { paddingTop: Math.max(50, insets.top + 16) }]}>
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.headerSub}>Family Care Portal</Text>
                        <Text style={styles.title}>Welcome back 👋</Text>
                        <Text style={styles.headerDesc}>Stay connected. Stay informed.</Text>
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
                        <LogOut color="#475569" size={20} />
                    </Pressable>
                </View>
            </View>

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                showsVerticalScrollIndicator={false}
            >
                {/* Link New Patient Container */}
                <View style={styles.linkCard}>
                    <View style={styles.linkHeader}>
                        <View style={styles.linkIconBg}>
                            <UserPlus color="#6366F1" size={20} />
                        </View>
                        <View>
                            <Text style={styles.linkTitle}>Link a Patient</Text>
                            <Text style={styles.linkSubtitle}>Enter their 6-digit invite code</Text>
                        </View>
                    </View>
                    <View style={styles.linkInputRow}>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.linkInput}
                                placeholder="Enter 6-digit code"
                                placeholderTextColor="#94A3B8"
                                value={linkCode}
                                onChangeText={(v) => setLinkCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                                autoCapitalize="characters"
                            />
                            <ShieldCheck size={16} color="#94A3B8" style={styles.inputSecurityIcon} />
                        </View>
                        <Pressable 
                            style={({ pressed }) => [
                                styles.linkBtn, 
                                (!linkCode || linkCode.length < 6 || linking) && { opacity: 0.7 },
                                pressed && { opacity: 0.8 }
                            ]} 
                            onPress={handleLinkPatient}
                            disabled={!linkCode || linkCode.length < 6 || linking}
                        >
                            {linking ? (
                                <ActivityIndicator color="#FFF" size="small" />
                            ) : (
                                <View style={styles.linkBtnContent}>
                                    <Text style={styles.linkBtnText}>Link</Text>
                                    <ArrowRight size={16} color="#FFF" />
                                </View>
                            )}
                        </Pressable>
                    </View>
                    <View style={styles.linkDivider} />
                    <View style={styles.linkFooter}>
                        <Lock size={12} color="#94A3B8" />
                        <Text style={styles.linkFooterText}>Your data is private and secure</Text>
                    </View>
                </View>

                {/* Section Header */}
                <View style={styles.sectionHeaderRow}>
                    <View>
                        <Text style={styles.sectionTitle}>Your Care Circle</Text>
                        <Text style={styles.sectionSubtitle}>
                            {data.linked_patients?.length || 0} connected
                        </Text>
                    </View>
                    <Pressable 
                        style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => navigation.navigate('CareCircle')}
                    >
                        <Sliders size={14} color="#6366F1" />
                        <Text style={styles.manageBtnText}>Manage</Text>
                    </Pressable>
                </View>
                
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
                            const isLowConfidence = p.visibility_label === 'Low';
                            
                            // Dynamic colors matching Whole-Health Grid Board color tokens
                            const scoreColor = isLowConfidence ? '#6366F1' : (p.health_score >= 70 ? '#10B981' : '#F59E0B');
                            const badgeBgColor = isLowConfidence ? '#EA580C' : (p.health_score >= 70 ? '#10B981' : '#F59E0B');

                            return (
                                <Pressable
                                    key={p.id}
                                    style={({ pressed }) => [styles.patientCard, pressed && { opacity: 0.9 }]}
                                    onPress={() => handleSelectPatient(p)}
                                >
                                    {/* SVG Progress Circle Avatar */}
                                    <ProgressCircle percentage={p.health_score || 0}>
                                        <View style={styles.avatarInner}>
                                            <Text style={styles.avatarText}>{initials}</Text>
                                        </View>
                                        
                                        {p.health_score !== undefined && (
                                            <View style={[
                                                styles.scoreBadge,
                                                isLowConfidence ? styles.scoreBadgeLowVisibility : styles.scoreBadgeNormal,
                                                { backgroundColor: badgeBgColor }
                                            ]}>
                                                {isLowConfidence ? (
                                                    <>
                                                        <Text style={styles.scoreTextLow}>{p.health_score}</Text>
                                                        <Text style={styles.scoreBadgeEstimatedLabel}>Estimated</Text>
                                                    </>
                                                ) : (
                                                    <Text style={styles.scoreText}>{p.health_score}</Text>
                                                )}
                                            </View>
                                        )}
                                    </ProgressCircle>

                                    {/* Patient Info Block */}
                                    <View style={styles.patientInfo}>
                                        <Text style={styles.patientName}>{p.name}</Text>
                                        
                                        {p.health_score !== undefined && (
                                            <View style={styles.healthScoreRow}>
                                                <View style={styles.scoreHeaderRow}>
                                                    <Heart size={13} color="#6366F1" fill="#6366F1" style={{ marginTop: 1 }} />
                                                    <Text style={styles.scoreLabel}>Health Score</Text>
                                                </View>
                                                <Text style={[styles.scoreValue, { color: scoreColor }]}>
                                                    {p.health_score}
                                                </Text>
                                            </View>
                                        )}

                                        {/* Status Badge */}
                                        {p.health_score !== undefined && (
                                            <View style={styles.statusBadgeRow}>
                                                {isLowConfidence ? (
                                                    <View style={styles.badgeLowConfidence}>
                                                        <Text style={styles.badgeTextLowConfidence}>Low Confidence</Text>
                                                    </View>
                                                ) : p.health_score >= 70 ? (
                                                    <View style={styles.badgeGood}>
                                                        <View style={styles.dotGood} />
                                                        <Text style={styles.badgeTextGood}>Good</Text>
                                                    </View>
                                                ) : (
                                                    <View style={styles.badgeFair}>
                                                        <View style={styles.dotFair} />
                                                        <Text style={styles.badgeTextFair}>Fair</Text>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>

                                    {/* Modern Arrow Circle Button */}
                                    <View style={styles.arrowBox}>
                                        <ChevronRight color="#94A3B8" size={18} />
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
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { 
        paddingHorizontal: 24, 
        paddingBottom: 16, 
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
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
    },
    headerSub: {
        fontSize: 11,
        ...FONT.semibold,
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
    },
    title: { 
        fontSize: 26, 
        ...FONT.heavy, 
        color: '#0F172A',
        marginTop: 4,
    },
    headerDesc: {
        fontSize: 13,
        ...FONT.medium,
        color: '#94A3B8',
        marginTop: 4,
    },
    content: { padding: 24, gap: 24 },
    
    // Link Container Styles
    linkCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.03,
        shadowRadius: 16,
        elevation: 2,
    },
    linkHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    linkIconBg: { 
        width: 44, 
        height: 44, 
        borderRadius: 12, 
        backgroundColor: '#EEF2FF', 
        alignItems: 'center', 
        justifyContent: 'center',
    },
    linkTitle: {
        fontSize: 16,
        ...FONT.bold,
        color: '#0F172A',
    },
    linkSubtitle: {
        fontSize: 13,
        ...FONT.medium,
        color: '#64748B',
        marginTop: 2,
    },
    linkInputRow: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    inputWrapper: {
        flex: 1,
        position: 'relative',
        justifyContent: 'center',
    },
    linkInput: {
        height: 52,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingLeft: 16,
        paddingRight: 40,
        fontSize: 15,
        ...FONT.semibold,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    inputSecurityIcon: {
        position: 'absolute',
        right: 14,
    },
    linkBtn: {
        height: 52,
        backgroundColor: '#1E293B',
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#1E293B',
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    linkBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    linkBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        ...FONT.bold,
    },
    linkDivider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 16,
    },
    linkFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    linkFooterText: {
        fontSize: 12,
        ...FONT.medium,
        color: '#94A3B8',
    },

    // Patient List Section Headers
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: '#0F172A',
    },
    sectionSubtitle: {
        fontSize: 13,
        ...FONT.medium,
        color: '#94A3B8',
        marginTop: 2,
    },
    manageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 7,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
    },
    manageBtnText: {
        fontSize: 13,
        ...FONT.bold,
        color: '#6366F1',
    },

    // Patient List Cards
    patientsList: {
        gap: 16,
    },
    patientCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.03,
        shadowRadius: 16,
        elevation: 2,
        gap: 16,
    },
    avatarInner: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 18,
        ...FONT.bold,
        color: '#6366F1',
    },
    scoreBadge: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },
    scoreBadgeNormal: {
        bottom: -2,
        right: -2,
        width: 24,
        height: 24,
        borderRadius: 12,
    },
    scoreBadgeLowVisibility: {
        bottom: -4,
        right: -8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        minWidth: 48,
    },
    scoreText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    scoreTextLow: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 'bold',
    },
    scoreBadgeEstimatedLabel: {
        color: '#FFFFFF',
        fontSize: 7,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginTop: 2,
    },
    patientInfo: {
        flex: 1,
        gap: 4,
    },
    patientName: {
        fontSize: 16,
        ...FONT.bold,
        color: '#0F172A',
    },
    healthScoreRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        marginTop: 2,
    },
    scoreHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    scoreLabel: {
        fontSize: 13,
        ...FONT.medium,
        color: '#64748B',
    },
    scoreValue: {
        fontSize: 20,
        ...FONT.heavy,
        lineHeight: 22,
    },
    statusBadgeRow: {
        flexDirection: 'row',
        marginTop: 4,
    },
    badgeLowConfidence: {
        backgroundColor: '#FFFBEB',
        borderWidth: 0.5,
        borderColor: '#FDE68A',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    badgeTextLowConfidence: {
        fontSize: 10,
        ...FONT.semibold,
        color: '#B45309',
    },
    badgeGood: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#D1FAE5',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    dotGood: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#059669',
    },
    badgeTextGood: {
        fontSize: 10,
        ...FONT.semibold,
        color: '#059669',
    },
    badgeFair: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#FFEDD5',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    dotFair: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#D97706',
    },
    badgeTextFair: {
        fontSize: 10,
        ...FONT.semibold,
        color: '#D97706',
    },
    arrowBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#F1F5F9',
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
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 8,
    },
    emptyStateDesc: {
        fontSize: 14,
        ...FONT.medium,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
