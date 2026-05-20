import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, Pressable, Animated, Dimensions,
    ActivityIndicator, Easing
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Smartphone, Check, ShieldCheck, Sparkles, Activity } from 'lucide-react-native';
import { apiService } from '../../lib/api';
import AlertManager from '../../utils/AlertManager';
import { HapticPatterns } from '../../utils/haptics';

const { height: SH, width: SW } = Dimensions.get('window');

const UPI_APPS = [
    { id: 'gpay', name: 'Google Pay', color: '#4285F4', initials: 'G' },
    { id: 'phonepe', name: 'PhonePe', color: '#5F259F', initials: 'Pe' },
    { id: 'paytm', name: 'Paytm', color: '#00BAF2', initials: 'Pt' },
    { id: 'other', name: 'Other UPI', color: '#64748B', initials: '₹' },
];

export default function CheckoutBottomSheet({ visible, onClose, plan, onSuccess }) {
    const [step, setStep] = useState('select'); // 'select' | 'processing' | 'success'
    const [selectedUpi, setSelectedUpi] = useState(null);
    
    // Animations
    const slideAnim = useRef(new Animated.Value(SH)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const insightAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            setStep('select');
            setSelectedUpi(null);
            progressAnim.setValue(0);
            scaleAnim.setValue(0);
            insightAnim.setValue(0);
            Animated.spring(slideAnim, {
                toValue: 0,
                friction: 8,
                tension: 60,
                useNativeDriver: true
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: SH,
                duration: 250,
                useNativeDriver: true
            }).start();
        }
    }, [visible]);

    const closeSheet = () => {
        if (step === 'processing') return; // block closing while processing
        Animated.timing(slideAnim, {
            toValue: SH,
            duration: 250,
            useNativeDriver: true
        }).start(() => onClose());
    };

    const handlePay = async (app) => {
        setSelectedUpi(app.id);
        setStep('processing');

        // Fake processing progress
        Animated.timing(progressAnim, {
            toValue: 1,
            duration: 2500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false
        }).start();

        try {
            await new Promise(res => setTimeout(res, 2800)); // Simulating UPI switch
            
            // Backend Subscription Call
            await apiService.patients.subscribe({ plan: plan?.id || 'premium_monthly' });
            
            // Success Celebration
            setStep('success');
            HapticPatterns.premiumUnlocked();
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 5,
                tension: 40,
                useNativeDriver: true
            }).start();

            // Trigger the reward loop insight slightly after the main celebration
            setTimeout(() => {
                Animated.spring(insightAnim, {
                    toValue: 1,
                    friction: 6,
                    tension: 50,
                    useNativeDriver: true
                }).start();
            }, 800);

            // Wait a moment for celebration + reward insight, then pass success upstream
            setTimeout(() => {
                closeSheet();
                if (onSuccess) onSuccess();
            }, 3500);

        } catch (error) {
            console.error('Payment error', error);
            setStep('select');
            progressAnim.setValue(0);
            AlertManager.alert('Payment Failed', 'Something went wrong with the transaction. Please try again.');
        }
    };

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%']
    });

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={closeSheet}>
            <View style={s.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
                
                <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
                    {step === 'select' && (
                        <View style={s.content}>
                            <View style={s.headerRow}>
                                <Text style={s.title}>Complete Upgrade</Text>
                                <Pressable onPress={closeSheet} style={s.closeBtn}>
                                    <X size={20} color="#64748B" />
                                </Pressable>
                            </View>

                            <View style={s.summaryCard}>
                                <View style={s.summaryRow}>
                                    <Text style={s.summaryLabel}>Plan Selected</Text>
                                    <Text style={s.summaryValue}>{plan?.name || 'Premium'}</Text>
                                </View>
                                <View style={s.divider} />
                                <View style={s.summaryRow}>
                                    <Text style={s.summaryLabel}>Starts Today</Text>
                                    <Text style={s.summaryValue}>{plan?.price || '₹299'}</Text>
                                </View>
                            </View>

                            <Text style={s.upiLabel}>Select Payment Method</Text>
                            <View style={s.upiGrid}>
                                {UPI_APPS.map((app) => (
                                    <Pressable 
                                        key={app.id} 
                                        style={s.upiCard}
                                        onPress={() => handlePay(app)}
                                    >
                                        <View style={[s.upiIcon, { backgroundColor: app.color + '15' }]}>
                                            <Text style={[s.upiInitials, { color: app.color }]}>{app.initials}</Text>
                                        </View>
                                        <Text style={s.upiName}>{app.name}</Text>
                                    </Pressable>
                                ))}
                            </View>

                            <View style={s.trustBadge}>
                                <ShieldCheck size={14} color="#10B981" />
                                <Text style={s.trustText}>Secured by 256-bit AES encryption</Text>
                            </View>
                        </View>
                    )}

                    {step === 'processing' && (
                        <View style={s.processingContent}>
                            <View style={s.processingIconBox}>
                                <Smartphone size={40} color="#A855F7" />
                            </View>
                            <Text style={s.processingTitle}>Opening {UPI_APPS.find(a => a.id === selectedUpi)?.name || 'App'}...</Text>
                            <Text style={s.processingSub}>Please complete the payment securely</Text>
                            <View style={s.progressBar}>
                                <Animated.View style={[s.progressFill, { width: progressWidth }]} />
                            </View>
                        </View>
                    )}

                    {step === 'success' && (
                        <View style={s.successContent}>
                            <Animated.View style={[s.successCircle, { transform: [{ scale: scaleAnim }] }]}>
                                <LinearGradient colors={['#A855F7', '#6366F1']} style={s.successGradient}>
                                    <Sparkles size={40} color="#FFFFFF" strokeWidth={2.5} />
                                </LinearGradient>
                            </Animated.View>
                            <Text style={s.successTitle}>Welcome to Premium!</Text>
                            <Text style={s.successSub}>Your health insights are fully unlocked.</Text>
                            
                            <Animated.View 
                                style={[
                                    s.insightCard, 
                                    { 
                                        opacity: insightAnim,
                                        transform: [{ 
                                            translateY: insightAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [20, 0]
                                            })
                                        }]
                                    }
                                ]}
                            >
                                <View style={s.insightIconBox}>
                                    <Activity size={16} color="#A855F7" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.insightTitle}>Insight Unlocked</Text>
                                    <Text style={s.insightDesc}>Your AI Health Analysis is now active and monitoring your trends.</Text>
                                </View>
                            </Animated.View>
                        </View>
                    )}
                </Animated.View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingBottom: 34, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
    content: { padding: 24 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    
    summaryCard: { backgroundColor: '#F8FAFC', borderRadius: 20, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#F1F5F9' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { fontSize: 14, color: '#64748B', fontWeight: '500' },
    summaryValue: { fontSize: 16, color: '#0F172A', fontWeight: '700' },
    divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 },
    
    upiLabel: { fontSize: 15, fontWeight: '700', color: '#334155', marginBottom: 16 },
    upiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    upiCard: { width: (SW - 60) / 2, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
    upiIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    upiInitials: { fontSize: 18, fontWeight: '800' },
    upiName: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
    
    trustBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24 },
    trustText: { fontSize: 13, color: '#10B981', fontWeight: '600' },

    processingContent: { padding: 40, alignItems: 'center', minHeight: 400, justifyContent: 'center' },
    processingIconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FAF5FF', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    processingTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
    processingSub: { fontSize: 15, color: '#64748B', marginBottom: 32, textAlign: 'center' },
    progressBar: { width: '80%', height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: '#A855F7', borderRadius: 3 },

    successContent: { padding: 40, alignItems: 'center', minHeight: 400, justifyContent: 'center' },
    successCircle: { width: 100, height: 100, borderRadius: 50, marginBottom: 24, overflow: 'hidden', shadowColor: '#A855F7', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 },
    successGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    successTitle: { fontSize: 26, fontWeight: '900', color: '#0F172A', marginBottom: 8, textAlign: 'center', letterSpacing: -0.5 },
    successSub: { fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 24 },
    
    insightCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF5FF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3E8FF', gap: 12, width: '100%' },
    insightIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#A855F7', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    insightTitle: { fontSize: 14, fontWeight: '800', color: '#6B21A8', marginBottom: 2 },
    insightDesc: { fontSize: 13, color: '#7E22CE', lineHeight: 18 },
});
