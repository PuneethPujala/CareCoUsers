import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    Modal, View, Text, StyleSheet, Pressable, Animated, Dimensions,
    ScrollView, Share, Platform, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Share2, ChevronLeft, ChevronRight, Flame, Pill, Sunrise, Sun, Moon, Trophy, Heart, Sparkles } from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';

const { width: SW, height: SH } = Dimensions.get('window');
const SLIDE_COUNT = 7;
const SLIDE_DURATION = 4000; // 4 seconds per slide (video-like)

const SLIDE_GRADIENTS = [
    ['#0F172A', '#1E3A5F'],
    ['#059669', '#064E3B'],
    ['#DC2626', '#991B1B'],
    ['#2563EB', '#1E40AF'],
    ['#F59E0B', '#B45309'],
    ['#7C3AED', '#5B21B6'],
    ['#0EA5E9', '#0369A1'],
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

const ProgressRing = ({ progress = 0, size = 160, strokeWidth = 12 }) => {
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute' }}>
                <View style={{
                    width: size, height: size, borderRadius: size / 2,
                    borderWidth: strokeWidth, borderColor: 'rgba(255,255,255,0.15)',
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
            // Capture all slides as images
            const capturedUris = [];
            for (let i = 0; i < SLIDE_COUNT; i++) {
                // Navigate to slide, wait, then capture
                scrollRef.current?.scrollTo({ x: i * SW, animated: false });
                await new Promise(r => setTimeout(r, 300));
                if (viewShotRefs[i]?.current) {
                    const uri = await viewShotRefs[i].current.capture();
                    capturedUris.push(uri);
                }
            }
            // Go back to current slide
            scrollRef.current?.scrollTo({ x: currentSlide * SW, animated: false });

            // Share all captured images
            if (capturedUris.length > 0) {
                await Share.share({
                    url: Platform.OS === 'ios' ? capturedUris[0] : undefined,
                    message: `My ${periodLabel} Health Recap 💊\n${recap?.adherence_rate || 0}% adherence • ${recap?.streak_current || 0} day streak\n#CareMyMed #HealthJourney`,
                    title: `${periodLabel} Health Recap`,
                });
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
                    <Animated.View style={[s.slideContent, makeSlideAnim(0)]}>
                        <BrandBadge />
                        <Text style={s.introTitle}>Your{'\n'}{periodLabel}{'\n'}Recap</Text>
                        <Text style={s.introSub}>{r.date_range?.start} — {r.date_range?.end}</Text>
                        <Text style={s.introHint}>Swipe to see your stats →</Text>
                    </Animated.View>
                );
                break;
            case 1:
                content = (
                    <Animated.View style={[s.slideContent, makeSlideAnim(1)]}>
                        <Text style={s.slideLabel}>ADHERENCE SCORE</Text>
                        <ProgressRing progress={r.adherence_rate || 0} />
                        <Text style={s.slideCaption}>
                            {r.adherence_rate >= 90 ? 'Outstanding!' : r.adherence_rate >= 70 ? 'Great work!' : 'Keep improving!'}
                        </Text>
                        {r.improvement_vs_previous !== 0 && (
                            <View style={s.changeBadge}>
                                <Text style={s.changeText}>
                                    {r.improvement_vs_previous > 0 ? '↑' : '↓'} {Math.abs(r.improvement_vs_previous)}% vs last {period}
                                </Text>
                            </View>
                        )}
                    </Animated.View>
                );
                break;
            case 2:
                content = (
                    <Animated.View style={[s.slideContent, makeSlideAnim(2)]}>
                        <View style={s.fireCircle}>
                            <Flame size={48} color="#FFF" fill="#FFF" />
                        </View>
                        <AnimatedCounter value={r.streak_current || 0} style={s.bigStat} />
                        <Text style={s.slideLabel}>DAY STREAK</Text>
                        <Text style={s.slideCaption}>Best streak: {r.streak_best || 0} days</Text>
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
                        <Text style={s.slideTitle}>{TIME_LABELS[bestTime]}{'\n'}Champion</Text>
                        <Text style={s.slideCaption}>Your most consistent time slot</Text>
                    </Animated.View>
                );
                break;
            case 5:
                content = (
                    <Animated.View style={[s.slideContent, makeSlideAnim(5)]}>
                        <Text style={s.bigEmoji}>{r.level?.emoji || '🌱'}</Text>
                        <Text style={s.slideTitle}>You're{'\n'}{r.level?.label || 'Growing'}</Text>
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
                        <Text style={s.slideTitle}>{r.motivational_message || 'Keep going! 💙'}</Text>
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
            <View key={idx} style={{ width: SW, height: '100%' }}>
                <ViewShot ref={viewShotRefs[idx]} style={StyleSheet.absoluteFill} options={{ format: 'png', quality: 1 }}>
                    <LinearGradient colors={grad} style={StyleSheet.absoluteFill} />
                    {/* Watermark */}
                    <View style={s.watermark}>
                        <Heart size={10} color="rgba(255,255,255,0.3)" />
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
    brandBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 6,
        borderRadius: 20, marginBottom: 32,
    },
    brandText: { fontSize: 13, fontWeight: '800', color: '#FFF', letterSpacing: 1 },

    watermark: {
        position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 70, right: 20,
        flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.4, zIndex: 5,
    },
    watermarkText: { fontSize: 10, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },

    introTitle: { fontSize: 48, fontWeight: '900', color: '#FFF', textAlign: 'center', lineHeight: 56, letterSpacing: -2 },
    introSub: { fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 16, fontWeight: '600' },
    introHint: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 40, fontWeight: '600' },

    slideLabel: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginTop: 16, textTransform: 'uppercase' },
    slideTitle: { fontSize: 40, fontWeight: '900', color: '#FFF', textAlign: 'center', lineHeight: 48, letterSpacing: -1 },
    slideCaption: { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginTop: 12, fontWeight: '600', textAlign: 'center' },

    bigStat: { fontSize: 80, fontWeight: '900', color: '#FFF', letterSpacing: -3 },
    bigStatSub: { fontSize: 32, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
    bigEmoji: { fontSize: 72, marginBottom: 16 },
    ringText: { fontSize: 40, fontWeight: '900', color: '#FFF' },

    changeBadge: {
        backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 20, marginTop: 20,
    },
    changeText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

    fireCircle: {
        width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    topMedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: 16, marginTop: 24,
    },
    topMedText: { fontSize: 13, fontWeight: '700', color: '#FDE68A' },

    shareBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#FFF', paddingHorizontal: 28, paddingVertical: 14,
        borderRadius: 50, marginTop: 32,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16,
    },
    shareBtnText: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
});
