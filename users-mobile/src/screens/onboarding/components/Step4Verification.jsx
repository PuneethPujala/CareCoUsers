import React from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, Shield, Zap, Smartphone, Sparkles, ChevronRight } from 'lucide-react-native';
import { styles } from './SignupStyles';

const Step4Verification = ({ staggerAnims, handleGoToStep5 }) => {
    return (
        <View style={styles.centerStepEnhanced}>
            <Animated.View style={{ width: '100%', opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <LinearGradient colors={['#EFF3FF', '#FFFFFF']} style={styles.successCelebrationCard}>
                    <View style={styles.largeSuccessCircle}><CheckCircle2 size={56} color="#22C55E" strokeWidth={2.5} /></View>
                    <Text style={styles.successTitle}>Payment Successful!</Text>
                    <Text style={styles.successSubtitle}>Welcome to the Samvaya family.</Text>
                </LinearGradient>
            </Animated.View>

            <Animated.View style={{ width: '100%', opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <View style={styles.nextStepsCard}>
                    <View style={styles.nextStepsHeader}><Sparkles size={18} color="#3B5BDB" /><Text style={styles.nextStepsTitle}>Your Onboarding Journey</Text></View>
                    <Text style={styles.nextStepsDesc}>A Care Caller will reach out within 24 hours to finalize your profile:</Text>
                    <View style={styles.journeyList}>
                        {[
                            { icon: Shield, text: 'Collect your health details' },
                            { icon: Zap, text: 'Set up medication schedule' },
                            { icon: Smartphone, text: 'Assign your dedicated care caller' },
                        ].map(({ icon: Icon, text }, i) => (
                            <Animated.View key={text} style={{ opacity: staggerAnims[i + 2], transform: [{ translateX: staggerAnims[i + 2].interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }}>
                                <View style={styles.journeyItem}>
                                    <View style={styles.journeyIconBox}><Icon size={16} color="#3B5BDB" /></View>
                                    <Text style={styles.journeyText}>{text}</Text>
                                </View>
                            </Animated.View>
                        ))}
                    </View>
                </View>
            </Animated.View>

            <Animated.View style={{ width: '100%', opacity: staggerAnims[5], transform: [{ scale: staggerAnims[5].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}>
                <Pressable style={styles.primaryBtnEnhanced} onPress={handleGoToStep5}>
                    <LinearGradient
                        colors={['#6366F1', '#4F46E5']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.primaryBtnGradientEnhanced}
                    >
                        <Text style={styles.primaryBtnText}>Continue</Text>
                        <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} />
                    </LinearGradient>
                </Pressable>
            </Animated.View>
        </View>
    );
};

export default React.memo(Step4Verification);
