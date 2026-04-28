import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Smartphone, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useFormContext, Controller } from 'react-hook-form';
import { IconInput } from './SignupUI';
import { styles, FONT, C } from './SignupStyles';

const Step2Phone = ({
    isPhoneVerified,
    onSendOtp,        // () => void — triggers OTP modal in parent
    otpLoading,       // bool
    signupLoading,    // bool
}) => {
    const { control, formState: { errors } } = useFormContext();

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

            {/* Why note */}
            <View style={{
                backgroundColor: C.primarySoft, borderRadius: 14,
                padding: 16, marginBottom: 24, flexDirection: 'row', gap: 12, alignItems: 'flex-start',
            }}>
                <Smartphone size={18} color={C.primary} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 13, ...FONT.medium, color: C.primary, flex: 1, lineHeight: 20 }}>
                    Your phone number lets us send you care alerts and enables OTP-based account recovery.
                </Text>
            </View>

            {/* Error */}
            {errors.phoneNumber ? (
                <View style={styles.errorBoxEnhanced}>
                    <AlertCircle size={15} color={C.danger} />
                    <Text style={styles.errorMsgEnhanced}>{errors.phoneNumber.message}</Text>
                </View>
            ) : null}

            {/* Phone input */}
            <Controller
                control={control}
                name="phoneNumber"
                render={({ field: { onChange, value } }) => (
                    <IconInput
                        icon={Smartphone}
                        label="PHONE NUMBER"
                        placeholder="10-digit mobile number"
                        value={value}
                        onChangeText={onChange}
                        keyboardType="phone-pad"
                        maxLength={10}
                        textPrefix="+91 "
                        error={undefined}
                        editable={!isPhoneVerified}
                    />
                )}
            />

            {/* Verified badge */}
            {isPhoneVerified && (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: C.successBg, borderRadius: 12,
                    padding: 14, marginBottom: 16, marginTop: -8,
                    borderWidth: 1, borderColor: '#DCFCE7',
                }}>
                    <CheckCircle2 size={18} color={C.success} />
                    <Text style={{ fontSize: 14, ...FONT.semibold, color: C.successMid, flex: 1 }}>
                        Phone number verified
                    </Text>
                </View>
            )}

            {/* Send OTP / loading button */}
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

            {/* Continue after verification (handled automatically in parent) */}
            {isPhoneVerified && signupLoading && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 20 }}>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={{ fontSize: 14, ...FONT.medium, color: C.mid }}>Saving your number...</Text>
                </View>
            )}
        </View>
    );
};

export default React.memo(Step2Phone);
