import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import { colors } from '../../theme';
import { FONT, COACH_ILLUSTRATIONS } from './constants';

export default function HealthCoachCard({ coachData, onPressCoach }) {
    const {
        insight,
        score,
        projection
    } = coachData || {};

    const coachAction = insight?.action;
    const topTip = insight?.topTip;
    const coachCtaText = insight?.ctaText;

    const hasScore = score?.hasScore;

    // Determine which illustration to use for the coach card based on keywords
    let coachIllus = COACH_ILLUSTRATIONS.medsMeal; // default fallback
    const actionLower = coachAction ? coachAction.toLowerCase() : '';
    if (actionLower.includes('early') || actionLower.includes('fasting') || actionLower.includes('dinner') || actionLower.includes('bed') || actionLower.includes('hour')) {
        coachIllus = COACH_ILLUSTRATIONS.eatEarly;
    } else if (actionLower.includes('rice') || actionLower.includes('portion') || actionLower.includes('carb') || actionLower.includes('diet') || actionLower.includes('sugar') || actionLower.includes('meal')) {
        coachIllus = COACH_ILLUSTRATIONS.ricePortion;
    } else if (actionLower.includes('med') || actionLower.includes('take') || actionLower.includes('pill') || actionLower.includes('tablets')) {
        coachIllus = COACH_ILLUSTRATIONS.medsMeal;
    }

    const coachImpact = topTip?.impact === 'high' ? '+5' : topTip?.impact === 'medium' ? '+3' : '+2';

    return (
        <View style={s.cardContainer}>
            <Image source={coachIllus} style={s.illustration} />
            <View style={s.cardBody}>
                <View style={s.headerRow}>
                    <Sparkles size={16} color="#7C3AED" />
                    <Text style={s.headerEyebrow}>HEALTH COACH</Text>
                    {topTip && (
                        <View style={s.tipBadge}>
                            <Text style={s.tipBadgeTxt}>{(topTip.impact || 'TIP').toUpperCase()}</Text>
                        </View>
                    )}
                </View>

                <Text style={s.coachActionTitle}>
                    {coachAction}
                </Text>
                {topTip?.body && (
                    <Text style={s.coachActionBody}>
                        {topTip.body}
                    </Text>
                )}

                <View style={s.footerRow}>
                    {hasScore && (
                        <View style={s.scoreImpactBadge}>
                            <Text style={s.scoreImpactTxt}>
                                {coachImpact} Score Impact
                            </Text>
                        </View>
                    )}
                    <Pressable
                        onPress={onPressCoach}
                        hitSlop={8}
                        style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.7 }]}
                    >
                        <Text style={s.ctaTxt}>{coachCtaText}</Text>
                        <ChevronRight size={14} color="#7C3AED" />
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    cardContainer: {
        backgroundColor: '#FAF5FF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F3E8FF',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
    },
    illustration: {
        width: '100%',
        height: 140,
        resizeMode: 'cover',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
    },
    cardBody: {
        padding: 20,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
    },
    headerEyebrow: {
        fontSize: 12,
        ...FONT.heavy,
        color: '#7C3AED',
        letterSpacing: 0.8,
    },
    tipBadge: {
        backgroundColor: '#F3E8FF',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        marginLeft: 'auto',
    },
    tipBadgeTxt: {
        fontSize: 9,
        ...FONT.bold,
        color: '#7C3AED',
    },
    coachActionTitle: {
        fontSize: 16,
        ...FONT.bold,
        color: '#0F172A',
        lineHeight: 22,
        marginBottom: 4,
    },
    coachActionBody: {
        fontSize: 13,
        ...FONT.medium,
        color: '#475569',
        lineHeight: 18,
        marginBottom: 12,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    scoreImpactBadge: {
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    scoreImpactTxt: {
        fontSize: 12,
        ...FONT.heavy,
        color: '#10B981',
        letterSpacing: 0.2,
    },
    ctaBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    ctaTxt: {
        fontSize: 12,
        ...FONT.bold,
        color: '#7C3AED',
    },
});

