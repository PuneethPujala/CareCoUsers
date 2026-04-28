import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions, StatusBar } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ onFinish }) {
    const logoScale = useRef(new Animated.Value(0.3)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;
    const textTranslateY = useRef(new Animated.Value(30)).current;
    const subtitleOpacity = useRef(new Animated.Value(0)).current;
    const subtitleTranslateY = useRef(new Animated.Value(20)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const ring1Scale = useRef(new Animated.Value(0.5)).current;
    const ring1Opacity = useRef(new Animated.Value(0.6)).current;
    const ring2Scale = useRef(new Animated.Value(0.5)).current;
    const ring2Opacity = useRef(new Animated.Value(0.4)).current;
    const bottomOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Phase 1: Logo scales up with spring
        Animated.parallel([
            Animated.spring(logoScale, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
            Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();

        // Phase 2: Ring ripple effects
        Animated.sequence([
            Animated.delay(300),
            Animated.parallel([
                Animated.timing(ring1Scale, { toValue: 2.5, duration: 1200, useNativeDriver: true }),
                Animated.timing(ring1Opacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
            ]),
        ]).start();

        Animated.sequence([
            Animated.delay(600),
            Animated.parallel([
                Animated.timing(ring2Scale, { toValue: 3, duration: 1400, useNativeDriver: true }),
                Animated.timing(ring2Opacity, { toValue: 0, duration: 1400, useNativeDriver: true }),
            ]),
        ]).start();

        // Phase 3: Title text slides up
        Animated.sequence([
            Animated.delay(500),
            Animated.parallel([
                Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.spring(textTranslateY, { toValue: 0, friction: 6, useNativeDriver: true }),
            ]),
        ]).start();

        // Phase 4: Subtitle
        Animated.sequence([
            Animated.delay(800),
            Animated.parallel([
                Animated.timing(subtitleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.spring(subtitleTranslateY, { toValue: 0, friction: 6, useNativeDriver: true }),
            ]),
        ]).start();

        // Phase 5: Pulse animation on logo
        Animated.sequence([
            Animated.delay(1000),
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                ])
            ),
        ]).start();

        // Phase 6: Bottom text
        Animated.sequence([
            Animated.delay(1100),
            Animated.timing(bottomOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();

        // Auto-finish after 2.8 seconds
        const timer = setTimeout(() => {
            if (onFinish) onFinish();
        }, 2800);

        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Ripple rings */}
            <Animated.View style={[s.ring, { transform: [{ scale: ring1Scale }], opacity: ring1Opacity }]} />
            <Animated.View style={[s.ring, { transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />

            {/* Logo */}
            <Animated.View style={[s.logoContainer, { 
                transform: [{ scale: Animated.multiply(logoScale, pulseAnim) }], 
                opacity: logoOpacity 
            }]}>
                <View style={s.logoCircle}>
                    <View style={s.logoInner}>
                        <Text style={s.logoLetter}>C</Text>
                    </View>
                </View>
            </Animated.View>

            {/* Title */}
            <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslateY }] }}>
                <Text style={s.title}>Care<Text style={s.titleAccent}>Co</Text></Text>
            </Animated.View>

            {/* Subtitle */}
            <Animated.View style={{ opacity: subtitleOpacity, transform: [{ translateY: subtitleTranslateY }] }}>
                <Text style={s.subtitle}>Admin Portal</Text>
                <View style={s.divider} />
                <Text style={s.tagline}>Empowering Care, Enabling Health</Text>
            </Animated.View>

            {/* Bottom */}
            <Animated.View style={[s.bottom, { opacity: bottomOpacity }]}>
                <View style={s.loadingBar}>
                    <View style={s.loadingFill} />
                </View>
                <Text style={s.versionText}>v1.0.0</Text>
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0A1628',
    },
    ring: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: 'rgba(96, 165, 250, 0.3)',
    },
    logoContainer: {
        marginBottom: 32,
    },
    logoCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 2,
        borderColor: 'rgba(96, 165, 250, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 30,
        elevation: 20,
    },
    logoInner: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderWidth: 1.5,
        borderColor: 'rgba(147, 197, 253, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoLetter: {
        fontSize: 48,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -2,
        textShadowColor: 'rgba(59, 130, 246, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    title: {
        fontSize: 42,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -1,
        textAlign: 'center',
    },
    titleAccent: {
        color: '#60A5FA',
    },
    subtitle: {
        fontSize: 18,
        fontWeight: '600',
        color: 'rgba(148, 163, 184, 0.9)',
        textAlign: 'center',
        letterSpacing: 4,
        textTransform: 'uppercase',
        marginTop: 8,
    },
    divider: {
        width: 60,
        height: 2,
        backgroundColor: 'rgba(96, 165, 250, 0.4)',
        borderRadius: 1,
        alignSelf: 'center',
        marginVertical: 16,
    },
    tagline: {
        fontSize: 14,
        fontWeight: '400',
        color: 'rgba(148, 163, 184, 0.6)',
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    bottom: {
        position: 'absolute',
        bottom: 60,
        alignItems: 'center',
    },
    loadingBar: {
        width: 120,
        height: 3,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 12,
    },
    loadingFill: {
        width: '60%',
        height: '100%',
        backgroundColor: 'rgba(96, 165, 250, 0.6)',
        borderRadius: 2,
    },
    versionText: {
        fontSize: 12,
        color: 'rgba(148, 163, 184, 0.4)',
        letterSpacing: 1,
    },
});
