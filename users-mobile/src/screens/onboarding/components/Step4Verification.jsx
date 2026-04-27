import React, { useState } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, Shield, Zap, Smartphone, Sparkles, ChevronRight } from 'lucide-react-native';
import { styles } from './SignupStyles';

/**
 * Step4Verification
 *
 * FIX 1: staggerAnims[5] was potentially undefined if the parent passed fewer
 *         than 6 items. Journey items use indices 2, 3, 4 — CTA now uses
 *         staggerAnims[5] only when it exists, with a fallback opacity of 1.
 *         (The parent creates 10, so this is belt-and-suspenders.)
 *
 * FIX 2: Continue button had no loading / disabled state. A user who double-taps
 *         it could call handleGoToStep5 twice, setting isManualTransitionRef
 *         twice and causing a double step advance if the parent allows re-entry.
 *         Added local `proceeding` state — button disables after first tap and
 *         shows an ActivityIndicator until the parent unmounts this step.
 *
 * FIX 3: Added displayName for React DevTools clarity.
 */

const JOURNEY_ITEMS = [
    { Icon: Shield, text: 'Collect your health details' },
    { Icon: Zap, text: 'Set up medication schedule' },
    { Icon: Smartphone, text: 'Assign your dedicated care caller' },
];

const Step4Verification = ({ staggerAnims, handleGoToStep5 }) => {
    const [proceeding, setProceeding] = useState(false);

    const handlePress = async () => {
        if (proceeding) return;
        setProceeding(true);
        try {
            await handleGoToStep5();
        } catch {
            // If the parent throws, re-enable the button so the user can retry
            setProceeding(false);
        }
    };

    // Belt-and-suspenders: if the parent somehow passes fewer than 6 anims,
    // fall back to a static opacity=1 so the button is still visible.
    const ctaAnim = staggerAnims[5] ?? null;

    return (
        <View style={styles.centerStepEnhanced}>
            {/* Success card */}
            <Animated.View style={{
                width: '100%',
                opacity: staggerAnims[0],
                transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            }}>
                <LinearGradient colors={['#EFF3FF', '#FFFFFF']} style={styles.successCelebrationCard}>
                    <View style={styles.largeSuccessCircle}>
                        <CheckCircle2 size={56} color="#22C55E" strokeWidth={2.5} />
                    </View>
                    <Text style={styles.successTitle}>Payment Successful!</Text>
                    <Text style={styles.successSubtitle}>Welcome to the Samvaya family.</Text>
                </LinearGradient>
            </Animated.View>

            {/* Next steps card */}
            <Animated.View style={{
                width: '100%',
                opacity: staggerAnims[1],
                transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            }}>
                <View style={styles.nextStepsCard}>
                    <View style={styles.nextStepsHeader}>
                        <Sparkles size={18} color="#3B5BDB" />
                        <Text style={styles.nextStepsTitle}>Your Onboarding Journey</Text>
                    </View>
                    <Text style={styles.nextStepsDesc}>
                        A Care Caller will reach out within 24 hours to finalize your profile:
                    </Text>
                    <View style={styles.journeyList}>
                        {JOURNEY_ITEMS.map(({ Icon, text }, i) => (
                            <Animated.View
                                key={text}
                                style={{
                                    opacity: staggerAnims[i + 2],
                                    transform: [{
                                        translateX: staggerAnims[i + 2].interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [-10, 0],
                                        }),
                                    }],
                                }}
                            >
                                <View style={styles.journeyItem}>
                                    <View style={styles.journeyIconBox}>
                                        <Icon size={16} color="#3B5BDB" />
                                    </View>
                                    <Text style={styles.journeyText}>{text}</Text>
                                </View>
                            </Animated.View>
                        ))}
                    </View>
                </View>
            </Animated.View>

            {/* CTA button */}
            <Animated.View style={{
                width: '100%',
                opacity: ctaAnim
                    ? ctaAnim
                    : 1,
                transform: ctaAnim
                    ? [{ scale: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }]
                    : undefined,
            }}>
                <Pressable
                    style={[styles.primaryBtnEnhanced, proceeding && { opacity: 0.7 }]}
                    onPress={handlePress}
                    disabled={proceeding}
                >
                    <LinearGradient
                        colors={['#6366F1', '#4F46E5']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.primaryBtnGradientEnhanced}
                    >
                        {proceeding ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <>
                                <Text style={styles.primaryBtnText}>Continue</Text>
                                <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} />
                            </>
                        )}
                    </LinearGradient>
                </Pressable>
            </Animated.View>
        </View>
    );
};

Step4Verification.displayName = 'Step4Verification';

export default React.memo(Step4Verification);