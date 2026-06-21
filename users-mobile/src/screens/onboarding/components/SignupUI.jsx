import React from 'react';
import {
    View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView,
    Modal, StyleSheet, ActivityIndicator,
} from 'react-native';
import { AlertCircle, X, Smartphone, CreditCard } from 'lucide-react-native';
import OTPBoxes from '../../../components/ui/OTPBoxes';
import { styles, FONT, C } from './SignupStyles';

// ─── Password strength meter ──────────────────────────────────────────────────
const PasswordStrength = React.memo(({ password = '' }) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const barColors = ['transparent', '#EF4444', '#F59E0B', '#3B82F6', '#22C55E'];
    if (!password) return null;
    return (
        <View style={styles.strengthWrap}>
            <View style={styles.strengthBarRow}>
                {[1, 2, 3, 4].map(i => (
                    <View key={i} style={[styles.strengthSeg, { backgroundColor: i <= score ? barColors[score] : C.border }]} />
                ))}
            </View>
            <Text style={[styles.strengthLabel, { color: barColors[score] }]}>{labels[score]}</Text>
        </View>
    );
});

// ─── Password requirements checklist ─────────────────────────────────────────
const PasswordRequirements = React.memo(({ password = '' }) => {
    const checks = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'One number', met: /[0-9]/.test(password) },
    ];
    if (!password) return null;
    return (
        <View style={{ marginTop: 10, gap: 4, paddingHorizontal: 4 }}>
            {checks.map((c, i) => (
                <Text key={i} style={{ fontSize: 12, ...FONT.medium, color: c.met ? C.success : C.muted }}>
                    {c.met ? '✓' : '○'} {c.label}
                </Text>
            ))}
        </View>
    );
});

// ─── Step indicator (compact, used in header) ─────────────────────────────────
const STEP_LABELS = ['Profile Creation', 'Locality', 'Membership', 'Verification', 'All Systems Go'];
const UI_LABELS = ['Profile', 'Location', 'Plan', 'Payment', 'Finish'];

const StepIndicator = React.memo(({ current }) => (
    <View style={[styles.modernProgressContainer, { position: 'relative' }]}>
        <View style={styles.stepConnector} />
        <View style={[styles.stepConnector, styles.stepConnectorDone, {
            position: 'absolute', top: 13, left: 48, zIndex: 1,
            width: `${Math.min((current - 1) * 25, 100)}%`,
        }]} />
        {[1, 2, 3, 4, 5].map((s, idx) => {
            const done = s < current;
            const active = s === current;
            return (
                <View key={s} style={styles.stepDotWrap}>
                    <View style={[
                        styles.stepDot,
                        done && styles.stepDotDone,
                        active && styles.stepDotActive,
                    ]}>
                        {done ? (
                            <Text style={{ fontSize: 11, color: '#FFFFFF', ...FONT.heavy }}>✓</Text>
                        ) : (
                            <Text style={[styles.stepDotLabel, active && { color: '#FFFFFF' }]}>{s}</Text>
                        )}
                    </View>
                    <View style={styles.stepLabelContainer}>
                        <Text style={[styles.stepNameLabel, active && { color: C.dark, ...FONT.bold }]}>
                            {UI_LABELS[idx]}
                        </Text>
                    </View>
                </View>
            );
        })}
    </View>
));

// ─── Icon Input ───────────────────────────────────────────────────────────────
const IconInput = React.memo(React.forwardRef(({ icon: Icon, label, rightIcon, error, textPrefix, onFocus, onBlur, ...rest }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    return (
        <View style={styles.fieldGroup}>
            {typeof label === 'string' ? (
                <Text style={[styles.label, isFocused && { color: C.primary }]}>{label}</Text>
            ) : label}
            <Pressable
                style={[
                    styles.inputWrapEnhanced,
                    isFocused && styles.inputFocusedEnhanced,
                    error && styles.inputErrorEnhanced,
                ]}
                onPress={() => ref?.current?.focus()}
            >
                <View style={styles.inlineIconBox}>
                    <Icon size={18} color={isFocused ? C.primary : C.muted} />
                </View>
                {textPrefix ? <Text style={styles.textPrefixStyle}>{textPrefix}</Text> : null}
                <TextInput
                    ref={ref}
                    style={styles.textInputEnhanced}
                    placeholderTextColor={C.muted}
                    onFocus={() => { setIsFocused(true); onFocus?.(); }}
                    onBlur={() => { setIsFocused(false); onBlur?.(); }}
                    {...rest}
                />
                {rightIcon ? <View style={styles.rightIconWrap}>{rightIcon}</View> : null}
            </Pressable>
            {error ? (
                <View style={styles.errorTextRow}>
                    <AlertCircle size={12} color={C.danger} />
                    <Text style={styles.fieldErrorEnhanced}>{error}</Text>
                </View>
            ) : null}
        </View>
    );
}));

// OTPBoxes is imported from '../../../components/ui/OTPBoxes'

// ─── OTP Modal ────────────────────────────────────────────────────────────────
const OTPModal = React.memo(({ visible, onClose, otp, setOtp, onVerify, timer, resend, attempts, field, error, otpLoading, remainingSlots }) => (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.modalOverlayCentered} onPress={onClose}>
                <Pressable onPress={(e) => e.stopPropagation()} style={styles.otpModalCard}>
                    <View style={styles.modalHeader}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={styles.modalTitle}>
                                Verify {field === 'email' ? 'Email' : 'Phone'}
                            </Text>
                            <Text style={styles.modalSub}>
                                6-digit code sent to your {field === 'email' ? 'email address' : 'phone number'}
                            </Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            hitSlop={12}
                            disabled={otpLoading}
                            style={({ pressed }) => [styles.closeBtnBox, pressed && styles.pressed]}
                        >
                            <X size={18} color={C.mid} />
                        </Pressable>
                    </View>

                    {field === 'phone' && remainingSlots !== null && (
                        <View style={{
                            backgroundColor: '#F0FDF4', padding: 10, borderRadius: 10,
                            marginBottom: 14, borderWidth: 1, borderColor: '#DCFCE7',
                        }}>
                            <Text style={{ fontSize: 12, color: '#166534', textAlign: 'center', ...FONT.medium }}>
                                You can create up to {remainingSlots} more account{remainingSlots !== 1 ? 's' : ''} with this phone number.
                            </Text>
                        </View>
                    )}

                    <OTPBoxes
                        value={otp}
                        onChange={setOtp}
                        onComplete={onVerify}
                        length={6}
                        editable={!otpLoading}
                        activeBorderColor={C.primary}
                        activeBgColor={C.primarySoft}
                        textColor={C.dark}
                    />

                    {error ? (
                        <View style={[styles.errorTextRow, { justifyContent: 'center', marginTop: -8, marginBottom: 10 }]}>
                            <AlertCircle size={13} color={C.danger} />
                            <Text style={styles.fieldErrorEnhanced}>{error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.resendRow}>
                        {timer > 0 ? (
                            <Text style={styles.timerText}>Resend code in {timer}s</Text>
                        ) : (
                            <Pressable
                                onPress={resend}
                                disabled={otpLoading}
                                style={({ pressed }) => [pressed && styles.pressed]}
                            >
                                <Text style={[styles.resendAction, otpLoading && { opacity: 0.5 }]}>
                                    Resend Code
                                </Text>
                            </Pressable>
                        )}
                    </View>

                    <Pressable
                        style={({ pressed }) => [
                            styles.primaryBtnEnhanced,
                            otpLoading && { opacity: 0.7 },
                            pressed && styles.pressed,
                        ]}
                        onPress={onVerify}
                        disabled={otpLoading}
                    >
                        <View style={styles.primaryBtnGradientEnhanced}>
                            {otpLoading ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={[styles.primaryBtnText, { marginLeft: 10 }]}>Verifying...</Text>
                                </View>
                            ) : (
                                <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>Verify Code</Text>
                            )}
                        </View>
                    </Pressable>

                    {attempts > 0 && (
                        <Text style={styles.attemptsText}>{3 - attempts} attempt{3 - attempts !== 1 ? 's' : ''} remaining</Text>
                    )}
                </Pressable>
            </Pressable>
        </KeyboardAvoidingView>
    </Modal>
));

// ─── UPI Payment Modal ────────────────────────────────────────────────────────
const UPIPaymentModal = React.memo(({ visible, onClose, onSuccess, planName, planPrice }) => (
    <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
                <View style={{
                    width: 40, height: 4, borderRadius: 2,
                    backgroundColor: C.border, alignSelf: 'center', marginBottom: 20,
                }} />
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Complete Payment</Text>
                    <Pressable
                        onPress={onClose}
                        hitSlop={12}
                        style={({ pressed }) => [styles.closeBtnBox, pressed && styles.pressed]}
                    >
                        <X size={18} color={C.mid} />
                    </Pressable>
                </View>

                <View style={styles.paymentSummary}>
                    <Text style={styles.payPlanName}>{planName}</Text>
                    <Text style={styles.payAmount}>{planPrice}</Text>
                </View>

                <Text style={styles.paySubtext}>Choose a UPI app to pay</Text>

                {['Google Pay', 'PhonePe', 'Paytm'].map(app => (
                    <Pressable
                        key={app}
                        style={({ pressed }) => [styles.upiRow, pressed && styles.pressed]}
                        onPress={onSuccess}
                    >
                        <View style={styles.upiIconBox}>
                            <Smartphone size={18} color={C.dark} />
                        </View>
                        <Text style={styles.upiAppName}>{app}</Text>
                        <Text style={styles.upiAction}>Pay →</Text>
                    </Pressable>
                ))}

                <View style={styles.payDivider} />

                <Pressable
                    style={({ pressed }) => [styles.payManualBtn, pressed && styles.pressed]}
                    onPress={onSuccess}
                >
                    <CreditCard size={18} color="#FFFFFF" />
                    <Text style={styles.payManualText}>Pay with UPI ID</Text>
                </Pressable>
            </View>
        </View>
    </Modal>
));

export {
    PasswordStrength, PasswordRequirements, StepIndicator,
    IconInput, OTPBoxes, OTPModal, UPIPaymentModal,
};
