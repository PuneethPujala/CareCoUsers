import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, Mail, Lock, Eye, EyeOff, CheckCircle2, ChevronRight, AlertCircle, Smartphone } from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { IconInput, PasswordStrength } from './SignupUI';
import { styles } from './SignupStyles';

const Step1Profile = ({
    googleLoading, handleGooglePress,
    signupLoading, handleStep1Submit,
    isEmailVerified, isPhoneVerified,
    showPass, toggleShowPass,
    showConfirm, toggleShowConfirm,
    fullNameRef, emailRef, phoneRef, passwordRef, confirmPassRef
}) => {
    const { control, formState: { errors }, watch } = useFormContext();
    const formValues = watch();

    const emailLabel = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.label}>Email Address</Text>
            {isEmailVerified && <CheckCircle2 size={12} color="#22C55E" />}
        </View>
    ), [isEmailVerified]);

    const phoneLabel = useMemo(() => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.label}>Phone Number</Text>
            {isPhoneVerified && <CheckCircle2 size={12} color="#22C55E" />}
        </View>
    ), [isPhoneVerified]);

    const passwordsMatch = formValues.confirmPassword?.length > 0 && formValues.password === formValues.confirmPassword;

    return (
        <View>
            <Pressable style={styles.googleBtnEnhanced} onPress={handleGooglePress} disabled={googleLoading}>
                <View style={styles.googleIconWrap}>
                    <Text style={styles.googleTextG}>G</Text>
                </View>
                <Text style={styles.googleBtnText}>{googleLoading ? 'Signing up...' : 'Continue with Google'}</Text>
            </Pressable>

            <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR SIGN UP WITH EMAIL</Text>
                <View style={styles.dividerLine} />
            </View>

            {(errors.general || errors.google) ? (
                <View style={styles.errorBoxEnhanced}>
                    <AlertCircle size={18} color="#EF4444" />
                    <Text style={styles.errorMsgEnhanced}>{errors.general?.message || errors.google?.message}</Text>
                </View>
            ) : null}

            <Controller
                control={control}
                name="fullName"
                render={({ field: { onChange, value } }) => (
                    <IconInput ref={fullNameRef} icon={User} label="Full Name" placeholder="Enter your full name"
                        value={value} onChangeText={onChange}
                        error={errors.fullName?.message} />
                )}
            />

            <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                    <IconInput ref={emailRef} icon={Mail}
                        label={emailLabel}
                        placeholder="Enter your email"
                        value={value} onChangeText={onChange}
                        autoCapitalize="none" keyboardType="email-address"
                        autoCorrect={false} spellCheck={false} textContentType="emailAddress"
                        error={errors.email?.message} />
                )}
            />

            <Controller
                control={control}
                name="phoneNumber"
                render={({ field: { onChange, value } }) => (
                    <IconInput ref={phoneRef} icon={Smartphone}
                        label={phoneLabel}
                        placeholder="10-digit number"
                        value={value} onChangeText={onChange}
                        keyboardType="phone-pad" maxLength={10}
                        error={errors.phoneNumber?.message}
                        textPrefix="+91 " />
                )}
            />

            <View style={{ marginTop: 20 }}>
                <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, value } }) => (
                        <View>
                            <IconInput ref={passwordRef} icon={Lock} label="Password" placeholder="Create a password"
                                value={value} onChangeText={onChange}
                                secureTextEntry={!showPass}
                                error={errors.password?.message}
                                rightIcon={<Pressable onPress={toggleShowPass} hitSlop={8}>{showPass ? <Eye size={18} color="#8899BB" /> : <EyeOff size={18} color="#8899BB" />}</Pressable>} />
                            <PasswordStrength password={value} />
                        </View>
                    )}
                />

                <Controller
                    control={control}
                    name="confirmPassword"
                    render={({ field: { onChange, value } }) => (
                        <IconInput ref={confirmPassRef} icon={Lock} label="Confirm Password" placeholder="Re-enter your password"
                            value={value} onChangeText={onChange}
                            secureTextEntry={!showConfirm}
                            error={errors.confirmPassword?.message}
                            rightIcon={passwordsMatch ? <CheckCircle2 size={18} color="#22C55E" /> :
                                <Pressable onPress={toggleShowConfirm} hitSlop={8}>
                                    {showConfirm ? <Eye size={18} color="#8899BB" /> : <EyeOff size={18} color="#8899BB" />}
                                </Pressable>
                            } />
                    )}
                />

                <View style={{ marginTop: 10 }}>
                    <Pressable style={[styles.primaryBtnEnhanced, signupLoading && { opacity: 0.7 }]} onPress={handleStep1Submit} disabled={signupLoading}>
                        <View style={styles.primaryBtnGradientEnhanced}>
                            {signupLoading ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.primaryBtnText}>  Creating account...</Text>
                                </View>
                            ) : (<><Text style={styles.primaryBtnText}>Continue</Text><ChevronRight size={20} color="#FFFFFF" /></>)}
                        </View>
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

export default React.memo(Step1Profile);
