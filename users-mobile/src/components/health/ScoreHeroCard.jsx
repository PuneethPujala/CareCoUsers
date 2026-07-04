import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { TrendingUp } from 'lucide-react-native';
import { colors } from '../../theme';
import { FONT } from './constants';

export default function ScoreHeroCard({ scoreData }) {
    const {
        hasScore,
        activeScoreVal,
        scoreColor,
        scoreStatus,
        hsGrade,
        hsBracket,
        bracketLabel,
        lastSyncText,
        deltas,
        completionPct
    } = scoreData || {};

    const renderDelta = () => {
        if (!deltas || deltas.score_delta_30d === undefined) return null;
        const deltaVal = deltas.score_delta_30d;
        const arrow = deltaVal > 0 ? '↗' : deltaVal < 0 ? '↘' : '→';
        const color = deltaVal > 0 ? colors.success : deltaVal < 0 ? colors.danger : colors.textMuted;
        const text = deltaVal > 0 ? `+${deltaVal}` : deltaVal < 0 ? `${deltaVal}` : 'stable';
        return (
            <Text style={{ fontSize: 12, color, fontWeight: '700', marginLeft: 6 }}>
                {arrow} {text} this month
            </Text>
        );
    };

    return (
        <View style={s.card}>
            {/* Glow Background Layer */}
            <View style={s.glowBg} />

            {/* SVG Score Circle */}
            <View style={s.svgContainer}>
                <Svg width={110} height={110} viewBox="0 0 110 110">
                    <Defs>
                        <SvgLinearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0%" stopColor="#6366F1" />
                            <Stop offset="100%" stopColor={hasScore ? scoreColor : '#CBD5E1'} />
                        </SvgLinearGradient>
                    </Defs>
                    <SvgCircle cx={55} cy={55} r={45} stroke="#F1F5F9" strokeWidth={8} fill="none" />
                    <SvgCircle 
                        cx={55} 
                        cy={55} 
                        r={45} 
                        stroke={hasScore ? "url(#scoreGrad)" : colors.primary} 
                        strokeWidth={8} 
                        strokeDasharray={2 * Math.PI * 45} 
                        strokeDashoffset={2 * Math.PI * 45 * (1 - (hasScore ? activeScoreVal : (completionPct || 0)) / 100)} 
                        strokeLinecap="round" 
                        fill="none" 
                        transform="rotate(-90 55 55)" 
                    />
                </Svg>
                <View style={s.scoreTextContainer}>
                    <Text style={[s.scoreValText, { color: hasScore ? '#0F172A' : colors.primary }]}>
                        {hasScore ? activeScoreVal : `${completionPct || 0}%`}
                    </Text>
                </View>
            </View>

            {/* Score Info Details */}
            <View style={s.detailsContainer}>
                <Text style={s.statusText}>
                    {scoreStatus}
                </Text>
                
                {hasScore ? (
                    <View style={s.metricsList}>
                        <View style={s.gradeRow}>
                            <TrendingUp size={14} color={scoreColor} />
                            <Text style={[s.gradeText, { color: scoreColor }]}>{hsGrade} Grade</Text>
                            {renderDelta()}
                        </View>
                        {hsBracket && <Text style={s.bracketText}>Adjusted for {bracketLabel}</Text>}
                        <Text style={s.syncText}>{lastSyncText}</Text>
                    </View>
                ) : (
                    <Text style={s.learnText}>
                        We need more health data to calculate an accurate score. Currently {completionPct || 0}% complete.
                    </Text>
                )}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 36,
        padding: 24,
        marginBottom: 20,
        borderWidth: 1.5,
        borderColor: '#EEF2FF',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 4,
        position: 'relative',
        overflow: 'hidden',
    },
    glowBg: {
        position: 'absolute',
        top: -50,
        left: -50,
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: colors.primary,
        opacity: 0.05,
    },
    svgContainer: {
        position: 'relative',
        width: 110,
        height: 110,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreTextContainer: {
        position: 'absolute',
        alignItems: 'center',
    },
    scoreValText: {
        fontSize: 32,
        ...FONT.heavy,
        lineHeight: 36,
    },
    detailsContainer: {
        flex: 1,
    },
    statusText: {
        fontSize: 20,
        ...FONT.heavy,
        color: '#0F172A',
        marginBottom: 4,
    },
    metricsList: {
        gap: 4,
    },
    gradeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    gradeText: {
        fontSize: 13,
        ...FONT.bold,
    },
    bracketText: {
        fontSize: 12,
        ...FONT.medium,
        color: colors.textSecondary,
    },
    syncText: {
        fontSize: 11,
        ...FONT.medium,
        color: colors.textMuted,
    },
    learnText: {
        fontSize: 13,
        ...FONT.medium,
        color: colors.textSecondary,
        lineHeight: 18,
    },
});
