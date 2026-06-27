import React, { useState, useEffect } from 'react';
import {
    Modal, View, Text, StyleSheet, Pressable, Animated, Platform
} from 'react-native';
import { X, ChevronRight } from 'lucide-react-native';
import { colors } from '../../theme';
import { useReduceMotion } from '../../theme/motion';
import { HapticPatterns } from '../../utils/haptics';
import { TourService } from '../../lib/TourService';

export default function GuidedTour({
    visible,
    steps = [],
    scrollRef,
    tourKey,
    onClose
}) {
    const [activeStep, setActiveStep] = useState(0);
    const reduceMotion = useReduceMotion();

    useEffect(() => {
        if (visible) {
            setActiveStep(0);
            // Always scroll to the first step on start
            if (steps.length > 0 && scrollRef?.current) {
                scrollRef.current.scrollTo({ y: steps[0].scrollOffset, animated: !reduceMotion });
            }
        }
    }, [visible, steps]);

    if (!visible || steps.length === 0) return null;

    const stepData = steps[activeStep];
    if (!stepData) return null;

    const Icon = stepData.icon;

    const handleNext = async () => {
        HapticPatterns.selection();
        if (activeStep < steps.length - 1) {
            const nextStep = activeStep + 1;
            setActiveStep(nextStep);
            if (scrollRef?.current) {
                scrollRef.current.scrollTo({ y: steps[nextStep].scrollOffset, animated: !reduceMotion });
            }
        } else {
            // Save completion to registry and close
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
        <Modal transparent visible={visible} animationType="fade">
            <View style={s.wtOverlay}>
                {/* Spotlight highlight borders depending on active step */}
                {stepData.spotlightTop !== undefined && (
                    <View
                        style={[
                            s.wtSpotlight,
                            {
                                top: stepData.spotlightTop,
                                height: stepData.spotlightHeight || 100,
                                left: 16,
                                right: 16
                            }
                        ]}
                        pointerEvents="none"
                    />
                )}

                {/* Tooltip Card */}
                <View
                    style={[
                        s.wtCard,
                        stepData.tooltipBottom !== undefined
                            ? { bottom: stepData.tooltipBottom }
                            : { top: stepData.tooltipTop || (Platform.OS === 'ios' ? 390 : 370) }
                    ]}
                >
                    {stepData.arrowDirection === 'down' ? (
                        <View style={[
                            s.wtCardArrowDown,
                            stepData.arrowLeft !== undefined ? { left: stepData.arrowLeft, marginLeft: 0 } : { left: '50%', marginLeft: -8 }
                        ]} />
                    ) : (
                        <View style={[
                            s.wtCardArrowUp,
                            stepData.arrowLeft !== undefined ? { left: stepData.arrowLeft, marginLeft: 0 } : { left: '50%', marginLeft: -8 }
                        ]} />
                    )}

                    <View style={s.wtCardHeader}>
                        <View style={[s.wtIconWrap, { backgroundColor: (stepData.iconColor || colors.primary) + '15' }]}>
                            {Icon && <Icon size={22} color={stepData.iconColor || colors.primary} strokeWidth={2.5} />}
                        </View>
                        <Text style={s.wtTitle}>{stepData.title}</Text>
                        <Pressable onPress={handleSkip} style={s.wtSkipBtn} hitSlop={10}>
                            <Text style={s.wtSkipText}>Skip</Text>
                        </Pressable>
                    </View>

                    <Text style={s.wtDesc}>{stepData.desc}</Text>

                    {/* Bottom Actions and Progress Dots */}
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

                        <Pressable style={s.wtNextBtn} onPress={handleNext} hitSlop={10}>
                            <Text style={s.wtNextText}>
                                {activeStep === steps.length - 1 ? 'Got It' : 'Next'}
                            </Text>
                            <ChevronRight size={14} color="#FFF" strokeWidth={3} />
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    wtOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.75)', // Semi-transparent slate
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    wtSpotlight: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: colors.primary,
        borderStyle: 'dashed',
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 15,
        elevation: 10,
    },
    wtCard: {
        position: 'absolute',
        left: 20,
        right: 20,
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
    wtCardArrowUp: {
        position: 'absolute',
        top: -8,
        left: 48,
        width: 16,
        height: 16,
        backgroundColor: '#FFFFFF',
        borderLeftWidth: 1,
        borderTopWidth: 1,
        borderColor: '#E2E8F0',
        transform: [{ rotate: '45deg' }],
        zIndex: 5,
    },
    wtCardArrowDown: {
        position: 'absolute',
        bottom: -8,
        left: 48,
        width: 16,
        height: 16,
        backgroundColor: '#FFFFFF',
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#E2E8F0',
        transform: [{ rotate: '45deg' }],
        zIndex: 5,
    },
});
