import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '../../lib/api';
import { colors } from '../../theme';
import { ArrowLeft, MoreHorizontal, Plus, User, Edit2, Bell, AlertTriangle, FileText, Trash2, X, ShieldAlert } from 'lucide-react-native';
import AlertManager from '../../utils/AlertManager';

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CareCircleScreen() {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const [relationships, setRelationships] = useState([]);
    const [loading, setLoading] = useState(true);
    const [menuTarget, setMenuTarget] = useState(null); // The relationship record currently chosen for options
    const [showMenu, setShowMenu] = useState(false);
    const [showRename, setShowRename] = useState(false);
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const [newRelationshipType, setNewRelationshipType] = useState('');
    const [saving, setSaving] = useState(false);

    const loadRelationships = async () => {
        try {
            const res = await apiService.companion.getRelationships();
            if (res.data?.success) {
                setRelationships(res.data.relationships || []);
            }
        } catch (err) {
            console.warn('Failed to load relationships', err);
            AlertManager.alert('Error', 'Failed to retrieve Care Circle members.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRelationships();
    }, []);

    const handleUpdateRelationship = async () => {
        if (!newRelationshipType.trim()) return;
        setSaving(true);
        try {
            await apiService.companion.updateRelationship(menuTarget._id, {
                relationship_type: newRelationshipType.trim(),
            });
            setShowRename(false);
            setMenuTarget(null);
            await loadRelationships();
            AlertManager.alert('Success', 'Relationship updated successfully.');
        } catch (err) {
            AlertManager.alert('Update Failed', 'Could not update relationship.');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveRelationship = async () => {
        setSaving(true);
        try {
            await apiService.companion.deleteRelationship(menuTarget._id);
            setShowRemoveConfirm(false);
            setShowMenu(false);
            setMenuTarget(null);
            await loadRelationships();
            AlertManager.alert('Removed', 'Patient removed from your Care Circle.');
        } catch (err) {
            AlertManager.alert('Removal Failed', 'Could not remove patient.');
        } finally {
            setSaving(false);
        }
    };

    const getJoinedString = (date) => {
        if (!date) return 'Linked recently';
        const now = new Date();
        const joined = new Date(date);
        const diffMs = now.getTime() - joined.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 0) return 'Linked today';
        if (diffDays === 1) return 'Linked yesterday';
        if (diffDays < 30) return `Linked ${diffDays} days ago`;
        
        const diffMonths = Math.floor(diffDays / 30);
        if (diffMonths <= 1) return 'Linked 1 month ago';
        return `Linked ${diffMonths} months ago`;
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="#0F172A" size={24} />
                </Pressable>
                <View>
                    <Text style={styles.headerTitle}>Care Circle</Text>
                    <Text style={styles.headerSubtitle}>
                        {relationships.length} Connected Patient{relationships.length !== 1 ? 's' : ''}
                    </Text>
                </View>
            </View>

            {/* List */}
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {relationships.map((rel) => {
                    const patient = rel.patient_id;
                    if (!patient) return null;
                    const initials = patient.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                    
                    return (
                        <View key={rel._id} style={styles.patientCard}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{initials}</Text>
                            </View>
                            <View style={styles.info}>
                                <Text style={styles.patientName}>{patient.name}</Text>
                                <Text style={styles.relationshipText}>
                                    {rel.relationship_type || 'Family Member'}
                                </Text>
                                <Text style={styles.linkedText}>
                                    {getJoinedString(rel.joined_at)}
                                </Text>
                            </View>
                            <Pressable 
                                style={({ pressed }) => [styles.optionsBtn, pressed && { opacity: 0.6 }]}
                                onPress={() => {
                                    setMenuTarget(rel);
                                    setShowMenu(true);
                                }}
                            >
                                <MoreHorizontal color="#64748B" size={20} />
                            </Pressable>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Link another patient shortcut */}
            <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom) }]}>
                <Pressable 
                    style={({ pressed }) => [styles.linkAnotherBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => {
                        navigation.goBack();
                        // Optional: trigger link input focus or prompt
                    }}
                >
                    <Plus color="#FFFFFF" size={20} />
                    <Text style={styles.linkAnotherText}>Link Another Patient</Text>
                </Pressable>
            </View>

            {/* 1. Context Action Sheet Menu */}
            <Modal
                visible={showMenu && !showRename && !showRemoveConfirm}
                transparent
                animationType="slide"
                onRequestClose={() => setShowMenu(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setShowMenu(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{menuTarget?.patient_id?.name || 'Options'}</Text>
                            <Pressable onPress={() => setShowMenu(false)}>
                                <X color="#64748B" size={20} />
                            </Pressable>
                        </View>

                        {/* Menu Items */}
                        <Pressable 
                            style={styles.menuItem} 
                            onPress={() => {
                                setShowMenu(false);
                                navigation.navigate('CompanionTabs');
                            }}
                        >
                            <User size={18} color="#475569" />
                            <Text style={styles.menuItemText}>View Profile</Text>
                        </Pressable>

                        <Pressable 
                            style={styles.menuItem} 
                            onPress={() => {
                                setNewRelationshipType(menuTarget?.relationship_type || '');
                                setShowRename(true);
                            }}
                        >
                            <Edit2 size={18} color="#475569" />
                            <Text style={styles.menuItemText}>Rename Relationship</Text>
                        </Pressable>

                        <Pressable style={styles.menuItem} onPress={() => AlertManager.alert('Notifications', 'Alert configurations can be customized in settings.')}>
                            <Bell size={18} color="#475569" />
                            <Text style={styles.menuItemText}>Notifications</Text>
                        </Pressable>

                        <Pressable style={styles.menuItem} onPress={() => AlertManager.alert('Health Alerts', 'Health alerts preferences loaded.')}>
                            <ShieldAlert size={18} color="#475569" />
                            <Text style={styles.menuItemText}>Health Alerts</Text>
                        </Pressable>

                        <Pressable style={styles.menuItem} onPress={() => AlertManager.alert('Export Reports', 'Reports compiled and queued for download.')}>
                            <FileText size={18} color="#475569" />
                            <Text style={styles.menuItemText}>Export Reports</Text>
                        </Pressable>

                        <View style={styles.menuDivider} />

                        <Pressable 
                            style={[styles.menuItem, styles.menuItemDestructive]} 
                            onPress={() => setShowRemoveConfirm(true)}
                        >
                            <Trash2 size={18} color="#EF4444" />
                            <Text style={styles.menuItemTextDestructive}>Remove from Care Circle</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Modal>

            {/* 2. Rename Relationship Dialog */}
            <Modal
                visible={showRename}
                transparent
                animationType="fade"
                onRequestClose={() => setShowRename(false)}
            >
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                    style={styles.modalOverlay}
                >
                    <View style={styles.renameCard}>
                        <Text style={styles.renameTitle}>Rename Relationship</Text>
                        <Text style={styles.renameSubtitle}>
                            How is {menuTarget?.patient_id?.name} related to you?
                        </Text>
                        <TextInput
                            style={styles.renameInput}
                            placeholder="e.g. Mother, Father, Brother"
                            placeholderTextColor="#94A3B8"
                            value={newRelationshipType}
                            onChangeText={setNewRelationshipType}
                            autoFocus
                        />
                        <View style={styles.renameActionRow}>
                            <Pressable 
                                style={styles.renameCancelBtn}
                                onPress={() => {
                                    setShowRename(false);
                                    setNewRelationshipType('');
                                }}
                            >
                                <Text style={styles.renameCancelText}>Cancel</Text>
                            </Pressable>
                            <Pressable 
                                style={styles.renameConfirmBtn}
                                onPress={handleUpdateRelationship}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={styles.renameConfirmText}>Save</Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* 3. Remove Confirmation Bottom Sheet */}
            <Modal
                visible={showRemoveConfirm}
                transparent
                animationType="slide"
                onRequestClose={() => setShowRemoveConfirm(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setShowRemoveConfirm(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <View style={styles.confirmHeader}>
                            <View style={styles.warnIconBg}>
                                <AlertTriangle color="#EF4444" size={24} />
                            </View>
                            <Text style={styles.confirmTitle}>Remove {menuTarget?.patient_id?.name}?</Text>
                            <Text style={styles.confirmDesc}>
                                You will no longer receive medication reminders, health updates, or emergency alerts.
                            </Text>
                        </View>

                        <View style={styles.confirmActionRow}>
                            <Pressable 
                                style={styles.confirmCancelBtn} 
                                onPress={() => {
                                    setShowRemoveConfirm(false);
                                    setShowMenu(false);
                                }}
                            >
                                <Text style={styles.confirmCancelText}>Cancel</Text>
                            </Pressable>
                            <Pressable 
                                style={[styles.confirmRemoveBtn, saving && { opacity: 0.7 }]} 
                                onPress={handleRemoveRelationship}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={styles.confirmRemoveText}>Remove</Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingContainer: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 16,
        gap: 16,
        borderBottomWidth: 1,
        borderColor: '#EEF2FF',
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    headerTitle: {
        fontSize: 20,
        ...FONT.bold,
        color: '#0F172A',
    },
    headerSubtitle: {
        fontSize: 13,
        ...FONT.medium,
        color: '#94A3B8',
        marginTop: 2,
    },
    content: {
        padding: 24,
        gap: 16,
    },
    patientCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 10,
        elevation: 2,
        gap: 16,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 16,
        ...FONT.bold,
        color: '#6366F1',
    },
    info: {
        flex: 1,
        gap: 3,
    },
    patientName: {
        fontSize: 16,
        ...FONT.bold,
        color: '#0F172A',
    },
    relationshipText: {
        fontSize: 13,
        ...FONT.semibold,
        color: '#6366F1',
    },
    linkedText: {
        fontSize: 12,
        ...FONT.medium,
        color: '#94A3B8',
    },
    optionsBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        paddingHorizontal: 24,
    },
    linkAnotherBtn: {
        height: 52,
        backgroundColor: '#1E293B',
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowColor: '#1E293B',
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    linkAnotherText: {
        color: '#FFFFFF',
        fontSize: 15,
        ...FONT.bold,
    },

    // Modal Sheet layout
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        paddingBottom: 36,
        gap: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: '#0F172A',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 12,
    },
    menuItemText: {
        fontSize: 15,
        ...FONT.medium,
        color: '#334155',
    },
    menuDivider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 8,
    },
    menuItemDestructive: {
        // Red hue
    },
    menuItemTextDestructive: {
        fontSize: 15,
        ...FONT.bold,
        color: '#EF4444',
    },

    // Rename Modal Dialog Card
    renameCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        width: '85%',
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5,
        gap: 16,
    },
    renameTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: '#0F172A',
        textAlign: 'center',
    },
    renameSubtitle: {
        fontSize: 14,
        ...FONT.medium,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
    },
    renameInput: {
        height: 48,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 16,
        fontSize: 15,
        ...FONT.semibold,
        color: '#0F172A',
    },
    renameActionRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    renameCancelBtn: {
        flex: 1,
        height: 44,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    renameCancelText: {
        fontSize: 14,
        ...FONT.bold,
        color: '#64748B',
    },
    renameConfirmBtn: {
        flex: 1,
        height: 44,
        backgroundColor: '#6366F1',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    renameConfirmText: {
        fontSize: 14,
        ...FONT.bold,
        color: '#FFFFFF',
    },

    // Confirm Remove Bottom Sheet Headers
    confirmHeader: {
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    warnIconBg: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#FEF2F2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: '#0F172A',
        textAlign: 'center',
    },
    confirmDesc: {
        fontSize: 14,
        ...FONT.medium,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 16,
    },
    confirmActionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    confirmCancelBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmCancelText: {
        fontSize: 14,
        ...FONT.bold,
        color: '#64748B',
    },
    confirmRemoveBtn: {
        flex: 1,
        height: 48,
        backgroundColor: '#EF4444',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmRemoveText: {
        fontSize: 14,
        ...FONT.bold,
        color: '#FFFFFF',
    },
});
