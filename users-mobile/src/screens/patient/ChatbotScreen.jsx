import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView,
    Platform, Animated, ActivityIndicator, StatusBar, Image, Alert, PanResponder, Vibration, AppState
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Sparkles, Bot, User, Mic, Paperclip, Trash2, Pill, Flame, TrendingUp, CheckCircle2, Activity, Heart, Wind, Calendar, Shield } from 'lucide-react-native';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import usePatientStore from '../../store/usePatientStore';
import { getApiTokens } from '../../lib/tokenStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INITIAL_SUGGESTIONS = [
    '📋 What should I do today?',
    '📊 Weekly Health Summary',
    '💊 My medications list',
    '📈 My adherence streak',
    '🩺 View vitals status',
];

function generateDynamicGreeting(firstName) {
    const store = usePatientStore.getState();
    const medsCount = store.dashboardMeds?.length || 0;
    const takenCount = store.dashboardMeds?.filter(m => m.taken).length || 0;
    const streak = store.adherenceDetails?.streak || 0;
    
    if (medsCount > 0 && takenCount === medsCount) {
        return `Hi ${firstName}! 🎉 You have taken all ${medsCount} medications scheduled for today. Outstanding job! How can I assist you with your health details right now?`;
    }
    
    if (streak >= 7) {
        return `Hello ${firstName}! 👋 You are on a strong ${streak}-day medication streak! Let's keep it going today. How can I help you?`;
    }
    
    if (medsCount > 0 && takenCount < medsCount) {
        const remaining = medsCount - takenCount;
        return `Hi ${firstName}! 👋 Just a quick check-in: you have ${remaining} medication${remaining > 1 ? 's' : ''} left to take today. I'm here if you have any questions about them, or if you'd like to check your vitals.`;
    }
    
    return `Hi ${firstName}! 👋 I'm your Conversational Care Assistant. I can help you check your medications list, log vitals, view your weekly summary, or coordinate with your care team. How can I help you today?`;
}

function AdherenceCard({ rate, streak, level }) {
    return (
        <View style={styles.cardContainer}>
            <LinearGradient colors={['#F0FDF4', '#FFFFFF']} style={styles.cardGradient}>
                <View style={styles.cardHeader}>
                    <TrendingUp size={16} color="#16A34A" />
                    <Text style={styles.cardTitle}>Medication Adherence</Text>
                </View>
                
                <View style={styles.cardRow}>
                    <View style={styles.cardMetricCol}>
                        <Text style={styles.cardMetricValue}>{rate}%</Text>
                        <Text style={styles.cardMetricLabel}>Adherence Rate</Text>
                    </View>
                    
                    <View style={styles.cardDivider} />
                    
                    <View style={styles.cardMetricCol}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Flame size={18} color="#F97316" fill="#F97316" />
                            <Text style={styles.cardMetricValue}>{streak}</Text>
                        </View>
                        <Text style={styles.cardMetricLabel}>Current Streak</Text>
                    </View>
                </View>
                
                <View style={[styles.cardBadge, { backgroundColor: rate >= 80 ? '#DCFCE7' : '#FEF3C7' }]}>
                    <Text style={[styles.cardBadgeText, { color: rate >= 80 ? '#15803D' : '#92400E' }]}>
                        Status: {level}
                    </Text>
                </View>
            </LinearGradient>
        </View>
    );
}

function MedicationsCard({ taken, remaining }) {
    return (
        <View style={styles.cardContainer}>
            <LinearGradient colors={['#EEF2FF', '#FFFFFF']} style={styles.cardGradient}>
                <View style={styles.cardHeader}>
                    <Pill size={16} color="#4F46E5" />
                    <Text style={styles.cardTitle}>Today's Schedule</Text>
                </View>
                
                <View style={{ marginTop: 8, gap: 8 }}>
                    {remaining.length === 0 && taken.length === 0 ? (
                        <Text style={styles.cardEmptyText}>No medications scheduled for today.</Text>
                    ) : null}
                    
                    {remaining.map((med, i) => (
                        <View key={`rem-${i}`} style={styles.medCheckRow}>
                            <View style={styles.medCheckIconPending}>
                                <View style={styles.medCheckIconInner} />
                            </View>
                            <Text style={styles.medCheckTextPending}>{med}</Text>
                        </View>
                    ))}
                    
                    {taken.map((med, i) => (
                        <View key={`taken-${i}`} style={styles.medCheckRow}>
                            <CheckCircle2 size={16} color="#16A34A" strokeWidth={2.5} />
                            <Text style={styles.medCheckTextTaken}>{med}</Text>
                        </View>
                    ))}
                </View>
            </LinearGradient>
        </View>
    );
}

function VitalsCard({ systolic, diastolic, heartRate, spo2 }) {
    return (
        <View style={styles.cardContainer}>
            <LinearGradient colors={['#FFF1F2', '#FFFFFF']} style={styles.cardGradient}>
                <View style={styles.cardHeader}>
                    <Activity size={16} color="#E11D48" />
                    <Text style={styles.cardTitle}>Vitals Status</Text>
                </View>
                
                <View style={styles.vitalsGrid}>
                    <View style={styles.vitalGridItem}>
                        <Heart size={14} color="#E11D48" />
                        <View>
                            <Text style={styles.vitalGridValue}>{systolic}/{diastolic}</Text>
                            <Text style={styles.vitalGridUnit}>BP mmHg</Text>
                        </View>
                    </View>
                    
                    <View style={styles.vitalGridItem}>
                        <Activity size={14} color="#4F46E5" />
                        <View>
                            <Text style={styles.vitalGridValue}>{heartRate}</Text>
                            <Text style={styles.vitalGridUnit}>HR bpm</Text>
                        </View>
                    </View>
                    
                    <View style={styles.vitalGridItem}>
                        <Wind size={14} color="#0EA5E9" />
                        <View>
                            <Text style={styles.vitalGridValue}>{spo2}%</Text>
                            <Text style={styles.vitalGridUnit}>SpO₂</Text>
                        </View>
                    </View>
                </View>
            </LinearGradient>
        </View>
    );
}

function SummaryCard({ adherenceRate, vitalsLoggedDays, missedDoses, currentStreak }) {
    return (
        <View style={styles.cardContainer}>
            <LinearGradient colors={['#FDF4FF', '#FFFFFF']} style={styles.cardGradient}>
                <View style={styles.cardHeader}>
                    <Calendar size={16} color="#C084FC" />
                    <Text style={styles.cardTitle}>Weekly Summary</Text>
                </View>
                
                <View style={styles.summaryList}>
                    <View style={styles.summaryRowItem}>
                        <Text style={styles.summaryRowLabel}>Adherence Rate</Text>
                        <Text style={[styles.summaryRowValue, { color: adherenceRate >= 80 ? '#16A34A' : '#D97706' }]}>{adherenceRate}%</Text>
                    </View>
                    <View style={styles.summaryRowItem}>
                        <Text style={styles.summaryRowLabel}>Vitals Logged</Text>
                        <Text style={styles.summaryRowValue}>{vitalsLoggedDays} days</Text>
                    </View>
                    <View style={styles.summaryRowItem}>
                        <Text style={styles.summaryRowLabel}>Missed Doses</Text>
                        <Text style={[styles.summaryRowValue, { color: missedDoses > 0 ? '#DC2626' : '#16A34A' }]}>{missedDoses}</Text>
                    </View>
                    <View style={styles.summaryRowItem}>
                        <Text style={styles.summaryRowLabel}>Current Streak</Text>
                        <Text style={styles.summaryRowValue}>{currentStreak} days</Text>
                    </View>
                </View>
            </LinearGradient>
        </View>
    );
}

function RenderMessageCards({ cards }) {
    if (!cards || cards.length === 0) return null;
    return (
        <View style={styles.cardsWrapper}>
            {cards.map((card, i) => {
                if (card.type === 'adherence') {
                    return <AdherenceCard key={i} rate={card.rate} streak={card.streak} level={card.level} />;
                }
                if (card.type === 'medications') {
                    return <MedicationsCard key={i} taken={card.taken || []} remaining={card.remaining || []} />;
                }
                if (card.type === 'vitals') {
                    return <VitalsCard key={i} systolic={card.systolic} diastolic={card.diastolic} heartRate={card.heartRate} spo2={card.spo2} />;
                }
                if (card.type === 'summary') {
                    return (
                        <SummaryCard 
                            key={i} 
                            adherenceRate={card.adherenceRate} 
                            vitalsLoggedDays={card.vitalsLoggedDays} 
                            missedDoses={card.missedDoses} 
                            currentStreak={card.currentStreak} 
                        />
                    );
                }
                return null;
            })}
        </View>
    );
}

// ── Single chat bubble ─────────────────────────────────────────────────────
function ChatBubble({ message, isUser }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, []);

    if (!message.text && !message.image && !message.audio && (!message.cards || message.cards.length === 0)) {
        return null;
    }

    return (
        <Animated.View style={[styles.bubbleRow, isUser && styles.bubbleRowUser, { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
            {!isUser && (
                <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.avatarCircle}>
                    <Sparkles size={14} color="#FFFFFF" strokeWidth={2.5} />
                </LinearGradient>
            )}
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot, message.image && styles.bubbleImageContainer, message.audio && styles.bubbleAudioContainer]}>
                {isUser && !message.image && !message.audio ? (
                    <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                ) : null}
                
                {message.image ? (
                    <Image source={{ uri: message.image }} style={styles.chatImage} resizeMode="cover" />
                ) : null}

                {message.audio ? (
                    <View style={styles.audioBubble}>
                        <Mic size={16} color="#6366F1" />
                        <Text style={styles.audioBubbleText}>Voice Message • 0:02</Text>
                    </View>
                ) : null}

                {message.text ? (
                    <Text style={[styles.bubbleText, isUser && !message.image && !message.audio && styles.bubbleTextUser]}>{message.text}</Text>
                ) : null}
                
                {!isUser && message.cards && message.cards.length > 0 ? (
                    <RenderMessageCards cards={message.cards} />
                ) : null}
                
                <Text style={[styles.bubbleTime, isUser && !message.image && !message.audio && styles.bubbleTimeUser]}>
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

// ── Follow-up suggestion chips ──────────────────────────────────────────────
function FollowUpChips({ suggestions, onPress }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }).start();
    }, []);

    if (!suggestions || suggestions.length === 0) return null;

    return (
        <Animated.View style={[styles.followUpContainer, { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
            {suggestions.map((s, i) => (
                <Pressable key={i} style={styles.followUpChip} onPress={() => onPress(s)}>
                    <Text style={styles.followUpText}>{s}</Text>
                </Pressable>
            ))}
        </Animated.View>
    );
}

// ── Typing indicator ────────────────────────────────────────────────────────
function TypingIndicator({ stage }) {
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
            <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.avatarCircle}>
                <Sparkles size={14} color="#FFFFFF" strokeWidth={2.5} />
            </LinearGradient>
            <View style={[styles.bubble, styles.bubbleBot, styles.typingBubble, { flexDirection: 'row', alignItems: 'center' }]}>
                {stage && <Text style={{ color: '#6B7280', marginRight: 8, fontSize: 13, fontWeight: '500' }}>{stage}</Text>}
                {dots.map((dot, i) => (
                    <Animated.View key={i} style={[styles.typingDot, { opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }] }]} />
                ))}
            </View>
        </View>
    );
}

// ── Welcome Snapshot Card ───────────────────────────────────────────────────
function WelcomeSnapshotCard({ firstName, medsCount, takenCount, vitals, streak }) {
    const remaining = medsCount - takenCount;
    
    // Determine BP text
    let bpText = 'BP not logged';
    if (vitals) {
        if (vitals.systolic && vitals.diastolic) {
            bpText = `BP stable ${vitals.systolic}/${vitals.diastolic} mmHg`;
        } else if (vitals.blood_pressure) {
            bpText = `BP stable ${vitals.blood_pressure.systolic}/${vitals.blood_pressure.diastolic} mmHg`;
        }
    }
    
    // Determine greeting based on time of day
    const hr = new Date().getHours();
    const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    
    return (
        <View style={styles.welcomeCard}>
            <LinearGradient 
                colors={['#EEF2FF', '#E0E7FF']} 
                start={{ x: 0, y: 0 }} 
                end={{ x: 1, y: 1 }} 
                style={styles.welcomeGradient}
            >
                <View style={styles.welcomeContent}>
                    <Text style={styles.welcomeTitle}>{greeting}, <Text style={{ fontWeight: '800', color: '#4F46E5' }}>{firstName}!</Text> 👋</Text>
                    <Text style={styles.welcomeSub}>Here's your health snapshot for today.</Text>
                    
                    <View style={styles.snapshotRow}>
                        <View style={styles.snapshotBadge}>
                            <CheckCircle2 size={12} color="#22C55E" />
                            <Text style={styles.snapshotBadgeText}>
                                {remaining === 0 ? 'All meds taken' : `${remaining} med${remaining > 1 ? 's' : ''} left`}
                            </Text>
                        </View>
                        
                        <View style={styles.snapshotBadge}>
                            <Heart size={12} color="#EF4444" fill="#EF4444" />
                            <Text style={styles.snapshotBadgeText}>{bpText}</Text>
                        </View>
                        
                        <View style={styles.snapshotBadge}>
                            <Flame size={12} color="#F97316" fill="#F97316" />
                            <Text style={styles.snapshotBadgeText}>{streak} day streak</Text>
                        </View>
                    </View>
                </View>
                
                <Image 
                    source={require('../../../assets/doctor_mascot.jpg')} 
                    style={styles.robotMascot} 
                    resizeMode="contain"
                />
            </LinearGradient>
        </View>
    );
}

// ── Quick Actions Dashboard ────────────────────────────────────────────────
function QuickActionsDashboard({ onPress }) {
    return (
        <View style={styles.actionsDashboard}>
            <View style={styles.actionsHeader}>
                <Sparkles size={16} color="#6366F1" strokeWidth={2.5} />
                <Text style={styles.actionsHeaderText}>How can I help you today?</Text>
            </View>
            
            <View style={styles.actionsGrid}>
                {/* Row 1 */}
                <View style={styles.actionsGridRow}>
                    <Pressable style={styles.actionGridCard} onPress={() => onPress('📋 What should I do today?')}>
                        <View style={[styles.actionIconBox, { backgroundColor: '#FFF7ED' }]}>
                            <Calendar size={18} color="#EA580C" />
                        </View>
                        <View style={styles.actionCardContent}>
                            <Text style={styles.actionCardTitle}>What should I do today?</Text>
                            <Text style={styles.actionCardSub}>See today's plan</Text>
                        </View>
                    </Pressable>
                    
                    <Pressable style={styles.actionGridCard} onPress={() => onPress('📊 Weekly Health Summary')}>
                        <View style={[styles.actionIconBox, { backgroundColor: '#ECFDF5' }]}>
                            <TrendingUp size={18} color="#059669" />
                        </View>
                        <View style={styles.actionCardContent}>
                            <Text style={styles.actionCardTitle}>Weekly Health Summary</Text>
                            <Text style={styles.actionCardSub}>Your progress this week</Text>
                        </View>
                    </Pressable>
                </View>
                
                {/* Row 2 */}
                <View style={styles.actionsGridRow}>
                    <Pressable style={styles.actionGridCard} onPress={() => onPress('💊 My medications list')}>
                        <View style={[styles.actionIconBox, { backgroundColor: '#EEF2FF' }]}>
                            <Pill size={18} color="#4F46E5" />
                        </View>
                        <View style={styles.actionCardContent}>
                            <Text style={styles.actionCardTitle}>My medications list</Text>
                            <Text style={styles.actionCardSub}>View all your meds</Text>
                        </View>
                    </Pressable>
                    
                    <Pressable style={styles.actionGridCard} onPress={() => onPress('📈 My adherence streak')}>
                        <View style={[styles.actionIconBox, { backgroundColor: '#FFF1F2' }]}>
                            <Flame size={18} color="#E11D48" />
                        </View>
                        <View style={styles.actionCardContent}>
                            <Text style={styles.actionCardTitle}>My adherence streak</Text>
                            <Text style={styles.actionCardSub}>Track your consistency</Text>
                        </View>
                    </Pressable>
                </View>
            </View>
            
            {/* Center Card 5 */}
            <Pressable style={styles.actionCardCenter} onPress={() => onPress('🩺 View vitals status')}>
                <View style={[styles.actionIconBox, { backgroundColor: '#F0FDF4' }]}>
                    <Activity size={18} color="#16A34A" />
                </View>
                <View style={styles.actionCardContent}>
                    <Text style={styles.actionCardTitle}>View vitals status</Text>
                    <Text style={styles.actionCardSub}>Check BP, HR & more</Text>
                </View>
            </Pressable>
            
            {/* Privacy / Security Banner */}
            <View style={styles.privacyBanner}>
                <View style={styles.privacyIconBox}>
                    <Shield size={18} color="#4F46E5" />
                </View>
                <Text style={styles.privacyText}>
                    Your health data is private, secure, and used only to support your care.
                </Text>
                <Pressable style={styles.privacyLearnBtn}>
                    <Text style={styles.privacyLearnText}>Learn more</Text>
                </Pressable>
            </View>
        </View>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══ MAIN CHATBOT SCREEN ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
export default function ChatbotScreen({ navigation, route }) {
    const { t } = useTranslation();
    const { displayName, user } = useAuth();
    const patient = usePatientStore(state => state.patient);
    const dashboardMeds = usePatientStore(state => state.dashboardMeds || []);
    const medsCount = dashboardMeds.length;
    const takenCount = dashboardMeds.filter(m => m.taken).length;
    const vitals = usePatientStore(state => state.vitals);
    const adherenceDetails = usePatientStore(state => state.adherenceDetails);
    const insets = useSafeAreaInsets();
    const flatListRef = useRef(null);
    const xhrRef = useRef(null); // Track active SSE stream for abort/cancellation

    const [inputText, setInputText] = useState('');
    
    // UI Loading States
    const [isTyping, setIsTyping] = useState(false);
    const [typingStage, setTypingStage] = useState(''); // 'Listening...', 'Transcribing...', 'Thinking...'
    
    // Follow-up suggestions from the last bot response
    const [followUpSuggestions, setFollowUpSuggestions] = useState([]);
    
    // Audio recording state
    const [recording, setRecording] = useState(null);
    const [recordingMode, setRecordingMode] = useState('idle'); // 'idle', 'holding', 'locked'
    const [isCancelling, setIsCancelling] = useState(false);
    
    const recordingModeRef = useRef('idle');
    const isCancellingRef = useRef(false);
    const pan = useRef(new Animated.ValueXY()).current;

    const setRecMode = useCallback((mode) => {
        setRecordingMode(mode);
        recordingModeRef.current = mode;
    }, []);

    const setCancelMode = useCallback((val) => {
        setIsCancelling(val);
        isCancellingRef.current = val;
    }, []);

    const firstName = displayName?.split(' ')[0] || 'there';

    const [messages, setMessages] = useState([]);

    useEffect(() => {
        if (messages.length === 0) {
            setMessages([
                {
                    id: '1',
                    text: generateDynamicGreeting(firstName),
                    isUser: false,
                    timestamp: Date.now(),
                }
            ]);
        }
    }, [messages.length, firstName]);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

    // Load Chat History from AsyncStorage
    useEffect(() => {
        const loadHistory = async () => {
            if (!patient?._id) return;
            try {
                const stored = await AsyncStorage.getItem(`@caremymed_chatbot_messages_${patient._id}`);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed && parsed.length > 0) {
                        setMessages(parsed);
                        setTimeout(() => scrollToBottom(), 300);
                    }
                }
            } catch (err) {
                console.log('Failed to load chat history', err);
            }
        };
        loadHistory();
    }, [patient?._id]);

    // Save Chat History to AsyncStorage
    useEffect(() => {
        const saveHistory = async () => {
            if (!patient?._id || messages.length <= 1) return;
            try {
                // Keep only the last 50 messages to avoid payload limits
                const messagesToSave = messages.slice(-50);
                await AsyncStorage.setItem(`@caremymed_chatbot_messages_${patient._id}`, JSON.stringify(messagesToSave));
            } catch (err) {
                console.log('Failed to save chat history', err);
            }
        };
        saveHistory();
    }, [messages, patient?._id]);

    // Cleanup audio and abort active stream on unmount
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState.match(/inactive|background/) && recordingModeRef.current !== 'idle') {
                cancelRecording();
            }
        });

        return () => {
            subscription.remove();
            if (recording) {
                recording.stopAndUnloadAsync();
            }
            // Abort any in-flight SSE stream when leaving screen
            if (xhrRef.current) {
                xhrRef.current.abort();
                xhrRef.current = null;
            }
        };
    }, [recording]);

    // Conversational processing sequence
    useEffect(() => {
        let interval;
        if (isTyping) {
            // Seed the stages based on initial state
            const isAudio = typingStage.includes('🎤') || typingStage.includes('📝');
            const stages = isAudio 
                ? ['🎤 Listening...', '🧠 Understanding...', '💬 Preparing response...']
                : ['🧠 Understanding...', '💬 Preparing response...'];
            
            let idx = 0;
            interval = setInterval(() => {
                idx = Math.min(idx + 1, stages.length - 1);
                setTypingStage(stages[idx]);
            }, 1500);
        }
        return () => clearInterval(interval);
    }, [isTyping]); // Don't include typingStage as a dependency to avoid resetting the interval

    // ── SSE Streaming API Integration ────────────
    const streamFromBackend = (userMsg, botMessageId, isAudio = false, recordingUri = null) => {
        return new Promise(async (resolve, reject) => {
            try {
                // Abort any previous in-flight stream
                if (xhrRef.current) {
                    xhrRef.current.abort();
                    xhrRef.current = null;
                }

                const tokens = await getApiTokens();
                if (!tokens?.access_token) {
                    throw new Error('Not authenticated. Please log in again.');
                }
                const token = tokens.access_token;
                const targetLanguage = patient?.preferredLanguage ?? patient?.language ?? 'en';

                const formData = new FormData();
                formData.append('targetLanguage', targetLanguage);

                if (isAudio && recordingUri) {
                    setTypingStage('📝 Transcribing...');
                    const extension = Platform.OS === 'ios' ? 'm4a' : 'm4a';
                    formData.append('audio', {
                        uri: recordingUri,
                        type: `audio/${extension}`,
                        name: `voice_note.${extension}`
                    });
                } else {
                    setTypingStage('🧠 Thinking...');
                    formData.append('query', userMsg);
                }

                const baseUrl = process.env.EXPO_PUBLIC_CHATBOT_URL || process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.5:3001/api';
                const url = `${baseUrl}/chatbot/chat`;

                // Use XMLHttpRequest for streaming in React Native
                const xhr = new XMLHttpRequest();
                xhrRef.current = xhr;
                let wasAborted = false;
                const originalAbort = xhr.abort.bind(xhr);
                xhr.abort = () => {
                    wasAborted = true;
                    originalAbort();
                };
                let lastIndex = 0; // Track how much of responseText we've processed

                xhr.open('POST', url, true);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                // Don't set Content-Type for FormData — XHR sets the boundary automatically

                xhr.onreadystatechange = () => {
                    // readyState 3 = LOADING (partial data available)
                    if (xhr.readyState === 3 || xhr.readyState === 4) {
                        const newText = xhr.responseText.substring(lastIndex);
                        lastIndex = xhr.responseText.length;

                        // Parse SSE lines from the new chunk
                        const lines = newText.split('\n');
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            try {
                                const event = JSON.parse(line.substring(6));

                                if (event.type === 'meta' && event.transcribedText) {
                                    console.log(`[SSE] Heard: "${event.transcribedText}"`);
                                }

                                if (event.type === 'chunk' && event.text) {
                                    setIsTyping(false); // Hide typing indicator, show live text
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === botMessageId
                                                ? { ...m, text: (m.text || '') + event.text }
                                                : m
                                        )
                                    );
                                }

                                if (event.type === 'cards' && event.items) {
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === botMessageId
                                                ? { ...m, cards: event.items }
                                                : m
                                        )
                                    );
                                }

                                if (event.type === 'suggestions' && event.items) {
                                    setFollowUpSuggestions(event.items.slice(0, 3));
                                }

                                if (event.type === 'done') {
                                    // Stream finished successfully
                                }

                                if (event.type === 'error') {
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === botMessageId
                                                ? { ...m, text: `Sorry, I ran into an issue: ${event.message}. Please try again.` }
                                                : m
                                        )
                                    );
                                }
                            } catch (e) {
                                // Partial JSON line, ignore
                            }
                        }
                    }

                    // readyState 4 = DONE
                    if (xhr.readyState === 4) {
                        xhrRef.current = null;
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve();
                        } else if (xhr.status === 0) {
                            if (wasAborted) {
                                resolve();
                            } else {
                                reject(new Error('Cannot connect to chatbot server. Please check your internet connection or try again later.'));
                            }
                        } else {
                            // Non-SSE error (auth failure, validation, etc.)
                            try {
                                const errData = JSON.parse(xhr.responseText);
                                reject(new Error(errData.error || 'Request failed'));
                            } catch {
                                reject(new Error(`Request failed with status ${xhr.status}`));
                            }
                        }
                    }
                };

                xhr.onerror = () => {
                    xhrRef.current = null;
                    reject(new Error('Network request failed. Please try again.'));
                };

                xhr.ontimeout = () => {
                    xhrRef.current = null;
                    reject(new Error('Request timed out. Please try again.'));
                };

                xhr.timeout = 120000; // 2 minute timeout
                xhr.send(formData);

            } catch (error) {
                reject(error);
            }
        });
    };

    const handleSend = useCallback(async (text, imageUri = null, audioUri = null) => {
        const msg = (text || inputText).trim();
        if (!msg && !imageUri && !audioUri && !recording) return;

        const isAudioMsg = recordingModeRef.current !== 'idle' || !!audioUri;
        const currentRecordingUri = isAudioMsg ? (audioUri || recording?.getURI()) : null;

        if (recording) {
            await recording.stopAndUnloadAsync();
            setRecording(null);
            setRecMode('idle');
            setCancelMode(false);
        }

        const userMessage = { 
            id: Date.now().toString(), 
            text: isAudioMsg ? '' : msg, 
            image: imageUri,
            audio: currentRecordingUri,
            isUser: true, 
            timestamp: Date.now() 
        };

        // Create an empty bot message placeholder that will be filled by streaming
        const botMessageId = (Date.now() + 1).toString();
        const botPlaceholder = {
            id: botMessageId,
            text: '',
            isUser: false,
            timestamp: Date.now(),
        };
        
        setMessages(prev => [...prev, userMessage, botPlaceholder]);
        setInputText('');
        setIsTyping(true);
        // Start the sequential text processing state
        if (isAudioMsg) {
            setTypingStage('🎤 Listening...');
        } else {
            setTypingStage('🧠 Understanding...');
        }
        setFollowUpSuggestions([]);

        try {
            await streamFromBackend(msg, botMessageId, isAudioMsg, currentRecordingUri);
        } catch (error) {
            setMessages(prev =>
                prev.map(m =>
                    m.id === botMessageId
                        ? { ...m, text: `Sorry, I ran into an issue: ${error.message}. Please try again.` }
                        : m
                )
            );
            setFollowUpSuggestions([]);
        } finally {
            setIsTyping(false);
            setTypingStage('');
        }
    }, [inputText, recording, user, patient]);

    const handleClearChat = () => {
        Alert.alert(
            'Clear Conversation',
            'Are you sure you want to delete all messages? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Clear', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setMessages([]);
                            setFollowUpSuggestions([]);
                            if (patient?._id) {
                                await AsyncStorage.removeItem(`@caremymed_chatbot_messages_${patient._id}`);
                            }
                        } catch (err) {
                            console.log('Failed to clear chat history', err);
                        }
                    }
                }
            ]
        );
    };

    const handlePickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets[0]) {
                handleSend('', result.assets[0].uri);
            }
        } catch (error) {
            console.warn('Image picker error:', error);
            Alert.alert('Error', 'Could not open image gallery.');
        }
    };

    const startRecording = async () => {
        try {
            const permission = await Audio.requestPermissionsAsync();
            if (permission.status === 'granted') {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                });
                const { recording } = await Audio.Recording.createAsync(
                    Audio.RecordingOptionsPresets.HIGH_QUALITY
                );
                setRecording(recording);
            } else {
                Alert.alert('Permission needed', 'Please grant microphone access to send voice messages.');
                setRecMode('idle');
            }
        } catch (err) {
            console.error('Failed to start recording', err);
            setRecMode('idle');
        }
    };

    const stopRecordingAndSend = async () => {
        if (!recording) return;
        try {
            setRecMode('idle');
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setRecording(null);
            
            if (uri) {
                handleSend('', null, uri);
            }
        } catch (err) {
            console.error('Failed to stop recording', err);
            setRecording(null);
        }
    };

    const cancelRecording = async () => {
        if (!recording) return;
        try {
            setRecMode('idle');
            setCancelMode(false);
            await recording.stopAndUnloadAsync();
            setRecording(null);
            Vibration.vibrate([0, 50, 50, 50]); // Quick buzz to indicate cancelled
        } catch (err) {
            console.error('Failed to cancel recording', err);
            setRecording(null);
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: async () => {
                setRecMode('holding');
                setCancelMode(false);
                pan.setValue({ x: 0, y: 0 });
                Vibration.vibrate(50); 
                await startRecording();
            },
            onPanResponderMove: (evt, gestureState) => {
                if (recordingModeRef.current === 'locked') return;

                if (gestureState.dy < -80) {
                    // Locked!
                    setRecMode('locked');
                    Vibration.vibrate(50);
                    pan.setValue({ x: 0, y: 0 });
                } else if (gestureState.dx < -80) {
                    // Cancel!
                    setCancelMode(true);
                    pan.setValue({ x: gestureState.dx, y: 0 });
                } else {
                    setCancelMode(false);
                    // Move the mic visually up/left based on drag
                    pan.setValue({ 
                        x: gestureState.dx < 0 ? gestureState.dx : 0, 
                        y: gestureState.dy < 0 ? gestureState.dy : 0 
                    });
                }
            },
            onPanResponderRelease: async (evt, gestureState) => {
                if (isCancellingRef.current) {
                    pan.setValue({ x: 0, y: 0 });
                    await cancelRecording();
                } else if (recordingModeRef.current === 'locked') {
                    // Doing nothing, wait for tap to stop
                } else {
                    pan.setValue({ x: 0, y: 0 });
                    await stopRecordingAndSend();
                }
            },
            onPanResponderTerminate: async () => {
                pan.setValue({ x: 0, y: 0 });
                await cancelRecording();
            }
        })
    ).current;

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
                        <Text style={styles.headerTitle}>Care Assistant</Text>
                        <View style={styles.onlineRow}>
                            <View style={styles.onlineDot} />
                            <Text style={styles.onlineText}>Online</Text>
                        </View>
                    </View>
                </View>
                <Pressable 
                    onPress={handleClearChat} 
                    style={({ pressed }) => [
                        styles.clearBtn,
                        pressed && { opacity: 0.7 }
                    ]}
                    hitSlop={12}
                >
                    <Trash2 size={20} color="#EF4444" strokeWidth={2} />
                </Pressable>
            </View>

            {/* ── Messages ── */}
            <KeyboardAvoidingView 
                style={{ flex: 1 }} 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : insets.top + 66}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.messageList}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                        <WelcomeSnapshotCard
                            firstName={patient?.first_name || displayName || 'there'}
                            medsCount={medsCount}
                            takenCount={takenCount}
                            vitals={vitals}
                            streak={adherenceDetails?.streak || 0}
                        />
                    }
                    ListFooterComponent={
                        <>
                            {messages.length <= 2 && (
                                <QuickActionsDashboard onPress={(s) => handleSend(s)} />
                            )}
                            {isTyping ? <TypingIndicator stage={typingStage} /> : null}
                            {!isTyping && followUpSuggestions.length > 0 ? (
                                <FollowUpChips 
                                    suggestions={followUpSuggestions} 
                                    onPress={(s) => handleSend(s)} 
                                />
                            ) : null}
                        </>
                    }
                />

                {/* ── Input bar ── */}
                <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    {recordingMode === 'idle' ? (
                        <>
                            <Pressable style={styles.inputAction} onPress={handlePickImage}>
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
                        </>
                    ) : (
                        <View style={styles.recordingOverlay}>
                            {recordingMode === 'locked' ? (
                                <>
                                    <View style={styles.recordingRow}>
                                        <View style={styles.recordingDotPulse} />
                                        <Text style={styles.recordingText}>Recording...</Text>
                                    </View>
                                    <Pressable style={styles.cancelRecordingBtn} onPress={cancelRecording}>
                                        <Text style={styles.cancelRecordingTxt}>Cancel</Text>
                                    </Pressable>
                                </>
                            ) : (
                                <>
                                    <View style={styles.recordingRow}>
                                        <View style={[styles.recordingDotPulse, isCancelling && { backgroundColor: '#EF4444' }]} />
                                        <Text style={[styles.recordingText, isCancelling && { color: '#EF4444' }]}>
                                            {isCancelling ? 'Release to cancel' : 'Slide up to lock ⬆️'}
                                        </Text>
                                    </View>
                                    <Text style={{ color: '#94A3B8', fontSize: 13, marginRight: 50 }}>Slide left to cancel ⬅️</Text>
                                </>
                            )}
                        </View>
                    )}

                    {/* Primary Button: Send or Hold-to-Speak */}
                    {inputText.trim().length > 0 ? (
                        <Pressable style={styles.sendBtn} onPress={() => handleSend()}>
                            <LinearGradient colors={['#818CF8', '#4F46E5']} style={styles.sendGradient}>
                                <Send size={18} color="#FFF" strokeWidth={2.5} />
                            </LinearGradient>
                        </Pressable>
                    ) : (
                        <Animated.View 
                            style={[
                                styles.micBtnContainer, 
                                { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
                            ]} 
                            {...panResponder.panHandlers}
                        >
                            {recordingMode === 'locked' ? (
                                <Pressable style={styles.sendBtn} onPress={stopRecordingAndSend}>
                                    <LinearGradient colors={['#10B981', '#059669']} style={styles.sendGradient}>
                                        <Send size={18} color="#FFF" strokeWidth={2.5} />
                                    </LinearGradient>
                                </Pressable>
                            ) : (
                                <View style={[styles.micBtnInner, recordingMode === 'holding' ? styles.micBtnHolding : styles.micBtnIdle]}>
                                    <Mic size={20} color={recordingMode === 'holding' ? '#EF4444' : '#FFF'} strokeWidth={2.5} />
                                </View>
                            )}
                        </Animated.View>
                    )}
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
    backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    clearBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
    onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
    onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22C55E' },
    onlineText: { fontSize: 11, fontWeight: '600', color: '#22C55E' },

    // ── Welcome card ──
    welcomeCard: {
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 8,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
    },
    welcomeGradient: {
        padding: 20,
        borderRadius: 24,
        flexDirection: 'row',
        position: 'relative',
        minHeight: 140,
        overflow: 'hidden',
    },
    welcomeContent: {
        flex: 1,
        paddingRight: 80,
        justifyContent: 'center',
    },
    welcomeTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 4,
    },
    welcomeSub: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
        marginBottom: 12,
    },
    snapshotRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    snapshotBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderWidth: 0.5,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 2,
        elevation: 1,
    },
    snapshotBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#4F46E5',
    },
    robotMascot: {
        position: 'absolute',
        right: -10,
        bottom: -10,
        width: 120,
        height: 140,
    },

    // ── Suggestions Dashboard ──
    actionsDashboard: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    actionsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'center',
        marginVertical: 4,
    },
    actionsHeaderText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#4F46E5',
    },
    actionsGrid: {
        gap: 8,
    },
    actionsGridRow: {
        flexDirection: 'row',
        gap: 8,
    },
    actionGridCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 10,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
        gap: 8,
    },
    actionCardCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
        gap: 8,
        width: '70%',
    },
    actionIconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionCardContent: {
        flex: 1,
    },
    actionCardTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: '#4338CA',
    },
    actionCardSub: {
        fontSize: 9,
        color: '#94A3B8',
        fontWeight: '500',
        marginTop: 1,
    },

    // ── Privacy banner ──
    privacyBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 0.5,
        borderColor: '#C7D2FE',
        gap: 10,
        marginTop: 12,
    },
    privacyIconBox: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E0E7FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    privacyText: {
        flex: 1,
        fontSize: 10,
        color: '#4338CA',
        lineHeight: 14,
        fontWeight: '600',
    },
    privacyLearnBtn: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#C7D2FE',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    privacyLearnText: {
        fontSize: 10,
        color: '#4F46E5',
        fontWeight: '700',
    },

    // ── Messages ──
    messageList: { paddingBottom: 8 },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, marginVertical: 4, gap: 8 },
    bubbleRowUser: { flexDirection: 'row', justifyContent: 'flex-end' },
    avatarCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    avatarCircleUser: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    bubble: { maxWidth: '75%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, overflow: 'hidden' },
    bubbleImageContainer: { paddingHorizontal: 4, paddingVertical: 4, backgroundColor: 'transparent' },
    bubbleAudioContainer: { paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#FFFFFF' },
    chatImage: { width: 200, height: 200, borderRadius: 16 },
    audioBubble: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    audioBubbleText: { fontSize: 14, color: '#6366F1', fontWeight: '600' },
    bubbleBot: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderBottomLeftRadius: 6 },
    bubbleUser: { borderBottomRightRadius: 6 },
    bubbleText: { fontSize: 14, color: '#1E293B', lineHeight: 20, fontWeight: '500' },
    bubbleTextUser: { color: '#FFFFFF' },
    bubbleTime: { fontSize: 10, color: '#94A3B8', marginTop: 4, textAlign: 'right', fontWeight: '600' },
    bubbleTimeUser: { color: 'rgba(255,255,255,0.7)' },
    
    recordingOverlay: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10 },
    recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    recordingDotPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
    recordingText: { fontSize: 15, fontWeight: '600', color: '#334155' },
    cancelRecordingBtn: { paddingHorizontal: 12, paddingVertical: 6, marginRight: 40 },
    cancelRecordingTxt: { color: '#EF4444', fontWeight: '600', fontSize: 14 },
    micBtnContainer: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
    micBtnInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
    micBtnIdle: { backgroundColor: '#6366F1' },
    micBtnHolding: { backgroundColor: '#FEE2E2', transform: [{ scale: 1.2 }] },

    // ── Typing indicator ──
    typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14, paddingHorizontal: 18 },
    typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366F1' },

    // ── Initial Suggestions ──
    suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    suggestionChip: {
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E7FF',
        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    },
    suggestionText: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },

    // ── Follow-up Suggestions ──
    followUpContainer: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8,
        paddingHorizontal: 50, // offset to align with bot bubble (avatar width + gap)
        paddingVertical: 4, marginBottom: 4,
    },
    followUpChip: {
        backgroundColor: '#F0F0FF', borderWidth: 1, borderColor: '#C7D2FE',
        borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
    },
    followUpText: { fontSize: 12, fontWeight: '600', color: '#4338CA' },

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

    // ── Structured Cards ──
    cardsWrapper: { marginTop: 8, gap: 10, width: '100%' },
    cardContainer: {
        width: '100%', borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        shadowColor: '#0A2463', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    },
    cardGradient: { padding: 14 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
    cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginVertical: 8 },
    cardMetricCol: { alignItems: 'center' },
    cardMetricValue: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    cardMetricLabel: { fontSize: 10, fontWeight: '600', color: '#64748B', marginTop: 2 },
    cardBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, alignSelf: 'flex-start', marginTop: 4 },
    cardBadgeText: { fontSize: 11, fontWeight: '700' },
    
    // Medications Card
    medCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    medCheckIconPending: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
    medCheckIconInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6366F1' },
    medCheckTextPending: { fontSize: 13, fontWeight: '600', color: '#334155' },
    medCheckTextTaken: { fontSize: 13, fontWeight: '500', color: '#94A3B8', textDecorationLine: 'line-through' },
    cardEmptyText: { fontSize: 12, color: '#64748B', fontStyle: 'italic', paddingVertical: 4 },
    
    // Vitals Grid
    vitalsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 4 },
    vitalGridItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', padding: 8, borderRadius: 10, borderWidth: 0.5, borderColor: '#E2E8F0' },
    vitalGridValue: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
    vitalGridUnit: { fontSize: 9, fontWeight: '600', color: '#64748B' },
    
    // Summary Card
    summaryList: { gap: 6 },
    summaryRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
    summaryRowLabel: { fontSize: 12, fontWeight: '500', color: '#475569' },
    summaryRowValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
});
