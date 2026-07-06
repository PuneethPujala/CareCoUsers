import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView,
    Platform, Animated, ActivityIndicator, StatusBar, Image, PanResponder, Vibration, AppState
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Sparkles, Bot, User, Mic, Paperclip, Trash2, Pill, Flame, TrendingUp, CheckCircle2, Activity, Heart, Wind, Calendar, Shield, Plus } from 'lucide-react-native';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import usePatientStore from '../../store/usePatientStore';
import { getApiTokens } from '../../lib/tokenStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService, handleApiError } from '../../lib/api';
import AlertManager from '../../utils/AlertManager';
import { globalChatCache } from './ChatHistoryScreen';
import TabScreenTransition from '../../components/ui/TabScreenTransition';

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

function generateCompanionGreeting(companionFirstName, patientName, companionData) {
    const patientShortName = patientName?.split(' ')[0] || 'your family member';
    const medsCount = companionData?.medication_schedule?.length || 0;
    const takenCount = companionData?.medication_schedule?.filter(m => m.taken).length || 0;
    const streak = companionData?.patient?.current_streak || 0;
    
    if (medsCount > 0 && takenCount === medsCount) {
        return `Hi ${companionFirstName}! 🎉 ${patientShortName} has taken all ${medsCount} medications scheduled for today. Outstanding job! How can I assist you with their health details right now?`;
    }
    
    if (streak >= 7) {
        return `Hello ${companionFirstName}! 👋 ${patientShortName} is on a strong ${streak}-day medication streak! Let's keep it going today. How can I help you?`;
    }
    
    if (medsCount > 0 && takenCount < medsCount) {
        const remaining = medsCount - takenCount;
        return `Hi ${companionFirstName}! 👋 Just a quick update: ${patientShortName} has ${remaining} medication${remaining > 1 ? 's' : ''} left to take today. I'm here if you have any questions or if you'd like to check their vitals.`;
    }
    
    return `Hi ${companionFirstName}! 👋 I'm your Care Assistant. I can help you check ${patientShortName}'s medications list, view vitals status, review their weekly summary, or check-in on their adherence. How can I help you today?`;
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
                        <Heart size={14} color="#E11D48" style={{ marginBottom: 4 }} />
                        <Text style={styles.vitalGridValue} numberOfLines={1} adjustsFontSizeToFit>{systolic}/{diastolic}</Text>
                        <Text style={styles.vitalGridUnit}>BP mmHg</Text>
                    </View>
                    
                    <View style={styles.vitalGridItem}>
                        <Activity size={14} color="#4F46E5" style={{ marginBottom: 4 }} />
                        <Text style={styles.vitalGridValue} numberOfLines={1} adjustsFontSizeToFit>{heartRate}</Text>
                        <Text style={styles.vitalGridUnit}>HR bpm</Text>
                    </View>
                    
                    <View style={styles.vitalGridItem}>
                        <Wind size={14} color="#0EA5E9" style={{ marginBottom: 4 }} />
                        <Text style={styles.vitalGridValue} numberOfLines={1} adjustsFontSizeToFit>{spo2}%</Text>
                        <Text style={styles.vitalGridUnit}>SpO₂</Text>
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

// ── Helper to dynamically resolve mascot pose based on message content ──────
const getMascotForMessage = (text) => {
    if (!text) return require('../../../assets/doctor_mascot.jpg');
    const lower = text.toLowerCase();
    
    // Concern/warning keywords (English, Spanish, Hindi)
    if (
        lower.includes('high bp') || lower.includes('alert') || lower.includes('danger') || lower.includes('concerned') || lower.includes('warning') || lower.includes('missed several') || lower.includes('overdue') || lower.includes('urgent') ||
        lower.includes('peligro') || lower.includes('alerta') || lower.includes('preocupado') || lower.includes('urgente') || lower.includes('presión alta') || lower.includes('omitido') ||
        lower.includes('खतरा') || lower.includes('चेतावनी') || lower.includes('चिंता') || lower.includes('आपातकाल') || lower.includes('उच्च रक्तचाप')
    ) {
        return require('../../../assets/doctor_mascot_concerned.jpg');
    }
    
    // Success/congratulations keywords
    if (
        lower.includes('streak') || lower.includes('congrats') || lower.includes('awesome') || lower.includes('great job') || lower.includes('success') || lower.includes('unlocked') || lower.includes('perfect') || lower.includes('celebrate') || lower.includes('completed') || lower.includes('excellent') ||
        lower.includes('racha') || lower.includes('felicidades') || lower.includes('excelente') || lower.includes('éxito') || lower.includes('celebrar') || lower.includes('completado') ||
        lower.includes('बधाई') || lower.includes('सफलता') || lower.includes('बहुत बढ़िया') || lower.includes('शानदार') || lower.includes('पूरा')
    ) {
        return require('../../../assets/doctor_mascot_celebration.jpg');
    }
    
    // Caring/reminders/medications/health tips keywords
    if (
        lower.includes('take') || lower.includes('medication') || lower.includes('medicine') || lower.includes('remind') || lower.includes('health tip') || lower.includes('please drink') || lower.includes('hydration') || lower.includes('care') || lower.includes('pills') ||
        lower.includes('tomar') || lower.includes('medicamento') || lower.includes('medicina') || lower.includes('recordar') || lower.includes('hidratación') || lower.includes('cuidado') ||
        lower.includes('दवा') || lower.includes('याद दिलाएं') || lower.includes('पानी') || lower.includes('देखभाल')
    ) {
        return require('../../../assets/doctor_mascot_caring.jpg');
    }
    
    // Insights/analysis/weekly summary keywords
    if (
        lower.includes('insight') || lower.includes('summary') || lower.includes('trend') || lower.includes('analysis') || lower.includes('report') || lower.includes('fact') ||
        lower.includes('resumen') || lower.includes('análisis') || lower.includes('tendencia') || lower.includes('informe') ||
        lower.includes('सारांश') || lower.includes('विश्लेषण') || lower.includes('रिपोर्ट')
    ) {
        return require('../../../assets/doctor_mascot_insights.jpg');
    }
    
    // Thinking/analyzing
    if (
        lower.includes('thinking') || lower.includes('analyzing') || lower.includes('checking') || lower.includes('one moment') ||
        lower.includes('pensando') || lower.includes('analizando') ||
        lower.includes('सोच') || lower.includes('विश्लेषण कर')
    ) {
        return require('../../../assets/doctor_mascot_thinking.jpg');
    }
    
    // Default welcome/greeting mascot
    return require('../../../assets/doctor_mascot.jpg');
};

// ── Skeleton message loaders ────────────────────────────────────────────────
export const SKELETON_MESSAGES = [
    { id: 'sk-1', isSkeleton: true, isUser: false, width: '75%' },
    { id: 'sk-2', isSkeleton: true, isUser: false, width: '45%' },
    { id: 'sk-3', isSkeleton: true, isUser: true, width: '60%' },
    { id: 'sk-4', isSkeleton: true, isUser: false, width: '90%' },
];

function ChatBubbleSkeleton({ isUser, width }) {
    const pulseAnim = useRef(new Animated.Value(0.3)).current;
    
    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true })
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [pulseAnim]);

    return (
        <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
            {!isUser && (
                <View style={[styles.botAvatarCircle, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }]} />
            )}
            <Animated.View 
                style={[
                    styles.bubble, 
                    isUser ? styles.bubbleUser : styles.bubbleBot,
                    { 
                        opacity: pulseAnim, 
                        width: width || '70%', 
                        height: 55,
                        backgroundColor: isUser ? '#E0E7FF' : '#E2E8F0',
                        borderRadius: 16,
                        borderWidth: 0,
                    }
                ]}
            />
            {isUser && (
                <View style={[styles.avatarCircleUser, { backgroundColor: '#E2E8F0' }]} />
            )}
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
                <Image 
                    source={getMascotForMessage(message.text)} 
                    style={styles.botAvatarCircle} 
                />
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
            <Image 
                source={require('../../../assets/doctor_mascot_thinking.jpg')} 
                style={styles.botAvatarCircle} 
            />
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
function WelcomeSnapshotCard({ firstName, medsCount, takenCount, vitals, streak, userRole, patientName }) {
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
    
    const isCompanion = userRole === 'companion';
    const subText = isCompanion 
        ? `Here is ${patientName || 'your family member'}'s health snapshot.`
        : "Here's your health snapshot for today.";
        
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
                    <Text style={styles.welcomeSub}>{subText}</Text>
                    
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
function QuickActionsDashboard({ onPress, userRole, patientName }) {
    const isCompanion = userRole === 'companion';
    const patientShortName = patientName?.split(' ')[0] || 'Patient';
    
    return (
        <View style={styles.actionsDashboard}>
            <View style={styles.actionsHeader}>
                <Sparkles size={16} color="#6366F1" strokeWidth={2.5} />
                <Text style={styles.actionsHeaderText}>How can I help you today?</Text>
            </View>
            
            <View style={styles.actionsGrid}>
                {/* Row 1 */}
                <View style={styles.actionsGridRow}>
                    <Pressable style={styles.actionGridCard} onPress={() => onPress(isCompanion ? `📋 What should ${patientShortName} do today?` : '📋 What should I do today?')}>
                        <View style={[styles.actionIconBox, { backgroundColor: '#FFF7ED' }]}>
                            <Calendar size={18} color="#EA580C" />
                        </View>
                        <View style={styles.actionCardContent}>
                            <Text style={styles.actionCardTitle}>{isCompanion ? `What should ${patientShortName} do today?` : 'What should I do today?'}</Text>
                            <Text style={styles.actionCardSub}>{isCompanion ? "See patient's plan" : "See today's plan"}</Text>
                        </View>
                    </Pressable>
                    
                    <Pressable style={styles.actionGridCard} onPress={() => onPress(isCompanion ? `📊 ${patientShortName}'s Weekly Health Summary` : '📊 Weekly Health Summary')}>
                        <View style={[styles.actionIconBox, { backgroundColor: '#ECFDF5' }]}>
                            <TrendingUp size={18} color="#059669" />
                        </View>
                        <View style={styles.actionCardContent}>
                            <Text style={styles.actionCardTitle}>{isCompanion ? `${patientShortName}'s Weekly Summary` : 'Weekly Health Summary'}</Text>
                            <Text style={styles.actionCardSub}>{isCompanion ? "Patient's progress this week" : "Your progress this week"}</Text>
                        </View>
                    </Pressable>
                </View>
                
                {/* Row 2 */}
                <View style={styles.actionsGridRow}>
                    <Pressable style={styles.actionGridCard} onPress={() => onPress(isCompanion ? `💊 ${patientShortName}'s medications list` : '💊 My medications list')}>
                        <View style={[styles.actionIconBox, { backgroundColor: '#EEF2FF' }]}>
                            <Pill size={18} color="#4F46E5" />
                        </View>
                        <View style={styles.actionCardContent}>
                            <Text style={styles.actionCardTitle}>{isCompanion ? `${patientShortName}'s meds list` : 'My medications list'}</Text>
                            <Text style={styles.actionCardSub}>{isCompanion ? "View patient's meds" : "View all your meds"}</Text>
                        </View>
                    </Pressable>
                    
                    <Pressable style={styles.actionGridCard} onPress={() => onPress(isCompanion ? `📈 ${patientShortName}'s adherence streak` : '📈 My adherence streak')}>
                        <View style={[styles.actionIconBox, { backgroundColor: '#FFF1F2' }]}>
                            <Flame size={18} color="#E11D48" />
                        </View>
                        <View style={styles.actionCardContent}>
                            <Text style={styles.actionCardTitle}>{isCompanion ? `${patientShortName}'s adherence streak` : 'My adherence streak'}</Text>
                            <Text style={styles.actionCardSub}>{isCompanion ? "Track patient's consistency" : "Track your consistency"}</Text>
                        </View>
                    </Pressable>
                </View>
            </View>
            
            {/* Center Card 5 */}
            <Pressable style={styles.actionCardCenter} onPress={() => onPress(isCompanion ? `🩺 View ${patientShortName}'s vitals status` : '🩺 View vitals status')}>
                <View style={[styles.actionIconBox, { backgroundColor: '#F0FDF4' }]}>
                    <Activity size={18} color="#16A34A" />
                </View>
                <View style={styles.actionCardContent}>
                    <Text style={styles.actionCardTitle}>{isCompanion ? `View ${patientShortName}'s vitals status` : 'View vitals status'}</Text>
                    <Text style={styles.actionCardSub}>Check BP, HR & more</Text>
                </View>
            </Pressable>
            
            {/* Privacy / Security Banner */}
            <View style={styles.privacyBanner}>
                <View style={styles.privacyIconBox}>
                    <Shield size={18} color="#4F46E5" />
                </View>
                <Text style={styles.privacyText}>
                    {isCompanion 
                        ? `Patient health data is private, secure, and used only to support their care.`
                        : `Your health data is private, secure, and used only to support your care.`}
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
    const { displayName, user, profile, userRole } = useAuth();
    const patient = usePatientStore(state => state.patient);
    const companionSelectedPatientId = usePatientStore(state => state.companionSelectedPatientId);
    
    const isCompanion = userRole === 'companion' || profile?.role === 'companion';
    const targetPatientId = isCompanion ? companionSelectedPatientId : patient?._id;
    
    const routeSessionId = route.params?.sessionId;
    const [activeSessionId, setActiveSessionId] = useState(routeSessionId);

    // Sync local state if navigation route params change (e.g. user opens a different chat)
    useEffect(() => {
        setActiveSessionId(routeSessionId);
    }, [routeSessionId]);

    // Companion specific data fetching
    const [companionData, setCompanionData] = useState(null);
    const [isCompanionLoading, setIsCompanionLoading] = useState(isCompanion);

    const [isHydrating, setIsHydrating] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState(null);

    const sessionCreationPromiseRef = useRef(null);
    const sessionAbortRef = useRef(null);

    // Auto-create chat session in the background if no sessionId is provided
    useEffect(() => {
        if (!activeSessionId && targetPatientId) {
            const initBackgroundCreation = async () => {
                const data = isCompanion ? { patientId: targetPatientId } : {};
                
                // 5-second timeout safeguard for session creation
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session creation timed out')), 5000)
                );
                
                const createPromise = (async () => {
                    const res = await apiService.chatbot.createSession(data);
                    return res.data;
                })();
                
                const promise = Promise.race([createPromise, timeoutPromise]);
                sessionCreationPromiseRef.current = promise;
                
                try {
                    const newSession = await promise;
                    const newSessionId = newSession._id;
                    setActiveSessionId(newSessionId);
                    navigation.setParams({ sessionId: newSessionId });
                    
                    // Cache the disclaimer and session structure returned by backend
                    const sessionMessages = (newSession.messages || []).map(m => ({
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
                        title: newSession.title,
                        updatedAt: newSession.updated_at || newSession.created_at,
                        sessionId: newSessionId
                    };
                    await AsyncStorage.setItem(`chatbot_session_${newSessionId}`, JSON.stringify(sessionData));
                } catch (err) {
                    console.warn('[ChatbotScreen] Background session creation failed/timed out:', err.message);
                } finally {
                    sessionCreationPromiseRef.current = null;
                }
            };
            initBackgroundCreation();
        }
    }, [activeSessionId, targetPatientId, isCompanion]);

    useEffect(() => {
        const fetchCompanionPatientData = async () => {
            if (!companionSelectedPatientId) {
                setIsCompanionLoading(false);
                return;
            }
            try {
                setIsCompanionLoading(true);
                const res = await apiService.companion.getPatientStatus({ patientId: companionSelectedPatientId });
                setCompanionData(res.data);
            } catch (err) {
                console.warn('Failed to fetch patient data for companion', err);
            } finally {
                setIsCompanionLoading(false);
            }
        };
        if (isCompanion) {
            fetchCompanionPatientData();
        }
    }, [companionSelectedPatientId, isCompanion]);

    const dashboardMeds = usePatientStore(state => state.dashboardMeds || []);
    const medsCount = isCompanion
        ? (companionData?.medication_schedule?.length || 0)
        : dashboardMeds.length;
    const takenCount = isCompanion
        ? (companionData?.medication_schedule?.filter(m => m.taken).length || 0)
        : dashboardMeds.filter(m => m.taken).length;
    const vitals = usePatientStore(state => state.vitals);
    const activeVitals = isCompanion
        ? (companionData?.latest_vital ? {
            systolic: companionData.latest_vital.bp_systolic,
            diastolic: companionData.latest_vital.bp_diastolic,
            heartRate: companionData.latest_vital.heart_rate,
            spo2: companionData.latest_vital.spo2,
          } : null)
        : vitals;
    const adherenceDetails = usePatientStore(state => state.adherenceDetails);
    const activeStreak = isCompanion
        ? (companionData?.patient?.current_streak || 0)
        : (adherenceDetails?.streak || 0);

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

    const getInitialMessages = () => {
        if (!routeSessionId) {
            return [
                {
                    id: 'disclaimer-msg',
                    text: 'CareMyMed AI provides educational guidance and assistance. It does not replace a licensed medical professional. For emergencies, contact emergency services or your healthcare provider immediately.',
                    isUser: false,
                    timestamp: Date.now(),
                    cards: [],
                    suggestions: []
                }
            ];
        }
        if (globalChatCache[routeSessionId]) {
            return globalChatCache[routeSessionId].messages;
        }
        return SKELETON_MESSAGES;
    };

    const [messages, setMessages] = useState(getInitialMessages);
    const [isLoadingSession, setIsLoadingSession] = useState(false);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

    // Load Chat Session from Cache and then Backend
    useEffect(() => {
        // Abort previous in-flight session loading
        if (sessionAbortRef.current) {
            sessionAbortRef.current.abort();
            sessionAbortRef.current = null;
        }

        if (!activeSessionId) {
            // New chat session is already initialized with the disclaimer message in state
            setIsHydrating(false);
            setLastSyncedAt(null);
            setFollowUpSuggestions([]);
            return;
        }

        const abortController = new AbortController();
        sessionAbortRef.current = abortController;

        const loadSession = async () => {
            setIsHydrating(true);

            // If we are currently showing skeleton messages (because we didn't have memory cache),
            // check AsyncStorage first before the network response completes.
            const isShowingSkeletons = messages.length > 0 && messages[0].isSkeleton;
            if (isShowingSkeletons) {
                try {
                    const localCachedStr = await AsyncStorage.getItem(`chatbot_session_${activeSessionId}`);
                    if (localCachedStr && !abortController.signal.aborted) {
                        const localCached = JSON.parse(localCachedStr);
                        setMessages(localCached.messages);
                        globalChatCache[activeSessionId] = localCached;
                        
                        if (localCached.messages.length > 0) {
                            const lastMsg = localCached.messages[localCached.messages.length - 1];
                            if (!lastMsg.isUser && lastMsg.suggestions && lastMsg.suggestions.length > 0) {
                                setFollowUpSuggestions(lastMsg.suggestions);
                            }
                        }
                    }
                } catch (err) {
                    console.warn('[ChatbotScreen] AsyncStorage read failed:', err);
                }
            }

            try {
                const params = isCompanion ? { patientId: targetPatientId } : {};
                const res = await apiService.chatbot.getSession(activeSessionId, params, { signal: abortController.signal });
                
                if (abortController.signal.aborted) return;

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

                setMessages(sessionMessages);
                setLastSyncedAt(Date.now());
                
                // Set suggestions from last assistant message
                if (sessionMessages.length > 0) {
                    const lastMsg = sessionMessages[sessionMessages.length - 1];
                    if (!lastMsg.isUser && lastMsg.suggestions && lastMsg.suggestions.length > 0) {
                        setFollowUpSuggestions(lastMsg.suggestions);
                    }
                }

                // Update the memory and local caches
                const sessionData = {
                    messages: sessionMessages,
                    title: res.data.title,
                    updatedAt: res.data.updated_at || res.data.created_at,
                    sessionId: activeSessionId
                };
                globalChatCache[activeSessionId] = sessionData;
                await AsyncStorage.setItem(`chatbot_session_${activeSessionId}`, JSON.stringify(sessionData));
                
                setTimeout(() => scrollToBottom(), 300);
            } catch (err) {
                if (err.name === 'AbortError' || err.message === 'canceled') {
                    return; // Ignore abort exceptions
                }
                console.warn('[ChatbotScreen] Failed to load chat session from network:', err);
                
                // Show error alert only if we have no messages rendered at all (still showing skeletons)
                const currentIsShowingSkeletons = messages.length > 0 && messages[0].isSkeleton;
                if (currentIsShowingSkeletons) {
                    AlertManager.alert('Error', 'Could not load conversation messages.', [{ text: 'OK' }], { type: 'error' });
                }
            } finally {
                if (!abortController.signal.aborted) {
                    setIsHydrating(false);
                }
            }
        };

        loadSession();

        return () => {
            if (sessionAbortRef.current) {
                sessionAbortRef.current.abort();
                sessionAbortRef.current = null;
            }
        };
    }, [activeSessionId, targetPatientId, isCompanion]);

    const hasAutoSent = useRef(false);

    useEffect(() => {
        const initMsg = route.params?.initialMessage || route.params?.initialQuery;
        if (initMsg && !hasAutoSent.current) {
            hasAutoSent.current = true;
            setTimeout(() => {
                handleSend(initMsg);
            }, 500);
        }
    }, [route.params, handleSend]);

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
    const streamFromBackend = (userMsg, botMessageId, isAudio = false, recordingUri = null, currentSessionId) => {
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
                const targetLanguage = isCompanion
                    ? (companionData?.patient?.preferredLanguage ?? companionData?.patient?.language ?? 'en')
                    : (patient?.preferredLanguage ?? patient?.language ?? 'en');

                const formData = new FormData();
                formData.append('targetLanguage', targetLanguage);
                if (targetPatientId) {
                    formData.append('patientId', targetPatientId);
                }
                if (currentSessionId) {
                    formData.append('sessionId', currentSessionId);
                }

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
                    let finalQuery = userMsg;
                    const healthContext = route.params?.healthContext;
                    if (healthContext && userMsg === route.params?.initialMessage) {
                        finalQuery = `${userMsg}\n\n[Context: Current Health Score is ${healthContext.score} (${healthContext.label}, Grade ${healthContext.grade}). Weakest driver is ${healthContext.weakestDriver} at ${healthContext.weakestScore}%. Suggested action is: ${healthContext.suggestedAction}. Projected boost is +${healthContext.projectedBoost} to ${healthContext.projectedScore}.]`;
                    }
                    formData.append('query', finalQuery);
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

        // Zero-latency Client-side Emergency Interception
        const lowerText = msg.toLowerCase();
        const emergencyKeywords = [
            'chest pain', 'heart attack', 'stroke symptoms', 'difficulty breathing', 
            'shortness of breath', 'uncontrolled bleeding', 'severe dizziness', 
            'fainting', 'seizure', 'loss of consciousness', 'fainted', 'seizures'
        ];
        const isEmergency = emergencyKeywords.some(keyword => lowerText.includes(keyword));

        if (isEmergency && !imageUri && !audioUri) {
            const userMessage = { 
                id: Date.now().toString(), 
                text: msg, 
                isUser: true, 
                timestamp: Date.now() 
            };
            
            const botMessageId = (Date.now() + 1).toString();
            const botEmergencyResponse = {
                id: botMessageId,
                text: "⚠️ CLINICAL WARNING: You have entered symptoms that may indicate a serious, acute medical emergency. Please dial emergency services (911) immediately, or connect with your care coordinator immediately using the Voice Call button on the Caller tab.",
                isUser: false,
                isWarning: true,
                timestamp: Date.now(),
            };

            setMessages(prev => [...prev, userMessage, botEmergencyResponse]);
            setInputText('');
            setIsTyping(false);
            setTypingStage('');
            return;
        }

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
        
        // Optimistically insert user message and bot placeholder instantly
        setMessages(prev => [...prev, userMessage, botPlaceholder]);
        setInputText('');
        setIsTyping(true);
        if (isAudioMsg) {
            setTypingStage('🎤 Listening...');
        } else {
            setTypingStage('🧠 Understanding...');
        }
        setFollowUpSuggestions([]);

        let currentSessionId = activeSessionId;

        try {
            // Await background session creation if it's currently running
            if (!currentSessionId && sessionCreationPromiseRef.current) {
                try {
                    const newSession = await sessionCreationPromiseRef.current;
                    currentSessionId = newSession._id;
                    setActiveSessionId(currentSessionId);
                    navigation.setParams({ sessionId: currentSessionId });
                } catch (e) {
                    console.warn('[ChatbotScreen] Awaiting background session creation failed:', e.message);
                }
            }

            // Fallback: If creation failed or timed out previously, create it now
            if (!currentSessionId) {
                try {
                    const data = isCompanion ? { patientId: targetPatientId } : {};
                    const res = await apiService.chatbot.createSession(data);
                    currentSessionId = res.data._id;
                    setActiveSessionId(currentSessionId);
                    navigation.setParams({ sessionId: currentSessionId });
                } catch (err) {
                    console.warn('[ChatbotScreen] Fallback session creation in handleSend failed:', err.message);
                    throw new Error('Could not initialize conversation session. Please try again.');
                }
            }

            await streamFromBackend(msg, botMessageId, isAudioMsg, currentRecordingUri, currentSessionId);
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

            // Synchronize the completed message list with global memory and AsyncStorage caches
            if (currentSessionId) {
                setMessages(prev => {
                    const sessionData = {
                        messages: prev,
                        title: route.params?.title || 'Active Chat',
                        updatedAt: Date.now(),
                        sessionId: currentSessionId
                    };
                    globalChatCache[currentSessionId] = sessionData;
                    AsyncStorage.setItem(`chatbot_session_${currentSessionId}`, JSON.stringify(sessionData)).catch(e => {
                        console.warn('[ChatbotScreen] Failed to save chat cache after stream finish:', e.message);
                    });
                    return prev;
                });
            }
        }
    }, [inputText, recording, user, patient, isCompanion, companionData, targetPatientId, activeSessionId, route.params]);

    const [isCreating, setIsCreating] = useState(false);

    const handleCreateSession = async () => {
        if (!targetPatientId) return;
        try {
            setIsCreating(true);
            const data = isCompanion ? { patientId: targetPatientId } : {};
            const res = await apiService.chatbot.createSession(data);
            
            // Navigate/Replace with new session
            navigation.replace('Chatbot', { sessionId: res.data._id });
        } catch (err) {
            console.warn('Failed to create session:', err);
            const apiErr = handleApiError(err);
            if (err.response?.status === 400 && apiErr.message.includes('Limit reached')) {
                AlertManager.alert(
                    'Chat Limit Reached 🚨',
                    'You can have at most 10 active concurrent chats. Please delete some previous conversations to start a new one.',
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

    const handleDeleteChat = () => {
        if (!activeSessionId) return;
        Vibration.vibrate(50);
        AlertManager.alert(
            'Delete Conversation 🗑️',
            'Are you sure you want to delete this chat session? This will permanently erase the history and return you to the conversations list.',
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Delete', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const params = isCompanion ? { patientId: targetPatientId } : {};
                            await apiService.chatbot.deleteSession(activeSessionId, params);
                            
                            // Delete local caches
                            delete globalChatCache[activeSessionId];
                            await AsyncStorage.removeItem(`chatbot_session_${activeSessionId}`);
                            
                            navigation.goBack();
                        } catch (err) {
                            console.warn('Failed to delete chat session:', err);
                            AlertManager.alert('Error', 'Could not delete conversation.', [{ text: 'OK' }], { type: 'error' });
                        }
                    }
                }
            ],
            { type: 'warning' }
        );
    };

    const handlePickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets[0]) {
                handleSend('', result.assets[0].uri);
            }
        } catch (error) {
            console.warn('Image picker error:', error);
            AlertManager.alert('Error', 'Could not open image gallery.', [{ text: 'OK' }], { type: 'error' });
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
                AlertManager.alert('Permission needed', 'Please grant microphone access to send voice messages.', [{ text: 'OK' }], { type: 'warning' });
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

    const renderMessage = useCallback(({ item }) => {
        if (item.isSkeleton) {
            return <ChatBubbleSkeleton isUser={item.isUser} width={item.width} />;
        }
        return <ChatBubble message={item} isUser={item.isUser} />;
    }, []);

    const keyExtractor = useCallback((item) => item.id, []);

    return (
        <TabScreenTransition>
        <View style={[styles.screen, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
                    <ArrowLeft size={22} color="#0F172A" strokeWidth={2.5} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Image 
                        source={require('../../../assets/doctor_mascot.jpg')} 
                        style={styles.headerMascotAvatar} 
                    />
                    <View>
                        <Text style={styles.headerTitle}>Care Assistant</Text>
                        <View style={styles.onlineRow}>
                            {isHydrating ? (
                                <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 2, transform: [{ scale: 0.7 }] }} />
                            ) : (
                                <View style={styles.onlineDot} />
                            )}
                            <Text style={styles.onlineText}>
                                {isHydrating ? 'Syncing...' : lastSyncedAt ? 'Updated just now' : 'Online'}
                            </Text>
                        </View>
                    </View>
                </View>
                <View style={styles.headerRightActions}>
                    <Pressable 
                        onPress={handleCreateSession} 
                        disabled={isCreating}
                        style={({ pressed }) => [
                            styles.headerNewChatBtn,
                            pressed && { opacity: 0.7 }
                        ]}
                        hitSlop={12}
                    >
                        {isCreating ? (
                            <ActivityIndicator size="small" color="#6366F1" />
                        ) : (
                            <Plus size={20} color="#6366F1" strokeWidth={2.5} />
                        )}
                    </Pressable>
                    <Pressable 
                        onPress={handleDeleteChat} 
                        style={({ pressed }) => [
                            styles.clearBtn,
                            pressed && { opacity: 0.7 }
                        ]}
                        hitSlop={12}
                    >
                        <Trash2 size={20} color="#EF4444" strokeWidth={2} />
                    </Pressable>
                </View>
            </View>

            {/* ── Messages ── */}
            <KeyboardAvoidingView 
                style={{ flex: 1 }} 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.messageList}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                        isCompanion && isCompanionLoading ? (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <ActivityIndicator size="small" color="#6366F1" />
                            </View>
                        ) : (
                            <WelcomeSnapshotCard
                                firstName={isCompanion ? (displayName || 'there') : (patient?.first_name || displayName || 'there')}
                                medsCount={medsCount}
                                takenCount={takenCount}
                                vitals={activeVitals}
                                streak={activeStreak}
                                userRole={userRole}
                                patientName={companionData?.patient?.name}
                            />
                        )
                    }
                    ListFooterComponent={
                        <>
                            {!messages.some(m => m.isUser) && (
                                <QuickActionsDashboard 
                                    onPress={(s) => handleSend(s)} 
                                    userRole={userRole}
                                    patientName={companionData?.patient?.name}
                                />
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
        </TabScreenTransition>
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
    headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerNewChatBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerMascotAvatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
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
        paddingRight: 110,
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
        right: 12,
        bottom: 20,
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
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
    botAvatarCircle: { width: 30, height: 30, borderRadius: 15, marginBottom: 2, overflow: 'hidden' },
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
    vitalGridItem: { 
        flex: 1, 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#F8FAFC', 
        paddingVertical: 10, 
        paddingHorizontal: 4,
        borderRadius: 10, 
        borderWidth: 0.5, 
        borderColor: '#E2E8F0' 
    },
    vitalGridValue: { fontSize: 13, fontWeight: '700', color: '#1E293B', textAlign: 'center', width: '100%' },
    vitalGridUnit: { fontSize: 9, fontWeight: '600', color: '#64748B', textAlign: 'center', marginTop: 2 },
    
    // Summary Card
    summaryList: { gap: 6 },
    summaryRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#F1F5F9' },
    summaryRowLabel: { fontSize: 12, fontWeight: '500', color: '#475569' },
    summaryRowValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
});
