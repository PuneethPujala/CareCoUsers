import React from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Shield, Check, AlertCircle, ChevronRight, Sparkles } from 'lucide-react-native';
import { useFormContext } from 'react-hook-form';
import { styles, FONT, C } from './SignupStyles';

const FEATURES = [
    'Daily Care Calls from a dedicated caller',
    'Medication tracking & reminders',
    'Personal health log & history',
    'Emergency contact management',
];

const PLANS = [
    {
        id: 'premium_monthly',
        name: 'Monthly Plan',
        price: '₹800',
        priceSub: '/mo',
        displayPrice: '₹800/mo',
        subtitle: 'Billed monthly',
        badge: null,
    },
    {
        id: 'premium_annual',
        name: 'Annual Plan',
        price: '₹8,000',
        priceSub: '/yr',
        displayPrice: '₹8,000/yr',
        subtitle: 'Billed annually',
        badge: 'SAVE 17%',
    }
];

const Step4Membership = ({
    paymentCrashWarning, staggerAnims,
    setFeaturesModalVisible,
    selectedPlan, setSelectedPlan,
    setUpiModalVisible,
}) => {
    const { setValue, watch } = useFormContext();
    const selectedPlanId = watch('selectedPlanId') || 'premium_monthly';

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

            {/* Features list (shown once) */}
            <Animated.View style={{
                opacity: staggerAnims[0],
                transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                marginBottom: 24,
            }}>
                <View style={{ gap: 10, paddingHorizontal: 4 }}>
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
            </Animated.View>

            {/* Plans List */}
            {PLANS.map((plan, index) => {
                const isActive = selectedPlanId === plan.id;
                const animIndex = index + 1;
                const opacityVal = staggerAnims[animIndex] || new Animated.Value(1);
                const transYVal = opacityVal.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

                return (
                    <Animated.View key={plan.id} style={{
                        opacity: opacityVal,
                        transform: [{ translateY: transYVal }],
                    }}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.planCardEnhanced,
                                isActive && styles.planCardActive,
                                pressed && styles.pressed,
                            ]}
                            onPress={() => {
                                setValue('selectedPlanId', plan.id);
                                setSelectedPlan({ id: plan.id, name: plan.name, price: plan.displayPrice });
                            }}
                        >
                            <View style={styles.planCardGradient}>
                                <View style={[styles.planCardHeaderRow, { marginBottom: 0 }]}>
                                    <View style={[styles.planIconBoxEnhanced, { backgroundColor: isActive ? '#FFFFFF' : C.primarySoft }]}>
                                        <Shield size={24} color={C.primary} />
                                    </View>
                                    <View style={styles.planPriceCol}>
                                        <Text style={styles.planTitleEnhanced}>{plan.name}</Text>
                                        <Text style={{ fontSize: 13, ...FONT.medium, color: C.muted, marginTop: 2 }}>{plan.subtitle}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                        <Text style={styles.planPriceEnhanced}>
                                            {plan.price}<Text style={styles.planPriceSub}>{plan.priceSub}</Text>
                                        </Text>
                                        {plan.badge && (
                                            <View style={{ backgroundColor: C.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 }}>
                                                <Text style={{ color: '#FFF', fontSize: 10, ...FONT.heavy }}>{plan.badge}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </View>
                        </Pressable>
                    </Animated.View>
                );
            })}

            {/* Pay button */}
            <Animated.View style={{
                opacity: staggerAnims[3] || new Animated.Value(1),
                transform: [{ translateY: (staggerAnims[3] || new Animated.Value(1)).interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                marginTop: 8,
            }}>
                <Pressable
                    style={({ pressed }) => [
                        styles.primaryBtnEnhanced,
                        pressed && styles.pressed,
                    ]}
                    onPress={() => {
                        const currentPlan = PLANS.find(p => p.id === selectedPlanId) || PLANS[0];
                        setSelectedPlan({ id: currentPlan.id, name: currentPlan.name, price: currentPlan.displayPrice });
                        setUpiModalVisible(true);
                    }}
                >
                    <View style={styles.primaryBtnGradientEnhanced}>
                        <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>
                            Subscribe & Pay {PLANS.find(p => p.id === selectedPlanId)?.price || '₹800'}
                        </Text>
                        <ChevronRight size={18} color="#FFFFFF" />
                    </View>
                </Pressable>
            </Animated.View>

            {/* Explore features link */}
            <Animated.View style={{
                opacity: staggerAnims[4] || new Animated.Value(1),
                transform: [{ translateY: (staggerAnims[4] || new Animated.Value(1)).interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                marginTop: 16,
            }}>
                <Pressable
                    style={({ pressed }) => [styles.planCardGhost, pressed && styles.pressed]}
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

export default React.memo(Step4Membership);
