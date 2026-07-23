import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Pill, Check, Clock, ChevronDown, Sparkles } from 'lucide-react-native';
import { colors, radius } from '../../theme';
import { FONT } from '../health/constants';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ProgressiveMedCard({
    slots = [],
    onToggleSlot,
    onNavigateMedications,
}) {
    if (!slots || slots.length === 0) return null;

    // Find the first untaken slot as default focused index, or last slot if all taken
    const initialFocusedIdx = slots.findIndex((s) => !s.taken);
    const activeIdx = initialFocusedIdx !== -1 ? initialFocusedIdx : 0;

    const [expandedIdx, setExpandedIdx] = useState(activeIdx);

    const handleSelectSlot = (idx) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedIdx(idx);
    };

    return (
        <View style={s.card}>
            <View style={s.headerRow}>
                <View style={s.titleWrap}>
                    <View style={s.iconWrap}>
                        <Pill size={18} color="#7C3AED" />
                    </View>
                    <View>
                        <Text style={s.eyebrow}>TODAY'S MEDICATIONS</Text>
                        <Text style={s.title}>Progressive Schedule</Text>
                    </View>
                </View>
                <Pressable onPress={onNavigateMedications} hitSlop={8}>
                    <Text style={s.viewAllTxt}>View All →</Text>
                </Pressable>
            </View>

            {/* Compact Timeline Bar (Past & Future Slots) */}
            <View style={s.timelineBar}>
                {slots.map((slot, idx) => {
                    const isExpanded = expandedIdx === idx;
                    const isTaken = slot.taken;
                    return (
                        <Pressable
                            key={slot.id || idx}
                            style={[
                                s.timelinePill,
                                isExpanded && s.timelinePillActive,
                                isTaken && s.timelinePillTaken,
                            ]}
                            onPress={() => handleSelectSlot(idx)}
                        >
                            {isTaken ? (
                                <Check size={12} color="#10B981" />
                            ) : (
                                <Clock size={12} color={isExpanded ? '#7C3AED' : '#94A3B8'} />
                            )}
                            <Text
                                style={[
                                    s.timelinePillTxt,
                                    isExpanded && s.timelinePillTxtActive,
                                    isTaken && s.timelinePillTxtTaken,
                                ]}
                            >
                                {slot.label || slot.time}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* Focused Slot Detail Card (Progressive Disclosure) */}
            {slots[expandedIdx] && (
                <View style={s.focusedCard}>
                    <View style={s.focusedHeader}>
                        <View style={s.focusedTimeBadge}>
                            <Clock size={14} color="#7C3AED" />
                            <Text style={s.focusedTimeTxt}>
                                {slots[expandedIdx].label || slots[expandedIdx].time}
                            </Text>
                        </View>
                        {slots[expandedIdx].taken ? (
                            <View style={s.takenBadge}>
                                <Check size={12} color="#10B981" />
                                <Text style={s.takenBadgeTxt}>Taken</Text>
                            </View>
                        ) : (
                            <Text style={s.dueTxt}>Due Now</Text>
                        )}
                    </View>

                    {/* Medications inside this focused slot */}
                    <View style={s.medsList}>
                        {(slots[expandedIdx].items || [slots[expandedIdx]]).map((item, mIdx) => (
                            <View key={mIdx} style={s.medRow}>
                                <View style={s.medBullet} />
                                <View style={{ flex: 1 }}>
                                    <Text style={s.medName}>{item.name || item.medicine_name || 'Medication'}</Text>
                                    <Text style={s.medDosage}>{item.dosage || '1 dose'} • {item.instructions || 'With water'}</Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* Action Button */}
                    <Pressable
                        style={({ pressed }) => [
                            s.actionBtn,
                            slots[expandedIdx].taken && s.actionBtnTaken,
                            pressed && { opacity: 0.8 },
                        ]}
                        onPress={() => onToggleSlot?.(slots[expandedIdx])}
                    >
                        <Check size={16} color={slots[expandedIdx].taken ? '#10B981' : '#FFFFFF'} />
                        <Text
                            style={[
                                s.actionBtnTxt,
                                slots[expandedIdx].taken && s.actionBtnTxtTaken,
                            ]}
                        >
                            {slots[expandedIdx].taken ? 'Marked as Taken' : 'Mark Slot as Taken'}
                        </Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.lg,
        padding: 16,
        marginHorizontal: 16,
        marginVertical: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    titleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FAF5FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    eyebrow: {
        fontSize: 10,
        ...FONT.heavy,
        color: '#7C3AED',
        letterSpacing: 0.5,
    },
    title: {
        fontSize: 15,
        ...FONT.bold,
        color: '#0F172A',
    },
    viewAllTxt: {
        fontSize: 12,
        ...FONT.bold,
        color: '#7C3AED',
    },
    timelineBar: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 14,
    },
    timelinePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    timelinePillActive: {
        backgroundColor: 'rgba(124, 58, 237, 0.08)',
        borderColor: 'rgba(124, 58, 237, 0.3)',
    },
    timelinePillTaken: {
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderColor: 'rgba(16, 185, 129, 0.25)',
    },
    timelinePillTxt: {
        fontSize: 12,
        ...FONT.medium,
        color: '#64748B',
    },
    timelinePillTxtActive: {
        color: '#7C3AED',
        ...FONT.bold,
    },
    timelinePillTxtTaken: {
        color: '#059669',
        ...FONT.bold,
    },
    focusedCard: {
        backgroundColor: 'rgba(124, 58, 237, 0.03)',
        borderRadius: radius.md,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.12)',
    },
    focusedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    focusedTimeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.15)',
    },
    focusedTimeTxt: {
        fontSize: 12,
        ...FONT.bold,
        color: '#7C3AED',
    },
    takenBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
    },
    takenBadgeTxt: {
        fontSize: 11,
        ...FONT.bold,
        color: '#059669',
    },
    dueTxt: {
        fontSize: 11,
        ...FONT.bold,
        color: '#D97706',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
    },
    medsList: {
        gap: 8,
        marginBottom: 14,
    },
    medRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    medBullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#7C3AED',
        marginTop: 6,
    },
    medName: {
        fontSize: 14,
        ...FONT.bold,
        color: '#0F172A',
    },
    medDosage: {
        fontSize: 12,
        ...FONT.medium,
        color: '#64748B',
        marginTop: 1,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#7C3AED',
        paddingVertical: 10,
        borderRadius: radius.sm,
    },
    actionBtnTaken: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    actionBtnTxt: {
        fontSize: 13,
        ...FONT.bold,
        color: '#FFFFFF',
    },
    actionBtnTxtTaken: {
        color: '#059669',
    },
});
