import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { apiService } from '../../lib/api';
import { layout } from '../../theme';
import { ShieldCheck, UserPlus, ChevronRight } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';
import usePatientStore from '../../store/usePatientStore';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#0EA5E9',
    primaryLight: '#E0F2FE',
    dark: '#0F172A',
    mid: '#475569',
    light: '#94A3B8',
    danger: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    border: '#F1F5F9',
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionHomeScreen() {
    const [data, setData] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [linkCode, setLinkCode] = useState('');
    const [linking, setLinking] = useState(false);
    
    const setCompanionSelectedPatientId = usePatientStore(s => s.setCompanionSelectedPatientId);
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();

    const loadData = async () => {
        try {
            // We just need the patient status to get `linked_patients`
            const res = await apiService.companion.getPatientStatus();
            setData(res.data);
        } catch (err) {
            console.warn('Failed to load companion home data', err);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

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

    if (!data) return <View style={styles.container} />;

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: Math.max(60, insets.top + 20) }]}>
                <View>
                    <Text style={styles.headerSub}>Family Care Portal</Text>
                    <Text style={styles.title}>Welcome!</Text>
                </View>
            </View>

            <ScrollView 
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            >
                {/* Link New Patient Container */}
                <View style={styles.linkContainer}>
                    <View style={styles.linkHeader}>
                        <UserPlus color={C.dark} size={18} />
                        <Text style={styles.linkTitle}>Link New Patient</Text>
                    </View>
                    <View style={styles.linkInputRow}>
                        <TextInput
                            style={styles.linkInput}
                            placeholder="Enter 6-char Invite Code"
                            placeholderTextColor={C.light}
                            value={linkCode}
                            onChangeText={(v) => setLinkCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                            autoCapitalize="characters"
                        />
                        <Pressable 
                            style={[styles.linkBtn, (!linkCode || linkCode.length < 6 || linking) && { opacity: 0.7 }]} 
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
                        <ShieldCheck size={64} color={C.primaryLight} style={{ marginBottom: 20 }} />
                        <Text style={styles.emptyStateTitle}>No Patients Linked</Text>
                        <Text style={styles.emptyStateDesc}>Enter an invite code above to start monitoring your loved one's health.</Text>
                    </View>
                ) : (
                    <View style={styles.patientsList}>
                        {data.linked_patients.map((p) => {
                            const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                            return (
                                <Pressable
                                    key={p.id}
                                    style={styles.patientCard}
                                    onPress={() => handleSelectPatient(p)}
                                >
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{initials}</Text>
                                        {p.health_score !== undefined && (
                                            <View style={[
                                                styles.scoreBadge,
                                                { backgroundColor: p.health_score > 70 ? C.success : C.warning }
                                            ]}>
                                                <Text style={styles.scoreText}>{p.health_score}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.patientInfo}>
                                        <Text style={styles.patientName}>{p.name}</Text>
                                        {p.health_score !== undefined && (
                                            <Text style={styles.patientStatus}>
                                                Health Score: {p.health_score}
                                            </Text>
                                        )}
                                    </View>
                                    <View style={styles.arrowBox}>
                                        <ChevronRight color={C.mid} size={20} />
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
    container: { flex: 1, backgroundColor: C.bg },
    header: { 
        paddingHorizontal: 24, 
        paddingBottom: 24, 
        backgroundColor: C.surface,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    headerSub: {
        fontSize: 12,
        ...FONT.semibold,
        color: C.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    title: { fontSize: 24, ...FONT.heavy, color: C.dark },
    content: { padding: 24, gap: 24 },
    
    // Link Container Styles
    linkContainer: {
        backgroundColor: C.surface,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.dark,
        shadowOpacity: 0.02,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 1,
    },
    linkHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    linkTitle: {
        fontSize: 16,
        ...FONT.bold,
        color: C.dark,
    },
    linkInputRow: {
        flexDirection: 'row',
        gap: 12,
    },
    linkInput: {
        flex: 1,
        height: 48,
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        paddingHorizontal: 16,
        fontSize: 14,
        ...FONT.medium,
        color: C.dark,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    linkBtn: {
        height: 48,
        backgroundColor: C.primary,
        paddingHorizontal: 24,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
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
        color: C.dark,
        marginTop: 8,
    },
    patientsList: {
        gap: 12,
    },
    patientCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.surface,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.dark,
        shadowOpacity: 0.02,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
        gap: 16,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: C.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: C.primary,
        position: 'relative',
    },
    avatarText: {
        fontSize: 18,
        ...FONT.bold,
        color: C.primary,
    },
    scoreBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: C.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreText: {
        color: C.surface,
        fontSize: 9,
        fontWeight: 'bold',
    },
    patientInfo: {
        flex: 1,
        gap: 4,
    },
    patientName: {
        fontSize: 16,
        ...FONT.bold,
        color: C.dark,
    },
    patientStatus: {
        fontSize: 13,
        ...FONT.medium,
        color: C.mid,
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
        color: C.dark,
        textAlign: 'center',
        marginBottom: 8,
    },
    emptyStateDesc: {
        fontSize: 14,
        ...FONT.medium,
        color: C.mid,
        textAlign: 'center',
        lineHeight: 22,
    },
});
