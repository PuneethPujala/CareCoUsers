import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView,
    Platform, Animated, ActivityIndicator, StatusBar, Image, Alert, PanResponder, Vibration, AppState
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Sparkles, Bot, User, Mic, Paperclip } from 'lucide-react-native';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import usePatientStore from '../../store/usePatientStore';
import { getApiTokens } from '../../lib/tokenStorage';

const INITIAL_SUGGESTIONS = [
    '💊 What medications am I taking?',
    '📊 Show my vitals summary',
    '🩺 Health tips for today',
    '⏰ When is my next dose?',
    '📈 How is my adherence?',
    '💉 Any drug interactions?',
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
            <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.avatarCircle}>
                <Bot size={16} color="#6366F1" strokeWidth={2.5} />
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

// ══════════════════════════════════════════════════════════════════════════════
// ══ MAIN CHATBOT SCREEN ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
export default function ChatbotScreen({ navigation, route }) {
    const { t } = useTranslation();
    const { displayName, user } = useAuth();
    const patient = usePatientStore(state => state.patient);
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

    const [messages, setMessages] = useState([
        {
            id: '1',
            text: `Hi ${firstName}! 👋 I'm your Conversational Care Assistant. I can help you with medication info, vitals, health tips, and more. How can I help you today?`,
            isUser: false,
            timestamp: Date.now(),
        },
    ]);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

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
                            // Aborted — don't reject
                            resolve();
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
                                <Text style={styles.welcomeTitle}>Talk to Care Assistant</Text>
                                <Text style={styles.welcomeSub}>
                                    Ask me about medications, vitals, health tips, and more. I'm here to help you stay on top of your health.
                                </Text>
                            </LinearGradient>
                        </View>
                    }
                    ListFooterComponent={
                        <>
                            {messages.length <= 2 && (
                                <View style={styles.suggestionsRow}>
                                    {INITIAL_SUGGESTIONS.map((s, i) => (
                                        <Pressable key={i} style={styles.suggestionChip} onPress={() => handleSend(s)}>
                                            <Text style={styles.suggestionText}>{s}</Text>
                                        </Pressable>
                                    ))}
                                </View>
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
});
