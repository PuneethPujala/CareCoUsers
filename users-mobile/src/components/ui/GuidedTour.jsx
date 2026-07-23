import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Modal, View, Text, StyleSheet, Pressable, Animated, Platform, Dimensions, Easing
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
    const [arrowConfig, setArrowConfig] = useState({ isUp: true, arrowLeft: 48 });
    const [isTransitioning, setIsTransitioning] = useState(false);
    const reduceMotion = useReduceMotion();
    const cardFade = useRef(new Animated.Value(1)).current;
    const cardContentFade = useRef(new Animated.Value(1)).current;
    const timeoutsRef = useRef([]);

    // Animated values for continuous 60fps morphing between steps
    const animSpotTop = useRef(new Animated.Value(0)).current;
    const animSpotLeft = useRef(new Animated.Value(0)).current;
    const animSpotWidth = useRef(new Animated.Value(0)).current;
    const animSpotHeight = useRef(new Animated.Value(0)).current;
    const animCardTop = useRef(new Animated.Value(0)).current;
    const animCardLeft = useRef(new Animated.Value(20)).current;
    const animArrowLeft = useRef(new Animated.Value(48)).current;
    const animOpacity = useRef(new Animated.Value(0)).current;
    const isFirstMeasureRef = useRef(true);

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
     * Animate spotlight cutout, card position, and arrow alignment to new target coordinates
     */
    const animateToCoords = useCallback((coords, isUp, arrowLeft) => {
        if (!coords) return;

        const screenWidth = Dimensions.get('window').width;
        const screenHeight = Dimensions.get('window').height;

        const pad = coords.padding || 8;
        const spotTop = Math.max(0, coords.top - pad);
        const spotLeft = Math.max(0, coords.left - pad);
        const spotWidth = Math.min(screenWidth, coords.width + pad * 2);
        const spotHeight = coords.height + pad * 2;

        const cardWidth = Math.min(screenWidth - 32, 340);
        const targetCenterX = coords.left + coords.width / 2;
        const cardLeft = Math.max(16, Math.min(targetCenterX - cardWidth / 2, screenWidth - cardWidth - 16));
        const computedArrowLeft = Math.max(24, Math.min(targetCenterX - cardLeft - 8, cardWidth - 40));

        let cardTop;
        if (isUp) {
            cardTop = spotTop + spotHeight + 14;
        } else {
            cardTop = Math.max(20, spotTop - 160);
        }

        setArrowConfig({ isUp, arrowLeft: computedArrowLeft });

        if (isFirstMeasureRef.current || reduceMotion) {
            animSpotTop.setValue(spotTop);
            animSpotLeft.setValue(spotLeft);
            animSpotWidth.setValue(spotWidth);
            animSpotHeight.setValue(spotHeight);
            animCardTop.setValue(cardTop);
            animCardLeft.setValue(cardLeft);
            animArrowLeft.setValue(computedArrowLeft);
            animOpacity.setValue(1);
            isFirstMeasureRef.current = false;
        } else {
            Animated.parallel([
                Animated.timing(animSpotTop, { toValue: spotTop, duration: 320, easing: Easing.bezier(0.22, 0.98, 0.34, 1), useNativeDriver: false }),
                Animated.timing(animSpotLeft, { toValue: spotLeft, duration: 320, easing: Easing.bezier(0.22, 0.98, 0.34, 1), useNativeDriver: false }),
                Animated.timing(animSpotWidth, { toValue: spotWidth, duration: 320, easing: Easing.bezier(0.22, 0.98, 0.34, 1), useNativeDriver: false }),
                Animated.timing(animSpotHeight, { toValue: spotHeight, duration: 320, easing: Easing.bezier(0.22, 0.98, 0.34, 1), useNativeDriver: false }),
                Animated.timing(animCardTop, { toValue: cardTop, duration: 320, easing: Easing.bezier(0.22, 0.98, 0.34, 1), useNativeDriver: false }),
                Animated.timing(animCardLeft, { toValue: cardLeft, duration: 320, easing: Easing.bezier(0.22, 0.98, 0.34, 1), useNativeDriver: false }),
                Animated.timing(animArrowLeft, { toValue: computedArrowLeft, duration: 320, easing: Easing.bezier(0.22, 0.98, 0.34, 1), useNativeDriver: false }),
                Animated.timing(animOpacity, { toValue: 1, duration: 250, useNativeDriver: false }),
            ]).start();
        }
    }, [animSpotTop, animSpotLeft, animSpotWidth, animSpotHeight, animCardTop, animCardLeft, animArrowLeft, animOpacity, reduceMotion]);

    /**
     * Measure step target using measureInWindow with retry pass & scroll offset
     */
    const measureStep = useCallback((stepData, attempt = 0) => {
        if (!stepData) return;

        const applyStaticFallback = (sd) => {
            const screenWidth = Dimensions.get('window').width;
            if (sd && sd.spotlightTop !== undefined) {
                const fallbackCoords = {
                    top: sd.spotlightTop,
                    height: sd.spotlightHeight || 100,
                    left: 16,
                    width: screenWidth - 32
                };
                setSpotlightCoords(fallbackCoords);
                animateToCoords(fallbackCoords, true, 48);
            } else {
                setSpotlightCoords(null);
            }
        };

        const doWindowMeasure = () => {
            if (stepData.ref?.current) {
                if (stepData.ref.current.measureInWindow) {
                    stepData.ref.current.measureInWindow((x, y, mwidth, mheight) => {
                        if (mwidth > 0 && mheight > 0) {
                            const coords = {
                                top: y,
                                height: mheight,
                                left: x > 0 ? x : 16,
                                width: mwidth
                            };
                            setSpotlightCoords(coords);
                            const screenHeight = Dimensions.get('window').height;
                            const isUp = stepData.arrow === 'top' || (y < screenHeight / 2 - 20 && stepData.arrow !== 'bottom');
                            animateToCoords(coords, isUp, 48);
                        } else if (attempt < 4) {
                            setTrackedTimeout(() => measureStep(stepData, attempt + 1), 60);
                        } else {
                            applyStaticFallback(stepData);
                        }
                    });
                } else if (stepData.ref.current.measure) {
                    stepData.ref.current.measure((mx, my, mwidth, mheight, pageX, pageY) => {
                        if (mwidth > 0 && mheight > 0) {
                            const coords = {
                                top: pageY,
                                height: mheight,
                                left: pageX || 16,
                                width: mwidth
                            };
                            setSpotlightCoords(coords);
                            const screenHeight = Dimensions.get('window').height;
                            const isUp = stepData.arrow === 'top' || (pageY < screenHeight / 2 - 20 && stepData.arrow !== 'bottom');
                            animateToCoords(coords, isUp, 48);
                        } else {
                            applyStaticFallback(stepData);
                        }
                    });
                } else {
                    applyStaticFallback(stepData);
                }
            } else {
                applyStaticFallback(stepData);
            }
        };

        // Handle auto-scroll if scrollRef and offset/ref are provided
        if (stepData.scrollOffset !== undefined && scrollRef?.current) {
            scrollRef.current.scrollTo({ y: stepData.scrollOffset, animated: !reduceMotion });
            setTrackedTimeout(doWindowMeasure, 250);
        } else if (stepData.ref?.current && scrollRef?.current) {
            try {
                if (stepData.ref.current.measureLayout) {
                    stepData.ref.current.measureLayout(
                        scrollRef.current,
                        (x, y) => {
                            scrollRef.current.scrollTo({ y: Math.max(0, y - 40), animated: !reduceMotion });
                            setTrackedTimeout(doWindowMeasure, 250);
                        },
                        () => setTrackedTimeout(doWindowMeasure, 100)
                    );
                } else {
                    setTrackedTimeout(doWindowMeasure, 100);
                }
            } catch {
                setTrackedTimeout(doWindowMeasure, 100);
            }
        } else {
            setTrackedTimeout(doWindowMeasure, 100);
        }
    }, [scrollRef, reduceMotion, setTrackedTimeout, animateToCoords]);

    // Measure spotlight whenever the active step or visibility changes
    useEffect(() => {
        if (visible && steps.length > 0) {
            const stepData = steps[activeStep];
            measureStep(stepData);
        } else {
            setActiveStep(0);
            setSpotlightCoords(null);
            isFirstMeasureRef.current = true;
            animOpacity.setValue(0);
        }
    }, [visible, activeStep, steps, measureStep, animOpacity]);

    if (!visible || steps.length === 0) return null;

    const stepData = steps[activeStep];
    if (!stepData) return null;

    const Icon = stepData.icon;

    const handleNext = async () => {
        HapticPatterns.selection();
        if (activeStep < steps.length - 1) {
            setIsTransitioning(true);
            Animated.timing(cardContentFade, {
                toValue: 0,
                duration: 120,
                useNativeDriver: true,
            }).start(() => {
                const nextStep = activeStep + 1;
                setActiveStep(nextStep);
                Animated.timing(cardContentFade, {
                    toValue: 1,
                    duration: 180,
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
            <View style={[s.wtOverlay, !spotlightCoords && s.wtOverlayCentered]}>
                {spotlightCoords ? (
                    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                        <Defs>
                            <Mask id="spotlightMask">
                                <SvgRect width="100%" height="100%" fill="white" />
                                <SvgRect
                                    x={spotlightCoords.left - (stepData.padding || 8)}
                                    y={spotlightCoords.top - (stepData.padding || 8)}
                                    width={spotlightCoords.width + (stepData.padding || 8) * 2}
                                    height={spotlightCoords.height + (stepData.padding || 8) * 2}
                                    rx={stepData.borderRadius || 20}
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

                {/* Animated Spotlight highlight border ring */}
                {spotlightCoords && (
                    <Animated.View
                        style={[
                            s.wtSpotlight,
                            {
                                top: animSpotTop,
                                left: animSpotLeft,
                                width: animSpotWidth,
                                height: animSpotHeight,
                                opacity: animOpacity,
                                borderRadius: stepData.borderRadius || 20,
                            }
                        ]}
                        pointerEvents="none"
                    />
                )}

                {/* Dynamic Tooltip Card */}
                <Animated.View
                    style={[
                        s.wtCard,
                        spotlightCoords ? {
                            position: 'absolute',
                            top: animCardTop,
                            left: animCardLeft,
                            width: Math.min(Dimensions.get('window').width - 32, 340),
                        } : {
                            position: 'relative',
                            alignSelf: 'center',
                            width: Dimensions.get('window').width - 40,
                        },
                        { opacity: cardFade }
                    ]}
                    pointerEvents={isTransitioning ? 'none' : 'auto'}
                >
                    {spotlightCoords && (
                        <Animated.View
                            style={[
                                arrowConfig.isUp ? s.wtCardArrowUp : s.wtCardArrowDown,
                                { left: animArrowLeft }
                            ]}
                        />
                    )}

                    <Animated.View style={{ opacity: cardContentFade }}>
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
        borderWidth: 2.5,
        borderColor: colors.primary,
        borderStyle: 'solid',
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 12,
        elevation: 10,
    },
    wtCard: {
        position: 'absolute',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 12,
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
        fontSize: 17,
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
        fontSize: 13.5,
        fontWeight: '500',
        color: colors.textMuted,
        lineHeight: 21,
        marginBottom: 18,
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

