import React, { useState } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator } from 'react-native';
import { CheckCircle2, Shield, Zap, Smartphone, Sparkles, ChevronRight } from 'lucide-react-native';
import { styles, FONT, C } from './SignupStyles';

const JOURNEY_ITEMS = [
    { Icon: Shield, text: 'Collect your full health profile details' },
    { Icon: Zap, text: 'Set up your personalised medication schedule' },
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
            setProceeding(false);
        }
    };

    const ctaAnim = staggerAnims[5] ?? null;

    return (
        <View>
            {/* Pill badge */}
            <View style={styles.pillBadge}>
                <View style={styles.pillDot} />
                <Text style={styles.pillBadgeText}>Payment done</Text>
            </View>

            {/* Title */}
            <Text style={styles.stepTitleLine1}>You're in</Text>
            <Text style={styles.stepTitleLine2}>the family!</Text>

            {/* Success card */}
            <Animated.View style={{
                opacity: staggerAnims[0],
                transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            }}>
                <View style={styles.successCelebrationCard}>
                    <View style={styles.largeSuccessCircle}>
                        <CheckCircle2 size={52} color={C.success} strokeWidth={2} />
                    </View>
                    <Text style={styles.successTitle}>Payment Successful!</Text>
                    <Text style={styles.successSubtitle}>Welcome to the CareMyMed family.</Text>
                </View>
            </Animated.View>

            {/* Next steps card */}
            <Animated.View style={{
                opacity: staggerAnims[1],
                transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            }}>
                <View style={styles.nextStepsCard}>
                    <View style={styles.nextStepsHeader}>
                        <Sparkles size={16} color={C.primary} />
                        <Text style={styles.nextStepsTitle}>YOUR ONBOARDING JOURNEY</Text>
                    </View>
                    <Text style={styles.nextStepsDesc}>
                        A Care Caller will reach out within 24 hours to finalise your profile:
                    </Text>
                    <View style={styles.journeyList}>
                        {JOURNEY_ITEMS.map(({ Icon, text }, i) => (
                            <Animated.View
                                key={text}
                                style={{
                                    opacity: staggerAnims[i + 2],
                                    transform: [{
                                        translateX: staggerAnims[i + 2].interpolate({
                                            inputRange: [0, 1], outputRange: [-12, 0],
                                        }),
                                    }],
                                }}
                            >
                                <View style={styles.journeyItem}>
                                    <View style={styles.journeyIconBox}>
                                        <Icon size={16} color={C.primary} />
                                    </View>
                                    <Text style={styles.journeyText}>{text}</Text>
                                </View>
                            </Animated.View>
                        ))}
                    </View>
                </View>
            </Animated.View>

            {/* Continue CTA */}
            <Animated.View style={{
                opacity: ctaAnim ?? 1,
                transform: ctaAnim
                    ? [{ scale: ctaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }]
                    : undefined,
            }}>
                <Pressable
                    style={[styles.primaryBtnEnhanced, proceeding && { opacity: 0.7 }]}
                    onPress={handlePress}
                    disabled={proceeding}
                >
                    <View style={styles.primaryBtnGradientEnhanced}>
                        {proceeding ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 10 }}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>Loading...</Text>
                            </View>
                        ) : (
                            <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>
                                Complete profile
                            </Text>
                        )}
                    </View>
                </Pressable>
            </Animated.View>
        </View>
    );
};

Step4Verification.displayName = 'Step4Verification';
export default React.memo(Step4Verification);
