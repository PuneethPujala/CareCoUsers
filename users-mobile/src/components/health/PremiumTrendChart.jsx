import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Rect, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { colors, typography } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PremiumTrendChart = ({
    data = [],
    type = 'area', // 'area' | 'line' | 'bar'
    color = colors.primary,
    height = 180,
    yMin,
    yMax,
    showGrid = true,
    paddingRight = 40,
    paddingLeft = 20,
    paddingTop = 15,
    paddingBottom = 25,
    projectionValue, // 14-day projection value
    emptyIcon,
    emptyLabel,
    emptySubLabel,
}) => {
    if (!data || data.length === 0) {
        if (emptyIcon || emptyLabel) {
            const chartW = SCREEN_WIDTH - 48;
            // Faint mock graph path — an organic-looking wave at 8% opacity
            const mockH = height;
            const mockPath = `M 0 ${mockH * 0.65} Q ${chartW * 0.12} ${mockH * 0.55}, ${chartW * 0.22} ${mockH * 0.6} T ${chartW * 0.42} ${mockH * 0.45} T ${chartW * 0.62} ${mockH * 0.52} T ${chartW * 0.82} ${mockH * 0.35} T ${chartW} ${mockH * 0.42}`;
            const mockArea = `${mockPath} L ${chartW} ${mockH} L 0 ${mockH} Z`;
            return (
                <View style={[styles.container, styles.emptyContainer, { height }]}>
                    {/* Faint ghost chart */}
                    <View style={StyleSheet.absoluteFill}>
                        <Svg width="100%" height="100%">
                            <Defs>
                                <LinearGradient id="emptyGrad" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0%" stopColor={color} stopOpacity="0.06" />
                                    <Stop offset="100%" stopColor={color} stopOpacity="0.00" />
                                </LinearGradient>
                            </Defs>
                            <Path d={mockArea} fill="url(#emptyGrad)" />
                            <Path d={mockPath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.10" />
                            {/* Faint grid lines */}
                            {[0.3, 0.5, 0.7].map((pct, i) => (
                                <Line key={i} x1={0} y1={mockH * pct} x2={chartW} y2={mockH * pct} stroke={colors.borderLight} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                            ))}
                        </Svg>
                    </View>
                    {/* Centered label overlay */}
                    <View style={styles.emptyOverlay}>
                        {emptyIcon ? <Text style={styles.emptyIcon}>{emptyIcon}</Text> : null}
                        {emptyLabel ? <Text style={styles.emptyLabel}>{emptyLabel}</Text> : null}
                        {emptySubLabel ? <Text style={styles.emptySubLabel}>{emptySubLabel}</Text> : null}
                    </View>
                </View>
            );
        }
        return <View style={[styles.container, { height }]} />;
    }

    const chartWidth = SCREEN_WIDTH - 48 - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Extrapolate values
    const values = data.map((d) => (typeof d === 'number' ? d : d.value));
    const labels = data.map((d) => (typeof d === 'number' ? '' : d.label || ''));

    const allValuesForBounds = [...values];
    if (projectionValue !== undefined && projectionValue !== null) {
        allValuesForBounds.push(projectionValue);
    }

    const calculatedMin = Math.min(...allValuesForBounds, 0);
    const calculatedMax = Math.max(...allValuesForBounds, 100);
    
    const minVal = yMin !== undefined ? yMin : Math.max(0, calculatedMin - (calculatedMax - calculatedMin) * 0.1);
    const maxVal = yMax !== undefined ? yMax : Math.min(100, calculatedMax + (calculatedMax - calculatedMin) * 0.1);
    const valRange = maxVal - minVal || 1;

    const activeWidth = (projectionValue !== undefined && projectionValue !== null) ? chartWidth * 0.82 : chartWidth;

    // Calculate point coordinates
    const points = data.map((d, index) => {
        const val = typeof d === 'number' ? d : d.value;
        const x = paddingLeft + (index / Math.max(1, data.length - 1)) * activeWidth;
        const y = paddingTop + chartHeight - ((val - minVal) / valRange) * chartHeight;
        return { x, y, value: val, label: typeof d === 'number' ? '' : d.label };
    });

    // Generate Path descriptions
    let linePath = '';
    let areaPath = '';

    if (points.length >= 2) {
        // Horizontal Bezier interpolation
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const cpX1 = p0.x + (p1.x - p0.x) / 2;
            const cpY1 = p0.y;
            const cpX2 = p1.x - (p1.x - p0.x) / 2;
            const cpY2 = p1.y;
            d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
        }
        linePath = d;

        if (type === 'area') {
            areaPath = `${d} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
        }
    }

    // Determine grid lines (3 divisions)
    const gridDivisions = 3;
    const gridLines = [];
    for (let i = 0; i <= gridDivisions; i++) {
        const val = minVal + (i / gridDivisions) * valRange;
        const y = paddingTop + chartHeight - (i / gridDivisions) * chartHeight;
        gridLines.push({ y, value: Math.round(val) });
    }

    return (
        <View style={[styles.container, { height }]}>
            <Svg width="100%" height="100%">
                <Defs>
                    <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor={color} stopOpacity="0.25" />
                        <Stop offset="100%" stopColor={color} stopOpacity="0.00" />
                    </LinearGradient>
                </Defs>

                {/* Grid Lines */}
                {showGrid &&
                    gridLines.map((line, idx) => (
                        <G key={`grid-${idx}`}>
                            <Line
                                x1={paddingLeft}
                                y1={line.y}
                                x2={paddingLeft + chartWidth}
                                y2={line.y}
                                stroke={colors.borderLight}
                                strokeWidth="1"
                                strokeDasharray="3 3"
                            />
                            <SvgText
                                x={paddingLeft + chartWidth + 8}
                                y={line.y + 4}
                                fill={colors.textMuted}
                                fontSize={typography.sizes.tiny}
                                fontWeight="600"
                            >
                                {line.value}
                            </SvgText>
                        </G>
                    ))}

                {/* Bar Chart Type */}
                {type === 'bar' &&
                    points.map((p, idx) => {
                        const barWidth = Math.max(6, Math.min(24, chartWidth / (data.length * 1.6)));
                        const barHeight = paddingTop + chartHeight - p.y;
                        return (
                            <Rect
                                key={`bar-${idx}`}
                                x={p.x - barWidth / 2}
                                y={p.y}
                                width={barWidth}
                                height={Math.max(2, barHeight)}
                                rx={barWidth / 2}
                                fill={color}
                            />
                        );
                    })}

                {/* Area Chart Type */}
                {type === 'area' && areaPath ? (
                    <Path d={areaPath} fill="url(#chartGradient)" />
                ) : null}

                {/* Line Path */}
                {(type === 'line' || type === 'area') && linePath ? (
                    <Path
                        d={linePath}
                        fill="none"
                        stroke={color}
                        strokeWidth="3"
                        strokeLinecap="round"
                    />
                ) : null}

                {/* Glow dot on latest point */}
                {(type === 'line' || type === 'area') && points.length > 0 && (
                    <G>
                        <Circle
                            cx={points[points.length - 1].x}
                            cy={points[points.length - 1].y}
                            r="8"
                            fill={color}
                            opacity="0.3"
                        />
                        <Circle
                            cx={points[points.length - 1].x}
                            cy={points[points.length - 1].y}
                            r="4"
                            fill={color}
                            stroke={colors.surface}
                            strokeWidth="2"
                        />
                    </G>
                )}

                {/* 14-day Trajectory Projection segment */}
                {projectionValue !== undefined && projectionValue !== null && points.length > 0 && (
                    <G>
                        <Line
                            x1={points[points.length - 1].x}
                            y1={points[points.length - 1].y}
                            x2={paddingLeft + chartWidth}
                            y2={paddingTop + chartHeight - ((projectionValue - minVal) / valRange) * chartHeight}
                            stroke={color}
                            strokeWidth="2.5"
                            strokeDasharray="4 4"
                        />
                        <Circle
                            cx={paddingLeft + chartWidth}
                            cy={paddingTop + chartHeight - ((projectionValue - minVal) / valRange) * chartHeight}
                            r="5"
                            fill={colors.surface}
                            stroke={color}
                            strokeWidth="2.5"
                        />
                        <SvgText
                            x={paddingLeft + chartWidth}
                            y={paddingTop + chartHeight - ((projectionValue - minVal) / valRange) * chartHeight - 10}
                            fill={color}
                            fontSize="10"
                            fontWeight="800"
                            textAnchor="middle"
                        >
                            {Math.round(projectionValue)}
                        </SvgText>
                    </G>
                )}

                {/* X Axis Labels */}
                {points.map((p, idx) => {
                    // Reduce label density to prevent overlap (max 5 labels)
                    const skipCount = Math.ceil(points.length / 5);
                    if (idx % skipCount !== 0 && idx !== points.length - 1) return null;

                    return (
                        <SvgText
                            key={`x-lbl-${idx}`}
                            x={p.x}
                            y={height - 6}
                            fill={colors.textMuted}
                            fontSize={10}
                            fontWeight="600"
                            textAnchor="middle"
                        >
                            {p.label}
                        </SvgText>
                    );
                })}

                {/* Trajectory Label on X Axis */}
                {projectionValue !== undefined && projectionValue !== null && (
                    <SvgText
                        x={paddingLeft + chartWidth}
                        y={height - 6}
                        fill={color}
                        fontSize={9}
                        fontWeight="700"
                        textAnchor="middle"
                    >
                        14d Proj
                    </SvgText>
                )}
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginVertical: 8,
    },
    emptyContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    emptyOverlay: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    emptyIcon: {
        fontSize: 28,
        marginBottom: 8,
    },
    emptyLabel: {
        fontSize: 13,
        fontFamily: 'Inter_600SemiBold',
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 18,
    },
    emptySubLabel: {
        fontSize: 11,
        fontFamily: 'Inter_500Medium',
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 4,
        lineHeight: 16,
    },
});

export default PremiumTrendChart;
