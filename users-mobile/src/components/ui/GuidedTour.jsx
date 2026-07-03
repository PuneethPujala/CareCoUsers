import React, { useState, useEffect, useRef } from 'react';
import {
    Modal, View, Text, StyleSheet, Pressable, Animated, Dimensions
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors } from '../../theme';
import { HapticPatterns } from '../../utils/haptics';
import { TourService } from '../../lib/TourService';

export default function GuidedTour({
    visible,
    steps = [],
    tourKey,
    onClose
}) {
    const [activeStep, setActiveStep] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const cardFade = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!visible) {
            setActiveStep(0);
        }
    }, [visible]);

    if (!visible || steps.length === 0) return null;

    const stepData = steps[activeStep];
    if (!stepData) return null;

    const Icon = stepData.icon;

    const handleNext = async () => {
        HapticPatterns.selection();
        if (activeStep < steps.length - 1) {
            setIsTransitioning(true);
            Animated.timing(cardFade, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }).start(() => {
                const nextStep = activeStep + 1;
                setActiveStep(nextStep);
                Animated.timing(cardFade, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => setIsTransitioning(false));
            });
        } else {
            if (tourKey) {
                await TourService.markTourSeen(tourKey);
            }
            if (onClose) onClose();
        }
    };

    const handleSkip = async () => {
        HapticPatterns.selection();
        if (tourKey) {
            await TourService.markTourSeen(tourKey);
        }
        if (onClose) onClose();
    };

    return (
        <Modal transparent visible={visible} animationType="fade" statusBarTranslucent={true}>
            <View style={s.wtOverlay}>
                <Animated.View
                    style={[s.wtCard, { opacity: cardFade }]}
                    pointerEvents={isTransitioning ? 'none' : 'auto'}
                >
                    <View style={s.wtCardHeader}>
                        <View style={[s.wtIconWrap, { backgroundColor: (stepData.iconColor || colors.primary) + '15' }]}>
                            {Icon && <Icon size={22} color={stepData.iconColor || colors.primary} strokeWidth={2.5} />}
                        </View>
                        <Text style={s.wtTitle}>{stepData.title}</Text>
                        <Pressable onPress={handleSkip} style={s.wtSkipBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Text style={s.wtSkipText}>Skip</Text>
                        </Pressable>
                    </View>

                    <Text style={s.wtDesc}>{stepData.desc}</Text>

                    <View style={s.wtFooter}>
                        <View style={s.wtDots}>
                            {steps.map((_, i) => (
                                <View
                                    key={i}
                                    style={[
                                        s.wtDot,
                                        activeStep === i && s.wtDotActive,
                                        { backgroundColor: activeStep === i ? colors.primary : '#CBD5E1' }
                                    ]}
                                />
                            ))}
                        </View>

                        <Pressable style={s.wtNextBtn} onPress={handleNext} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Text style={s.wtNextText}>
                                {activeStep === steps.length - 1 ? 'Got It' : 'Next'}
                            </Text>
                            <ChevronRight size={14} color="#FFF" strokeWidth={3} />
                        </Pressable>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    wtOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    wtCard: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    wtCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    wtIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    wtTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.textPrimary,
        flex: 1,
    },
    wtSkipBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: '#F1F5F9',
    },
    wtSkipText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    wtDesc: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textMuted,
        lineHeight: 22,
        marginBottom: 20,
    },
    wtFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    wtDots: {
        flexDirection: 'row',
        gap: 6,
    },
    wtDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    wtDotActive: {
        width: 18,
    },
    wtNextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.primary,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 100,
    },
    wtNextText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFF',
    },
});
