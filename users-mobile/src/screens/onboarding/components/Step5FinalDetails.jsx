import React from 'react';
import {
    View, Text, Pressable, Animated, Platform, ActivityIndicator,
} from 'react-native';
import {
    CheckCircle2, Calendar, ChevronRight, AlertCircle,
    Heart, ShieldCheck, Users,
} from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { IconInput } from './SignupUI';
import { styles, FONT, C } from './SignupStyles';

const CELEBRATION_FEATURES = [
    { Icon: Heart, title: 'Personalised care', subtitle: 'Tailored daily health insights' },
    { Icon: ShieldCheck, title: 'Secure & private', subtitle: 'Your data is end-to-end encrypted' },
    { Icon: Users, title: 'Always here to help', subtitle: '24/7 dedicated care management' },
];

const Step5FinalDetails = ({
    staggerAnims, handleCompleteSignUp,
    signupLoading, showCelebration,
    proceedToDashboard, userName,
}) => {
    const { control, formState: { errors } } = useFormContext();
    const [selectedDate, setSelectedDate] = React.useState(
        new Date(new Date().getFullYear() - 30, 0, 1)
    );

    // ─── Celebration view ─────────────────────────────────────────────────────
    if (showCelebration) {
        return (
            <View style={styles.finalState}>
                <Animated.View style={[styles.successOrb, { opacity: staggerAnims[0] }]}>
                    <CheckCircle2 size={72} color={C.primary} />
                </Animated.View>

                <Animated.Text style={[styles.finalTitle, { opacity: staggerAnims[1] }]}>
                    You're all set{userName ? `, ${userName}` : ''}!
                </Animated.Text>
                <Animated.Text style={[styles.finalSub, { opacity: staggerAnims[2] }]}>
                    Your health profile is ready. Let's start your journey to better health.
                </Animated.Text>

                <Animated.View style={[styles.finalCard, { opacity: staggerAnims[3] }]}>
                    {CELEBRATION_FEATURES.map(({ Icon, title, subtitle }) => (
                        <View key={title} style={styles.finalRow}>
                            <View style={styles.finalIconBox}>
                                <Icon size={20} color={C.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.finalCardTitle}>{title}</Text>
                                <Text style={styles.finalCardText}>{subtitle}</Text>
                            </View>
                        </View>
                    ))}
                </Animated.View>

                <Animated.View style={{
                    width: '100%', opacity: staggerAnims[4],
                    transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                }}>
                    <Pressable style={styles.primaryBtnEnhanced} onPress={proceedToDashboard}>
                        <View style={styles.primaryBtnGradientEnhanced}>
                            <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>
                                Go to dashboard
                            </Text>
                        </View>
                    </Pressable>
                </Animated.View>
            </View>
        );
    }

    // ─── Details form ─────────────────────────────────────────────────────────
    return (
        <View>
            {/* Pill badge */}
            <View style={styles.pillBadge}>
                <View style={styles.pillDot} />
                <Text style={styles.pillBadgeText}>Almost there</Text>
            </View>

            {/* Title */}
            <Text style={styles.stepTitleLine1}>A few more</Text>
            <Text style={styles.stepTitleLine2}>details</Text>

            <Animated.View style={{
                width: '100%', opacity: staggerAnims[1],
                transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            }}>
                {/* Date of Birth */}
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
                                if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--;
                                onChange(age.toString());
                            }
                        };

                        return (
                            <>
                                <Pressable onPress={() => setShowPicker(true)}>
                                    <View pointerEvents="none">
                                        <IconInput
                                            icon={Calendar}
                                            label="DATE OF BIRTH"
                                            placeholder="Tap to select your birth date"
                                            value={value
                                                ? `${selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}  (Age ${value})`
                                                : ''
                                            }
                                            error={errors.age?.message}
                                            editable={false}
                                        />
                                    </View>
                                </Pressable>
                                {showPicker && (
                                    require('@react-native-community/datetimepicker').default &&
                                    React.createElement(require('@react-native-community/datetimepicker').default, {
                                        value: selectedDate,
                                        mode: 'date',
                                        display: Platform.OS === 'ios' ? 'spinner' : 'default',
                                        maximumDate: new Date(),
                                        onChange: handleDateChange,
                                    })
                                )}
                            </>
                        );
                    }}
                />

                {/* Gender */}
                <View style={{ marginBottom: 20 }}>
                    <Text style={[styles.label, { marginBottom: 10 }]}>GENDER</Text>
                    <Controller
                        control={control}
                        name="gender"
                        render={({ field: { onChange, value } }) => (
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {['Male', 'Female', 'Other'].map(g => (
                                    <Pressable
                                        key={g}
                                        style={[styles.genderBtn, value === g && styles.genderBtnActive]}
                                        onPress={() => onChange(g)}
                                    >
                                        <Text style={[styles.genderBtnText, value === g && { color: C.primary }]}>
                                            {g}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    />
                    {errors.gender && (
                        <Text style={[styles.fieldErrorEnhanced, { marginTop: 6, marginLeft: 4 }]}>
                            {errors.gender.message}
                        </Text>
                    )}
                </View>
            </Animated.View>

            {/* General error */}
            {errors.general ? (
                <View style={styles.errorBoxEnhanced}>
                    <AlertCircle size={16} color={C.danger} />
                    <Text style={styles.errorMsgEnhanced}>
                        {errors.general.message || errors.general}
                    </Text>
                </View>
            ) : null}

            {/* Complete button */}
            <Animated.View style={{
                width: '100%', opacity: staggerAnims[2],
                transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            }}>
                <Pressable
                    style={[styles.primaryBtnEnhanced, signupLoading && { opacity: 0.7 }]}
                    onPress={() => handleCompleteSignUp(selectedDate.toISOString())}
                    disabled={signupLoading}
                >
                    <View style={styles.primaryBtnGradientEnhanced}>
                        {signupLoading ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 10 }}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>Saving...</Text>
                            </View>
                        ) : (
                            <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>
                                Complete setup
                            </Text>
                        )}
                    </View>
                </Pressable>
            </Animated.View>
        </View>
    );
};

export default React.memo(Step5FinalDetails);
