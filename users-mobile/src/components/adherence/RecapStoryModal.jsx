import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    Modal, View, Text, StyleSheet, Pressable, Animated, Dimensions,
    ScrollView, Share, Platform, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Share2, ChevronLeft, ChevronRight, Flame, Pill, Sunrise, Sun, Moon, Trophy, Heart, Sparkles } from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { HapticPatterns } from '../../utils/haptics';

const { width: SW, height: SH } = Dimensions.get('window');
const SLIDE_COUNT = 7;
const SLIDE_DURATION = 4000; // 4 seconds per slide (video-like)

const SLIDE_GRADIENTS = [
    ['#FF416C', '#FF4B2B'], // Vibrant Red/Pink
    ['#1D976C', '#93F9B9'], // Spotify-ish Green
    ['#4776E6', '#8E54E9'], // Deep Purple/Blue
    ['#F2994A', '#F2C94C'], // Sunny Yellow/Orange
    ['#00B4DB', '#0083B0'], // Aqua Blue
    ['#DA22FF', '#9733EE'], // Neon Violet
    ['#FF0099', '#493240'], // Cyberpunk Pink
];

const AnimatedCounter = ({ value, suffix = '', style }) => {
    const anim = useRef(new Animated.Value(0)).current;
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        anim.setValue(0);
        const listener = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
        Animated.timing(anim, { toValue: value || 0, duration: 1200, useNativeDriver: false }).start();
        return () => anim.removeListener(listener);
    }, [value]);

    return <Text style={style}>{display}{suffix}</Text>;
};

const ProgressRing = ({ progress = 0, size = 180, strokeWidth = 18 }) => {
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute' }}>
                <View style={{
                    width: size, height: size, borderRadius: size / 2,
                    borderWidth: strokeWidth, borderColor: 'rgba(0,0,0,0.15)',
                }} />
            </View>
            <View style={{ position: 'absolute' }}>
                <View style={{
                    width: size, height: size, borderRadius: size / 2,
                    borderWidth: strokeWidth, borderColor: '#FFF',
                    borderTopColor: progress > 25 ? '#FFF' : 'transparent',
                    borderRightColor: progress > 50 ? '#FFF' : 'transparent',
                    borderBottomColor: progress > 75 ? '#FFF' : 'transparent',
                    borderLeftColor: progress > 0 ? '#FFF' : 'transparent',
                    transform: [{ rotate: '-90deg' }],
                }} />
            </View>
            <AnimatedCounter value={progress} suffix="%" style={s.ringText} />
        </View>
    );
};

const TIME_LABELS = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };
const TIME_EMOJIS = { morning: '🌅', afternoon: '☀️', night: '🌙' };

export default function RecapStoryModal({ visible, onClose, recap, period = 'weekly' }) {
    const scrollRef = useRef(null);
    const viewShotRefs = useRef([...Array(SLIDE_COUNT)].map(() => React.createRef())).current;
    const shareCardRef = useRef(null);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);
    const [isSharing, setIsSharing] = useState(false);
    const fadeAnims = useRef([...Array(SLIDE_COUNT)].map(() => new Animated.Value(0))).current;
    const progressAnims = useRef([...Array(SLIDE_COUNT)].map(() => new Animated.Value(0))).current;
    const autoPlayTimer = useRef(null);

    const periodLabel = period === 'yearly' && recap?.is_all_time_fallback ? 'All-Time' : period === 'yearly' ? 'Yearly' : period === 'monthly' ? 'Monthly' : 'Weekly';

    // ── Auto-play logic (Instagram Stories style) ──
    useEffect(() => {
        if (visible) {
            setCurrentSlide(0);
            setIsAutoPlaying(true);
            scrollRef.current?.scrollTo({ x: 0, animated: false });
            progressAnims.forEach(a => a.setValue(0));
            animateSlide(0);
            startAutoPlay(0);
        } else {
            stopAutoPlay();
        }
        return () => stopAutoPlay();
    }, [visible]);

    const startAutoPlay = (fromSlide) => {
        stopAutoPlay();
        // Animate progress bar for current slide
        progressAnims[fromSlide].setValue(0);
        Animated.timing(progressAnims[fromSlide], {
            toValue: 1, duration: SLIDE_DURATION, useNativeDriver: false,
        }).start(({ finished }) => {
            if (finished && fromSlide < SLIDE_COUNT - 1) {
                const next = fromSlide + 1;
                goToSlide(next, true);
            } else if (finished) {
                setIsAutoPlaying(false);
            }
        });
    };

    const stopAutoPlay = () => {
        if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
        progressAnims.forEach(a => a.stopAnimation());
    };

    const animateSlide = useCallback((idx) => {
        fadeAnims.forEach(a => a.setValue(0));
        Animated.spring(fadeAnims[idx], { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }).start();
    }, [fadeAnims]);

    const goToSlide = (idx, fromAutoPlay = false) => {
        if (idx < 0 || idx >= SLIDE_COUNT) return;
        if (!fromAutoPlay) {
            stopAutoPlay();
            setIsAutoPlaying(false);
        }
        setCurrentSlide(idx);
        scrollRef.current?.scrollTo({ x: idx * SW, animated: true });
        if (idx === 2) {
            HapticPatterns.milestone();
        }
        animateSlide(idx);
        // Fill previous progress bars, reset future ones
        progressAnims.forEach((a, i) => {
            if (i < idx) a.setValue(1);
            else if (i > idx) a.setValue(0);
        });
        if (fromAutoPlay || isAutoPlaying) startAutoPlay(idx);
    };

    const handleScroll = (e) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
        if (idx !== currentSlide && idx >= 0 && idx < SLIDE_COUNT) {
            stopAutoPlay();
            setIsAutoPlaying(false);
            setCurrentSlide(idx);
            if (idx === 2) {
                HapticPatterns.milestone();
            }
            animateSlide(idx);
            progressAnims.forEach((a, i) => {
                if (i < idx) a.setValue(1);
                else if (i > idx) a.setValue(0);
                else a.setValue(0);
            });
        }
    };

    const handleShare = async () => {
        try {
            setIsSharing(true);
            stopAutoPlay();
            
            if (shareCardRef.current) {
                // Add a small delay to ensure the hidden component has fully rendered off-screen
                await new Promise(r => setTimeout(r, 100));
                const uri = await shareCardRef.current.capture();
                
                const isAvailable = await Sharing.isAvailableAsync();
                if (isAvailable) {
                    await Sharing.shareAsync(uri, {
                        dialogTitle: `${periodLabel} Health Recap`,
                        mimeType: 'image/png'
                    });
                } else {
                    await Share.share({
                        message: `My ${periodLabel} Health Recap 💙\n${recap?.adherence_rate || 0}% adherence | ${recap?.streak_current || 0} day streak\n#CareMyMed #HealthJourney`
                    });
                }
            }
        } catch (err) {
            console.warn('Share error:', err);
        } finally {
            setIsSharing(false);
        }
    };

    if (!visible || !recap) return null;

    const r = recap;
    const bestTime = r.most_consistent_time || 'morning';

    const makeSlideAnim = (idx) => ({
        opacity: fadeAnims[idx],
        transform: [{
            translateY: fadeAnims[idx].interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
        }, {
            scale: fadeAnims[idx].interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
        }],
    });

    const BrandBadge = () => (
        <View style={s.brandBadge}>
            <Heart size={14} color="#FFF" />
            <Text style={s.brandText}>CareMyMed</Text>
        </View>
    );

    const renderSlide = (idx) => {
        const grad = SLIDE_GRADIENTS[idx];
        let content;

        switch (idx) {
            case 0:
                content = (
                    <Animated.View style={[s.slideContent, s.slideLeftAlign, makeSlideAnim(0)]}>
                        <BrandBadge />
                        <Text style={s.introTitle} adjustsFontSizeToFit numberOfLines={3}>YOUR{"\n"}HEALTH{"\n"}WRAPPED</Text>
                        <View style={s.datePill}>
                            <Text style={s.datePillText}>{r.date_range?.start} — {r.date_range?.end}</Text>
                        </View>
                        <Text style={s.introHint}>Tap to reveal →</Text>
                    </Animated.View>
                );
                break;
            case 1:
                content = (
                    <Animated.View style={[s.slideContent, makeSlideAnim(1)]}>
                        <View style={s.cardPanel}>
                            <Text style={s.slideLabel}>ADHERENCE SCORE</Text>
                            <ProgressRing progress={r.adherence_rate || 0} />
                            <Text style={s.slideTitleAlt} adjustsFontSizeToFit numberOfLines={2}>
                                {r.adherence_rate >= 90 ? 'Outstanding.' : r.adherence_rate >= 70 ? 'Great Work.' : 'Keep It Up.'}
                            </Text>
                            {r.improvement_vs_previous !== 0 && (
                                <View style={s.changeBadge}>
                                    <Text style={s.changeText}>
                                        {r.improvement_vs_previous > 0 ? '↑' : '↓'} {Math.abs(r.improvement_vs_previous)}% vs last {period}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                );
                break;
            case 2:
                content = (
                    <Animated.View style={[s.slideContent, s.slideLeftAlign, makeSlideAnim(2)]}>
                        <Text style={[s.slideLabel, { textAlign: 'left', marginBottom: -20 }]}>ON FIRE</Text>
                        <AnimatedCounter value={r.streak_current || 0} style={s.megaStat} />
                        <Text style={s.slideTitleAlt}>Day Streak.</Text>
                        <View style={s.pillBadge}>
                            <Flame size={16} color="#000" fill="#000" />
                            <Text style={s.pillBadgeText}>Best: {r.streak_best || 0} days</Text>
                        </View>
                    </Animated.View>
                );
                break;
            case 3:
                content = (
                    <Animated.View style={[s.slideContent, makeSlideAnim(3)]}>
                        <Pill size={48} color="#FFF" style={{ marginBottom: 16 }} />
                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                            <AnimatedCounter value={r.total_doses_taken || 0} style={s.bigStat} />
                            <Text style={s.bigStatSub}> / {r.total_doses_scheduled || 0}</Text>
                        </View>
                        <Text style={s.slideLabel}>DOSES TAKEN</Text>
                        <Text style={s.slideCaption}>{r.perfect_days || 0} perfect days this {period}</Text>
                    </Animated.View>
                );
                break;
            case 4:
                content = (
                    <Animated.View style={[s.slideContent, makeSlideAnim(4)]}>
                        <Text style={s.bigEmoji}>{TIME_EMOJIS[bestTime]}</Text>
                        <Text style={s.slideTitle} adjustsFontSizeToFit numberOfLines={2}>{TIME_LABELS[bestTime]}{'\n'}Champion</Text>
                        <Text style={s.slideCaption}>Your most consistent time slot</Text>
                    </Animated.View>
                );
                break;
            case 5:
                content = (
                    <Animated.View style={[s.slideContent, makeSlideAnim(5)]}>
                        <Text style={s.bigEmoji}>{r.level?.emoji || '🌱'}</Text>
                        <Text style={s.slideTitle} adjustsFontSizeToFit numberOfLines={2}>You're{'\n'}{r.level?.label || 'Growing'}</Text>
                        <Text style={s.slideCaption}>{r.badges_earned || 0} badges earned</Text>
                        {r.top_medication && (
                            <View style={s.topMedBadge}>
                                <Trophy size={14} color="#FDE68A" />
                                <Text style={s.topMedText}>Top: {r.top_medication.name} ({r.top_medication.rate}%)</Text>
                            </View>
                        )}
                    </Animated.View>
                );
                break;
            case 6:
                content = (
                    <Animated.View style={[s.slideContent, makeSlideAnim(6)]}>
                        <Sparkles size={40} color="#FDE68A" style={{ marginBottom: 16 }} />
                        <Text style={s.slideTitle} adjustsFontSizeToFit numberOfLines={3}>{r.motivational_message || 'Keep going! 💙'}</Text>
                        <BrandBadge />
                        <Pressable style={s.shareBtn} onPress={handleShare} disabled={isSharing}>
                            <Share2 size={18} color="#0F172A" />
                            <Text style={s.shareBtnText}>{isSharing ? 'Capturing...' : 'Share Story'}</Text>
                        </Pressable>
                    </Animated.View>
                );
                break;
        }

        return (
            <View key={idx} style={{ width: SW, height: '100%', overflow: 'hidden' }}>
                <ViewShot ref={viewShotRefs[idx]} style={StyleSheet.absoluteFill} options={{ format: 'png', quality: 1 }}>
                    <LinearGradient colors={grad} style={StyleSheet.absoluteFill} />
                    
                    {/* Floating Background Blobs for Spotify Texture */}
                    <View style={[s.bgBlob, { top: -100, left: -50, width: 300, height: 300, backgroundColor: grad[1] }]} />
                    <View style={[s.bgBlob, { bottom: -50, right: -100, width: 400, height: 400, backgroundColor: grad[0] }]} />
                    
                    {/* Grain overlay placeholder (opacity makes it subtle) */}
                    <View style={s.grainOverlay} />

                    {/* Watermark */}
                    <View style={s.watermark}>
                        <Heart size={10} color="#000" />
                        <Text style={s.watermarkText}>CareMyMed</Text>
                    </View>
                    {content}
                </ViewShot>
            </View>
        );
    };

    return (
        <Modal visible={visible} transparent={false} animationType="slide" statusBarTranslucent>
            <StatusBar barStyle="light-content" />
            <View style={s.container}>
                {/* Progress bars (Instagram Stories style) */}
                <View style={s.progressRow}>
                    {[...Array(SLIDE_COUNT)].map((_, i) => (
                        <View key={i} style={s.progressBarBg}>
                            <Animated.View style={[s.progressBarFill, {
                                width: progressAnims[i].interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                }),
                            }]} />
                        </View>
                    ))}
                </View>

                <ScrollView
                    ref={scrollRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={handleScroll}
                    scrollEventThrottle={16}
                    bounces={false}
                >
                    {[...Array(SLIDE_COUNT)].map((_, i) => renderSlide(i))}
                </ScrollView>

                {/* Hidden Spotify-Wrapped style Share Graphic */}
                <View style={{ position: 'absolute', top: -10000, left: -10000, width: 1080, height: 1920 }}>
                    <ViewShot ref={shareCardRef} style={{ flex: 1, backgroundColor: '#FF416C' }} options={{ format: 'png', quality: 1 }}>
                        <LinearGradient colors={['#FF416C', '#FF4B2B']} style={StyleSheet.absoluteFill} />
                        <View style={{ flex: 1, padding: 80, justifyContent: 'space-between' }}>
                            {/* Header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                                    <Heart size={48} color="#000" fill="#000" />
                                    <Text style={{ fontSize: 40, fontWeight: '900', color: '#000', letterSpacing: 2, textTransform: 'uppercase' }}>CareMyMed</Text>
                                </View>
                                <Text style={{ fontSize: 32, fontWeight: '900', color: 'rgba(0,0,0,0.7)', textTransform: 'uppercase', letterSpacing: 2 }}>
                                    {periodLabel} Wrapped
                                </Text>
                            </View>

                            {/* Main Stat */}
                            <View style={{ alignItems: 'flex-start', marginTop: 120 }}>
                                <Text style={{ fontSize: 48, fontWeight: '900', color: '#000', marginBottom: 20, textTransform: 'uppercase' }}>I achieved</Text>
                                <Text style={{ fontSize: 260, fontWeight: '900', color: '#FFF', letterSpacing: -12, lineHeight: 280, marginLeft: -10 }}>
                                    {recap?.adherence_rate || 0}%
                                </Text>
                                <Text style={{ fontSize: 64, fontWeight: '900', color: '#000', marginTop: -10, textTransform: 'uppercase', letterSpacing: -2 }}>Medication Adherence</Text>
                            </View>

                            {/* Sub Stats Row */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#000', borderRadius: 50, padding: 60, marginTop: 120 }}>
                                <View style={{ alignItems: 'flex-start' }}>
                                    <Flame size={64} color="#FF4B2B" style={{ marginBottom: 20 }} />
                                    <Text style={{ fontSize: 96, fontWeight: '900', color: '#FFF', letterSpacing: -4 }}>{recap?.streak_current || 0}</Text>
                                    <Text style={{ fontSize: 32, fontWeight: '900', color: 'rgba(255,255,255,0.7)', marginTop: 10, textTransform: 'uppercase' }}>Day Streak</Text>
                                </View>
                                <View style={{ width: 4, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ alignItems: 'flex-start' }}>
                                    <Trophy size={64} color="#F2C94C" style={{ marginBottom: 20 }} />
                                    <Text style={{ fontSize: 96, fontWeight: '900', color: '#FFF', letterSpacing: -4 }}>{recap?.perfect_days || 0}</Text>
                                    <Text style={{ fontSize: 32, fontWeight: '900', color: 'rgba(255,255,255,0.7)', marginTop: 10, textTransform: 'uppercase' }}>Perfect Days</Text>
                                </View>
                            </View>

                            {/* Footer */}
                            <View style={{ alignItems: 'flex-start', marginTop: 120, marginBottom: 40 }}>
                                <Text style={{ fontSize: 40, fontWeight: '900', color: '#000', letterSpacing: -1 }}>Your Health. Unwrapped.</Text>
                                <Text style={{ fontSize: 32, fontWeight: '900', color: 'rgba(0,0,0,0.6)', marginTop: 16 }}>caremymed.com</Text>
                            </View>
                        </View>
                    </ViewShot>
                </View>

                {/* Close */}
                <Pressable style={s.closeBtn} onPress={onClose} hitSlop={12}>
                    <X size={24} color="#FFF" />
                </Pressable>

                {/* Play/Pause indicator */}
                <Pressable
                    style={s.playPauseBtn}
                    onPress={() => {
                        if (isAutoPlaying) {
                            stopAutoPlay();
                            setIsAutoPlaying(false);
                        } else {
                            setIsAutoPlaying(true);
                            startAutoPlay(currentSlide);
                        }
                    }}
                >
                    <Text style={s.playPauseText}>{isAutoPlaying ? '❚❚' : '▶'}</Text>
                </Pressable>

                {/* Dots */}
                <View style={s.dotsRow}>
                    {[...Array(SLIDE_COUNT)].map((_, i) => (
                        <Pressable key={i} onPress={() => goToSlide(i)}>
                            <View style={[s.dot, currentSlide === i && s.dotActive]} />
                        </Pressable>
                    ))}
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    closeBtn: {
        position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 20,
        width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    playPauseBtn: {
        position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 68,
        width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    playPauseText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

    // Progress bars (video-like)
    progressRow: {
        position: 'absolute', top: Platform.OS === 'ios' ? 48 : 28,
        left: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 20,
    },
    progressBarBg: {
        flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%', backgroundColor: '#FFF', borderRadius: 2,
    },

    dotsRow: {
        position: 'absolute', bottom: Platform.OS === 'ios' ? 50 : 30,
        left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
    dotActive: { backgroundColor: '#FFF', width: 24, borderRadius: 4 },

    slideContent: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 40, paddingBottom: 80,
    },
    slideLeftAlign: {
        alignItems: 'flex-start',
        paddingHorizontal: 30,
    },
    brandBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#000', paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 30, marginBottom: 32, alignSelf: 'flex-start',
    },
    brandText: { fontSize: 13, fontWeight: '900', color: '#FFF', letterSpacing: 1, textTransform: 'uppercase' },

    watermark: {
        position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 70, right: 20,
        flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.6, zIndex: 5,
    },
    watermarkText: { fontSize: 10, fontWeight: '900', color: '#000', letterSpacing: 0.5, textTransform: 'uppercase' },

    introTitle: { fontSize: 52, fontWeight: '900', color: '#000', textAlign: 'left', lineHeight: 56, letterSpacing: -2, textTransform: 'uppercase' },
    datePill: { backgroundColor: '#000', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 24 },
    datePillText: { fontSize: 14, color: '#FFF', fontWeight: '800', letterSpacing: 1 },
    introHint: { fontSize: 16, color: 'rgba(0,0,0,0.6)', marginTop: 40, fontWeight: '800' },

    slideLabel: { fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 3, marginTop: 16, textTransform: 'uppercase' },
    slideTitle: { fontSize: 40, fontWeight: '900', color: '#000', textAlign: 'center', lineHeight: 44, letterSpacing: -2, textTransform: 'uppercase' },
    slideTitleAlt: { fontSize: 34, fontWeight: '900', color: '#000', textAlign: 'left', marginTop: 10, letterSpacing: -1 },
    slideCaption: { fontSize: 18, color: 'rgba(0,0,0,0.7)', marginTop: 12, fontWeight: '700', textAlign: 'center' },

    bigStat: { fontSize: 96, fontWeight: '900', color: '#000', letterSpacing: -4, marginTop: -10 },
    megaStat: { fontSize: 140, fontWeight: '900', color: '#000', letterSpacing: -8, marginTop: 0, marginLeft: -5 },
    bigStatSub: { fontSize: 32, fontWeight: '900', color: 'rgba(0,0,0,0.4)' },
    bigEmoji: { fontSize: 80, marginBottom: 16, transform: [{ rotate: '-10deg' }] },
    ringText: { fontSize: 48, fontWeight: '900', color: '#FFF', letterSpacing: -2 },

    cardPanel: {
        backgroundColor: 'rgba(0,0,0,0.1)',
        padding: 30,
        borderRadius: 40,
        alignItems: 'center',
        width: '100%',
    },

    changeBadge: {
        backgroundColor: '#000', paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: 20, marginTop: 24,
    },
    changeText: { fontSize: 15, fontWeight: '900', color: '#FFF', textTransform: 'uppercase' },

    pillBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#000', paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: 20, marginTop: 20,
    },
    pillBadgeText: { fontSize: 15, fontWeight: '900', color: '#FFF' },

    topMedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#000', paddingHorizontal: 20, paddingVertical: 12,
        borderRadius: 20, marginTop: 24,
    },
    topMedText: { fontSize: 15, fontWeight: '900', color: '#FFF' },

    shareBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#000', paddingHorizontal: 32, paddingVertical: 18,
        borderRadius: 50, marginTop: 40,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16,
    },
    shareBtnText: { fontSize: 18, fontWeight: '900', color: '#FFF', textTransform: 'uppercase' },
    
    bgBlob: {
        position: 'absolute',
        borderRadius: 999,
        opacity: 0.5,
        transform: [{ scale: 1.5 }],
        filter: 'blur(40px)',
    },
    grainOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.05)',
    }
});
