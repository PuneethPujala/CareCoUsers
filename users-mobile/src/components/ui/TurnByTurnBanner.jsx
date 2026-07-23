import React from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Navigation, ChevronRight, CheckCircle2, Pill, Heart, AlertTriangle } from 'lucide-react-native';
import { colors, radius, FONT } from '../../theme';

export default function TurnByTurnBanner({
    stepTitle = 'Next Step',
    stepDescription = 'Take Morning Medications (Due in 15 mins)',
    iconType = 'medication',
    onPress,
}) {
    const getIcon = () => {
        switch (iconType) {
            case 'medication':
                return <Pill size={18} color="#FFFFFF" />;
            case 'vital':
                return <Heart size={18} color="#FFFFFF" />;
            case 'alert':
                return <AlertTriangle size={18} color="#FFFFFF" />;
            case 'done':
                return <CheckCircle2 size={18} color="#FFFFFF" />;
            default:
                return <Navigation size={18} color="#FFFFFF" />;
        }
    };

    return (
        <Pressable
            style={({ pressed }) => [s.banner, pressed && { opacity: 0.94, transform: [{ scale: 0.99 }] }]}
            onPress={onPress}
        >
            <View style={s.iconBadge}>{getIcon()}</View>
            <View style={s.textWrap}>
                <View style={s.eyebrowCapsule}>
                    <Text style={s.eyebrow}>{stepTitle.toUpperCase()}</Text>
                </View>
                <Text style={s.description} numberOfLines={1}>
                    {stepDescription}
                </Text>
            </View>
            <View style={s.arrowWrap}>
                <ChevronRight size={16} color="#94A3B8" />
            </View>
        </Pressable>
    );
}

const s = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0F172A',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginHorizontal: 16,
        marginVertical: 10,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 4,
    },
    iconBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(124, 58, 237, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    textWrap: {
        flex: 1,
    },
    eyebrowCapsule: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(124, 58, 237, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 100,
        marginBottom: 3,
    },
    eyebrow: {
        fontSize: 9,
        ...FONT.heavy,
        color: '#C084FC',
        letterSpacing: 0.6,
    },
    description: {
        fontSize: 14,
        ...FONT.bold,
        color: '#F8FAFC',
        marginTop: 1,
    },
    arrowWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
