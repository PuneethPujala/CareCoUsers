import React from 'react';
import { View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, X, Smartphone, CreditCard } from 'lucide-react-native';
import { styles, FONT } from './SignupStyles';

export const STEP_LABELS = ['Profile Creation', 'Locality', 'Membership', 'Verification', 'All Systems Go'];
const PasswordStrength = React.memo(({ password = '' }) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const barColors = ['transparent', '#EF4444', '#F59E0B', '#3B5BDB', '#22C55E'];
    if (!password) return null;
    return (
        <View style={styles.strengthWrap}>
            <View style={styles.strengthBarRow}>
                {[1, 2, 3, 4].map(i => (
                    <View key={i} style={[styles.strengthSeg, { backgroundColor: i <= score ? barColors[score] : '#E2E8F0' }]} />
                ))}
            </View>
            <Text style={[styles.strengthLabel, { color: barColors[score] }]}>{labels[score]}</Text>
        </View>
    );
});

const PasswordRequirements = React.memo(({ password = '' }) => {
    const checks = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'One number', met: /[0-9]/.test(password) },
    ];
    if (!password) return null;
    return (
        <View style={styles.reqWrap}>
            {checks.map((c, i) => (
                <Text key={i} style={[styles.reqItem, { color: c.met ? '#22C55E' : '#64748B' }]}>
                    {c.met ? '✓' : '—'} {c.label}
                </Text>
            ))}
        </View>
    );
});

const STEP_ICONS = ['👤', '📍', '⭐', '✉️', '🚀'];

const StepIndicator = React.memo(({ current }) => (
    <View style={styles.modernProgressContainer}>
        {[1, 2, 3, 4, 5].map((s, idx) => {
            const done = s < current;
            const active = s === current;
            return (
                <React.Fragment key={s}>
                    <View style={styles.stepDotWrap}>
                        <View style={[
                            styles.stepDot,
                            done && styles.stepDotDone,
                            active && styles.stepDotActive,
                        ]}>
                            {done ? (
                                <Text style={{ fontSize: 11, color: '#6366F1', fontFamily: 'Inter_800ExtraBold' }}>✓</Text>
                            ) : (
                                <Text style={[styles.stepDotLabel, active && { color: '#6366F1' }]}>{s}</Text>
                            )}
                        </View>
                        <View style={styles.stepLabelContainer}>
                            <Text style={[styles.stepNameLabel, active && { color: '#FFFFFF', ...FONT.bold }]}>
                                {STEP_LABELS[idx].split(' ')[0]}
                            </Text>
                        </View>
                    </View>
                    {idx < 4 && (
                        <View style={[styles.stepConnector, done && styles.stepConnectorDone]} />
                    )}
                </React.Fragment>
            );
        })}
    </View>
));

// B6 FIX: Wrap with both memo AND forwardRef. Previously only forwardRef was used,
// meaning the component re-rendered on every parent state change (every keystroke).
const IconInput = React.memo(React.forwardRef(({ icon: Icon, label, rightIcon, error, textPrefix, onFocus, onBlur, ...rest }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const handleFocus = (e) => {
        setIsFocused(true);
        if (onFocus) onFocus(e);
    };

    const handleBlur = (e) => {
        setIsFocused(false);
        if (onBlur) onBlur(e);
    };

    return (
        <View style={styles.fieldGroup}>
            {typeof label === 'string' ? (
                <Text style={[styles.label, isFocused && { color: '#6366F1' }]}>{label}</Text>
            ) : label}
            <Pressable
                style={[
                    styles.inputWrapEnhanced,
                    isFocused && styles.inputFocusedEnhanced,
                    error && styles.inputErrorEnhanced,
                ]}
                onPress={() => ref?.current?.focus()}
            >
                <View style={[styles.inlineIconBox, isFocused && { backgroundColor: '#EEF2FF' }]}>
                    <Icon size={18} color={isFocused ? '#6366F1' : '#94A3B8'} />
                </View>
                {textPrefix && <Text style={styles.textPrefixStyle}>{textPrefix}</Text>}
                <TextInput
                    ref={ref}
                    style={styles.textInputEnhanced}
                    placeholderTextColor="#94A3B8"
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    {...rest}
                />
                {rightIcon && <View style={styles.rightIconWrap}>{rightIcon}</View>}
            </Pressable>
            {error ? (
                <View style={styles.errorTextRow}>
                    <AlertCircle size={12} color="#EF4444" />
                    <Text style={styles.fieldErrorEnhanced}>{error}</Text>
                </View>
            ) : null}
        </View>
    );
}));

// Individual OTP input boxes — auto-advance and backspace navigation
const OTPBoxes = ({ value = '', onChange, onComplete, length = 6, editable = true }) => {
    const refs = React.useRef([...Array(length)].map(() => React.createRef()));

    const handleChange = (text, idx) => {
        const digit = text.replace(/\D/g, '').slice(-1);
        const newVal = (value.slice(0, idx) + digit + value.slice(idx + 1)).slice(0, length);
        onChange(newVal);
        if (digit) {
            if (idx < length - 1) refs.current[idx + 1]?.current?.focus();
            if (newVal.length === length) onComplete?.(newVal);
        }
    };

    const handleKeyPress = ({ nativeEvent }, idx) => {
        if (nativeEvent.key === 'Backspace' && !value[idx] && idx > 0) {
            refs.current[idx - 1]?.current?.focus();
        }
    };

    return (
        <View style={otpBoxSt.row}>
            {Array.from({ length }).map((_, i) => (
                <TextInput
                    key={i}
                    ref={refs.current[i]}
                    style={[otpBoxSt.box, !!value[i] && otpBoxSt.boxFilled]}
                    value={value[i] || ''}
                    onChangeText={(t) => handleChange(t, i)}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    editable={editable}
                    autoFocus={i === 0}
                    selectTextOnFocus
                />
            ))}
        </View>
    );
};

const otpBoxSt = StyleSheet.create({
    row: { flexDirection: 'row', gap: 9, justifyContent: 'center', marginVertical: 16 },
    box: {
        width: 46, height: 58,
        borderRadius: 16,
        backgroundColor: '#F8FAFC',
        borderWidth: 2, borderColor: '#E2E8F0',
        fontSize: 24, fontFamily: 'Inter_700Bold',
        color: '#0F172A',
    },
    boxFilled: {
        borderColor: '#6366F1',
        backgroundColor: '#EEF2FF',
        shadowColor: '#6366F1',
        shadowOpacity: 0.12, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
    },
});

const OTPModal = React.memo(({ visible, onClose, otp, setOtp, onVerify, timer, resend, attempts, field, error, otpLoading, remainingSlots }) => (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
            <KeyboardAvoidingView style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalSheet, { maxHeight: '92%', marginTop: 60 }]}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Verify {field === 'email' ? 'Email' : 'Phone'}</Text>
                        <Pressable onPress={onClose} hitSlop={12} disabled={otpLoading}><X size={22} color="#64748B" /></Pressable>
                    </View>
                    <Text style={styles.otpSubtext}>Enter the 6-digit code sent to your {field}.</Text>
                    {field === 'phone' && remainingSlots !== null && (
                        <View style={{ backgroundColor: '#F0FDF4', padding: 10, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' }}>
                            <Text style={{ fontSize: 12, color: '#166534', textAlign: 'center', fontFamily: 'Inter_500Medium' }}>
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
                    />
                    {error ? (
                        <View style={[styles.errorTextRow, { justifyContent: 'center', marginTop: -8, marginBottom: 8 }]}>
                            <AlertCircle size={13} color="#EF4444" />
                            <Text style={styles.fieldErrorEnhanced}>{error}</Text>
                        </View>
                    ) : null}
                    <View style={styles.resendRow}>
                        {timer > 0 ? (
                            <Text style={styles.timerText}>Resend in {timer}s</Text>
                        ) : (
                            <Pressable onPress={resend} disabled={otpLoading}>
                                <Text style={[styles.resendAction, otpLoading && { opacity: 0.5 }]}>Resend Code</Text>
                            </Pressable>
                        )}
                    </View>
                    <Pressable style={[styles.primaryBtnEnhanced, otpLoading && { opacity: 0.7 }]} onPress={onVerify} disabled={otpLoading}>
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtnGradientEnhanced}
                        >
                            {otpLoading ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.primaryBtnText}>  Verifying...</Text>
                                </View>
                            ) : (
                                <Text style={styles.primaryBtnText}>Verify OTP</Text>
                            )}
                        </LinearGradient>
                    </Pressable>
                    {attempts > 0 && (
                        <Text style={styles.attemptsText}>{3 - attempts} attempts remaining</Text>
                    )}
                </Pressable>
            </KeyboardAvoidingView>
        </Pressable>
    </Modal>
));

const UPIPaymentModal = React.memo(({ visible, onClose, onSuccess, planName, planPrice }) => (
    <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Complete Payment</Text>
                    <Pressable onPress={onClose} hitSlop={12}><X size={22} color="#64748B" /></Pressable>
                </View>
                <View style={styles.paymentSummary}>
                    <Text style={styles.payPlanName}>{planName}</Text>
                    <Text style={styles.payAmount}>{planPrice}</Text>
                </View>
                <Text style={styles.paySubtext}>Choose a UPI app to pay</Text>
                {['Google Pay', 'PhonePe', 'Paytm'].map(app => (
                    <Pressable key={app} style={styles.upiRow} onPress={onSuccess}>
                        <View style={styles.upiIconBox}><Smartphone size={20} color="#1A202C" /></View>
                        <Text style={styles.upiAppName}>{app}</Text>
                        <Text style={styles.upiAction}>Pay →</Text>
                    </Pressable>
                ))}
                <View style={styles.payDivider} />
                <Pressable style={styles.payManualBtn} onPress={onSuccess}>
                    <CreditCard size={18} color="#FFFFFF" />
                    <Text style={styles.payManualText}>Pay with UPI ID</Text>
                </Pressable>
            </View>
        </View>
    </Modal>
));

export { PasswordStrength, PasswordRequirements, StepIndicator, IconInput, OTPBoxes, OTPModal, UPIPaymentModal };
