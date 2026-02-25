import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import PremiumCard from './PremiumCard';
import StatusBadge from './StatusBadge';

/**
 * PatientHealthView — Shared component for displaying patient health conditions & medications.
 *
 * Props:
 *   conditions  — Array of { id, condition, diagnosedDate, severity, status }
 *   medications — Array of { id, name, frequency?, addedDate?, adherence? }
 *   editable    — Boolean (default false). When true, shows Add / Delete controls.
 *   onAddCondition    — () => void
 *   onRemoveCondition — (condition) => void
 *   onAddMedication   — () => void
 *   onRemoveMedication — (medication) => void
 */
export default function PatientHealthView({
    conditions = [],
    medications = [],
    editable = false,
    onAddCondition,
    onRemoveCondition,
    onAddMedication,
    onRemoveMedication,
}) {
    const getSeverityVariant = (severity) => {
        switch (severity?.toLowerCase()) {
            case 'severe': return 'error';
            case 'moderate': return 'warning';
            case 'mild': return 'success';
            default: return 'neutral';
        }
    };

    const getStatusVariant = (status) => {
        switch (status?.toLowerCase()) {
            case 'active': return 'warning';
            case 'managed': return 'success';
            case 'resolved': return 'neutral';
            default: return 'info';
        }
    };

    return (
        <View>
            {/* ─── Health Conditions ─────────────────────────── */}
            <View>
                <View style={s.sectionHeader}>
                    <View style={s.sectionTitleRow}>
                        <Text style={s.sectionIcon}>🏥</Text>
                        <Text style={s.sectionTitle}>Health Conditions</Text>
                        <View style={s.countBadge}>
                            <Text style={s.countBadgeText}>{conditions.length}</Text>
                        </View>
                    </View>
                    {editable && onAddCondition && (
                        <TouchableOpacity style={s.addBtn} onPress={onAddCondition} activeOpacity={0.7}>
                            <Text style={s.addBtnText}>+ Add</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <PremiumCard style={{ padding: 0 }}>
                    {conditions.length === 0 ? (
                        <View style={s.emptyState}>
                            <Text style={s.emptyIcon}>📋</Text>
                            <Text style={s.emptyText}>No health conditions recorded</Text>
                        </View>
                    ) : (
                        conditions.map((condition, i) => (
                            <React.Fragment key={condition.id || i}>
                                {i > 0 && <View style={s.divider} />}
                                <View style={s.conditionRow}>
                                    <View style={s.conditionIconWrap}>
                                        <Text style={s.conditionIconText}>
                                            {condition.status === 'active' ? '⚠️' : '✅'}
                                        </Text>
                                    </View>
                                    <View style={s.itemContent}>
                                        <Text style={s.itemName}>{condition.condition}</Text>
                                        <View style={s.itemMeta}>
                                            {condition.diagnosedDate && (
                                                <Text style={s.metaText}>
                                                    📅 {new Date(condition.diagnosedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                </Text>
                                            )}
                                            {condition.severity && (
                                                <StatusBadge label={condition.severity} variant={getSeverityVariant(condition.severity)} />
                                            )}
                                        </View>
                                    </View>
                                    <View style={s.itemActions}>
                                        <StatusBadge
                                            label={condition.status || 'active'}
                                            variant={getStatusVariant(condition.status)}
                                        />
                                        {editable && onRemoveCondition && (
                                            <TouchableOpacity
                                                style={s.deleteBtn}
                                                onPress={() => onRemoveCondition(condition)}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={s.deleteBtnText}>🗑️</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            </React.Fragment>
                        ))
                    )}
                </PremiumCard>
            </View>

            {/* ─── Medications ───────────────────────────────── */}
            <View style={{ marginTop: Spacing.lg }}>
                <View style={s.sectionHeader}>
                    <View style={s.sectionTitleRow}>
                        <Text style={s.sectionIcon}>💊</Text>
                        <Text style={s.sectionTitle}>Medications</Text>
                        <View style={s.countBadge}>
                            <Text style={s.countBadgeText}>{medications.length}</Text>
                        </View>
                    </View>
                    {editable && onAddMedication && (
                        <TouchableOpacity style={s.addBtn} onPress={onAddMedication} activeOpacity={0.7}>
                            <Text style={s.addBtnText}>+ Add</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <PremiumCard style={{ padding: 0 }}>
                    {medications.length === 0 ? (
                        <View style={s.emptyState}>
                            <Text style={s.emptyIcon}>💊</Text>
                            <Text style={s.emptyText}>No medications recorded</Text>
                        </View>
                    ) : (
                        medications.map((med, i) => (
                            <React.Fragment key={med.id || i}>
                                {i > 0 && <View style={s.divider} />}
                                <View style={s.medRow}>
                                    <View style={s.medIconWrap}>
                                        <Text style={s.medIconText}>💊</Text>
                                    </View>
                                    <View style={s.itemContent}>
                                        <Text style={s.itemName}>{med.name}</Text>
                                        <View style={s.itemMeta}>
                                            {med.frequency && (
                                                <Text style={s.metaText}>⏰ {med.frequency}</Text>
                                            )}
                                            {med.addedDate && (
                                                <Text style={s.metaText}>
                                                    📅 {new Date(med.addedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                </Text>
                                            )}
                                        </View>
                                        {med.adherence != null && (
                                            <View style={s.adherenceRow}>
                                                <View style={s.adherenceBar}>
                                                    <View style={[
                                                        s.adherenceFill,
                                                        {
                                                            width: `${med.adherence}%`,
                                                            backgroundColor: med.adherence >= 90 ? Colors.success
                                                                : med.adherence >= 70 ? Colors.warning
                                                                    : Colors.error
                                                        }
                                                    ]} />
                                                </View>
                                                <Text style={[
                                                    s.adherenceText,
                                                    {
                                                        color: med.adherence >= 90 ? Colors.success
                                                            : med.adherence >= 70 ? Colors.warning
                                                                : Colors.error
                                                    }
                                                ]}>
                                                    {med.adherence}%
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={s.itemActions}>
                                        {editable && onRemoveMedication && (
                                            <TouchableOpacity
                                                style={s.deleteBtn}
                                                onPress={() => onRemoveMedication(med)}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={s.deleteBtnText}>🗑️</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            </React.Fragment>
                        ))
                    )}
                </PremiumCard>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    // Section Header
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    sectionIcon: {
        fontSize: 18,
    },
    sectionTitle: {
        ...Typography.h3,
        color: Colors.textPrimary,
    },
    countBadge: {
        backgroundColor: Colors.surfaceAlt,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        minWidth: 24,
        alignItems: 'center',
    },
    countBadgeText: {
        ...Typography.tiny,
        color: Colors.primary,
        fontWeight: '700',
    },
    // Add Button
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: Radius.md,
        backgroundColor: Colors.primary,
        gap: Spacing.xs,
    },
    addBtnText: {
        ...Typography.caption,
        color: '#fff',
        fontWeight: '700',
    },
    // Divider
    divider: {
        height: 1,
        backgroundColor: Colors.borderLight,
    },
    // Condition Row
    conditionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        gap: Spacing.md,
    },
    conditionIconWrap: {
        width: 40,
        height: 40,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceAlt,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    conditionIconText: {
        fontSize: 18,
    },
    // Medication Row
    medRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        gap: Spacing.md,
    },
    medIconWrap: {
        width: 40,
        height: 40,
        borderRadius: Radius.full,
        backgroundColor: Colors.infoLight,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    medIconText: {
        fontSize: 18,
    },
    // Shared Item Content
    itemContent: {
        flex: 1,
    },
    itemName: {
        ...Typography.bodySemibold,
        color: Colors.textPrimary,
        fontSize: 15,
    },
    itemMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.xs,
        flexWrap: 'wrap',
    },
    metaText: {
        ...Typography.tiny,
        color: Colors.textMuted,
    },
    itemActions: {
        alignItems: 'flex-end',
        gap: Spacing.sm,
        flexShrink: 0,
    },
    // Adherence Bar
    adherenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
    adherenceBar: {
        flex: 1,
        height: 4,
        backgroundColor: Colors.borderLight,
        borderRadius: 2,
    },
    adherenceFill: {
        height: 4,
        borderRadius: 2,
    },
    adherenceText: {
        ...Typography.tiny,
        fontWeight: '700',
        minWidth: 32,
        textAlign: 'right',
    },
    // Delete Button
    deleteBtn: {
        width: 32,
        height: 32,
        borderRadius: Radius.full,
        backgroundColor: Colors.errorLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteBtnText: {
        fontSize: 14,
    },
    // Empty State
    emptyState: {
        paddingVertical: Spacing.xl,
        alignItems: 'center',
        gap: Spacing.sm,
    },
    emptyIcon: {
        fontSize: 32,
        opacity: 0.5,
    },
    emptyText: {
        ...Typography.body,
        color: Colors.textMuted,
    },
});
