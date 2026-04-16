// admin-app/src/components/premium/HeroStatCard.jsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import AnimatedNumber from './AnimatedNumber';

const { width: SW } = Dimensions.get('window');

function Sparkline({ data = [45, 52, 48, 63, 58, 67, 72, 81, 77, 89, 95, 124], width, height, color }) {
    if (!data || data.length === 0) data = [0, 0];
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    
    const points = data.map((val, i) => {
        const x = i * stepX;
        const y = height - ((val - min) / range) * height;
        return `${x},${y}`;
    }).join(' L ');
    const d = `M ${points}`;

    return (
        <Svg width={width} height={height}>
            <Defs>
                <SvgGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={color} stopOpacity="0.8" />
                    <Stop offset="1" stopColor={color} stopOpacity="0" />
                </SvgGradient>
            </Defs>
            <Path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={`${d} L ${width},${height} L 0,${height} Z`} fill="url(#grad)" />
        </Svg>
    );
}

export default function HeroStatCard({
    title = 'PLATFORM PERFORMANCE',
    value = 98.4,
    suffix = '%',
    changeText = '↗ +2.4%',
    changeSub = 'system stability',
    data = [45, 52, 48, 63, 58, 67, 72, 81, 77, 89, 95, 124]
}) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 0,
                duration: 800,
                easing: Easing.out(Easing.back(1)),
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View style={[s.container, { opacity, transform: [{ translateY }] }]}>
            <LinearGradient
                colors={Theme.colors.accents.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.gradient}
            >
                <View style={s.content}>
                    <View style={s.header}>
                        <Text style={[s.label, Theme.typography.common]}>{title}</Text>
                        <Feather name="activity" size={16} color="rgba(255,255,255,0.9)" />
                    </View>

                    <View style={s.numberContainer}>
                        <AnimatedNumber 
                            value={value} 
                            suffix={suffix} 
                            style={[s.mainNumber, Theme.typography.common]} 
                        />
                    </View>

                    <Text style={[s.change, Theme.typography.common]}>
                        {changeText} <Text style={s.changeSub}>{changeSub}</Text>
                    </Text>
                </View>

                <View style={s.chartContainer}>
                    <Sparkline data={data} width={SW - 32} height={60} color="rgba(255,255,255,0.3)" />
                </View>
            </LinearGradient>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: {
        height: 180,
        borderRadius: 20,
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 20,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        ...Theme.shadows.glow,
    },
    gradient: { flex: 1, padding: 24, justifyContent: 'space-between' },
    content: { zIndex: 2 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    label: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
    mainNumber: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', letterSpacing: -1 },
    change: { color: '#10B981', fontSize: 14, fontWeight: '700', marginTop: 4 },
    changeSub: { color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
    chartContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, opacity: 0.4 },
});
