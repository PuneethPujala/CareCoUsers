import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { User, Mail, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { IconInput, PasswordStrength } from './SignupUI';
import { styles, FONT, C } from './SignupStyles';
import LegalModal from '../../../components/ui/LegalModal';

const Step1Profile = ({
    googleLoading, handleGooglePress,
    signupLoading, handleStep1Submit,
    isEmailVerified,
    showPass, toggleShowPass,
    showConfirm, toggleShowConfirm,
    fullNameRef, emailRef, passwordRef, confirmPassRef,
}) => {
    const { control, formState: { errors }, watch } = useFormContext();
    const formValues = watch();
    const passwordsMatch = formValues.confirmPassword?.length > 0 && formValues.password === formValues.confirmPassword;

    const [legalVisible, setLegalVisible] = React.useState(false);
    const [legalType, setLegalType] = React.useState('terms');

    const emailLabel = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            {isEmailVerified && <CheckCircle2 size={13} color={C.success} />}
        </View>
    ), [isEmailVerified]);

    return (
        <View>
            {/* Pill badge */}
            <View style={styles.pillBadge}>
                <View style={styles.pillDot} />
                <Text style={styles.pillBadgeText}>New account</Text>
            </View>

            {/* Title */}
            <Text style={styles.stepTitleLine1}>Create your</Text>
            <Text style={styles.stepTitleLine2}>SAMVAYA account</Text>

            <View style={styles.glassFormCard}>
                {/* Google signup */}
                <Pressable
                    style={({ pressed }) => [styles.googleBtnEnhanced, pressed && styles.pressed]}
                    onPress={handleGooglePress}
                    disabled={googleLoading}
                >
                    <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#4285F4', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 14, color: '#FFF', ...FONT.heavy }}>G</Text>
                    </View>
                    <Text style={styles.googleBtnText}>
                        {googleLoading ? 'Signing up...' : 'Continue with Google'}
                    </Text>
                    {googleLoading && <ActivityIndicator size="small" color={C.muted} />}
                </Pressable>

                {/* Divider */}
                <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR SIGN UP WITH EMAIL</Text>
                    <View style={styles.dividerLine} />
                </View>

                {/* Block error */}
                {(errors.general || errors.google) ? (
                    <View style={styles.errorBoxEnhanced}>
                        <AlertCircle size={16} color={C.danger} />
                        <Text style={styles.errorMsgEnhanced}>
                            {errors.general?.message || errors.google?.message}
                        </Text>
                    </View>
                ) : null}

                {/* Full name */}
                <Controller
                    control={control}
                    name="fullName"
                    render={({ field: { onChange, value } }) => (
                        <IconInput
                            ref={fullNameRef}
                            icon={User}
                            label="FULL NAME"
                            placeholder="Enter your full name"
                            value={value}
                            onChangeText={onChange}
                            autoCapitalize="words"
                            textContentType="name"
                            returnKeyType="next"
                            onSubmitEditing={() => emailRef?.current?.focus()}
                            error={errors.fullName?.message}
                        />
                    )}
                />

                {/* Email */}
                <Controller
                    control={control}
                    name="email"
                    render={({ field: { onChange, value } }) => (
                        <IconInput
                            ref={emailRef}
                            icon={Mail}
                            label={emailLabel}
                            placeholder="you@example.com"
                            value={value}
                            onChangeText={onChange}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoCorrect={false}
                            spellCheck={false}
                            textContentType="emailAddress"
                            returnKeyType="next"
                            onSubmitEditing={() => passwordRef?.current?.focus()}
                            error={errors.email?.message}
                        />
                    )}
                />

                {/* Divider between identity and security */}
                <View style={{ height: 1, backgroundColor: C.border, marginBottom: 20 }} />

                {/* Password */}
                <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, value } }) => (
                        <View>
                            <IconInput
                                ref={passwordRef}
                                icon={Lock}
                                label="PASSWORD"
                                placeholder="Create a strong password"
                                value={value}
                                onChangeText={onChange}
                                secureTextEntry={!showPass}
                                textContentType="newPassword"
                                returnKeyType="next"
                                onSubmitEditing={() => confirmPassRef?.current?.focus()}
                                error={errors.password?.message}
                                rightIcon={
                                    <Pressable
                                        onPress={toggleShowPass}
                                        hitSlop={10}
                                        style={({ pressed }) => [pressed && styles.pressed]}
                                    >
                                        {showPass
                                            ? <Eye size={18} color={C.primary} />
                                            : <EyeOff size={18} color={C.muted} />
                                        }
                                    </Pressable>
                                }
                            />
                            <PasswordStrength password={value} />
                        </View>
                    )}
                />

                {/* Confirm password */}
                <Controller
                    control={control}
                    name="confirmPassword"
                    render={({ field: { onChange, value } }) => (
                        <IconInput
                            ref={confirmPassRef}
                            icon={Lock}
                            label="CONFIRM PASSWORD"
                            placeholder="Re-enter your password"
                            value={value}
                            onChangeText={onChange}
                            secureTextEntry={!showConfirm}
                            textContentType="newPassword"
                            returnKeyType="done"
                            onSubmitEditing={handleStep1Submit}
                            error={errors.confirmPassword?.message}
                            rightIcon={
                                passwordsMatch
                                    ? <CheckCircle2 size={18} color={C.success} />
                                    : (
                                        <Pressable
                                            onPress={toggleShowConfirm}
                                            hitSlop={10}
                                            style={({ pressed }) => [pressed && styles.pressed]}
                                        >
                                            {showConfirm
                                                ? <Eye size={18} color={C.primary} />
                                                : <EyeOff size={18} color={C.muted} />
                                            }
                                        </Pressable>
                                    )
                            }
                        />
                    )}
                />

                {/* Email OTP note */}
                <View style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                    backgroundColor: C.primarySoft, borderRadius: 12,
                    padding: 12, marginBottom: 8,
                }}>
                    <CheckCircle2 size={15} color={C.primary} style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 12, ...FONT.medium, color: C.primary, flex: 1, lineHeight: 18 }}>
                        We'll send a one-time code to verify your email before creating your account.
                    </Text>
                </View>

                {/* Terms & Conditions and Privacy Policy Checkbox */}
                <Controller
                    control={control}
                    name="termsAccepted"
                    render={({ field: { onChange, value } }) => (
                        <View style={{ marginBottom: 8, marginTop: 12 }}>
                            <Pressable
                                style={({ pressed }) => [
                                    {
                                        flexDirection: 'row',
                                        alignItems: 'flex-start',
                                        gap: 10,
                                        paddingVertical: 8,
                                    },
                                    pressed && styles.pressed
                                ]}
                                onPress={() => onChange(!value)}
                            >
                                <View style={{ marginTop: 2 }}>
                                    {value ? (
                                        <View style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 5,
                                            backgroundColor: C.primary,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}>
                                            <CheckCircle2 size={13} color="#FFF" />
                                        </View>
                                    ) : (
                                        <View style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 5,
                                            borderWidth: 1.5,
                                            borderColor: errors.termsAccepted ? C.danger : C.muted,
                                            backgroundColor: C.inputBg,
                                        }} />
                                    )}
                                </View>
                                <Text style={{
                                    fontSize: 13,
                                    ...FONT.medium,
                                    color: C.mid,
                                    flex: 1,
                                    lineHeight: 18,
                                }}>
                                    I have read and agree to the{' '}
                                    <Text
                                        style={{
                                            color: C.primary,
                                            ...FONT.bold,
                                            textDecorationLine: 'underline',
                                        }}
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            setLegalType('terms');
                                            setLegalVisible(true);
                                        }}
                                    >
                                        Terms & Conditions
                                    </Text>
                                    {' '}and{' '}
                                    <Text
                                        style={{
                                            color: C.primary,
                                            ...FONT.bold,
                                            textDecorationLine: 'underline',
                                        }}
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            setLegalType('privacy');
                                            setLegalVisible(true);
                                        }}
                                    >
                                        Privacy Policy
                                    </Text>
                                    .
                                </Text>
                            </Pressable>
                            {errors.termsAccepted && (
                                <Text style={{
                                    fontSize: 12,
                                    ...FONT.medium,
                                    color: C.danger,
                                    marginTop: 4,
                                    marginLeft: 28,
                                }}>
                                    {errors.termsAccepted.message}
                                </Text>
                            )}
                        </View>
                    )}
                />

                {/* Continue button */}
                <Pressable
                    style={({ pressed }) => [
                        styles.primaryBtnEnhanced,
                        { marginTop: 16 },
                        signupLoading && { opacity: 0.7 },
                        pressed && styles.pressed
                    ]}
                    onPress={handleStep1Submit}
                    disabled={signupLoading}
                >
                    <View style={styles.primaryBtnGradientEnhanced}>
                        {signupLoading ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 10 }}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>Creating account...</Text>
                            </View>
                        ) : (
                            <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>Continue</Text>
                        )}
                    </View>
                </Pressable>
            </View>

            <LegalModal
                visible={legalVisible}
                type={legalType}
                onClose={() => setLegalVisible(false)}
            />
        </View>
    );
};

export default React.memo(Step1Profile);
