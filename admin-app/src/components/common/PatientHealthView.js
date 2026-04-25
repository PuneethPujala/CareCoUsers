import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadows } from '../../theme/colors';
import PremiumCard from './PremiumCard';
import StatusBadge from './StatusBadge';

/**
 * PatientHealthView — Shared component for displaying patient health conditions & medications.
 */
export default function PatientHealthView({
    conditions = [],
    medications = [],
    editable = false,
    currentShift = null,
    onAddCondition,
    onRemoveCondition,
    onAddMedication,
    onRemoveMedication,
    onToggleMedication,
}) {
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    // Helper to check if a timestamp belongs to the current shift
    const isTimestampInShift = (timestamp, shiftName) => {
        if (!timestamp || !shiftName) return true;
        const hour = new Date(timestamp).getHours();
        const shift = shiftName.toLowerCase();
        if (shift === 'morning') return hour >= 0 && hour < 12;
        if (shift === 'afternoon') return hour >= 12 && hour < 17;
        if (shift === 'night') return hour >= 17;
        return true;
    };

    // Progress Bar Logic
    const totalMeds = medications.length;
    let completedMeds = 0;
    
    medications.forEach(med => {
        const isMedObj = typeof med === 'object';
        if (isMedObj && med.takenLogs) {
            if (med.takenLogs.some(l => l.date === todayStr && isTimestampInShift(l.timestamp, currentShift))) completedMeds++;
        } else if (isMedObj && med.takenDates) {
            // legacy fallback, assume true if taken today
            if (med.takenDates.includes(todayStr) && (!currentShift || currentShift.toLowerCase() === 'morning')) completedMeds++;
        }
    });

    const progressPercentage = totalMeds === 0 ? 0 : (completedMeds / totalMeds) * 100;
    const progressWidth = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(progressWidth, {
            toValue: progressPercentage,
            bounciness: 8,
            useNativeDriver: false
        }).start();
    }, [progressPercentage]);

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
                        <Feather name="activity" size={18} color="#0F172A" />
                        <Text style={s.sectionTitle}>Health Conditions</Text>
                        <View style={s.countBadge}>
                            <Text style={s.countBadgeText}>{conditions.length}</Text>
                        </View>
                    </View>
                    {editable && onAddCondition && (
                        <TouchableOpacity style={s.addBtn} onPress={onAddCondition} activeOpacity={0.7}>
                            <Feather name="plus" size={14} color="#FFF" />
                            <Text style={s.addBtnText}>Add</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <PremiumCard style={{ padding: 0 }}>
                    {conditions.length === 0 ? (
                        <View style={s.emptyState}>
                            <View style={s.emptyIconCircle}>
                                <Feather name="clipboard" size={24} color="#94A3B8" />
                            </View>
                            <Text style={s.emptyText}>No health conditions recorded</Text>
                        </View>
                    ) : (
                        conditions.map((condition, i) => {
                            const isConditionObj = typeof condition === 'object';
                            const cName = isConditionObj ? (condition.condition || condition.name || 'Unknown') : condition;
                            const isActive = isConditionObj && condition.status === 'active';
                            
                            return (
                                <React.Fragment key={isConditionObj ? (condition.id || condition._id || i) : i}>
                                    {i > 0 && <View style={s.divider} />}
                                    <View style={[s.conditionRow, { borderLeftColor: isActive ? '#F59E0B' : '#10B981', borderLeftWidth: 4 }]}>
                                        <View style={[s.conditionIconWrap, isActive && s.conditionIconWrapActive]}>
                                            <Feather name={isActive ? "alert-circle" : "check-circle"} size={18} color={isActive ? "#F59E0B" : "#10B981"} />
                                        </View>
                                        <View style={s.itemContent}>
                                            <Text style={s.itemName}>{cName}</Text>
                                            
                                            {isConditionObj && (
                                                <View style={s.itemMeta}>
                                                    {condition.diagnosedDate && (
                                                        <View style={s.metaPill}>
                                                            <Feather name="calendar" size={12} color="#64748B" style={{marginRight: 4}} />
                                                            <Text style={s.metaText}>
                                                                {new Date(condition.diagnosedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                            </Text>
                                                        </View>
                                                    )}
                                                    {condition.severity && (
                                                        <StatusBadge label={condition.severity} variant={getSeverityVariant(condition.severity)} />
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                        <View style={s.itemActions}>
                                            {isConditionObj && condition.status && (
                                                <StatusBadge
                                                    label={condition.status}
                                                    variant={getStatusVariant(condition.status)}
                                                />
                                            )}
                                            {editable && onRemoveCondition && (
                                                <TouchableOpacity
                                                    style={s.deleteBtn}
                                                    onPress={() => onRemoveCondition(condition)}
                                                    activeOpacity={0.7}
                                                >
                                                    <Feather name="trash-2" size={14} color="#EF4444" />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </React.Fragment>
                            );
                        })
                    )}
                </PremiumCard>
            </View>

            {/* ─── Medications ───────────────────────────────── */}
            <View style={{ marginTop: Spacing.xl }}>
                <View style={s.sectionHeader}>
                    <View style={s.sectionTitleRow}>
                        <Feather name="shield" size={18} color="#0F172A" />
                        <Text style={s.sectionTitle}>Medications</Text>
                        <View style={s.countBadge}>
                            <Text style={s.countBadgeText}>{medications.length}</Text>
                        </View>
                    </View>
                    {editable && onAddMedication && (
                        <TouchableOpacity style={s.addBtn} onPress={onAddMedication} activeOpacity={0.7}>
                            <Feather name="plus" size={14} color="#FFF" />
                            <Text style={s.addBtnText}>Add</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <PremiumCard style={{ padding: 0 }}>
                    {medications.length === 0 ? (
                        <View style={s.emptyState}>
                            <View style={s.emptyIconCircle}>
                                <Feather name="box" size={24} color="#94A3B8" />
                            </View>
                            <Text style={s.emptyText}>No medications recorded</Text>
                        </View>
                    ) : (
                        medications.map((med, i) => {
                            const isMedObj = typeof med === 'object';
                            const mName = isMedObj ? (med.name || med.genericName || 'Unknown') : med;
                            let hasTakenToday = false;
                            let takenLog = null;
                            
                            if (isMedObj && med.takenLogs) {
                                takenLog = med.takenLogs.find(l => l.date === todayStr && isTimestampInShift(l.timestamp, currentShift));
                                hasTakenToday = !!takenLog;
                            } else if (isMedObj && med.takenDates) { // legacy fallback
                                hasTakenToday = med.takenDates.includes(todayStr) && (!currentShift || currentShift.toLowerCase() === 'morning');
                            }
                            
                            return (
                                <React.Fragment key={isMedObj ? (med.id || med._id || i) : i}>
                                    {i > 0 && <View style={s.divider} />}
                                    <View style={[s.medRow, { borderLeftColor: hasTakenToday ? '#10B981' : '#6366F1', borderLeftWidth: 4 }]}>
                                        <View style={[s.medIconWrap, hasTakenToday && { backgroundColor: '#D1FAE5', borderColor: '#A7F3D0' }]}>
                                            <Feather name={hasTakenToday ? "check-square" : "square"} size={18} color={hasTakenToday ? "#10B981" : "#6366F1"} />
                                        </View>
                                        <View style={s.itemContent}>
                                            <Text style={s.itemName}>{mName}</Text>
                                            
                                            {isMedObj && (
                                                <View style={s.itemMeta}>
                                                    {hasTakenToday && takenLog && takenLog.timestamp && (
                                                        <View style={[s.metaPill, { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' }]}>
                                                            <Feather name="check-circle" size={12} color="#10B981" style={{marginRight: 4}} />
                                                            <Text style={[s.metaText, { color: '#059669' }]}>
                                                                Done at {new Date(takenLog.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </Text>
                                                        </View>
                                                    )}
                                                    {med.frequency && (
                                                        <View style={s.metaPill}>
                                                            <Feather name="clock" size={12} color="#64748B" style={{marginRight: 4}} />
                                                            <Text style={s.metaText}>{med.frequency}</Text>
                                                        </View>
                                                    )}
                                                    {med.dosage && (
                                                        <View style={s.metaPill}>
                                                            <Feather name="info" size={12} color="#64748B" style={{marginRight: 4}} />
                                                            <Text style={s.metaText}>{med.dosage}</Text>
                                                        </View>
                                                    )}
                                                    {med.addedDate && (
                                                        <View style={s.metaPill}>
                                                            <Feather name="calendar" size={12} color="#64748B" style={{marginRight: 4}} />
                                                            <Text style={s.metaText}>
                                                                {new Date(med.addedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            )}

                                            {isMedObj && med.adherence != null && (
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
                                            {onToggleMedication && isMedObj && (med._id || med.id) && (
                                                <TouchableOpacity 
                                                    style={[s.toggleBtn, hasTakenToday && s.toggleBtnActive]} 
                                                    onPress={() => onToggleMedication(med)}
                                                    activeOpacity={0.7}
                                                >
                                                    <Feather name="check" size={16} color={hasTakenToday ? '#FFFFFF' : '#94A3B8'} />
                                                </TouchableOpacity>
                                            )}
                                            {editable && onRemoveMedication && (
                                                <TouchableOpacity
                                                    style={s.deleteBtn}
                                                    onPress={() => onRemoveMedication(med)}
                                                    activeOpacity={0.7}
                                                >
                                                    <Feather name="trash-2" size={14} color="#EF4444" />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </React.Fragment>
                            );
                        })
                    )}
                </PremiumCard>
                
                {/* Premium HD Real-time Progress Bar */}
                {totalMeds > 0 && (
                    <View style={s.progressCardWrapper}>
                        <View style={s.progressHeader}>
                            <View style={s.progressLabelBox}>
                                <View style={[s.progressIconWrap, { backgroundColor: progressPercentage === 100 ? '#D1FAE5' : '#EEF2FF' }]}>
                                    <Feather name={progressPercentage === 100 ? "award" : "activity"} size={14} color={progressPercentage === 100 ? '#10B981' : '#4F46E5'} />
                                </View>
                                <Text style={s.progressTitle}>DAILY COMPLIANCE</Text>
                            </View>
                            <View style={s.progressMetricBox}>
                                <Text style={s.progressValue}>{completedMeds}</Text>
                                <Text style={s.progressDiv}>/</Text>
                                <Text style={s.progressTotalBox}>{totalMeds}</Text>
                            </View>
                        </View>
                        
                        <View style={s.progressBarTrack}>
                            <Animated.View 
                                style={[
                                    s.progressBarFill, 
                                    { 
                                        width: progressWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) 
                                    }
                                ]} 
                            >
                                <PremiumCard style={{ flex: 1, backgroundColor: progressPercentage === 100 ? '#10B981' : '#4F46E5' }} noShadow />
                            </Animated.View>
                        </View>
                        
                        {progressPercentage === 100 && (
                            <View style={s.progressSuccessPill}>
                                <Feather name="check-circle" size={14} color="#10B981" />
                                <Text style={s.progressSuccessText}>All medications completed for today • Auto-Logged</Text>
                            </View>
                        )}
                    </View>
                )}
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
    sectionTitle: {
        fontSize: 16,
        color: '#0F172A',
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    countBadge: {
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        minWidth: 24,
        alignItems: 'center',
    },
    countBadgeText: {
        fontSize: 11,
        color: '#6366F1',
        fontWeight: '800',
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: Radius.md,
        backgroundColor: '#6366F1',
        gap: 6,
        ...Shadows.sm
    },
    addBtnText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '700',
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginLeft: 0, 
    },
    // Shared Layouts
    conditionRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 16,
        backgroundColor: '#FFFFFF'
    },
    medRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 16,
        backgroundColor: '#FFFFFF'
    },
    conditionIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    conditionIconWrapActive: {
        backgroundColor: '#FEF3C7',
        borderColor: '#FDE68A',
    },
    medIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#EEF2FF',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        borderWidth: 1,
        borderColor: '#E0E7FF',
    },
    itemContent: {
        flex: 1,
        paddingTop: 2,
    },
    itemName: {
        color: '#1E293B',
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 6,
        letterSpacing: -0.2,
    },
    itemMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    metaPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },
    metaText: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
    },
    itemActions: {
        alignItems: 'flex-end',
        gap: Spacing.sm,
        flexShrink: 0,
        paddingTop: 2,
    },
    // Adherence Bar
    adherenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        backgroundColor: '#F8FAFC',
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },
    adherenceBar: {
        flex: 1,
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden'
    },
    adherenceFill: {
        height: '100%',
        borderRadius: 3,
    },
    adherenceText: {
        fontSize: 11,
        fontWeight: '800',
        minWidth: 32,
        textAlign: 'right',
    },
    // Toggle Button
    toggleBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    toggleBtnActive: {
        backgroundColor: '#10B981',
        borderColor: '#059669',
    },
    // Delete Button
    deleteBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#FEF2F2',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    // Empty State
    emptyState: {
        paddingVertical: 40,
        alignItems: 'center',
        gap: 12,
    },
    emptyIconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },
    emptyText: {
        fontSize: 14,
        color: '#94A3B8',
        fontWeight: '600',
        textAlign: 'center'
    },
    // Premium Progress Bar Styles
    progressCardWrapper: {
        marginTop: 20,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Shadows.sm,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    progressLabelBox: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressIconWrap: {
        width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 10
    },
    progressTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 0.8,
    },
    progressMetricBox: {
        flexDirection: 'row', alignItems: 'baseline'
    },
    progressValue: {
        fontSize: 20,
        fontWeight: '900',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    progressDiv: {
        fontSize: 14, fontWeight: '700', color: '#CBD5E1', marginHorizontal: 4
    },
    progressTotalBox: {
        fontSize: 14, fontWeight: '700', color: '#64748B'
    },
    progressBarTrack: {
        height: 12,
        backgroundColor: '#F1F5F9',
        borderRadius: 6,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 6,
        overflow: 'hidden',
    },
    progressSuccessPill: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECFDF5', paddingVertical: 10, borderRadius: 10, marginTop: 16, borderWidth: 1, borderColor: '#D1FAE5'
    },
    progressSuccessText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#059669',
        marginLeft: 6
    }
});
