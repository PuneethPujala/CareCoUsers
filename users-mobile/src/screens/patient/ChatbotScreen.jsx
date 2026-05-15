import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView,
    Platform, Animated, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Sparkles, Bot, User, Mic, Paperclip } from 'lucide-react-native';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

const INITIAL_SUGGESTIONS = [
    '💊 What medications am I taking?',
    '📊 Show my vitals summary',
    '🩺 Health tips for today',
    '⏰ When is my next dose?',
];

// ── Single chat bubble ─────────────────────────────────────────────────────
function ChatBubble({ message, isUser }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, []);

    return (
        <Animated.View style={[styles.bubbleRow, isUser && styles.bubbleRowUser, { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
            {!isUser && (
                <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.avatarCircle}>
                    <Bot size={16} color="#6366F1" strokeWidth={2.5} />
                </LinearGradient>
            )}
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
                {isUser ? (
                    <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                ) : null}
                <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.text}</Text>
                <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
            {isUser && (
                <View style={styles.avatarCircleUser}>
                    <User size={16} color="#FFFFFF" strokeWidth={2.5} />
                </View>
            )}
        </Animated.View>
    );
}

// ── Typing indicator ────────────────────────────────────────────────────────
function TypingIndicator() {
    const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
    useEffect(() => {
        const anims = dots.map((dot, i) =>
            Animated.loop(Animated.sequence([
                Animated.delay(i * 200),
                Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
            ]))
        );
        anims.forEach(a => a.start());
        return () => anims.forEach(a => a.stop());
    }, []);

    return (
        <View style={[styles.bubbleRow]}>
            <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.avatarCircle}>
                <Bot size={16} color="#6366F1" strokeWidth={2.5} />
            </LinearGradient>
            <View style={[styles.bubble, styles.bubbleBot, styles.typingBubble]}>
                {dots.map((dot, i) => (
                    <Animated.View key={i} style={[styles.typingDot, { opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }] }]} />
                ))}
            </View>
        </View>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ MAIN CHATBOT SCREEN ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
export default function ChatbotScreen({ navigation }) {
    const { t } = useTranslation();
    const { displayName } = useAuth();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef(null);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const firstName = displayName?.split(' ')[0] || 'there';

    const [messages, setMessages] = useState([
        {
            id: '1',
            text: `Hi ${firstName}! 👋 I'm your CareMyMed AI assistant. I can help you with medication info, vitals, health tips, and more. How can I help you today?`,
            isUser: false,
            timestamp: Date.now(),
        },
    ]);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

    // ── Placeholder response (replace with real model later) ────────────
    const getPlaceholderResponse = (userMsg) => {
        const lower = userMsg.toLowerCase();
        if (lower.includes('medication') || lower.includes('med') || lower.includes('drug'))
            return "I can see your medication schedule! Once our AI model is connected, I'll give you detailed info about dosages, interactions, and reminders. For now, check the Medications tab for your full list. 💊";
        if (lower.includes('vital') || lower.includes('heart') || lower.includes('blood pressure'))
            return "Your vitals tracking is looking good! When our AI is fully integrated, I'll be able to analyze trends and predict health patterns. Check your dashboard for today's readings. 📊";
        if (lower.includes('tip') || lower.includes('health') || lower.includes('advice'))
            return "Here's a quick health tip: Stay hydrated and try to take short walks every hour! Once our AI model is fine-tuned, I'll provide personalized health recommendations based on your profile. 🩺";
        if (lower.includes('dose') || lower.includes('next') || lower.includes('schedule'))
            return "Your medication schedule is managed in the Medications tab. Soon, I'll be able to proactively remind you and suggest optimal timing based on your routine! ⏰";
        if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey'))
            return `Hello ${firstName}! 😊 I'm here to help. Ask me anything about your medications, vitals, or health!`;
        return "Thanks for your message! I'm currently being fine-tuned to give you the best health assistance. In the meantime, feel free to explore the app's features — Medications, Vitals, and Health Profile are all at your fingertips! 🚀";
    };

    const handleSend = useCallback((text) => {
        const msg = (text || inputText).trim();
        if (!msg) return;

        const userMessage = { id: Date.now().toString(), text: msg, isUser: true, timestamp: Date.now() };
        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setIsTyping(true);

        // Simulate AI response delay
        setTimeout(() => {
            const botReply = {
                id: (Date.now() + 1).toString(),
                text: getPlaceholderResponse(msg),
                isUser: false,
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, botReply]);
            setIsTyping(false);
        }, 1200 + Math.random() * 800);
    }, [inputText, firstName]);

    const renderMessage = useCallback(({ item }) => (
        <ChatBubble message={item} isUser={item.isUser} />
    ), []);

    const keyExtractor = useCallback((item) => item.id, []);

    return (
        <View style={[styles.screen, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
                    <ArrowLeft size={22} color="#0F172A" strokeWidth={2.5} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.headerAvatar}>
                        <Sparkles size={18} color="#FFF" strokeWidth={2.5} />
                    </LinearGradient>
                    <View>
                        <Text style={styles.headerTitle}>CareMyMed AI</Text>
                        <View style={styles.onlineRow}>
                            <View style={styles.onlineDot} />
                            <Text style={styles.onlineText}>Online</Text>
                        </View>
                    </View>
                </View>
                <View style={{ width: 42 }} />
            </View>

            {/* ── Messages ── */}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.messageList}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                        <View style={styles.welcomeCard}>
                            <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.welcomeGradient}>
                                <LinearGradient colors={['#818CF8', '#6366F1']} style={styles.welcomeIconBox}>
                                    <Sparkles size={20} color="#FFF" />
                                </LinearGradient>
                                <Text style={styles.welcomeTitle}>Your AI Health Assistant</Text>
                                <Text style={styles.welcomeSub}>
                                    Ask me about medications, vitals, health tips, and more. I'm here to help you stay on top of your health.
                                </Text>
                            </LinearGradient>
                        </View>
                    }
                    ListFooterComponent={isTyping ? <TypingIndicator /> : null}
                />

                {/* ── Suggestion chips (shown when few messages) ── */}
                {messages.length <= 2 && (
                    <View style={styles.suggestionsRow}>
                        {INITIAL_SUGGESTIONS.map((s, i) => (
                            <Pressable key={i} style={styles.suggestionChip} onPress={() => handleSend(s)}>
                                <Text style={styles.suggestionText}>{s}</Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                {/* ── Input bar ── */}
                <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    <Pressable style={styles.inputAction} onPress={() => {}}>
                        <Paperclip size={20} color="#94A3B8" strokeWidth={2} />
                    </Pressable>
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Type your message..."
                            placeholderTextColor="#94A3B8"
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxLength={500}
                            returnKeyType="send"
                            onSubmitEditing={() => handleSend()}
                            blurOnSubmit={false}
                        />
                    </View>
                    <Pressable style={styles.inputAction} onPress={() => {}}>
                        <Mic size={20} color="#94A3B8" strokeWidth={2} />
                    </Pressable>
                    <Pressable
                        style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
                        onPress={() => handleSend()}
                        disabled={!inputText.trim() && !isTyping}
                    >
                        <LinearGradient
                            colors={inputText.trim() ? ['#818CF8', '#4F46E5'] : ['#E2E8F0', '#E2E8F0']}
                            style={styles.sendGradient}
                        >
                            <Send size={18} color={inputText.trim() ? '#FFF' : '#94A3B8'} strokeWidth={2.5} />
                        </LinearGradient>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#F8FAFC' },

    // ── Header ──
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
        shadowColor: '#0A2463', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 3,
    },
    backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
    onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
    onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22C55E' },
    onlineText: { fontSize: 11, fontWeight: '600', color: '#22C55E' },

    // ── Welcome card ──
    welcomeCard: { marginHorizontal: 16, marginTop: 16, marginBottom: 8, borderRadius: 20, overflow: 'hidden' },
    welcomeGradient: { padding: 20, alignItems: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#C7D2FE' },
    welcomeIconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    welcomeTitle: { fontSize: 16, fontWeight: '800', color: '#312E81', marginBottom: 4 },
    welcomeSub: { fontSize: 13, color: '#4338CA', textAlign: 'center', lineHeight: 19, fontWeight: '500' },

    // ── Messages ──
    messageList: { paddingBottom: 8 },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, marginVertical: 4, gap: 8 },
    bubbleRowUser: { flexDirection: 'row', justifyContent: 'flex-end' },
    avatarCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    avatarCircleUser: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    bubble: { maxWidth: '75%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, overflow: 'hidden' },
    bubbleBot: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderBottomLeftRadius: 6 },
    bubbleUser: { borderBottomRightRadius: 6 },
    bubbleText: { fontSize: 14, color: '#1E293B', lineHeight: 20, fontWeight: '500' },
    bubbleTextUser: { color: '#FFFFFF' },
    bubbleTime: { fontSize: 10, color: '#94A3B8', marginTop: 4, textAlign: 'right', fontWeight: '600' },
    bubbleTimeUser: { color: 'rgba(255,255,255,0.7)' },

    // ── Typing indicator ──
    typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14, paddingHorizontal: 18 },
    typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366F1' },

    // ── Suggestions ──
    suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    suggestionChip: {
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E7FF',
        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    },
    suggestionText: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },

    // ── Input bar ──
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 6,
        paddingHorizontal: 12, paddingTop: 10,
        backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F1F5F9',
    },
    inputAction: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    inputWrapper: {
        flex: 1, backgroundColor: '#F1F5F9', borderRadius: 22,
        borderWidth: 1, borderColor: '#E2E8F0',
        paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 4,
        maxHeight: 100,
    },
    textInput: { fontSize: 14, color: '#0F172A', fontWeight: '500', maxHeight: 80 },
    sendBtn: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
    sendBtnDisabled: { opacity: 0.6 },
    sendGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
