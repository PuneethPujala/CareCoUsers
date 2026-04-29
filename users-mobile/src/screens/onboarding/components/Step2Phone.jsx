import React from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Smartphone, CheckCircle2, AlertCircle, RefreshCcw } from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { styles, FONT, C } from './SignupStyles';

const Step2Phone = ({
    isPhoneVerified,
    onSendOtp,
    otpLoading,
    signupLoading,
    phoneError,
    onRetry,
}) => {
    const { control, formState: { errors } } = useFormContext();
    const fieldError = errors.phoneNumber?.message;

    return (
        <View>
            {/* Pill badge */}
            <View style={styles.pillBadge}>
                <View style={styles.pillDot} />
                <Text style={styles.pillBadgeText}>Verify phone</Text>
            </View>

            {/* Title */}
            <Text style={styles.stepTitleLine1}>Add your</Text>
            <Text style={styles.stepTitleLine2}>phone number</Text>

            {/* Info card */}
            <View style={local.infoCard}>
                <View style={local.infoIconBox}>
                    <Smartphone size={20} color={C.primary} />
                </View>
                <Text style={local.infoText}>
                    Used for care alerts and OTP-based account recovery.
                </Text>
            </View>

            {/* Field validation error */}
            {fieldError ? (
                <View style={local.errorBox}>
                    <AlertCircle size={15} color={C.danger} />
                    <Text style={local.errorText}>{fieldError}</Text>
                </View>
            ) : null}

            {/* Save error with retry */}
            {phoneError && !fieldError ? (
                <View style={local.errorBox}>
                    <AlertCircle size={15} color={C.danger} />
                    <Text style={local.errorText}>{phoneError}</Text>
                    {onRetry ? (
                        <Pressable onPress={onRetry} style={local.retryBtn} hitSlop={8}>
                            <RefreshCcw size={14} color={C.primary} />
                            <Text style={local.retryText}>Retry</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}

            {/* Phone input */}
            <Controller
                control={control}
                name="phoneNumber"
                render={({ field: { onChange, value } }) => (
                    <View style={[
                        local.inputWrap,
                        isPhoneVerified && local.inputVerifiedWrap,
                        fieldError && local.inputErrorWrap,
                    ]}>
                        <Smartphone size={18} color={isPhoneVerified ? C.success : C.muted} />
                        <Text style={local.prefix}>+91</Text>
                        <TextInput
                            style={local.input}
                            placeholder="10-digit mobile number"
                            placeholderTextColor={C.muted}
                            value={value}
                            onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 10))}
                            keyboardType="phone-pad"
                            maxLength={10}
                            editable={!isPhoneVerified}
                        />
                        {isPhoneVerified && <CheckCircle2 size={18} color={C.success} />}
                    </View>
                )}
            />

            {/* Verified badge */}
            {isPhoneVerified && (
                <View style={local.verifiedBadge}>
                    <CheckCircle2 size={20} color={C.success} />
                    <View style={{ flex: 1 }}>
                        <Text style={local.verifiedTitle}>Phone number verified</Text>
                        <Text style={local.verifiedSub}>
                            {signupLoading ? 'Saving your details...' : 'Ready to continue'}
                        </Text>
                    </View>
                    {signupLoading && <ActivityIndicator size="small" color={C.success} />}
                </View>
            )}

            {/* Send OTP button */}
            {!isPhoneVerified && (
                <Pressable
                    style={[styles.primaryBtnEnhanced, (otpLoading || signupLoading) && { opacity: 0.7 }]}
                    onPress={onSendOtp}
                    disabled={otpLoading || signupLoading}
                >
                    <View style={styles.primaryBtnGradientEnhanced}>
                        {otpLoading || signupLoading ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 10 }}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>Sending OTP...</Text>
                            </View>
                        ) : (
                            <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>
                                Send OTP
                            </Text>
                        )}
                    </View>
                </Pressable>
            )}
        </View>
    );
};

const local = StyleSheet.create({
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.primarySoft,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        gap: 12,
    },
    infoIconBox: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
    },
    infoText: {
        fontSize: 13, ...FONT.medium, color: C.primary,
        flex: 1, lineHeight: 20,
    },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: C.dangerBg, borderRadius: 12,
        padding: 12, marginBottom: 14,
        borderWidth: 1, borderColor: '#FCA5A5',
    },
    errorText: { color: '#991B1B', fontSize: 13, ...FONT.semibold, flex: 1 },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    retryText: { fontSize: 13, ...FONT.bold, color: C.primary },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: C.surface,
        borderWidth: 1.5, borderColor: C.border,
        borderRadius: 16, height: 54,
        paddingHorizontal: 16, marginBottom: 20, gap: 10,
    },
    inputVerifiedWrap: {
        borderColor: C.success, backgroundColor: '#F0FDF4',
    },
    inputErrorWrap: {
        borderColor: C.danger, backgroundColor: C.dangerBg,
    },
    prefix: { fontSize: 15, ...FONT.semibold, color: C.mid },
    input: {
        flex: 1, height: '100%',
        fontSize: 15, ...FONT.semibold, color: C.dark,
    },
    verifiedBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#F0FDF4',
        borderRadius: 16, padding: 16, marginBottom: 20,
        borderWidth: 1.5, borderColor: '#DCFCE7',
    },
    verifiedTitle: { fontSize: 15, ...FONT.bold, color: '#16A34A' },
    verifiedSub: { fontSize: 12, ...FONT.medium, color: '#4ADE80', marginTop: 2 },
});

export default React.memo(Step2Phone);
