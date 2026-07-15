import React, { useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, Animated, Pressable, Dimensions, Easing
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Icons from 'lucide-react-native';
import { Sparkles, Trophy, Check, Crown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import usePatientStore from '../../store/usePatientStore';
import { ACHIEVEMENTS, TIER_CONFIG } from '../../constants/achievements';
import CelebrationOverlay from '../ui/CelebrationOverlay';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AchievementCelebration() {
    const newlyUnlockedAchievement = usePatientStore((s) => s.newlyUnlockedAchievement);
    const clearNewlyUnlockedAchievement = usePatientStore((s) => s.clearNewlyUnlockedAchievement);

    const scaleAnim = useRef(new Animated.Value(0)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (newlyUnlockedAchievement) {
            // Trigger Haptic Success
            try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {}

            // Reset animations
            scaleAnim.setValue(0);
            rotateAnim.setValue(0);
            fadeAnim.setValue(0);
            pulseAnim.setValue(1);

            // Animate Modal Content
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 6,
                    tension: 30,
                    useNativeDriver: true,
                }),
                Animated.timing(rotateAnim, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
            ]).start();

            // Setup looping glow pulse
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.08,
                        duration: 1000,
                        easing: Easing.inOut(Easing.quad),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        easing: Easing.inOut(Easing.quad),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }
    }, [newlyUnlockedAchievement]);

    if (!newlyUnlockedAchievement) return null;

    const meta = ACHIEVEMENTS.find(a => a.key === newlyUnlockedAchievement.key) || {};
    const tierInfo = TIER_CONFIG[meta.tier] || TIER_CONFIG.bronze;
    const IconComponent = Icons[meta.iconName] || Trophy;

    const rotation = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['-15deg', '0deg'],
    });

    const handleDismiss = () => {
        try {
            Haptics.selectionAsync();
        } catch (e) {}
        
        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            clearNewlyUnlockedAchievement();
        });
    };

    return (
        <Modal
            visible={!!newlyUnlockedAchievement}
            transparent
            animationType="none"
            onRequestClose={handleDismiss}
        >
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                {/* Backdrop press dismisses modal */}
                <Pressable style={styles.backdrop} onPress={handleDismiss} />
                <CelebrationOverlay active={!!newlyUnlockedAchievement} />

                <Animated.View style={[
                    styles.card,
                    {
                        transform: [
                            { scale: scaleAnim },
                            { rotate: rotation }
                        ]
                    }
                ]}>
                    {/* Glowing outer backdrop circles */}
                    <Animated.View style={[
                        styles.halo,
                        {
                            backgroundColor: tierInfo.color + '12',
                            transform: [{ scale: pulseAnim }],
                        }
                    ]} />
                    <Animated.View style={[
                        styles.innerHalo,
                        {
                            backgroundColor: tierInfo.color + '20',
                        }
                    ]} />

                    {/* Confetti decoration particles */}
                    <View style={styles.sparkleContainer}>
                        <Sparkles size={24} color="#FBBF24" style={styles.sparkle1} />
                        <Sparkles size={18} color={tierInfo.color} style={styles.sparkle2} />
                        <Trophy size={20} color="#FBBF24" fill="#FBBF24" style={styles.sparkle3} />
                    </View>

                    {/* Premium Dual-Ring Large Medal representation */}
                    <View style={[styles.medalOuter, { borderColor: tierInfo.color }]}>
                        <LinearGradient
                            colors={tierInfo.gradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.medalInner}
                        >
                            <IconComponent size={44} color="#FFFFFF" />
                        </LinearGradient>
                        
                        {meta.tier === 'legendary' && (
                            <View style={styles.legendaryCrownWrap}>
                                <Crown size={12} color="#7C3AED" fill="#7C3AED" />
                            </View>
                        )}
                    </View>

                    {/* Celebration labels */}
                    <View style={[styles.ribbon, { backgroundColor: tierInfo.bgColor, borderColor: tierInfo.color + '20' }]}>
                        <Text style={[styles.ribbonTxt, { color: tierInfo.color }]}>
                            {tierInfo.label.toUpperCase()} ACHIEVEMENT UNLOCKED!
                        </Text>
                    </View>

                    {/* Achievement Details */}
                    <Text style={styles.title}>{meta.title || newlyUnlockedAchievement.key}</Text>
                    <Text style={styles.desc}>{meta.description}</Text>

                    <View style={styles.divider} />

                    {/* Unlock Status Confirmation Banner */}
                    <View style={[styles.statusBox, { backgroundColor: tierInfo.bgColor, borderColor: tierInfo.color + '15' }]}>
                        <Check size={16} color={tierInfo.color} strokeWidth={3} />
                        <Text style={[styles.statusTxt, { color: tierInfo.color }]}>ADDED TO YOUR COLLECTION</Text>
                    </View>

                    {/* Action Button */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.btn,
                            pressed && { opacity: 0.95, transform: [{ scale: 0.98 }] }
                        ]}
                        onPress={handleDismiss}
                    >
                        <LinearGradient
                            colors={['#4F46E5', '#6366F1']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <Text style={styles.btnTxt}>Awesome!</Text>
                    </Pressable>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    card: {
        width: SCREEN_WIDTH - 48,
        backgroundColor: '#FFFFFF',
        borderRadius: 32,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 12,
        position: 'relative',
        overflow: 'hidden',
    },
    halo: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        top: 20,
    },
    innerHalo: {
        position: 'absolute',
        width: 150,
        height: 150,
        borderRadius: 75,
        top: 55,
    },
    sparkleContainer: {
        position: 'absolute',
        width: '100%',
        height: 200,
        top: 20,
    },
    sparkle1: {
        position: 'absolute',
        top: 15,
        left: 45,
    },
    sparkle2: {
        position: 'absolute',
        top: 30,
        right: 50,
    },
    sparkle3: {
        position: 'absolute',
        bottom: 10,
        right: 40,
        transform: [{ rotate: '15deg' }],
        opacity: 0.7,
    },
    medalOuter: {
        width: 108,
        height: 108,
        borderRadius: 54,
        borderWidth: 3,
        padding: 5,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 6,
    },
    medalInner: {
        width: '100%',
        height: '100%',
        borderRadius: 45,
        alignItems: 'center',
        justifyContent: 'center',
    },
    legendaryCrownWrap: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: '#FBBF24',
        borderRadius: 12,
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
    },
    ribbon: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
    },
    ribbonTxt: {
        fontSize: 9.5,
        fontWeight: '900',
        letterSpacing: 1,
    },
    title: {
        fontSize: 22,
        fontWeight: '900',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    desc: {
        fontSize: 14,
        fontWeight: '550',
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 16,
    },
    divider: {
        width: '100%',
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 20,
    },
    statusBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 24,
    },
    statusTxt: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.8,
    },
    btn: {
        width: '100%',
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
    },
    btnTxt: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
});
