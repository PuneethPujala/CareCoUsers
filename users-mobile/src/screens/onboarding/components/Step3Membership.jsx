import React from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles, Shield, ChevronRight, CheckCircle2, Check, AlertCircle } from 'lucide-react-native';
import { useFormContext } from 'react-hook-form';
import { styles } from './SignupStyles';

const Step3Membership = ({
    paymentCrashWarning, staggerAnims,
    setFeaturesModalVisible,
    setUpiModalVisible
}) => {
    const { setValue, watch } = useFormContext();
    const selectedPlanId = watch('selectedPlanId');

    const handleSelectBasicAndPay = () => {
        setValue('selectedPlanId', 'basic');
        setUpiModalVisible(true);
    };
    
    const handleSelectBasic = () => setValue('selectedPlanId', 'basic');

    return (
        <View style={{ paddingBottom: 20 }}>
            {paymentCrashWarning && (
                <View style={styles.errorBoxEnhanced}>
                    <AlertCircle size={18} color="#F59E0B" />
                    <Text style={[styles.errorMsgEnhanced, { color: '#92400E' }]}>
                        Your last payment attempt may not have completed. Please try again — you won't be charged twice.
                    </Text>
                </View>
            )}

            <Animated.View style={{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <Pressable style={styles.planCardGhost} onPress={() => setFeaturesModalVisible(true)}>
                    <View style={styles.ghostIconWrap}><Sparkles size={18} color="#64748B" /></View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.planTitleGhost}>Explore Features</Text>
                        <Text style={styles.planDesc}>Limited preview — no care calls</Text>
                    </View>
                    <ChevronRight size={18} color="#CBD5E1" />
                </Pressable>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <Pressable onPress={handleSelectBasic} style={[styles.planCardEnhanced, selectedPlanId === 'basic' && styles.planCardActive]}>
                    <LinearGradient colors={['#FFFFFF', '#EEF1FF']} style={styles.planCardGradient}>
                        <View style={styles.planCardHeaderRow}>
                            <View style={[styles.planIconBoxEnhanced, { backgroundColor: '#EFF3FF' }]}><Shield size={24} color="#5c55e9" /></View>
                            <View style={styles.planPriceCol}>
                                <Text style={styles.planTitleEnhanced}>Basic Plan</Text>
                                <Text style={styles.planPriceEnhanced}>₹500<Text style={styles.planPriceSub}>/mo</Text></Text>
                            </View>
                            {selectedPlanId === 'basic' && <View style={styles.selectedCheck}><CheckCircle2 size={24} color="#5c55e9" fill="#EFF3FF" /></View>}
                        </View>
                        <View style={styles.planFeaturesEnhanced}>
                            {['Daily Care Calls', 'Medication Tracking', 'Assigned Caller', 'Health History'].map(f => (
                                <View key={f} style={styles.featureLine}><Check size={14} color="#5c55e9" strokeWidth={3} /><Text style={styles.featureTextEnhanced}>{f}</Text></View>
                            ))}
                        </View>
                        <Pressable
                            style={[styles.planActionBtn, selectedPlanId === 'basic' ? styles.btnActive : styles.btnInactive]}
                            onPress={handleSelectBasicAndPay}
                        >
                            <Text style={[styles.planActionBtnText, selectedPlanId === 'basic' ? styles.txtActive : styles.txtInactive]}>
                                {selectedPlanId === 'basic' ? 'Selected — Pay ₹500' : 'Select Basic'}
                            </Text>
                            <ChevronRight size={18} color={selectedPlanId === 'basic' ? '#FFFFFF' : '#64748B'} />
                        </Pressable>
                    </LinearGradient>
                </Pressable>
            </Animated.View>
        </View>
    );
};

export default React.memo(Step3Membership);
