import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, Platform, Pressable, Animated, Image,
    ActivityIndicator, Alert, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ChevronLeft, CreditCard, Check, Smartphone
} from 'lucide-react-native';
import { colors } from '../../theme';
import { apiService } from '../../lib/api';

const UPI_APPS = [
    { id: 'gpay', name: 'Google Pay', color: '#4285F4', initials: 'G' },
    { id: 'phonepe', name: 'PhonePe', color: '#5F259F', initials: 'Pe' },
    { id: 'paytm', name: 'Paytm', color: '#00BAF2', initials: 'Pt' },
    { id: 'other', name: 'Other UPI', color: '#64748B', initials: '₹' },
];

export default function PaymentScreen({ navigation, route }) {
    const plan = route.params?.plan;
    const [selectedUpi, setSelectedUpi] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const checkScale = useRef(new Animated.Value(0)).current;

    if (!plan) {
        navigation.goBack();
        return null;
    }

    const handlePay = async (upiApp) => {
        setSelectedUpi(upiApp.id);
        setProcessing(true);

        // Animate progress bar
        Animated.timing(progressAnim, {
            toValue: 1, duration: 2500, useNativeDriver: false,
        }).start();

        // Wait for simulated processing
        await new Promise(resolve => setTimeout(resolve, 2800));

        // Call backend to subscribe
        try {
            await apiService.patients.subscribe({ plan: plan.id });
            setSuccess(true);

            // Animate success check
            Animated.spring(checkScale, {
                toValue: 1, friction: 4, useNativeDriver: true,
            }).start();

            // Navigate to waiting screen after a brief moment
            setTimeout(() => {
                navigation.replace('WaitingRoom', { plan });
            }, 1500);
        } catch (err) {
            setProcessing(false);
            setSuccess(false);
            progressAnim.setValue(0);
            Alert.alert('Payment Failed', 'Something went wrong. Please try again.');
        }
    };

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <View style={styles.container}>
            {/* Header */}
            <LinearGradient
                colors={plan.gradient || ['#6366F1', '#4338CA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                <Pressable style={styles.backBtn} onPress={() => !processing && navigation.goBack()}>
                    <ChevronLeft size={24} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.headerTitle}>Complete Payment</Text>
                <View style={{ width: 40 }} />
            </LinearGradient>

            <View style={styles.body}>
                {/* Order Summary */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Plan</Text>
                        <Text style={styles.summaryValue}>{plan.name}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Billing</Text>
                        <Text style={styles.summaryValue}>Monthly</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { fontWeight: '700' }]}>Total</Text>
                        <Text style={[styles.summaryValue, { fontSize: 22, color: plan.color || colors.accent }]}>
                            {plan.price}
                        </Text>
                    </View>
                </View>

                {/* UPI Section */}
                {!processing && !success && (
                    <>
                        <Text style={styles.sectionTitle}>Pay with UPI</Text>
                        <View style={styles.upiGrid}>
                            {UPI_APPS.map((app) => (
                                <Pressable
                                    key={app.id}
                                    style={[
                                        styles.upiCard,
                                        selectedUpi === app.id && { borderColor: app.color, borderWidth: 2 },
                                    ]}
                                    onPress={() => handlePay(app)}
                                >
                                    <View style={[styles.upiIconCircle, { backgroundColor: app.color + '20' }]}>
                                        <Text style={[styles.upiInitials, { color: app.color }]}>{app.initials}</Text>
                                    </View>
                                    <Text style={styles.upiAppName}>{app.name}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </>
                )}

                {/* Processing State */}
                {processing && !success && (
                    <View style={styles.processingContainer}>
                        <View style={styles.processingIconWrap}>
                            <Smartphone size={48} color={plan.color || colors.accent} />
                        </View>
                        <Text style={styles.processingTitle}>Processing Payment...</Text>
                        <Text style={styles.processingDesc}>
                            Complete the payment in your {UPI_APPS.find(a => a.id === selectedUpi)?.name || 'UPI'} app
                        </Text>
                        <View style={styles.progressTrack}>
                            <Animated.View
                                style={[
                                    styles.progressFill,
                                    { width: progressWidth, backgroundColor: plan.color || colors.accent },
                                ]}
                            />
                        </View>
                    </View>
                )}

                {/* Success State */}
                {success && (
                    <View style={styles.successContainer}>
                        <Animated.View style={[styles.successCircle, { transform: [{ scale: checkScale }] }]}>
                            <LinearGradient
                                colors={['#22C55E', '#16A34A']}
                                style={styles.successGradient}
                            >
                                <Check size={48} color="#FFFFFF" strokeWidth={3} />
                            </LinearGradient>
                        </Animated.View>
                        <Text style={styles.successTitle}>Payment Successful!</Text>
                        <Text style={styles.successDesc}>Setting up your Samvaya experience...</Text>
                    </View>
                )}

                {/* Security Note */}
                <View style={styles.securityNote}>
                    <CreditCard size={16} color="#94A3B8" />
                    <Text style={styles.securityText}>Secured by 256-bit encryption • UPI Verified</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 44,
        paddingBottom: 20, paddingHorizontal: 16,
        borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

    body: { flex: 1, padding: 16 },

    summaryCard: {
        backgroundColor: '#FFFFFF', borderRadius: 28, padding: 20,
        marginBottom: 28,
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
    },
    summaryRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingVertical: 12,
    },
    summaryLabel: { fontSize: 15, color: '#64748B' },
    summaryValue: { fontSize: 16, fontWeight: '600', color: '#1A202C' },
    divider: { height: 1, backgroundColor: '#F1F5F9' },

    sectionTitle: {
        fontSize: 16, fontWeight: '700', color: '#1A202C',
        marginBottom: 16,
    },
    upiGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    },
    upiCard: {
        width: (Dimensions.get('window').width - 56) / 2,
        backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20,
        alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    upiIconCircle: {
        width: 56, height: 56, borderRadius: 28,
        alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    },
    upiInitials: { fontSize: 20, fontWeight: '800' },
    upiAppName: { fontSize: 14, fontWeight: '600', color: '#1A202C' },

    processingContainer: { alignItems: 'center', paddingVertical: 40 },
    processingIconWrap: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
    },
    processingTitle: { fontSize: 20, fontWeight: '700', color: '#1A202C', marginBottom: 8 },
    processingDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 32 },
    progressTrack: {
        width: '80%', height: 6, backgroundColor: '#E2E8F0',
        borderRadius: 3, overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 3 },

    successContainer: { alignItems: 'center', paddingVertical: 40 },
    successCircle: {
        width: 100, height: 100, borderRadius: 50,
        marginBottom: 24, overflow: 'hidden',
    },
    successGradient: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
    },
    successTitle: { fontSize: 22, fontWeight: '700', color: '#1A202C', marginBottom: 8 },
    successDesc: { fontSize: 15, color: '#64748B' },

    securityNote: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, marginTop: 'auto', paddingBottom: 24,
    },
    securityText: { fontSize: 12, color: '#94A3B8' },
});
