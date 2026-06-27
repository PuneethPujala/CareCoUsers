import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, Pressable, Animated, Platform, ActivityIndicator,
} from 'react-native';
import {
    CheckCircle2, Calendar, ChevronRight, AlertCircle,
    Heart, ShieldCheck, Users, Globe, Check,
} from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { IconInput } from './SignupUI';
import { styles, FONT, C } from './SignupStyles';
import { HapticPatterns } from '../../../utils/haptics';
import { useReduceMotion } from '../../../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../../../i18n';

const CELEBRATION_FEATURES = [
    { Icon: Heart, title: 'Personalised care', subtitle: 'Tailored daily health insights' },
    { Icon: ShieldCheck, title: 'Secure & private', subtitle: 'Your data is end-to-end encrypted' },
    { Icon: Users, title: 'Always here to help', subtitle: '24/7 dedicated care management' },
];

const Step6FinalDetails = ({
    staggerAnims, handleCompleteSignUp,
    signupLoading, showCelebration,
    proceedToDashboard, userName,
}) => {
    const { control, formState: { errors } } = useFormContext();
    const [selectedDate, setSelectedDate] = useState(
        new Date(new Date().getFullYear() - 30, 0, 1)
    );
    const orbScale = useRef(new Animated.Value(0.3)).current;
    const reduceMotion = useReduceMotion();

    useEffect(() => {
        if (showCelebration) {
            HapticPatterns.allDone().catch(() => {});
            if (reduceMotion) {
                orbScale.setValue(1);
            } else {
                Animated.spring(orbScale, {
                    toValue: 1,
                    friction: 4,
                    tension: 40,
                    useNativeDriver: true,
                }).start();
            }
        }
    }, [showCelebration, reduceMotion]);

    // ─── Celebration view ─────────────────────────────────────────────────────
    if (showCelebration) {
        return (
            <View style={styles.finalState}>
                <Animated.View style={[
                    styles.successOrb,
                    { opacity: staggerAnims[0], transform: [{ scale: orbScale }] }
                ]}>
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
                    transform: [{ translateY: staggerAnims[4].interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 20, 0] }) }],
                }}>
                    <Pressable
                        style={({ pressed }) => [styles.primaryBtnEnhanced, pressed && styles.pressed]}
                        onPress={proceedToDashboard}
                    >
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

            <View style={styles.glassFormCard}>
                <Animated.View style={{
                    width: '100%', opacity: staggerAnims[1],
                    transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 16, 0] }) }],
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
                                    <Pressable
                                        onPress={() => setShowPicker(true)}
                                        style={({ pressed }) => [pressed && styles.pressed]}
                                    >
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
                                            style={({ pressed }) => [
                                                styles.genderBtn,
                                                value === g && styles.genderBtnActive,
                                                pressed && styles.pressed,
                                            ]}
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

                    {/* Preferred Language */}
                    <View style={{ marginBottom: 20 }}>
                        <Text style={[styles.label, { marginBottom: 10 }]}>PREFERRED LANGUAGE / भाषा</Text>
                        <Controller
                            control={control}
                            name="language"
                            render={({ field: { onChange, value } }) => {
                                const languages = [
                                    { code: 'en_IN', label: 'English', native: 'English' },
                                    { code: 'hi_IN', label: 'Hindi', native: 'हिन्दी' },
                                    { code: 'te_IN', label: 'Telugu', native: 'తెలుగు' },
                                    { code: 'ta_IN', label: 'Tamil', native: 'தமிழ்' },
                                    { code: 'kn_IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
                                    { code: 'mr_IN', label: 'Marathi', native: 'मराठी' },
                                ];

                                const handleLangSelect = async (code) => {
                                    HapticPatterns.selection();
                                    onChange(code);
                                    await i18n.changeLanguage(code);
                                    try {
                                        await AsyncStorage.setItem('@user_preferred_language', code);
                                    } catch (e) {
                                        console.warn('[Step6] AsyncStorage error saving language:', e);
                                    }
                                };

                                return (
                                    <View>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
                                            {languages.map(lang => {
                                                const isActive = value === lang.code;
                                                return (
                                                    <Pressable
                                                        key={lang.code}
                                                        style={({ pressed }) => [
                                                            styles.genderBtn,
                                                            {
                                                                width: '48%',
                                                                paddingVertical: 12,
                                                                height: 'auto',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                flexDirection: 'column',
                                                                position: 'relative'
                                                            },
                                                            isActive && styles.genderBtnActive,
                                                            pressed && styles.pressed,
                                                        ]}
                                                        onPress={() => handleLangSelect(lang.code)}
                                                    >
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Globe size={13} color={isActive ? C.primary : '#94A3B8'} />
                                                            <Text style={[{ fontSize: 15, fontWeight: '700', color: C.dark }, isActive && { color: C.primary }]}>
                                                                {lang.native}
                                                            </Text>
                                                        </View>
                                                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 2 }}>
                                                            {lang.label}
                                                        </Text>
                                                        {isActive && (
                                                            <View style={{ position: 'absolute', top: 6, right: 6 }}>
                                                                <Check size={12} color={C.primary} strokeWidth={3} />
                                                            </View>
                                                        )}
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                        {value && (
                                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#10B981', marginTop: 10, marginLeft: 4 }}>
                                                {value === 'hi_IN' ? '✓ भाषा बदल दी गई है (आप इसे बाद में सेटिंग्स से बदल सकते हैं)' :
                                                 value === 'te_IN' ? '✓ భాష మార్చబడింది (దీనిని మీరు తర్వాత సెట్టింగ్స్‌లో మార్చుకోవచ్చు)' :
                                                 value === 'ta_IN' ? '✓ மொழி மாற்றப்பட்டது (நீங்கள் இதை பிறகு அமைப்புகளில் மாற்றலாம்)' :
                                                 value === 'kn_IN' ? '✓ ಭಾಷೆ ಬದಲಾಯಿಸಲಾಗಿದೆ (ನೀವು ಇದನ್ನು ನಂತರ ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ಬದಲಾಯಿಸಬಹುದು)' :
                                                 value === 'mr_IN' ? '✓ भाषा बदलली आहे (तुम्ही हे नंतर सेटिंग्जमधून बदलू शकता)' :
                                                 '✓ Language updated (You can change this later from Settings)'}
                                            </Text>
                                        )}
                                    </View>
                                );
                            }}
                        />
                        {errors.language && (
                            <Text style={[styles.fieldErrorEnhanced, { marginTop: 6, marginLeft: 4 }]}>
                                {errors.language.message}
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
                    transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 20, 0] }) }],
                }}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.primaryBtnEnhanced,
                            signupLoading && { opacity: 0.7 },
                            pressed && styles.pressed
                        ]}
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
        </View>
    );
};

export default React.memo(Step6FinalDetails);
