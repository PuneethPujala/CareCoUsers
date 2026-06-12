import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { FONT } from './constants';

export default function AchievementSection({
    nextMilestone,
    milestoneProgress,
    milestoneTarget,
    unlockedAchievements
}) {
    const progressPct = Math.min(100, Math.round((milestoneProgress / milestoneTarget) * 100));

    return (
        <View style={s.card}>
            <Text style={s.sectionTitle}>ACHIEVEMENTS</Text>
            
            {/* Next Milestone Card */}
            <View style={s.milestoneCard}>
                <Text style={s.milestoneEyebrow}>NEXT MILESTONE</Text>
                <Text style={s.milestoneName}>{nextMilestone}</Text>
                <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${progressPct}%` }]} />
                </View>
            </View>

            {unlockedAchievements.length > 0 && (
                <>
                    <Text style={s.unlockedTitle}>UNLOCKED</Text>
                    <View style={s.achievementList}>
                        {unlockedAchievements.map((achievement, idx) => (
                            <View key={idx} style={s.achievementRow}>
                                <Text style={s.trophyIcon}>🏆</Text>
                                <Text style={s.achievementTxt}>{achievement}</Text>
                            </View>
                        ))}
                    </View>
                </>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 28,
        padding: 20,
        borderWidth: 1,
        borderColor: colors.borderLight,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 1,
    },
    sectionTitle: {
        fontSize: 12,
        ...FONT.heavy,
        color: colors.textMuted,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    milestoneCard: {
        backgroundColor: '#FFFBEB',
        borderRadius: 20,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#FDE68A',
    },
    milestoneEyebrow: {
        fontSize: 11,
        ...FONT.heavy,
        color: '#D97706',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    milestoneName: {
        fontSize: 14,
        ...FONT.bold,
        color: colors.textPrimary,
        marginBottom: 8,
    },
    progressBg: {
        height: 6,
        backgroundColor: '#FEF3C7',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.warning,
        borderRadius: 3,
    },
    unlockedTitle: {
        fontSize: 11,
        ...FONT.heavy,
        color: colors.textMuted,
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    achievementList: {
        gap: 10,
    },
    achievementRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    trophyIcon: {
        fontSize: 18,
    },
    achievementTxt: {
        fontSize: 13,
        ...FONT.bold,
        color: colors.textSecondary,
    },
});
