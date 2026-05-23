import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions, StatusBar, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ onFinish }) {
    const logoScale = useRef(new Animated.Value(0.3)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    
    const contentOpacity = useRef(new Animated.Value(0)).current;
    const contentTranslateY = useRef(new Animated.Value(30)).current;
    
    const buttonOpacity = useRef(new Animated.Value(0)).current;
    const buttonScale = useRef(new Animated.Value(0.9)).current;

    // Glowing effect
    const glowAnim = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        // Phase 1: Logo scales up and fades in
        Animated.parallel([
            Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
            Animated.timing(logoOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]).start();

        // Phase 2: Glow breathing effect
        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
                Animated.timing(glowAnim, { toValue: 0.5, duration: 2000, useNativeDriver: true })
            ])
        ).start();

        // Phase 3: Content slides up
        Animated.sequence([
            Animated.delay(500),
            Animated.parallel([
                Animated.timing(contentOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
                Animated.spring(contentTranslateY, { toValue: 0, friction: 7, tension: 40, useNativeDriver: true }),
            ]),
        ]).start();

        // Phase 4: Button pops in
        Animated.sequence([
            Animated.delay(900),
            Animated.parallel([
                Animated.timing(buttonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.spring(buttonScale, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
            ]),
        ]).start();

    }, []);

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            {/* Background Gradient */}
            <LinearGradient
                colors={['#051020', '#020617', '#000000']}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Glowing Backdrop */}
            <Animated.View style={[s.glowCircle, {
                opacity: glowAnim,
                transform: [{ scale: Animated.add(1, Animated.multiply(glowAnim, 0.2)) }]
            }]} />

            <View style={s.centerContent}>
                {/* Logo Image */}
                <Animated.View style={{ 
                    transform: [{ scale: logoScale }], 
                    opacity: logoOpacity 
                }}>
                    <Image 
                        source={require('../../assets/caremymed-logo.png')} 
                        style={s.logoImage}
                        resizeMode="contain"
                    />
                </Animated.View>

                {/* Subtitle */}
                <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentTranslateY }], alignItems: 'center' }}>
                    <View style={s.dividerContainer}>
                        <View style={[s.dividerLine, { backgroundColor: '#0284c7' }]} />
                        <Text style={s.subtitle}>Admin Portal</Text>
                        <View style={[s.dividerLine, { backgroundColor: '#16a34a' }]} />
                    </View>
                    <Text style={s.tagline}>Intelligent Healthcare Management</Text>
                </Animated.View>
            </View>

            {/* Interactive Login Button */}
            <Animated.View style={[s.bottomArea, { opacity: buttonOpacity, transform: [{ scale: buttonScale }] }]}>
                <TouchableOpacity 
                    activeOpacity={0.8} 
                    onPress={onFinish}
                    style={s.loginButtonContainer}
                >
                    <LinearGradient
                        colors={['#0284c7', '#0369a1']}
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
        backgroundColor: '#000000',
    },
    glowCircle: {
        position: 'absolute',
        top: height / 2 - 200,
        left: width / 2 - 200,
        width: 400,
        height: 400,
        borderRadius: 200,
        backgroundColor: 'rgba(2, 132, 199, 0.15)', // Subdued blue glow
        shadowColor: '#0284c7',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 100,
        elevation: 10,
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoImage: {
        width: 250,
        height: 250,
        marginBottom: 24,
    },
    subtitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#f8fafc',
        letterSpacing: 4,
        textTransform: 'uppercase',
        marginHorizontal: 16,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    dividerLine: {
        width: 40,
        height: 2,
        borderRadius: 1,
    },
    tagline: {
        fontSize: 14,
        fontWeight: '400',
        color: '#94a3b8',
        letterSpacing: 1,
    },
    bottomArea: {
        paddingHorizontal: 32,
        paddingBottom: 60,
        alignItems: 'center',
        width: '100%',
    },
    loginButtonContainer: {
        width: '100%',
        shadowColor: '#0284c7',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    loginButton: {
        width: '100%',
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    loginButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: 0.5,
    },
    versionText: {
        marginTop: 24,
        fontSize: 12,
        color: '#475569',
        letterSpacing: 1,
    },
});
