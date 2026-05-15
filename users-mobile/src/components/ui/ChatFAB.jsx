import React, { useRef, useEffect } from 'react';
import { Pressable, Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle } from 'lucide-react-native';

export default function ChatFAB({ onPress, bottomOffset = 90 }) {
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.spring(scaleAnim, {
            toValue: 1, friction: 5, tension: 80, useNativeDriver: true,
        }).start(() => {
            Animated.loop(Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
            ])).start();
        });
    }, []);

    return (
        <Animated.View style={[styles.container, { bottom: bottomOffset, transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }] }]}>
            <View style={styles.glowRing} />
            <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
                accessibilityLabel="Open AI Assistant" testID="chat-fab">
                <LinearGradient colors={['#818CF8', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
                    <MessageCircle size={26} color="#FFFFFF" strokeWidth={2.5} fill="rgba(255,255,255,0.15)" />
                </LinearGradient>
            </Pressable>
        </Animated.View>
    );
}

const S = 58;
const styles = StyleSheet.create({
    container: { position: 'absolute', right: 20, zIndex: 100, alignItems: 'center', justifyContent: 'center' },
    glowRing: { position: 'absolute', width: S + 16, height: S + 16, borderRadius: (S + 16) / 2, backgroundColor: 'rgba(99,102,241,0.12)' },
    fab: { width: S, height: S, borderRadius: S / 2, overflow: 'hidden', shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 12 },
    gradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
