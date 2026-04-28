import React from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Shield, Check, CheckCircle2, AlertCircle, ChevronRight, Sparkles } from 'lucide-react-native';
import { useFormContext } from 'react-hook-form';
import { styles, FONT, C } from './SignupStyles';

const FEATURES = [
    'Daily Care Calls from a dedicated caller',
    'Medication tracking & reminders',
    'Personal health log & history',
    'Emergency contact management',
];

const Step3Membership = ({
    paymentCrashWarning, staggerAnims,
    setFeaturesModalVisible,
    selectedPlan, setSelectedPlan,
    setUpiModalVisible,
}) => {
    const { setValue, watch } = useFormContext();
    const selectedPlanId = watch('selectedPlanId');

    const handleSelectAndPay = () => {
        setValue('selectedPlanId', 'basic');
        setSelectedPlan({ id: 'basic', name: 'Basic Plan', price: '₹500/mo' });
        setUpiModalVisible(true);
    };

    return (
        <View>
            {/* Pill badge */}
            <View style={styles.pillBadge}>
                <View style={styles.pillDot} />
                <Text style={styles.pillBadgeText}>Choose plan</Text>
            </View>

            {/* Title */}
            <Text style={styles.stepTitleLine1}>Pick your</Text>
            <Text style={styles.stepTitleLine2}>health plan</Text>

            {/* Payment crash warning */}
            {paymentCrashWarning && (
                <View style={[styles.errorBoxEnhanced, { backgroundColor: C.warningBg, borderColor: '#FEF3C7' }]}>
                    <AlertCircle size={16} color={C.warning} />
                    <Text style={[styles.errorMsgEnhanced, { color: '#92400E' }]}>
                        Your last payment attempt may not have completed. Please try again — you won't be charged twice.
                    </Text>
                </View>
            )}

            {/* Basic plan card */}
            <Animated.View style={{
                opacity: staggerAnims[1],
                transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            }}>
                <Pressable
                    style={[styles.planCardEnhanced, selectedPlanId === 'basic' && styles.planCardActive]}
                    onPress={() => setValue('selectedPlanId', 'basic')}
                    activeOpacity={0.92}
                >
                    <View style={styles.planCardGradient}>
                        {/* Card header */}
                        <View style={styles.planCardHeaderRow}>
                            <View style={[styles.planIconBoxEnhanced, { backgroundColor: C.primarySoft }]}>
                                <Shield size={24} color={C.primary} />
                            </View>
                            <View style={styles.planPriceCol}>
                                <Text style={styles.planTitleEnhanced}>Basic Plan</Text>
                                <Text style={styles.planPriceEnhanced}>
                                    ₹500<Text style={styles.planPriceSub}>/mo</Text>
                                </Text>
                            </View>
                            {selectedPlanId === 'basic' && (
                                <View style={styles.selectedCheck}>
                                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                                </View>
                            )}
                        </View>

                        {/* Features list */}
                        <View style={styles.planFeaturesEnhanced}>
                            {FEATURES.map(f => (
                                <View key={f} style={styles.featureLine}>
                                    <View style={{
                                        width: 20, height: 20, borderRadius: 6,
                                        backgroundColor: C.primarySoft,
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Check size={12} color={C.primary} strokeWidth={3} />
                                    </View>
                                    <Text style={styles.featureTextEnhanced}>{f}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Action button */}
                        <Pressable
                            style={[
                                styles.planActionBtn,
                                selectedPlanId === 'basic' ? styles.btnActive : styles.btnInactive,
                            ]}
                            onPress={handleSelectAndPay}
                        >
                            <Text style={selectedPlanId === 'basic' ? styles.txtActive : styles.txtInactive}>
                                {selectedPlanId === 'basic' ? 'Subscribe — Pay ₹500' : 'Select Basic Plan'}
                            </Text>
                            <ChevronRight size={18} color={selectedPlanId === 'basic' ? '#FFFFFF' : C.mid} />
                        </Pressable>
                    </View>
                </Pressable>
            </Animated.View>

            {/* Explore features link */}
            <Animated.View style={{
                opacity: staggerAnims[0],
                transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            }}>
                <Pressable
                    style={styles.planCardGhost}
                    onPress={() => setFeaturesModalVisible(true)}
                >
                    <View style={styles.ghostIconWrap}>
                        <Sparkles size={18} color={C.muted} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.planTitleGhost}>Explore free features</Text>
                        <Text style={styles.planDesc}>Preview the app without a plan</Text>
                    </View>
                    <ChevronRight size={16} color={C.muted} />
                </Pressable>
            </Animated.View>
        </View>
    );
};

export default React.memo(Step3Membership);
