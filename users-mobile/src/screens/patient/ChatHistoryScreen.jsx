import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
    Vibration, StatusBar, Image, Animated
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, MessageSquare, Plus, ChevronRight, Bot, Trash2, Sparkles, AlertCircle, Calendar } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, motion, anim, useReduceMotion } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import usePatientStore from '../../store/usePatientStore';
import { apiService, handleApiError } from '../../lib/api';
import AlertManager from '../../utils/AlertManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CompanionHeader from '../../components/ui/CompanionHeader';

export const globalChatCache = {}; // Keyed by sessionId: { messages, title, updatedAt, sessionId }
let cachedSessions = null;

const preloadRecentSessions = async (recentSessions, isCompanion, targetPatientId) => {
    if (!recentSessions || recentSessions.length === 0) return;
    const topSessions = recentSessions.slice(0, 5);
    for (const session of topSessions) {
        const sessionId = session._id;
        
        // 1. Try to load from AsyncStorage to warm global memory cache immediately
        try {
            const cacheKey = `chatbot_session_${sessionId}`;
            const cachedDataStr = await AsyncStorage.getItem(cacheKey);
            if (cachedDataStr) {
                const cachedData = JSON.parse(cachedDataStr);
                globalChatCache[sessionId] = cachedData;
            }
        } catch (err) {
            console.warn(`[Preload] Failed to read AsyncStorage for session ${sessionId}:`, err);
        }

        // 2. Fetch fresh data in background to refresh cache silently
        try {
            const params = isCompanion ? { patientId: targetPatientId } : {};
            const res = await apiService.chatbot.getSession(sessionId, params);
            if (res.data) {
                const sessionMessages = (res.data.messages || []).map(m => ({
                    id: m._id || String(Math.random()),
                    text: m.text,
                    isUser: m.role === 'user',
                    timestamp: new Date(m.timestamp).getTime(),
                    cards: m.cards || [],
                    suggestions: m.suggestions || [],
                    image: m.image,
                    audio: m.audio
                }));
                const sessionData = {
                    messages: sessionMessages,
                    title: res.data.title,
                    updatedAt: res.data.updated_at || res.data.created_at,
                    sessionId: sessionId
                };
                globalChatCache[sessionId] = sessionData;
                await AsyncStorage.setItem(`chatbot_session_${sessionId}`, JSON.stringify(sessionData));
            }
        } catch (err) {
            console.warn(`[Preload] Failed to fetch session ${sessionId}:`, err);
        }
    }
};

export default function ChatHistoryScreen() {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { userRole, displayName } = useAuth();
    const reduceMotion = useReduceMotion();
    
    const patient = usePatientStore(state => state.patient);
    const companionSelectedPatientId = usePatientStore(state => state.companionSelectedPatientId);
    
    const isCompanion = userRole === 'companion';
    const targetPatientId = isCompanion ? companionSelectedPatientId : patient?._id;

    const [sessions, setSessions] = useState(cachedSessions || []);
    const [isLoading, setIsLoading] = useState(!cachedSessions);
    const [isCreating, setIsCreating] = useState(false);

    // ── Entrance animation for hero + list ──
    const heroAnim = useRef(new Animated.Value(0)).current;
    const hasAnimated = useRef(false);

    const runEntrance = useCallback(() => {
        if (hasAnimated.current) return;
        hasAnimated.current = true;
        if (reduceMotion) {
            heroAnim.setValue(1);
            return;
        }
        Animated.spring(heroAnim, { toValue: 1, ...motion.springSoft, useNativeDriver: true }).start();
    }, [reduceMotion, heroAnim]);

    const loadSessions = useCallback(async () => {
        if (!targetPatientId) {
            setIsLoading(false);
            return;
        }
        try {
            if (!cachedSessions) {
                setIsLoading(true);
            }
            const params = isCompanion ? { patientId: targetPatientId } : {};
            const res = await apiService.chatbot.getSessions(params);
            const fetched = res.data || [];
            setSessions(fetched);
            cachedSessions = fetched;
            
            // Fire off background preloading
            preloadRecentSessions(fetched, isCompanion, targetPatientId);
        } catch (err) {
            console.warn('Failed to load chat sessions:', err);
            const apiErr = handleApiError(err);
            AlertManager.alert('Error', apiErr.message || 'Could not load chat history.', [{ text: 'OK' }], { type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, [targetPatientId, isCompanion]);

    useFocusEffect(
        useCallback(() => {
            loadSessions().then(() => runEntrance());
        }, [loadSessions, runEntrance])
    );

    const handleCreateSession = async () => {
        if (!targetPatientId) return;
        try {
            setIsCreating(true);
            const data = isCompanion ? { patientId: targetPatientId } : {};
            const res = await apiService.chatbot.createSession(data);
            
            // Optimistically update cache and local sessions before navigating
            const newSession = res.data;
            if (newSession) {
                setSessions(prev => {
                    const next = [newSession, ...prev];
                    cachedSessions = next;
                    return next;
                });
            }
            
            // Navigate to chatbot screen
            navigation.navigate('Chatbot', { sessionId: res.data._id });
        } catch (err) {
            console.warn('Failed to create session:', err);
            const apiErr = handleApiError(err);
            if (err.response?.status === 400 && apiErr.message.includes('Limit reached')) {
                AlertManager.alert(
                    'Chat Limit Reached 🚨',
                    'You can have at most 10 active concurrent chats. Please long-press and delete some previous conversations to start a new one.',
                    [{ text: 'OK' }],
                    { type: 'warning' }
                );
            } else {
                AlertManager.alert('Error', apiErr.message || 'Could not start a new chat session.', [{ text: 'OK' }], { type: 'error' });
            }
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteSession = (session) => {
        Vibration.vibrate(50);
        AlertManager.alert(
            'Delete Conversation 🗑️',
            `Are you sure you want to delete "${session.title}"?\nThis cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const params = isCompanion ? { patientId: targetPatientId } : {};
                            await apiService.chatbot.deleteSession(session._id, params);
                            setSessions(prev => {
                                const next = prev.filter(s => s._id !== session._id);
                                cachedSessions = next;
                                return next;
                            });
                            // Clear caches
                            delete globalChatCache[session._id];
                            await AsyncStorage.removeItem(`chatbot_session_${session._id}`);
                        } catch (err) {
                            console.warn('Failed to delete session:', err);
                            const apiErr = handleApiError(err);
                            AlertManager.alert('Error', apiErr.message || 'Could not delete conversation.', [{ text: 'OK' }], { type: 'error' });
                        }
                    }
                }
            ],
            { type: 'warning' }
        );
    };

    const handleSessionPress = (session) => {
        navigation.navigate('Chatbot', { sessionId: session._id });
    };

    const formatRelativeTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        
        if (isToday) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = d.toDateString() === yesterday.toDateString();
        
        if (isYesterday) {
            return 'Yesterday';
        }
        
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const renderSessionItem = ({ item }) => {
        return (
            <Pressable
                onPress={() => handleSessionPress(item)}
                onLongPress={() => handleDeleteSession(item)}
                style={({ pressed }) => [
                    styles.sessionRow,
                    pressed && styles.sessionRowPressed
                ]}
            >
                <Image 
                    source={require('../../../assets/doctor_mascot.jpg')} 
                    style={styles.mascotAvatar} 
                />
                
                <View style={styles.sessionDetails}>
                    <View style={styles.sessionHeaderRow}>
                        <Text style={styles.sessionTitle} numberOfLines={1}>
                            {item.title}
                        </Text>
                        <Text style={styles.sessionTime}>
                            {formatRelativeTime(item.updated_at || item.created_at)}
                        </Text>
                    </View>
                    
                    <Text style={styles.sessionSub}>
                        {item.message_count || 1} message{item.message_count !== 1 ? 's' : ''}
                    </Text>
                </View>
                
                <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
        );
    };

    const canGoBack = navigation.canGoBack();
    const useCompanionHeader = isCompanion;

    return (
        <View style={[styles.container, { paddingTop: useCompanionHeader ? 0 : (canGoBack ? insets.top : 50) }]}>
            {!useCompanionHeader && <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />}
            
            {/* ── Header ── */}
            {useCompanionHeader ? (
                <CompanionHeader
                    subtitle="Care Assistant"
                    title="Conversations"
                    onBack={canGoBack ? () => navigation.goBack() : null}
                    right={(
                        <Pressable
                            onPress={handleCreateSession}
                            disabled={isCreating}
                            style={({ pressed }) => [
                                styles.newChatBtn,
                                pressed && { opacity: 0.85 }
                            ]}
                        >
                            {isCreating ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Plus size={22} color="#FFF" strokeWidth={2.5} />
                            )}
                        </Pressable>
                    )}
                />
            ) : (
            <View style={styles.header}>
                <View style={styles.headerTitleContainer}>
                    {canGoBack && (
                        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
                            <ArrowLeft size={22} color="#0F172A" strokeWidth={2.5} />
                        </Pressable>
                    )}
                    <View>
                        <Text style={styles.headerSub}>Care Assistant</Text>
                        <Text style={styles.title}>Conversations</Text>
                    </View>
                </View>
                
                <Pressable 
                    onPress={handleCreateSession} 
                    disabled={isCreating}
                    style={({ pressed }) => [
                        styles.newChatBtn,
                        pressed && { opacity: 0.85 }
                    ]}
                >
                    {isCreating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Plus size={22} color="#FFF" strokeWidth={2.5} />
                    )}
                </Pressable>
            </View>
            )}

            {/* ── Content ── */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading conversations...</Text>
                </View>
            ) : (
                <FlatList
                    data={sessions}
                    renderItem={renderSessionItem}
                    keyExtractor={item => item._id}
                    contentContainerStyle={[
                        styles.listContent,
                        { paddingBottom: isCompanion ? layout.TAB_BAR_CLEARANCE + 72 : (canGoBack ? 40 : layout.TAB_BAR_CLEARANCE) }
                    ]}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                        <Pressable onPress={handleCreateSession} disabled={isCreating}>
                            <Animated.View style={{ opacity: heroAnim, transform: reduceMotion ? [] : [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
                            <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.heroCard}>
                                <View style={styles.heroHeader}>
                                    <View style={styles.heroIconBox}>
                                        <Sparkles size={20} color={colors.primary} strokeWidth={2.5} />
                                    </View>
                                    <Text style={styles.heroTitle}>Start a New Chat</Text>
                                </View>
                                <Text style={styles.heroDesc}>
                                    Ask the Care Assistant about {isCompanion ? "the patient's" : "your"} medications, vitals history, or adherence trends.
                                </Text>
                            </LinearGradient>
                            </Animated.View>
                        </Pressable>
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Bot size={48} color={colors.textMuted} strokeWidth={1.5} />
                            <Text style={styles.emptyTitle}>No conversations yet</Text>
                            <Text style={styles.emptySub}>
                                Tap the plus button or the card above to start chatting with the Care Assistant.
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { 
        paddingHorizontal: 24, 
        paddingBottom: 16, 
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    backBtn: { 
        width: 40, height: 40, borderRadius: 20, 
        backgroundColor: '#F1F5F9', 
        alignItems: 'center', justifyContent: 'center' 
    },
    headerSub: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
    newChatBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4
    },
    
    listContent: { padding: 20, gap: 16 },

    heroCard: {
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        marginBottom: 8,
    },
    heroHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    heroIconBox: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2
    },
    heroTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#312E81',
    },
    heroDesc: {
        fontSize: 13,
        color: '#4338CA',
        lineHeight: 18,
    },

    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },

    sessionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.borderLight,
        gap: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1
    },
    sessionRowPressed: {
        backgroundColor: '#F8FAFC',
        transform: [{ scale: 0.99 }]
    },
    mascotAvatar: {
        width: 44, height: 44, borderRadius: 22,
    },
    sessionDetails: {
        flex: 1,
        gap: 4,
    },
    sessionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sessionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.textPrimary,
        flex: 1,
        marginRight: 8,
    },
    sessionTime: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textMuted,
    },
    sessionSub: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textMuted,
    },

    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 20,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    emptySub: {
        fontSize: 13,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 18,
    }
});
