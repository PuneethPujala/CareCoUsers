import React from 'react';
import { View, Text, Pressable, Animated, Platform, ActivityIndicator } from 'react-native';
import { CheckCircle2, Calendar, ChevronRight, AlertCircle, Heart, ShieldCheck, Users } from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { IconInput } from './SignupUI';
import { styles } from './SignupStyles';

const Step5FinalDetails = ({ staggerAnims, handleCompleteSignUp, signupLoading, showCelebration, proceedToDashboard, userName }) => {
    const { control, formState: { errors } } = useFormContext();
    const [selectedDate, setSelectedDate] = React.useState(new Date(new Date().getFullYear() - 30, 0, 1));

    if (showCelebration) {
        return (
            <View style={styles.finalState}>
                <Animated.View style={[styles.successOrb, { opacity: staggerAnims[0], marginBottom: 16 }]}>
                    <CheckCircle2 size={72} color="#5c55e9" />
                </Animated.View>
                <Animated.Text style={[styles.finalTitle, { opacity: staggerAnims[1] }]}>You're all set, {userName || 'there'}!</Animated.Text>
                <Animated.Text style={[styles.finalSub, { opacity: staggerAnims[2] }]}>Your health profile is ready. Let's start your journey to better health.</Animated.Text>

                <Animated.View style={[styles.finalCard, { opacity: staggerAnims[3] }]}>
                    <View style={styles.finalRow}>
                        <View style={styles.finalIconBox}>
                            <Heart size={20} color="#5c55e9" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.finalCardTitle}>Personalized care</Text>
                            <Text style={styles.finalCardText}>Tailored health insights</Text>
                        </View>
                    </View>
                    <View style={styles.finalRow}>
                        <View style={styles.finalIconBox}>
                            <ShieldCheck size={20} color="#5c55e9" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.finalCardTitle}>Secure & private</Text>
                            <Text style={styles.finalCardText}>Your data is encrypted</Text>
                        </View>
                    </View>
                    <View style={styles.finalRow}>
                        <View style={styles.finalIconBox}>
                            <Users size={20} color="#5c55e9" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.finalCardTitle}>Always here to help</Text>
                            <Text style={styles.finalCardText}>24/7 care management</Text>
                        </View>
                    </View>
                </Animated.View>

                <Animated.View style={{ width: '100%', opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                    <Pressable style={styles.primaryBtnEnhanced} onPress={proceedToDashboard}>
                        <View style={styles.primaryBtnGradientEnhanced}>
                            <Text style={styles.primaryBtnText}>Go to dashboard</Text>
                            <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} />
                        </View>
                    </Pressable>
                </Animated.View>
            </View>
        );
    }

    return (
        <View style={styles.centerStepEnhanced}>
            <Animated.View style={{ width: '100%', opacity: staggerAnims[1], marginBottom: 24, marginTop: 10 }}>
                <View style={{ gap: 16 }}>
                    <Controller
                        control={control}
                        name="age"
                        render={({ field: { onChange, value } }) => {
                            const [showPicker, setShowPicker] = React.useState(false);

                            const handleDateChange = (event, date) => {
                                setShowPicker(false);
                                if (date) {
                                    setSelectedDate(date);
                                    const today = new Date();
                                    let age = today.getFullYear() - date.getFullYear();
                                    const m = today.getMonth() - date.getMonth();
                                    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
                                        age--;
                                    }
                                    onChange(age.toString());
                                }
                            };

                            return (
                                <>
                                    <Pressable onPress={() => setShowPicker(true)}>
                                        <View pointerEvents="none">
                                            <IconInput
                                                icon={Calendar}
                                                label="Date of Birth"
                                                placeholder="Select your birth date"
                                                value={value ? `${selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} (Age: ${value})` : ''}
                                                error={errors.age?.message}
                                            />
                                        </View>
                                    </Pressable>
                                    {showPicker && (
                                        require('@react-native-community/datetimepicker').default && (
                                            <View>
                                                {React.createElement(require('@react-native-community/datetimepicker').default, {
                                                    value: selectedDate,
                                                    mode: 'date',
                                                    display: Platform.OS === 'ios' ? 'spinner' : 'default',
                                                    maximumDate: new Date(),
                                                    onChange: handleDateChange
                                                })}
                                            </View>
                                        )
                                    )}
                                </>
                            );
                        }}
                    />
                    
                    <View>
                        <Text style={[styles.label, { textAlign: 'left' }]}>Gender</Text>
                        <Controller
                            control={control}
                            name="gender"
                            render={({ field: { onChange, value } }) => (
                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                                    {['Male', 'Female', 'Other'].map(g => (
                                        <Pressable
                                            key={g}
                                            style={[styles.genderBtn, value === g && styles.genderBtnActive]}
                                            onPress={() => onChange(g)}
                                        >
                                            <Text style={[styles.genderBtnText, value === g && { color: '#5c55e9' }]}>{g}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        />
                        {errors.gender && <Text style={[styles.fieldErrorEnhanced, { marginTop: 6, marginLeft: 4 }]}>{errors.gender.message}</Text>}
                    </View>
                </View>
            </Animated.View>

            {errors.general ? (
                <View style={styles.errorBoxEnhanced}>
                    <AlertCircle size={18} color="#EF4444" />
                    <Text style={styles.errorMsgEnhanced}>{errors.general.message || errors.general}</Text>
                </View>
            ) : null}

            <Animated.View style={{ width: '100%', opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <Pressable 
                    style={[styles.primaryBtnEnhanced, signupLoading && { opacity: 0.7 }]} 
                    onPress={() => handleCompleteSignUp(selectedDate.toISOString())} 
                    disabled={signupLoading}
                >
                    <View style={styles.primaryBtnGradientEnhanced}>
                        {signupLoading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <><Text style={styles.primaryBtnText}>Continue</Text><ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} /></>
                        )}
                    </View>
                </Pressable>
            </Animated.View>
        </View>
    );
};

export default React.memo(Step5FinalDetails);
