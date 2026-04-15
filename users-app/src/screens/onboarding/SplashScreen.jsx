import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// ─── Constants ───
const LOGO_SIZE = 240;

const NODES = [
    { id: 1, x: -85, y: -95, size: 6 },
    { id: 2, x: 95, y: -85, size: 10 },
    { id: 3, x: 105, y: 45, size: 8 },
    { id: 4, x: -75, y: 85, size: 6 },
    { id: 5, x: -105, y: 15, size: 10 },
    { id: 6, x: 0, y: 0, size: 14 },
];

const PREMIUM_HEART = "M 100 170 C 100 170 20 115 20 65 C 20 30 55 15 85 40 C 100 55 100 55 100 55 C 100 55 100 55 115 40 C 145 15 180 30 180 65 C 180 115 100 170 100 170 Z";

// ─── Background Particles ───
const BackgroundParticles = () => (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" collapsable={false}>
        {[...Array(30)].map((_, i) => <Particle key={i} />)}
    </View>
);

const Particle = () => {
    const anim = useRef(new Animated.Value(0)).current;
    const x = useRef(Math.random() * width).current;
    const y = useRef(Math.random() * height).current;
    const size = useRef(Math.random() * 2 + 0.8).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 3000 + Math.random() * 4000, easing: Animated.Easing?.inOut(Animated.Easing.sin), useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0, duration: 3000 + Math.random() * 4000, easing: Animated.Easing?.inOut(Animated.Easing.sin), useNativeDriver: true }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, []);

    const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.4, 0] });
    return (
        <Animated.View style={[styles.particle, { left: x, top: y, width: size, height: size, borderRadius: size / 2, opacity }]} />
    );
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

let hasShownSplash = false;

export default function SplashScreen({ navigation, onFinish }) {
    const [isReady, setIsReady] = useState(false);

    // If splash already played (e.g. returning from Google OAuth), skip straight to Login
    useEffect(() => {
        if (hasShownSplash) {
            if (onFinish) onFinish();
            else if (navigation) navigation.replace('Login');
        }
    }, [navigation, onFinish]);

    // ─── Animation Values ───
    const bgFade = useRef(new Animated.Value(0)).current;
    const networkAnim = useRef(new Animated.Value(0)).current;
    const convergeAnim = useRef(new Animated.Value(0)).current;
    const bloomAnim = useRef(new Animated.Value(0)).current;
    const silhouettesAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(0)).current;
    const pulseLoop = useRef(new Animated.Value(0)).current;
    const textAnim = useRef(new Animated.Value(0)).current;
    const exitAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Deferred Mounting: Wait for screen to be stable
        const readyTimer = setTimeout(() => setIsReady(true), 150);

        const sequence = Animated.parallel([
            Animated.timing(bgFade, { toValue: 1, duration: 1200, useNativeDriver: true }),
            Animated.timing(networkAnim, { toValue: 1, duration: 2000, easing: Animated.Easing?.bezier(0.2, 0, 0.3, 1), useNativeDriver: true, delay: 600 }),
            Animated.timing(convergeAnim, { toValue: 1, duration: 1500, easing: Animated.Easing?.bezier(0.7, 0, 0.84, 0), useNativeDriver: true, delay: 2600 }),
            Animated.sequence([
                Animated.delay(3800),
                Animated.timing(bloomAnim, { toValue: 1, duration: 1000, easing: Animated.Easing?.out(Animated.Easing.poly(3)), useNativeDriver: true })
            ]),
            Animated.timing(silhouettesAnim, { toValue: 1, duration: 1500, easing: Animated.Easing?.out(Animated.Easing.back(1.5)), useNativeDriver: true, delay: 4800 }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 1700, easing: Animated.Easing?.inOut(Animated.Easing.sin), useNativeDriver: false, delay: 5800 }),
            Animated.timing(textAnim, { toValue: 1, duration: 1500, easing: Animated.Easing?.out(Animated.Easing.poly(3)), useNativeDriver: true, delay: 6800 }),
            Animated.timing(exitAnim, { toValue: 1, duration: 700, easing: Animated.Easing?.inOut(Animated.Easing.ease), useNativeDriver: true, delay: 8300 })
        ]);

        sequence.start(({ finished }) => {
            if (finished) {
                hasShownSplash = true;
                // Proactive Unmount: Hide SVGs before replacing screen
                setIsReady(false);
                setTimeout(() => {
                    if (onFinish) onFinish();
                    else if (navigation) navigation.replace('Login');
                }, 100);
            }
        });

        const pulseTimer = setTimeout(() => {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseLoop, { toValue: 1, duration: 2000, easing: Animated.Easing?.linear, useNativeDriver: false }),
                    Animated.timing(pulseLoop, { toValue: 0, duration: 0, useNativeDriver: false }),
                ])
            ).start();
        }, 5800);

        return () => {
            clearTimeout(readyTimer);
            clearTimeout(pulseTimer);
            sequence.stop();
        };
    }, []);

    // ─── Interpolations ───
    const screenOpacity = exitAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
    const screenTranslateY = exitAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] });
    const networkOpacity = Animated.multiply(
        networkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
        convergeAnim.interpolate({ inputRange: [0.8, 1], outputRange: [1, 0] })
    );
    const networkGlobalScale = networkAnim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
    const getCVal = (start) => convergeAnim.interpolate({ inputRange: [0, 1], outputRange: [start, 0] });
    const heartScale = bloomAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.2, 1.15, 1] });
    const heartOpacity = bloomAnim.interpolate({ inputRange: [0, 0.25], outputRange: [0, 1] });
    const flareOpacity = bloomAnim.interpolate({ inputRange: [0, 0.1, 0.3, 0.5], outputRange: [0, 1, 0.3, 0] });
    const flareScale = bloomAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 8] });
    const cgTranslateX = silhouettesAnim.interpolate({ inputRange: [0, 1], outputRange: [-120, -100] });
    const ptTranslateX = silhouettesAnim.interpolate({ inputRange: [0, 1], outputRange: [120, 100] });
    const silOpacity = silhouettesAnim.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1] });
    const silScale = silhouettesAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
    const pulseDashOffset = Animated.add(
        pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [220, 0] }),
        pulseLoop.interpolate({ inputRange: [0, 1], outputRange: [0, -220] })
    );
    const pulseFinalOpacity = pulseAnim.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] });
    const textOpacity = textAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const textTranslateY = textAnim.interpolate({ inputRange: [0, 1], outputRange: [25, 0] });

    return (
        <LinearGradient colors={['#0F172A', '#4338CA', '#6366F1']} style={styles.container}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: bgFade }]} pointerEvents="none" collapsable={false}>
                <BackgroundParticles />
            </Animated.View>

            <Animated.View style={[styles.mainWrapper, { opacity: screenOpacity, transform: [{ translateY: screenTranslateY }] }]} collapsable={false}>

                {/* 1. LAYER: Nodes */}
                <Animated.View
                    style={[StyleSheet.absoluteFill, styles.center, { opacity: networkOpacity, transform: [{ scale: networkGlobalScale }] }]}
                    pointerEvents="none"
                    collapsable={false}
                >
                    {isReady && NODES.map(node => (
                        <Animated.View
                            key={node.id}
                            style={[
                                styles.dot,
                                {
                                    backgroundColor: '#FFFFFF',
                                    width: node.size, height: node.size, borderRadius: node.size / 2,
                                    shadowColor: '#3B82F6', shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
                                    transform: [{ translateX: getCVal(node.x) }, { translateY: getCVal(node.y) }]
                                }
                            ]}
                        />
                    ))}
                </Animated.View>

                {/* 2. LAYER: Bloom */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: flareOpacity, transform: [{ scale: flareScale }] }]} pointerEvents="none" collapsable={false}>
                    <View style={styles.flare} />
                </Animated.View>

                {/* 3. LAYER: Heart */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]} pointerEvents="none" collapsable={false}>
                    {isReady && (
                        <View style={styles.heartShadowContainer} collapsable={false}>
                            <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox="0 0 200 200" pointerEvents="none" style={{ width: LOGO_SIZE, height: LOGO_SIZE }}>
                                <Path d={PREMIUM_HEART} fill="#FFFFFF" />
                            </Svg>
                        </View>
                    )}
                </Animated.View>

                {/* 4. LAYER: Silhouettes */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: silOpacity, transform: [{ translateX: cgTranslateX }, { scale: silScale }] }]} pointerEvents="none" collapsable={false}>
                    {isReady && (
                        <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox="0 0 200 200" pointerEvents="none" style={{ width: LOGO_SIZE, height: LOGO_SIZE }}>
                            <Path d="M 35 150 C 35 130 45 120 55 120 C 65 120 75 130 75 150 Z M 55 85 A 14 14 0 1 0 55 113 A 14 14 0 1 0 55 85" fill="#FFFFFF" opacity="0.9" />
                        </Svg>
                    )}
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: silOpacity, transform: [{ translateX: ptTranslateX }, { scale: silScale }] }]} pointerEvents="none" collapsable={false}>
                    {isReady && (
                        <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox="0 0 200 200" pointerEvents="none" style={{ width: LOGO_SIZE, height: LOGO_SIZE }}>
                            <Path d="M 125 150 C 125 130 135 120 145 120 C 155 120 165 130 165 150 Z M 145 90 A 12 12 0 1 0 145 114 A 12 12 0 1 0 145 90" fill="#FFFFFF" opacity="0.9" />
                        </Svg>
                    )}
                </Animated.View>

                {/* 5. LAYER: Pulse */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: pulseFinalOpacity }]} pointerEvents="none" collapsable={false}>
                    {isReady && (
                        <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox="0 0 200 200" pointerEvents="none" style={{ width: LOGO_SIZE, height: LOGO_SIZE }}>
                            <AnimatedPath
                                d="M 50 100 L 75 100 L 85 75 L 100 135 L 115 85 L 125 100 L 150 100"
                                stroke="#4338CA" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
                                fill="none" strokeDasharray="220" strokeDashoffset={pulseDashOffset}
                            />
                        </Svg>
                    )}
                </Animated.View>
            </Animated.View>

            <Animated.View style={[styles.textContainer, { opacity: textOpacity, transform: [{ translateY: textTranslateY }] }]} collapsable={false}>
                <Text style={styles.title}>Care<Text style={styles.titleAccent}>Co</Text></Text>
                <Text style={styles.tagline}>Leading the Future of Compassionate Care</Text>
            </Animated.View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    particle: { position: 'absolute', backgroundColor: '#FFFFFF' },
    mainWrapper: { width: LOGO_SIZE, height: LOGO_SIZE, marginBottom: 80, position: 'relative', justifyContent: 'center', alignItems: 'center' },
    center: { justifyContent: 'center', alignItems: 'center' },
    dot: { position: 'absolute' },
    flare: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', shadowColor: '#60A5FA', shadowRadius: 20, shadowOpacity: 1, elevation: 15 },
    heartShadowContainer: {
        width: LOGO_SIZE,
        height: LOGO_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContainer: { alignItems: 'center', position: 'absolute', bottom: 100 },
    title: { fontSize: 44, fontWeight: '900', color: '#FFFFFF', letterSpacing: -2 },
    titleAccent: { color: '#A5B4FC' },
    tagline: { fontSize: 15, color: '#C7D2FE', fontWeight: '600', marginTop: 12, letterSpacing: 1, opacity: 0.85 },
});
