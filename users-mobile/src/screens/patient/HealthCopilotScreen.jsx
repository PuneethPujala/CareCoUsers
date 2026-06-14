import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView,
    Platform, Animated, ActivityIndicator, StatusBar, Image, ScrollView, AppState
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft, Send, Sparkles, Bot, User, Pill, Flame, TrendingUp,
    CheckCircle2, Activity, Heart, Wind, Calendar, Shield, Clock, Moon, CheckSquare, Square
} from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import usePatientStore from '../../store/usePatientStore';
import { apiService, handleApiError, getApiTokens } from '../../lib/api';
import AlertManager from '../../utils/AlertManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INITIAL_SUGGESTIONS = [
    '📋 What should I do today?',
    '📊 Weekly Health Summary',
    '💊 My medications list',
    '📈 My adherence streak',
    '🩺 View vitals status',
];

// Helper to resolve doctor mascot pose
const getMascotForMessage = (text) => {
    if (!text) return require('../../../assets/doctor_mascot.jpg');
    const lower = text.toLowerCase();
    if (lower.includes('high bp') || lower.includes('alert') || lower.includes('danger') || lower.includes('concerned') || lower.includes('warning') || lower.includes('missed') || lower.includes('overdue')) {
        return require('../../../assets/doctor_mascot_concerned.jpg');
    }
    if (lower.includes('streak') || lower.includes('congrats') || lower.includes('awesome') || lower.includes('great job') || lower.includes('success') || lower.includes('perfect')) {
        return require('../../../assets/doctor_mascot_celebration.jpg');
    }
    if (lower.includes('take') || lower.includes('medication') || lower.includes('medicine') || lower.includes('remind') || lower.includes('please drink')) {
        return require('../../../assets/doctor_mascot_caring.jpg');
    }
    if (lower.includes('insight') || lower.includes('summary') || lower.includes('trend') || lower.includes('report') || lower.includes('fact')) {
        return require('../../../assets/doctor_mascot_insights.jpg');
    }
    if (lower.includes('thinking') || lower.includes('analyzing') || lower.includes('checking')) {
        return require('../../../assets/doctor_mascot_thinking.jpg');
    }
    return require('../../../assets/doctor_mascot.jpg');
};

export default function HealthCopilotScreen({ navigation, route }) {
    const { t } = useTranslation();
    const { displayName, userRole } = useAuth();
    const patient = usePatientStore(state => state.patient);
    const insets = useSafeAreaInsets();
    
    const [activeTab, setActiveTab] = useState('brief'); // 'brief' | 'chat'
    const [copilotContext, setCopilotContext] = useState(null);
    const [loadingContext, setLoadingContext] = useState(true);
    
    // Checked states for Morning Brief and Care Plan items (stored locally)
    const [checkedBriefItems, setCheckedBriefItems] = useState({});
    const [checkedMedsTasks, setCheckedMedsTasks] = useState({});

    // Chatbot States
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [messages, setMessages] = useState([
        {
            id: 'disclaimer-msg',
            text: 'CareMyMed AI provides educational guidance and assistance. It does not replace a licensed medical professional. For emergencies, contact emergency services or your healthcare provider immediately.',
            isUser: false,
            timestamp: Date.now()
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [typingStage, setTypingStage] = useState('');
    const [followUpSuggestions, setFollowUpSuggestions] = useState(INITIAL_SUGGESTIONS);

    const flatListRef = useRef(null);
    const xhrRef = useRef(null);

    const firstName = displayName?.split(' ')[0] || 'there';

    // Fetch Copilot Context (Morning Brief + Care Plan)
    const fetchContext = async () => {
        try {
            setLoadingContext(true);
            const res = await apiService.patients.getCopilotContext();
            setCopilotContext(res.data);
        } catch (err) {
            console.warn('[HealthCopilot] Failed to fetch context:', err.message);
        } finally {
            setLoadingContext(false);
        }
    };

    useEffect(() => {
        fetchContext();
    }, []);

    // Session Initialization (similar to ChatbotScreen)
    useEffect(() => {
        if (!activeSessionId && patient?._id) {
            const initSession = async () => {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session creation timed out')), 5000)
                );
                const createPromise = (async () => {
                    const res = await apiService.chatbot.createSession({});
                    return res.data;
                })();

                try {
                    const session = await Promise.race([createPromise, timeoutPromise]);
                    setActiveSessionId(session._id);
                    
                    if (session.messages && session.messages.length > 1) {
                        const parsed = session.messages.map(m => ({
                            id: m._id || String(Math.random()),
                            text: m.text,
                            isUser: m.role === 'user',
                            timestamp: new Date(m.timestamp).getTime()
                        }));
                        setMessages(parsed);
                    }
                } catch (err) {
                    console.warn('[HealthCopilot] Session creation failed:', err.message);
                }
            };
            initSession();
        }
    }, [activeSessionId, patient?._id]);

    useEffect(() => {
        if (activeTab === 'chat') {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
    }, [activeTab, messages, isTyping]);

    const handleSend = async (textToSend) => {
        const queryText = textToSend || inputText;
        if (!queryText.trim()) return;

        setInputText('');
        setFollowUpSuggestions([]);
        
        // Add User Message
        const userMsg = {
            id: String(Math.random()),
            text: queryText,
            isUser: true,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);
        setTypingStage('🧠 Thinking...');

        // Add placeholder Bot Message for streaming
        const botMessageId = String(Math.random());
        const botPlaceholder = {
            id: botMessageId,
            text: '',
            isUser: false,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, botPlaceholder]);

        try {
            await streamFromBackend(queryText, botMessageId);
        } catch (err) {
            console.warn('[HealthCopilot] Streaming error:', err.message);
            // Update bot placeholder with error message
            setMessages(prev =>
                prev.map(m => m.id === botMessageId ? { ...m, text: 'Sorry, I encountered an issue. Please try again.' } : m)
            );
        } finally {
            setIsTyping(false);
            setTypingStage('');
        }
    };

    const streamFromBackend = (queryText, botMessageId) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (xhrRef.current) {
                    xhrRef.current.abort();
                    xhrRef.current = null;
                }

                const tokens = await getApiTokens();
                if (!tokens?.access_token) {
                    throw new Error('Not authenticated.');
                }

                const targetLanguage = patient?.preferredLanguage ?? patient?.language ?? 'en';
                const formData = new FormData();
                formData.append('targetLanguage', targetLanguage);
                formData.append('query', queryText);
                if (activeSessionId) {
                    formData.append('sessionId', activeSessionId);
                }

                const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';
                
                const xhr = new XMLHttpRequest();
                xhrRef.current = xhr;
                xhr.open('POST', `${baseUrl}/chatbot/chat`);
                xhr.setRequestHeader('Authorization', `Bearer ${tokens.access_token}`);
                xhr.setRequestHeader('x-app-name', 'CareMyMed');
                xhr.setRequestHeader('x-app-platform', 'mobile');
                xhr.setRequestHeader('X-Requested-Role', 'patient');

                let buffer = '';
                let botReplyText = '';

                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 3 || xhr.readyState === 4) {
                        const responseText = xhr.responseText;
                        const newChunk = responseText.substring(buffer.length);
                        buffer = responseText;

                        const lines = newChunk.split('\n');
                        for (let line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const parsed = JSON.parse(line.substring(6));
                                    if (parsed.type === 'chunk' && parsed.text) {
                                        botReplyText += parsed.text;
                                        setMessages(prev =>
                                            prev.map(m => m.id === botMessageId ? { ...m, text: botReplyText } : m)
                                        );
                                    } else if (parsed.type === 'suggestions' && parsed.items) {
                                        setFollowUpSuggestions(parsed.items);
                                    }
                                } catch (e) {
                                    // Parse error
                                }
                            }
                        }
                    }

                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve();
                        } else {
                            reject(new Error(`Server returned status ${xhr.status}`));
                        }
                    }
                };

                xhr.onerror = () => reject(new Error('Network error.'));
                xhr.send(formData);

            } catch (err) {
                reject(err);
            }
        });
    };

    const toggleBriefItem = (idx) => {
        setCheckedBriefItems(prev => ({
            ...prev,
            [idx]: !prev[idx]
        }));
    };

    const toggleMedsTask = (idx) => {
        setCheckedMedsTasks(prev => ({
            ...prev,
            [idx]: !prev[idx]
        }));
    };

    const renderHeader = () => (
        <View style={styles.header}>
            <View style={styles.headerRow}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft size={22} color="#1E293B" />
                </Pressable>
                <View style={styles.titleContainer}>
                    <Text style={styles.headerTitle}>Health Copilot</Text>
                    <Text style={styles.headerSub}>Interactive Care & Action Workspace</Text>
                </View>
                <View style={styles.headerActions}>
                    <Bot size={22} color="#6366F1" />
                </View>
            </View>
            
            {/* Tabs */}
            <View style={styles.tabBar}>
                <Pressable
                    style={[styles.tabBtn, activeTab === 'brief' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('brief')}
                >
                    <Sparkles size={16} color={activeTab === 'brief' ? '#6366F1' : '#64748B'} />
                    <Text style={[styles.tabBtnText, activeTab === 'brief' && styles.tabBtnTextActive]}>My Care Hub</Text>
                </Pressable>
                <Pressable
                    style={[styles.tabBtn, activeTab === 'chat' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('chat')}
                >
                    <Bot size={16} color={activeTab === 'chat' ? '#6366F1' : '#64748B'} />
                    <Text style={[styles.tabBtnText, activeTab === 'chat' && styles.tabBtnTextActive]}>Ask Copilot</Text>
                </Pressable>
            </View>
        </View>
    );

    const renderBriefTab = () => {
        if (loadingContext) {
            return (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#6366F1" />
                    <Text style={styles.loadingText}>Fetching health plan context...</Text>
                </View>
            );
        }

        const brief = copilotContext?.morning_brief || {};
        const carePlan = copilotContext?.care_plan || {};
        const focusItems = brief.focus_items || [];
        const scoreChange = brief.score_change || '+0';
        const trajectory = brief.forecast || 'Stable';
        const healthScore = brief.health_score || 80;

        return (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.briefScroll}>
                {/* Morning Brief Overview Card */}
                <View style={styles.briefCard}>
                    <LinearGradient
                        colors={['#EEF2FF', '#FFFFFF']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.briefGradient}
                    >
                        <View style={styles.briefHeader}>
                            <View>
                                <Text style={styles.briefGreeting}>Good Morning, {firstName}! 👋</Text>
                                <Text style={styles.briefTime}>Your health state is updated</Text>
                            </View>
                            <View style={styles.briefScoreBadge}>
                                <Text style={styles.briefScoreValue}>{healthScore}</Text>
                                <Text style={styles.briefScoreLabel}>SCORE</Text>
                            </View>
                        </View>

                        <View style={styles.briefMetricsRow}>
                            <View style={styles.briefMetricItem}>
                                <TrendingUp size={16} color="#6366F1" />
                                <Text style={styles.briefMetricValue}>{scoreChange}</Text>
                                <Text style={styles.briefMetricLabel}>Weekly Change</Text>
                            </View>
                            <View style={styles.briefDivider} />
                            <View style={styles.briefMetricItem}>
                                <Activity size={16} color="#10B981" />
                                <Text style={styles.briefMetricValue}>{trajectory}</Text>
                                <Text style={styles.briefMetricLabel}>Forecast Trajectory</Text>
                            </View>
                        </View>

                        {/* Today's Checklist */}
                        <Text style={styles.sectionHeading}>Today's Focus Items</Text>
                        {focusItems.length === 0 ? (
                            <Text style={styles.emptyText}>You are all caught up for today!</Text>
                        ) : (
                            <View style={styles.focusList}>
                                {focusItems.map((item, idx) => {
                                    const isChecked = !!checkedBriefItems[idx];
                                    return (
                                        <Pressable
                                            key={`brief-${idx}`}
                                            style={styles.focusItemRow}
                                            onPress={() => toggleBriefItem(idx)}
                                        >
                                            {isChecked ? (
                                                <CheckSquare size={20} color="#6366F1" />
                                            ) : (
                                                <Square size={20} color="#94A3B8" />
                                            )}
                                            <Text style={[styles.focusItemText, isChecked && styles.focusItemTextChecked]}>
                                                {item}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}
                    </LinearGradient>
                </View>

                {/* Weekly Care Plan Card */}
                <View style={styles.carePlanCard}>
                    <Text style={styles.carePlanTitle}>Weekly Care Plan (v{carePlan.version || 1})</Text>
                    <Text style={styles.carePlanSub}>Targets generated dynamically from your health insights</Text>
                    
                    <View style={styles.targetsGrid}>
                        <View style={styles.targetGridItem}>
                            <Activity size={18} color="#6366F1" style={{ marginBottom: 6 }} />
                            <Text style={styles.targetGridValue}>{carePlan.target_health_score || 85}</Text>
                            <Text style={styles.targetGridLabel}>Target Health Score</Text>
                        </View>
                        <View style={styles.targetGridItem}>
                            <Moon size={18} color="#0EA5E9" style={{ marginBottom: 6 }} />
                            <Text style={styles.targetGridValue}>{carePlan.sleep_hours_goal || 7.5} hrs</Text>
                            <Text style={styles.targetGridLabel}>Target Sleep/Night</Text>
                        </View>
                    </View>

                    <View style={styles.vitalsTargetBox}>
                        <Clock size={16} color="#64748B" />
                        <Text style={styles.vitalsTargetText}>
                            Vitals Target: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{carePlan.vitals_target || 'BP check every 2 days'}</Text>
                        </Text>
                    </View>

                    <Text style={styles.sectionHeading}>Medication Plan Checklist</Text>
                    {!carePlan.medication_tasks || carePlan.medication_tasks.length === 0 ? (
                        <Text style={styles.emptyText}>No medications tasks configured.</Text>
                    ) : (
                        <View style={styles.medTaskList}>
                            {carePlan.medication_tasks.map((task, idx) => {
                                const isChecked = !!checkedMedsTasks[idx];
                                return (
                                    <Pressable
                                        key={`med-${idx}`}
                                        style={styles.medTaskRow}
                                        onPress={() => toggleMedsTask(idx)}
                                    >
                                        {isChecked ? (
                                            <CheckCircle2 size={18} color="#22C55E" strokeWidth={2.5} />
                                        ) : (
                                            <View style={styles.pendingDot} />
                                        )}
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.medTaskName, isChecked && styles.medTaskChecked]}>
                                                {task.name}
                                            </Text>
                                            <Text style={styles.medTaskSlot}>{task.time_slot.toUpperCase()}</Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                </View>
            </ScrollView>
        );
    };

    const renderChatTab = () => {
        const renderItem = ({ item }) => {
            if (item.isSkeleton) return null;
            const isUser = item.isUser;
            return (
                <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}>
                    {!isUser && (
                        <Image
                            source={getMascotForMessage(item.text)}
                            style={styles.botAvatar}
                        />
                    )}
                    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
                        {isUser && (
                            <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        )}
                        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{item.text}</Text>
                        <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </View>
                    {isUser && (
                        <View style={styles.userAvatar}>
                            <User size={16} color="#FFFFFF" strokeWidth={2.5} />
                        </View>
                    )}
                </View>
            );
        };

        return (
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.chatListContent}
                    ListFooterComponent={() => (
                        <View style={{ gap: 10 }}>
                            {isTyping && (
                                <View style={styles.bubbleRow}>
                                    <Image
                                        source={require('../../../assets/doctor_mascot_thinking.jpg')}
                                        style={styles.botAvatar}
                                    />
                                    <View style={[styles.bubble, styles.bubbleBot, { flexDirection: 'row', alignItems: 'center' }]}>
                                        <Text style={styles.typingStageText}>{typingStage}</Text>
                                        <ActivityIndicator size="small" color="#6366F1" />
                                    </View>
                                </View>
                            )}
                            
                            {/* Follow-up suggestions */}
                            {followUpSuggestions.length > 0 && (
                                <View style={styles.suggestionsContainer}>
                                    {followUpSuggestions.map((s, i) => (
                                        <Pressable key={i} style={styles.suggestionChip} onPress={() => handleSend(s)}>
                                            <Text style={styles.suggestionChipText}>{s}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}
                />
                
                {/* Input Bar */}
                <View style={[styles.inputBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
                    <TextInput
                        style={styles.input}
                        placeholder="Type a message or ask a health question..."
                        placeholderTextColor="#94A3B8"
                        value={inputText}
                        onChangeText={setInputText}
                        onSubmitEditing={() => handleSend()}
                    />
                    <Pressable
                        style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
                        onPress={() => handleSend()}
                        disabled={!inputText.trim()}
                    >
                        <Send size={18} color="#FFFFFF" />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            {renderHeader()}
            <View style={{ flex: 1 }}>
                {activeTab === 'brief' ? renderBriefTab() : renderChatTab()}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        backgroundColor: '#FFFFFF',
        paddingTop: Platform.OS === 'ios' ? 44 : 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.screen,
        paddingVertical: 14,
        gap: 12,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#1E293B',
    },
    headerSub: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    headerActions: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: spacing.screen,
        paddingBottom: 10,
        gap: 12,
    },
    tabBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: radius.full,
        backgroundColor: '#F1F5F9',
    },
    tabBtnActive: {
        backgroundColor: '#EEF2FF',
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    tabBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#64748B',
    },
    tabBtnTextActive: {
        color: '#6366F1',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '600',
    },
    briefScroll: {
        padding: spacing.screen,
        gap: 16,
    },
    briefCard: {
        borderRadius: radius.lg,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    briefGradient: {
        padding: 20,
    },
    briefHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    briefGreeting: {
        fontSize: 20,
        fontWeight: '900',
        color: '#1E293B',
    },
    briefTime: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
        marginTop: 2,
    },
    briefScoreBadge: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#6366F1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    briefScoreValue: {
        fontSize: 20,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    briefScoreLabel: {
        fontSize: 8,
        fontWeight: '800',
        color: '#C7D2FE',
    },
    briefMetricsRow: {
        flexDirection: 'row',
        backgroundColor: '#F8FAFC',
        borderRadius: radius.md,
        padding: 12,
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    briefMetricItem: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    briefMetricValue: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1E293B',
    },
    briefMetricLabel: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '500',
    },
    briefDivider: {
        width: 1,
        height: 32,
        backgroundColor: '#E2E8F0',
    },
    sectionHeading: {
        fontSize: 14,
        fontWeight: '800',
        color: '#475569',
        letterSpacing: 0.5,
        marginBottom: 12,
        marginTop: 10,
    },
    focusList: {
        gap: 10,
    },
    focusItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    focusItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E293B',
        flex: 1,
    },
    focusItemTextChecked: {
        textDecorationLine: 'line-through',
        color: '#94A3B8',
    },
    emptyText: {
        fontSize: 13,
        color: '#94A3B8',
        fontStyle: 'italic',
        textAlign: 'center',
        marginVertical: 10,
    },
    carePlanCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 20,
    },
    carePlanTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: '#1E293B',
    },
    carePlanSub: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
        marginTop: 2,
        marginBottom: 16,
    },
    targetsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 14,
    },
    targetGridItem: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: radius.md,
        padding: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center',
    },
    targetGridValue: {
        fontSize: 18,
        fontWeight: '900',
        color: '#1E293B',
    },
    targetGridLabel: {
        fontSize: 10,
        color: '#64748B',
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 2,
    },
    vitalsTargetBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F1F5F9',
        padding: 12,
        borderRadius: radius.md,
        marginBottom: 16,
    },
    vitalsTargetText: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '600',
    },
    medTaskList: {
        gap: 8,
    },
    medTaskRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    pendingDot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: '#94A3B8',
        backgroundColor: 'transparent',
    },
    medTaskName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
    },
    medTaskChecked: {
        textDecorationLine: 'line-through',
        color: '#94A3B8',
    },
    medTaskSlot: {
        fontSize: 10,
        fontWeight: '800',
        color: '#6366F1',
        marginTop: 2,
    },
    chatListContent: {
        paddingHorizontal: spacing.screen,
        paddingTop: 16,
        paddingBottom: 24,
        gap: 14,
    },
    bubbleRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-end',
        maxWidth: '85%',
    },
    bubbleRowUser: {
        alignSelf: 'flex-end',
        flexDirection: 'row-reverse',
    },
    bubbleRowBot: {
        alignSelf: 'flex-start',
    },
    botAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#EEF2FF',
    },
    userAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#6366F1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bubble: {
        borderRadius: radius.lg,
        paddingHorizontal: 16,
        paddingVertical: 12,
        position: 'relative',
        overflow: 'hidden',
    },
    bubbleBot: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderBottomLeftRadius: 4,
    },
    bubbleUser: {
        borderBottomRightRadius: 4,
    },
    bubbleText: {
        fontSize: 14,
        color: '#1E293B',
        lineHeight: 20,
        fontWeight: '500',
    },
    bubbleTextUser: {
        color: '#FFFFFF',
    },
    bubbleTime: {
        fontSize: 9,
        color: '#94A3B8',
        marginTop: 6,
        alignSelf: 'flex-end',
    },
    bubbleTimeUser: {
        color: '#C7D2FE',
    },
    typingStageText: {
        fontSize: 13,
        color: '#64748B',
        marginRight: 6,
        fontWeight: '600',
    },
    suggestionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
        paddingHorizontal: 4,
    },
    suggestionChip: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: radius.full,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    suggestionChipText: {
        fontSize: 13,
        color: '#4F46E5',
        fontWeight: '700',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        paddingHorizontal: spacing.screen,
        paddingTop: 12,
        gap: 10,
    },
    input: {
        flex: 1,
        height: 44,
        borderRadius: radius.full,
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 16,
        fontSize: 14,
        color: '#1E293B',
        fontWeight: '500',
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#6366F1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtnDisabled: {
        backgroundColor: '#CBD5E1',
    },
});
