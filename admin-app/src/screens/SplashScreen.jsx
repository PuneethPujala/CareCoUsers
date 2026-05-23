import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions, StatusBar, TouchableOpacity, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, G, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

// SVG Component for ECG Pulse Line
const PulseLine = ({ color, reversed = false }) => {
    // QRS complex path
    // Flat line, slight dip (Q), sharp spike up (R), sharp spike down (S), flat line
    const path = reversed 
        ? "M 0 15 L 40 15 L 45 5 L 50 30 L 55 15 L 80 15" // Reversed visually or just mirrored
        : "M 0 15 L 25 15 L 30 5 L 35 30 L 40 15 L 80 15";
        
    const drawPath = reversed ? "M 80 15 L 55 15 L 50 5 L 45 30 L 40 15 L 0 15" : "M 0 15 L 40 15 L 45 5 L 50 30 L 55 15 L 80 15";

    return (
        <Svg width="80" height="30" viewBox="0 0 80 30">
            <Path 
                d={drawPath} 
                stroke={color} 
                strokeWidth="2" 
                fill="none" 
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
};

const Pill = () => {
    return (
        <Svg width="40" height="40" viewBox="0 0 40 40" style={{ position: 'absolute', top: 40, left: 40, transform: [{ rotate: '45deg' }, { scale: 0.75 }] }}>
            {/* Pill bottom half */}
            <Path d="M 10 20 L 10 30 A 10 10 0 0 0 30 30 L 30 20 Z" fill="#00a86b" />
            {/* Pill top half */}
            <Path d="M 10 20 L 10 10 A 10 10 0 0 1 30 10 L 30 20 Z" fill="#1a8fe1" />
            {/* White cross inside green part */}
            <Path d="M 17 25 L 23 25 M 20 22 L 20 28" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </Svg>
    );
};

export default function SplashScreen({ onFinish }) {
    // Animations
    const minuteHandRotate = useRef(new Animated.Value(0)).current;
    const hourHandRotate = useRef(new Animated.Value(0)).current;
    const orbitRotate = useRef(new Animated.Value(0)).current;

    const logoScale = useRef(new Animated.Value(0.3)).current;
    const contentOpacity = useRef(new Animated.Value(0)).current;
    const buttonOpacity = useRef(new Animated.Value(0)).current;
    const buttonScale = useRef(new Animated.Value(0.9)).current;

    useEffect(() => {
        // Continuous Rotations
        Animated.loop(
            Animated.timing(minuteHandRotate, {
                toValue: 1,
                duration: 10000, // 10 seconds per rotation
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();

        Animated.loop(
            Animated.timing(hourHandRotate, {
                toValue: 1,
                duration: 120000, // 120 seconds per rotation
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();

        Animated.loop(
            Animated.timing(orbitRotate, {
                toValue: 1,
                duration: 30000, // 30 seconds per rotation
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();

        // Entry Animations
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }).start();

        Animated.sequence([
            Animated.delay(500),
            Animated.timing(contentOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();

        Animated.sequence([
            Animated.delay(900),
            Animated.parallel([
                Animated.timing(buttonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.spring(buttonScale, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
            ]),
        ]).start();

    }, []);

    const minuteInterpolate = minuteHandRotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    const hourInterpolate = hourHandRotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    const orbitInterpolate = orbitRotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            {/* Background Gradient */}
            <LinearGradient
                colors={['#001a33', '#002a4a']}
                style={StyleSheet.absoluteFillObject}
            />

            <View style={s.centerContent}>
                {/* CIRCULAR LOGO AREA */}
                <Animated.View style={[s.logoArea, { transform: [{ scale: logoScale }] }]}>
                    {/* Orbit Ring */}
                    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: orbitInterpolate }] }]}>
                        <Svg width="220" height="220" viewBox="0 0 220 220">
                            <Defs>
                                <SvgLinearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <Stop offset="0%" stopColor="#00c9a7" />
                                    <Stop offset="100%" stopColor="#1a8fe1" stopOpacity="0" />
                                </SvgLinearGradient>
                            </Defs>
                            <Circle 
                                cx="110" cy="110" r="108" 
                                stroke="url(#orbitGrad)" 
                                strokeWidth="2" 
                                fill="none" 
                                strokeDasharray="150, 50" 
                                strokeLinecap="round"
                            />
                        </Svg>
                    </Animated.View>

                    {/* Centered Group for Clock and Text */}
                    <View style={s.logoGroup}>
                        {/* Clock & Pill Icon */}
                        <View style={s.iconContainer}>
                            {/* Clock Face */}
                            <Svg width="80" height="80" viewBox="0 0 80 80">
                                <Circle cx="40" cy="40" r="36" stroke="#1a8fe1" strokeWidth="6" fill="#ffffff" />
                                {/* Tick marks */}
                                <Path d="M 40 10 L 40 16 M 40 70 L 40 64 M 10 40 L 16 40 M 70 40 L 64 40" stroke="#1a8fe1" strokeWidth="2" strokeLinecap="round" />
                            </Svg>
                            
                            {/* Animated Clock Hands */}
                            <Animated.View style={[s.handContainer, { transform: [{ rotate: hourInterpolate }] }]}>
                                <View style={s.hourHand} />
                            </Animated.View>
                            <Animated.View style={[s.handContainer, { transform: [{ rotate: minuteInterpolate }] }]}>
                                <View style={s.minuteHand} />
                            </Animated.View>
                            
                            {/* Center Dot */}
                            <View style={s.centerDot} />

                            {/* Merged Pill */}
                            <Pill />
                        </View>

                        {/* Logo Text */}
                        <View style={s.logoTextContainer}>
                            <Text style={s.logoTextBlue}>Care</Text>
                            <Text style={s.logoTextGreen}>My</Text>
                            <Text style={s.logoTextBlue}>Med</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* SECTION LABEL & SUBTITLE */}
                <Animated.View style={{ opacity: contentOpacity, alignItems: 'center', marginTop: 40 }}>
                    <View style={s.sectionLabelContainer}>
                        <PulseLine color="#00c9a7" reversed={false} />
                        <Text style={s.sectionLabel}>ADMIN PORTAL</Text>
                        <PulseLine color="#00a86b" reversed={true} />
                    </View>
                    <Text style={s.subtitle}>Intelligent Healthcare Management</Text>
                </Animated.View>
            </View>

            {/* BOTTOM CTA BUTTON */}
            <Animated.View style={[s.bottomArea, { opacity: buttonOpacity, transform: [{ scale: buttonScale }] }]}>
                <TouchableOpacity 
                    activeOpacity={0.8} 
                    onPress={onFinish}
                    style={s.loginButtonContainer}
                >
                    <LinearGradient
                        colors={['#1a8fe1', '#00bfff']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.loginButton}
                    >
                        <Text style={s.loginButtonText}>Admin Login</Text>
                    </LinearGradient>
                </TouchableOpacity>
                <Text style={s.versionText}>Secure Platform v1.0.0</Text>
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#001a33',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    logoArea: {
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: 'rgba(255,255,255,0.07)',
        justifyContent: 'center',
        alignItems: 'center',
        // Soft elevation/glow
        shadowColor: '#1a8fe1',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
        elevation: 8,
    },
    logoGroup: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        width: 80,
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
    },
    handContainer: {
        position: 'absolute',
        width: 80,
        height: 80,
        alignItems: 'center',
    },
    hourHand: {
        width: 4,
        height: 20,
        backgroundColor: '#1a8fe1',
        borderRadius: 2,
        marginTop: 20,
    },
    minuteHand: {
        width: 2.5,
        height: 28,
        backgroundColor: '#00c9a7',
        borderRadius: 1.5,
        marginTop: 12,
    },
    centerDot: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#001a33',
        borderWidth: 2,
        borderColor: '#1a8fe1',
    },
    logoTextContainer: {
        flexDirection: 'row',
        marginTop: 16,
    },
    logoTextBlue: {
        color: '#1a8fe1',
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    logoTextGreen: {
        color: '#00a86b',
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    sectionLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    sectionLabel: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 4,
        marginHorizontal: 12,
    },
    subtitle: {
        color: '#b0c8d8',
        fontSize: 14,
        fontWeight: '300',
    },
    bottomArea: {
        width: '100%',
        paddingHorizontal: '6%',
        paddingBottom: 40,
        alignItems: 'center',
    },
    loginButtonContainer: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        // Subtle glow for button
        shadowColor: '#1a8fe1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
    },
    loginButton: {
        width: '100%',
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loginButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    versionText: {
        marginTop: 20,
        color: '#4a6a85',
        fontSize: 12,
    },
});
