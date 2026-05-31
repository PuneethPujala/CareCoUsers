import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MessageSquare, Plus, ChevronRight, Bot, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { layout } from '../../theme';
import usePatientStore from '../../store/usePatientStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const C = {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    primary: '#6366F1',
    primaryLight: '#E0E7FF',
    dark: '#0F172A',
    mid: '#475569',
    light: '#94A3B8',
    border: '#E2E8F0',
};

const FONT = {
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function CompanionChatListScreen() {
    const navigation = useNavigation();
    const selectedPatientId = usePatientStore(s => s.companionSelectedPatientId);
    
    const [recentMessages, setRecentMessages] = useState([]);

    useFocusEffect(
        useCallback(() => {
            const loadChats = async () => {
                if (!selectedPatientId) return;
                try {
                    const stored = await AsyncStorage.getItem(`@caremymed_chatbot_messages_${selectedPatientId}`);
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (parsed && parsed.length > 1) {
                            setRecentMessages(parsed);
                        } else {
                            setRecentMessages([]);
                        }
                    }
                } catch (err) {
                    console.log('Failed to load chats list', err);
                }
            };
            loadChats();
        }, [selectedPatientId])
    );

    const handleNewChat = () => {
        navigation.navigate('Chatbot');
    };

    let previewText = 'Tap to continue your previous conversation...';
    let previewTime = 'Today';
    
    if (recentMessages.length > 0) {
        const lastMsg = recentMessages[recentMessages.length - 1];
        if (lastMsg.text) previewText = lastMsg.text;
        else if (lastMsg.audio) previewText = 'Voice Message';
        else if (lastMsg.image) previewText = 'Image Attachment';
        
        const d = new Date(lastMsg.timestamp || Date.now());
        const isToday = d.toDateString() === new Date().toDateString();
        previewTime = isToday 
            ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerSub}>AI Assistant</Text>
                    <Text style={styles.title}>Messages</Text>
                </View>
                <Pressable onPress={handleNewChat} style={styles.newChatBtn}>
                    <Plus size={20} color="#FFF" strokeWidth={2.5} />
                </Pressable>
            </View>

            <ScrollView 
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Pressable onPress={handleNewChat}>
                    <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.heroCard}>
                        <View style={styles.heroHeader}>
                            <View style={styles.heroIconBox}>
                                <Sparkles size={22} color={C.primary} strokeWidth={2.5} />
                            </View>
                            <Text style={styles.heroTitle}>Start a New Session</Text>
                        </View>
                        <Text style={styles.heroDesc}>
                            Ask the Care Assistant about {selectedPatientId ? "the patient's" : "your family's"} medications, vitals, or adherence trends.
                        </Text>
                    </LinearGradient>
                </Pressable>

                <Text style={styles.sectionTitle}>Recent Chats</Text>
                
                {recentMessages.length > 0 ? (
                    <Pressable style={styles.chatRow} onPress={handleNewChat}>
                        <Image source={require('../../../assets/doctor_mascot.jpg')} style={styles.chatMascotAvatar} />
                        <View style={styles.chatDetails}>
                            <View style={styles.chatHeader}>
                                <Text style={styles.chatTitle}>Care Assistant</Text>
                                <Text style={styles.chatTime}>{previewTime}</Text>
                            </View>
                            <Text style={styles.chatPreview} numberOfLines={1}>
                                {previewText}
                            </Text>
                        </View>
                        <ChevronRight size={18} color={C.light} />
                    </Pressable>
                ) : (
                    <Text style={{ color: C.light, paddingLeft: 4, marginTop: 4, fontSize: 13, ...FONT.medium }}>
                        No previous sessions found. Start a new session above!
                    </Text>
                )}
                
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { 
        paddingTop: 60, 
        paddingHorizontal: 24, 
        paddingBottom: 20, 
        backgroundColor: C.surface,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerSub: {
        fontSize: 12,
        ...FONT.semibold,
        color: C.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    title: { fontSize: 28, ...FONT.heavy, color: C.dark },
    newChatBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: C.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
    },
    
    content: { padding: 20, gap: 20, paddingBottom: layout.TAB_BAR_CLEARANCE },

    heroCard: {
        padding: 24,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    heroHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    heroIconBox: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2
    },
    heroTitle: {
        fontSize: 18,
        ...FONT.bold,
        color: '#312E81',
    },
    heroDesc: {
        fontSize: 14,
        ...FONT.medium,
        color: '#4338CA',
        lineHeight: 20,
    },

    sectionTitle: {
        fontSize: 16,
        ...FONT.bold,
        color: C.dark,
        marginTop: 8,
        paddingLeft: 4,
    },

    chatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.surface,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.border,
        gap: 14,
    },
    avatarCircle: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: C.primaryLight,
        alignItems: 'center', justifyContent: 'center',
    },
    chatMascotAvatar: {
        width: 48, height: 48, borderRadius: 24,
    },
    chatDetails: {
        flex: 1,
        gap: 4,
    },
    chatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    chatTitle: {
        fontSize: 16,
        ...FONT.bold,
        color: C.dark,
    },
    chatTime: {
        fontSize: 12,
        ...FONT.medium,
        color: C.light,
    },
    chatPreview: {
        fontSize: 13,
        ...FONT.medium,
        color: C.mid,
    },
});
