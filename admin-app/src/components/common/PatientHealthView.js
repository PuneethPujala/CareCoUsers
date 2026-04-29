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

    // Progress Bar Logic — count per shift-slot, not per medication
    let totalSlots = 0;
    let completedSlots = 0;
    
    const parseTimeToShift = (t) => {
        const lower = (t || '').toLowerCase().trim();
        if (['morning', 'afternoon', 'night', 'evening'].includes(lower)) return lower === 'evening' ? 'night' : lower;
        const m24 = lower.match(/^(\d{1,2}):(\d{2})/);
        if (m24) { const h = parseInt(m24[1], 10); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'night'; }
        const m12 = lower.match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
        if (m12) { let h = parseInt(m12[1], 10); const p = m12[3].toLowerCase(); if (p === 'pm' && h !== 12) h += 12; if (p === 'am' && h === 12) h = 0; return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'night'; }
        return 'morning';
    };

    medications.forEach(med => {
        const isMedObj = typeof med === 'object';
        if (!isMedObj) { totalSlots++; return; }
        
        // Determine how many shift-slots this med has
        const times = med.scheduledTimes && med.scheduledTimes.length > 0 ? med.scheduledTimes : (med.times || []);
        const medShifts = times.length > 0 ? [...new Set(times.map(parseTimeToShift))] : ['morning'];
        totalSlots += medShifts.length;
        
        // Track which slots have been matched to prevent double-counting
        const matchedSlots = new Set();

        // 1. First, check takenLogs for explicitly matched shifts and timestamps
        if (med.takenLogs && med.takenLogs.length > 0) {
            const todayLogs = med.takenLogs.filter(l => l.date === todayStr);
            for (const sk of medShifts) {
                if (matchedSlots.has(sk)) continue;
                
                const found = todayLogs.find(l => {
                    if (l.shift) {
                        let logSk = l.shift.toLowerCase().trim();
                        if (logSk === 'evening') logSk = 'night';
                        const m = logSk.match(/^(\d{1,2}):(\d{2})/);
                        if (m) { const h = parseInt(m[1], 10); logSk = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'night'; }
                        return logSk === sk;
                    }
                    if (l.timestamp) return isTimestampInShift(l.timestamp, sk);
                    // Legacy: if we only have 1 shift, assume the timestamp applies to it
                    return medShifts.length === 1;
                });
                
                if (found) {
                    completedSlots++;
                    matchedSlots.add(sk);
                }
            }
        }
        
        // 2. Fallbacks: callerMarked / patientMarked / lastConfirmed
        const confirmedToday = med.lastConfirmed && med.lastConfirmedAt && new Date(med.lastConfirmedAt).toDateString() === now.toDateString();
        if (med.patientMarked || med.callerMarked || confirmedToday) {
            // If the caller just confirmed it in ActiveCall, the backend maps it to the CURRENT shift.
            // But since this is a summary view, we want to match it to the slots.
            // If there's a currentShift prop, match it. Otherwise manually mark the current time's shift.
            const currentSk = (currentShift || (now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'night')).toLowerCase();
            
            if (medShifts.includes(currentSk) && !matchedSlots.has(currentSk)) {
                completedSlots++;
                matchedSlots.add(currentSk);
            } else if (!matchedSlots.has(medShifts[0])) { // legacy safety
                completedSlots++;
                matchedSlots.add(medShifts[0]);
            }
        }
    });

    const progressPercentage = totalSlots === 0 ? 0 : Math.round((completedSlots / totalSlots) * 100);
    
    // Clinical compliance color thresholds
    const getComplianceColor = (pct) => {
        if (pct === 100) return '#10B981';  // Emerald  — Perfect
        if (pct >= 80)  return '#22C55E';  // Green    — Good
        if (pct >= 60)  return '#3B82F6';  // Blue     — Fair
        if (pct >= 40)  return '#F59E0B';  // Amber    — Needs attention
        if (pct >= 20)  return '#F97316';  // Orange   — Poor
        return '#EF4444';                   // Red      — Critical
    };
    const complianceColor = getComplianceColor(progressPercentage);
    const complianceBgLight = progressPercentage === 100 ? '#D1FAE5' : progressPercentage >= 60 ? '#EEF2FF' : progressPercentage >= 40 ? '#FEF3C7' : '#FEE2E2';
    
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

                            // ── Shift detection ──
                            const SHIFT_ORDER = { morning: 0, afternoon: 1, night: 2 };
                            const SHIFT_ICONS = { morning: 'sunrise', afternoon: 'sun', night: 'moon' };
                            const SHIFT_COLORS = { morning: '#F59E0B', afternoon: '#F97316', night: '#6366F1' };
                            const currentHour = now.getHours();
                            const activeShiftKey = currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'night';

                            // Map scheduledTimes → shifts + per-shift clock times
                            const shiftTimesMap = {}; // { morning: ['10:00'], night: ['20:00'] }
                            if (isMedObj) {
                                const times = med.scheduledTimes && med.scheduledTimes.length > 0 ? med.scheduledTimes : (med.times || []);
                                if (times.length === 0) {
                                    shiftTimesMap['morning'] = [];
                                } else {
                                    for (const t of times) {
                                        const lower = (t || '').toLowerCase().trim();
                                        let shiftKey = null;
                                        let clockTime = null;
                                        if (['morning', 'afternoon', 'night', 'evening'].includes(lower)) {
                                            shiftKey = lower === 'evening' ? 'night' : lower;
                                        } else {
                                            const match24 = lower.match(/^(\d{1,2}):(\d{2})/);
                                            if (match24) {
                                                const h = parseInt(match24[1], 10);
                                                shiftKey = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'night';
                                                clockTime = t.trim();
                                            }
                                        }
                                        if (shiftKey) {
                                            if (!shiftTimesMap[shiftKey]) shiftTimesMap[shiftKey] = [];
                                            if (clockTime) shiftTimesMap[shiftKey].push(clockTime);
                                        }
                                    }
                                    if (Object.keys(shiftTimesMap).length === 0) shiftTimesMap['morning'] = [];
                                }
                            } else {
                                shiftTimesMap['morning'] = [];
                            }

                            const medShiftKeys = Object.keys(shiftTimesMap).sort((a, b) => SHIFT_ORDER[a] - SHIFT_ORDER[b]);

                            // ── Per-shift status determination ──
                            const getShiftStatus = (shiftKey) => {
                                // Check caller confirmation for this specific shift
                                let callerConfirmedThisShift = false;
                                let patientConfirmedThisShift = false;
                                let confirmTime = null;

                                if (isMedObj) {
                                    // Check takenLogs universally for this specific shift (applies to both Patient and Caller)
                                    if (med.takenLogs) {
                                        const shiftLog = med.takenLogs.find(l => {
                                            if (l.date !== todayStr) return false;
                                            if (l.shift) {
                                                let logShiftKey = l.shift.toLowerCase().trim();
                                                if (logShiftKey === 'evening') logShiftKey = 'night';
                                                
                                                const match24 = logShiftKey.match(/^(\d{1,2}):(\d{2})/);
                                                if (match24) {
                                                    const h = parseInt(match24[1], 10);
                                                    logShiftKey = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'night';
                                                }
                                                
                                                if (logShiftKey === shiftKey || logShiftKey.includes(shiftKey)) return true;
                                            }
                                            if (!l.timestamp) return medShiftKeys.length === 1;
                                            return isTimestampInShift(l.timestamp, shiftKey);
                                        });

                                        if (shiftLog) {
                                            if (shiftLog.marked_by === 'caller') {
                                                callerConfirmedThisShift = true;
                                            } else {
                                                patientConfirmedThisShift = true;
                                            }
                                            if (shiftLog.timestamp) {
                                                confirmTime = new Date(shiftLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            }
                                        }
                                    } else {
                                        // Fallbacks when takenLogs array isn't natively populated (e.g., single-shift flags)
                                        if (med.callerMarked && medShiftKeys.length === 1) {
                                            callerConfirmedThisShift = true;
                                        } else if (med.patientMarked && medShiftKeys.length === 1) {
                                            patientConfirmedThisShift = true;
                                        }
                                    }

                                    // Fallback to strict CallLog checking if not found in MedicineLog 
                                    if (!callerConfirmedThisShift && med.lastConfirmed && med.lastConfirmedAt && new Date(med.lastConfirmedAt).toDateString() === now.toDateString()) {
                                        const confHour = new Date(med.lastConfirmedAt).getHours();
                                        const confShift = confHour < 12 ? 'morning' : confHour < 17 ? 'afternoon' : 'night';
                                        if (confShift === shiftKey) {
                                            callerConfirmedThisShift = true;
                                            confirmTime = confirmTime || new Date(med.lastConfirmedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        }
                                    }

                                    // Legacy takenDates (morning only)
                                    if (!callerConfirmedThisShift && !patientConfirmedThisShift && shiftKey === 'morning') {
                                        if (med.takenDates && med.takenDates.includes(todayStr)) {
                                            patientConfirmedThisShift = true;
                                        }
                                    }
                                }

                                const isTaken = callerConfirmedThisShift || patientConfirmedThisShift;

                                if (isTaken) {
                                    return { status: 'taken', caller: callerConfirmedThisShift, patient: patientConfirmedThisShift, time: confirmTime };
                                } else if (SHIFT_ORDER[shiftKey] < SHIFT_ORDER[activeShiftKey]) {
                                    return { status: 'missed', caller: false, patient: false, time: null };
                                } else if (SHIFT_ORDER[shiftKey] === SHIFT_ORDER[activeShiftKey]) {
                                    return { status: 'pending', caller: false, patient: false, time: null };
                                } else {
                                    return { status: 'upcoming', caller: false, patient: false, time: null };
                                }
                            };

                            // Overall card status (for border/icon)
                            const shiftStatuses = medShiftKeys.map(sk => ({ key: sk, ...getShiftStatus(sk) }));
                            const allTaken = shiftStatuses.every(ss => ss.status === 'taken');
                            const anyMissed = shiftStatuses.some(ss => ss.status === 'missed');
                            const anyTaken = shiftStatuses.some(ss => ss.status === 'taken');

                            const overallStatus = allTaken ? 'taken' : anyMissed ? 'missed' : anyTaken ? 'partial' : shiftStatuses[0]?.status || 'pending';
                            const borderColor = overallStatus === 'taken' ? '#10B981' : overallStatus === 'missed' || overallStatus === 'partial' ? '#F59E0B' : '#E2E8F0';
                            const iconBg = allTaken ? '#D1FAE5' : anyMissed ? '#FEF3C7' : '#F8FAFC';
                            const iconBorder = allTaken ? '#6EE7B7' : anyMissed ? '#FDE68A' : '#E2E8F0';
                            const iconColor = allTaken ? '#10B981' : anyMissed ? '#F59E0B' : '#94A3B8';
                            const iconName = allTaken ? 'check-circle' : anyMissed ? 'alert-triangle' : 'circle';

                            return (
                                <React.Fragment key={isMedObj ? (med.id || med._id || i) : i}>
                                    {i > 0 && <View style={s.divider} />}
                                    <View style={[s.medCard, { borderLeftColor: borderColor }]}>
                                        
                                        {/* Header: Icon + Name + Dosage + Actions */}
                                        <View style={s.medHeader}>
                                            <View style={[s.medIconWrap, { backgroundColor: iconBg, borderColor: iconBorder }]}>
                                                <Feather name={iconName} size={18} color={iconColor} />
                                            </View>
                                            <View style={s.medTitleBlock}>
                                                <Text style={s.medName} numberOfLines={1}>{mName}</Text>
                                                {isMedObj && med.dosage ? (
                                                    <View style={s.dosagePill}>
                                                        <Text style={s.dosageText}>{med.dosage}</Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                            <View style={s.medActions}>
                                                {editable && onRemoveMedication && (
                                                    <TouchableOpacity style={s.deleteBtn} onPress={() => onRemoveMedication(med)} activeOpacity={0.7}>
                                                        <Feather name="trash-2" size={14} color="#EF4444" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>

                                        {/* Per-shift status rows */}
                                        {isMedObj && (
                                            <View style={s.shiftStatusList}>
                                                {shiftStatuses.map((ss) => {
                                                    const shiftTimes = shiftTimesMap[ss.key] || [];
                                                    const timeStr = shiftTimes.length > 0 ? shiftTimes.join(', ') : null;
                                                    const label = ss.key.charAt(0).toUpperCase() + ss.key.slice(1);

                                                    // Status config
                                                    const cfg = {
                                                        taken: { bg: '#F0FDF4', border: '#BBF7D0', color: '#16A34A', icon: 'check-circle' },
                                                        missed: { bg: '#FEF2F2', border: '#FCA5A5', color: '#DC2626', icon: 'x-circle' },
                                                        pending: { bg: '#FFFBEB', border: '#FDE68A', color: '#D97706', icon: 'clock' },
                                                        upcoming: { bg: '#EFF6FF', border: '#93C5FD', color: '#2563EB', icon: 'arrow-right' },
                                                    }[ss.status];

                                                    // Status label text
                                                    let statusLabel = '';
                                                    if (ss.status === 'taken') {
                                                        if (ss.caller && ss.patient) statusLabel = `Patient + Caller${ss.time ? ' · ' + ss.time : ''}`;
                                                        else if (ss.caller) statusLabel = `Caller${ss.time ? ' · ' + ss.time : ''}`;
                                                        else if (ss.patient) statusLabel = `Patient${ss.time ? ' · ' + ss.time : ''}`;
                                                        else statusLabel = `Taken${ss.time ? ' · ' + ss.time : ''}`;
                                                    } else if (ss.status === 'missed') {
                                                        statusLabel = 'Missed';
                                                    } else if (ss.status === 'pending') {
                                                        statusLabel = 'Pending';
                                                    } else {
                                                        statusLabel = 'Upcoming';
                                                    }

                                                    return (
                                                        <View key={ss.key} style={s.shiftRow}>
                                                            {/* Shift label */}
                                                            <View style={s.shiftLabel}>
                                                                <Feather name={SHIFT_ICONS[ss.key]} size={12} color={SHIFT_COLORS[ss.key]} />
                                                                <Text style={[s.shiftLabelText, { color: SHIFT_COLORS[ss.key] }]}>{label}</Text>
                                                                {timeStr && (
                                                                    <>
                                                                        <View style={s.dotSep} />
                                                                        <Text style={s.shiftTimeText}>{timeStr}</Text>
                                                                    </>
                                                                )}
                                                            </View>
                                                            {/* Status badge */}
                                                            <View style={[s.shiftStatusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                                                                <Feather name={cfg.icon} size={10} color={cfg.color} />
                                                                <Text style={[s.shiftStatusText, { color: cfg.color }]} numberOfLines={1}>{statusLabel}</Text>
                                                            </View>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                </React.Fragment>
                            );
                        })
                    )}
                </PremiumCard>
                
                {/* Premium HD Real-time Progress Bar */}
                {totalSlots > 0 && (
                    <View style={s.progressCardWrapper}>
                        <View style={s.progressHeader}>
                            <View style={s.progressLabelBox}>
                                <View style={[s.progressIconWrap, { backgroundColor: complianceBgLight }]}>
                                    <Feather name={progressPercentage === 100 ? "award" : "activity"} size={14} color={complianceColor} />
                                </View>
                                <Text style={s.progressTitle}>DAILY COMPLIANCE</Text>
                            </View>
                            <View style={s.progressMetricBox}>
                                <Text style={[s.progressValue, { color: complianceColor }]}>{progressPercentage}%</Text>
                                <Text style={s.progressDiv}>({completedSlots}/{totalSlots})</Text>
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
                                <PremiumCard style={{ flex: 1, backgroundColor: complianceColor }} noShadow />
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
    // Shared Layouts — conditions
    conditionRow: {
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
    // ─── Medication Card ───
    medCard: {
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: '#FFFFFF',
        borderLeftWidth: 4,
    },
    medHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    medIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        borderWidth: 1,
    },
    medTitleBlock: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    medName: {
        color: '#1E293B',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    dosagePill: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    dosageText: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '700',
    },
    medActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
    },
    // ─── Per-shift status rows ───
    shiftStatusList: {
        marginTop: 10,
        marginLeft: 46,  // align with content (36 icon + 10 gap)
        gap: 6,
    },
    shiftRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
    },
    shiftLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        flexShrink: 0,
    },
    shiftLabelText: {
        fontSize: 12,
        fontWeight: '600',
    },
    dotSep: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#CBD5E1',
        marginHorizontal: 2,
    },
    shiftTimeText: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    shiftStatusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 5,
        borderWidth: 1,
    },
    shiftStatusText: {
        fontSize: 10,
        fontWeight: '700',
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
