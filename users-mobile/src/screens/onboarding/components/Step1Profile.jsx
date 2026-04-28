import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { User, Mail, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { IconInput, PasswordStrength } from './SignupUI';
import { styles, FONT, C } from './SignupStyles';

const Step1Profile = ({
    googleLoading, handleGooglePress,
    signupLoading, handleStep1Submit,
    isEmailVerified, isPhoneVerified,
    showPass, toggleShowPass,
    showConfirm, toggleShowConfirm,
    fullNameRef, emailRef, phoneRef, passwordRef, confirmPassRef,
}) => {
    const { control, formState: { errors }, watch } = useFormContext();
    const formValues = watch();
    const passwordsMatch = formValues.confirmPassword?.length > 0 && formValues.password === formValues.confirmPassword;

    const emailLabel = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            {isEmailVerified && <CheckCircle2 size={13} color={C.success} />}
        </View>
    ), [isEmailVerified]);

    const phoneLabel = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <Text style={styles.label}>PHONE NUMBER</Text>
            {isPhoneVerified && <CheckCircle2 size={13} color={C.success} />}
        </View>
    ), [isPhoneVerified]);

    return (
        <View>
            {/* Pill badge */}
            <View style={styles.pillBadge}>
                <View style={styles.pillDot} />
                <Text style={styles.pillBadgeText}>New account</Text>
            </View>

            {/* Title */}
            <Text style={styles.stepTitleLine1}>Create your</Text>
            <Text style={styles.stepTitleLine2}>CareMyMed account</Text>

            {/* Google signup */}
            <Pressable style={styles.googleBtnEnhanced} onPress={handleGooglePress} disabled={googleLoading}>
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
                        onSubmitEditing={() => phoneRef?.current?.focus()}
                        error={errors.email?.message}
                    />
                )}
            />

            {/* Phone */}
            <Controller
                control={control}
                name="phoneNumber"
                render={({ field: { onChange, value } }) => (
                    <IconInput
                        ref={phoneRef}
                        icon={Smartphone}
                        label={phoneLabel}
                        placeholder="10-digit number"
                        value={value}
                        onChangeText={onChange}
                        keyboardType="phone-pad"
                        maxLength={10}
                        textPrefix="+91 "
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef?.current?.focus()}
                        error={errors.phoneNumber?.message}
                    />
                )}
            />

            {/* Divider between contact and security */}
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
                                <Pressable onPress={toggleShowPass} hitSlop={10}>
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
                                    <Pressable onPress={toggleShowConfirm} hitSlop={10}>
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

            {/* OTP info note */}
            <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                backgroundColor: C.primarySoft, borderRadius: 12,
                padding: 12, marginBottom: 8,
            }}>
                <CheckCircle2 size={15} color={C.primary} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, ...FONT.medium, color: C.primary, flex: 1, lineHeight: 18 }}>
                    We'll send OTP codes to verify both your email and phone number before creating your account.
                </Text>
            </View>

            {/* Continue button */}
            <Pressable
                style={[styles.primaryBtnEnhanced, { marginTop: 16 }, signupLoading && { opacity: 0.7 }]}
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
    );
};

export default React.memo(Step1Profile);
