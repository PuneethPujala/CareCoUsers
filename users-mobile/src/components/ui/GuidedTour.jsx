import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Modal, View, Text, StyleSheet, Pressable, Animated, Platform, Dimensions, findNodeHandle
} from 'react-native';
import Svg, { Defs, Mask, Rect as SvgRect } from 'react-native-svg';
import { ChevronRight } from 'lucide-react-native';
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
    const [spotlightCoords, setSpotlightCoords] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const reduceMotion = useReduceMotion();
    const cardFade = useRef(new Animated.Value(1)).current;
    const timeoutsRef = useRef([]);

    const setTrackedTimeout = useCallback((fn, delay) => {
        const id = setTimeout(fn, delay);
        timeoutsRef.current.push(id);
        return id;
    }, []);

    useEffect(() => {
        return () => {
            timeoutsRef.current.forEach(clearTimeout);
        };
    }, []);

    /**
     * Attempt to measure a ref's on-screen position.
     * Uses measureLayout (relative to scrollRef) first for scrolling,
     * then falls back to measure() for global pageX/pageY coordinates.
     */
    const measureStep = useCallback((stepData) => {
        if (!stepData) return;

        const doGlobalMeasure = () => {
            if (stepData.ref?.current) {
                stepData.ref.current.measure((mx, my, mwidth, mheight, pageX, pageY) => {
                    if (mwidth > 0 && mheight > 0) {
                        setSpotlightCoords({
                            top: pageY,
                            height: mheight,
                            left: pageX || 16,
                            width: mwidth || (Dimensions.get('window').width - 32)
                        });
                    } else {
                        applyStaticFallback(stepData);
                    }
                });
            } else {
                applyStaticFallback(stepData);
            }
        };

        const applyStaticFallback = (sd) => {
            setSpotlightCoords(sd.spotlightTop !== undefined ? {
                top: sd.spotlightTop,
                height: sd.spotlightHeight || 100,
                left: 16,
                width: Dimensions.get('window').width - 32
            } : null);
        };

        // Try scrolling to the target element first
        if (stepData.ref?.current && scrollRef?.current) {
            try {
                stepData.ref.current.measureLayout(
                    findNodeHandle(scrollRef.current),
                    (x, y, width, height) => {
                        scrollRef.current.scrollTo({ y: Math.max(0, y - 20), animated: !reduceMotion });
                        setTrackedTimeout(doGlobalMeasure, 350);
                    },
                    () => {
                        if (stepData.scrollOffset !== undefined && scrollRef?.current) {
                            scrollRef.current.scrollTo({ y: stepData.scrollOffset, animated: !reduceMotion });
                        }
                        setTrackedTimeout(doGlobalMeasure, 350);
                    }
                );
            } catch {
                setTrackedTimeout(doGlobalMeasure, 100);
            }
        } else {
            if (stepData.scrollOffset !== undefined && scrollRef?.current) {
                scrollRef.current.scrollTo({ y: stepData.scrollOffset, animated: !reduceMotion });
            }
            setTrackedTimeout(doGlobalMeasure, 300);
        }
    }, [scrollRef, reduceMotion, setTrackedTimeout]);

    // Measure spotlight whenever the active step or visibility changes
    useEffect(() => {
        if (visible && steps.length > 0) {
            const stepData = steps[activeStep];
            measureStep(stepData);
        } else {
            setActiveStep(0);
            setSpotlightCoords(null);
        }
    }, [visible, activeStep, steps, measureStep]);

    if (!visible || steps.length === 0) return null;

    const stepData = steps[activeStep];
    if (!stepData) return null;

    const Icon = stepData.icon;

    const handleNext = async () => {
        HapticPatterns.selection();
        if (activeStep < steps.length - 1) {
            setIsTransitioning(true);
            setSpotlightCoords(null);
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

    const getCardStyle = () => {
        if (stepData.tooltipBottom !== undefined) return { bottom: stepData.tooltipBottom };
        if (stepData.tooltipTop !== undefined) return { top: stepData.tooltipTop };
        if (spotlightCoords) {
            const screenHeight = Dimensions.get('window').height;
            const spotlightBottom = spotlightCoords.top + spotlightCoords.height;
            if (spotlightCoords.top > screenHeight / 2 - 50) {
                return { bottom: screenHeight - spotlightCoords.top + 16 };
            } else {
                return { top: spotlightBottom + 16 };
            }
        }
        return { position: 'relative', alignSelf: 'center', width: Dimensions.get('window').width - 40 };
    };

    const cardStyle = getCardStyle();
    const showArrowUp = cardStyle.top !== undefined;

    return (
        <Modal transparent visible={visible} animationType="fade" statusBarTranslucent={true}>
            <View style={[s.wtOverlay, !spotlightCoords && s.wtOverlayCentered]}>
                {spotlightCoords ? (
                    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                        <Defs>
                            <Mask id="spotlightMask">
                                <SvgRect width="100%" height="100%" fill="white" />
                                <SvgRect
                                    x={spotlightCoords.left}
                                    y={spotlightCoords.top}
                                    width={spotlightCoords.width}
                                    height={spotlightCoords.height}
                                    rx={24}
                                    fill="black"
                                />
                            </Mask>
                        </Defs>
                        <SvgRect
                            width="100%"
                            height="100%"
                            fill="rgba(15, 23, 42, 0.75)"
                            mask="url(#spotlightMask)"
                        />
                    </Svg>
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15, 23, 42, 0.75)' }]} pointerEvents="none" />
                )}

                {/* Spotlight highlight border */}
                {spotlightCoords && (
                    <View
                        style={[
                            s.wtSpotlight,
                            {
                                top: spotlightCoords.top,
                                height: spotlightCoords.height,
                                left: spotlightCoords.left,
                                width: spotlightCoords.width
                            }
                        ]}
                        pointerEvents="none"
                    />
                )}

                {/* Tooltip Card */}
                <Animated.View
                    style={[s.wtCard, cardStyle, { opacity: cardFade }]}
                    pointerEvents={isTransitioning ? 'none' : 'auto'}
                >
                    {spotlightCoords && (showArrowUp ? (
                        <View style={[
                            s.wtCardArrowUp,
                            stepData.arrowLeft !== undefined ? { left: stepData.arrowLeft, marginLeft: 0 } : { left: '50%', marginLeft: -8 }
                        ]} />
                    ) : (
                        <View style={[
                            s.wtCardArrowDown,
                            stepData.arrowLeft !== undefined ? { left: stepData.arrowLeft, marginLeft: 0 } : { left: '50%', marginLeft: -8 }
                        ]} />
                    ))}

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
    },
    wtOverlayCentered: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
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
