import React from 'react';
import { View, Text, Pressable, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, Calendar, ChevronRight, AlertCircle } from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { IconInput } from './SignupUI';
import { styles } from './SignupStyles';

const Step5FinalDetails = ({ staggerAnims, handleCompleteSignUp, signupLoading }) => {
    const { control, formState: { errors } } = useFormContext();
    const [selectedDate, setSelectedDate] = React.useState(new Date(new Date().getFullYear() - 30, 0, 1));

    return (
        <View style={styles.finalState}>
            <Animated.View style={[styles.successOrb, { opacity: staggerAnims[0], marginBottom: 16 }]}>
                <CheckCircle2 size={64} color="#6366F1" />
            </Animated.View>
            <Animated.Text style={[styles.finalTitle, { opacity: staggerAnims[1], fontSize: 24 }]}>Almost Done!</Animated.Text>
            <Animated.Text style={[styles.finalSub, { opacity: staggerAnims[2], marginBottom: 24 }]}>Please provide a few more details for your health profile.</Animated.Text>

            <Animated.View style={{ width: '100%', opacity: staggerAnims[3], marginBottom: 24, textAlign: 'left' }}>
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
                                    const age = new Date().getFullYear() - date.getFullYear();
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
                                            <Text style={[styles.genderBtnText, value === g && { color: '#3B5BDB' }]}>{g}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        />
                        {errors.gender && <Text style={[styles.errorText, { marginTop: 4 }]}>{errors.gender.message}</Text>}
                    </View>
                </View>
            </Animated.View>

            {errors.general ? (
                <View style={[styles.errorBox, { marginBottom: 16 }]}>
                    <AlertCircle size={16} color="#EF4444" />
                    <Text style={styles.errorBoxText}>{errors.general.message || errors.general}</Text>
                </View>
            ) : null}

            <Animated.View style={{ width: '100%', opacity: staggerAnims[4], transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                <Pressable style={[styles.primaryBtnEnhanced, signupLoading && { opacity: 0.7 }]} onPress={handleCompleteSignUp} disabled={signupLoading}>
                    <LinearGradient
                        colors={['#6366F1', '#4F46E5']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.primaryBtnGradientEnhanced}
                    >
                        <Text style={styles.primaryBtnText}>Enter Dashboard</Text>
                        <ChevronRight size={20} color="#FFFFFF" />
                    </LinearGradient>
                </Pressable>
            </Animated.View>
        </View>
    );
};

export default React.memo(Step5FinalDetails);
