import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, Platform,
    KeyboardAvoidingView, ScrollView, Animated, ActivityIndicator,
    Modal, Alert, Keyboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
    User, Mail, MapPin, Lock, Eye, EyeOff, CheckCircle2, ArrowLeft, AlertCircle,
    Search, X, Smartphone, Check, ChevronRight, LogOut, Navigation, Sparkles, Shield, Crown, Zap, Star
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';
import { parseError } from '../../utils/parseError';
import analytics from '../../utils/analytics';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as Location from 'expo-location';

const ONBOARDING_STORAGE_KEY = 'careco_onboarding_progress';
const STALE_PROGRESS_DAYS = 7;

/* Password Helpers */
const PasswordStrength = React.memo(({ password }) => {
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
                    <View key={i} style={[styles.strengthSeg, { backgroundColor: i <= score ? barColors[score] : '#D0D9F5' }]} />
                ))}
            </View>
            <Text style={[styles.strengthLabel, { color: barColors[score] }]}>{labels[score]}</Text>
        </View>
    );
});

const OTPModal = React.memo(({ visible, onClose, otp, setOtp, onVerify, timer, resend, attempts, error, otpLoading }) => (
    <Modal visible={visible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
                <View style={styles.modalHeaderRow}>
                    <Text style={styles.modalTitle}>Verification</Text>
                    <Pressable onPress={onClose} hitSlop={15}><X size={24} color="#64748B" /></Pressable>
                </View>
                <Text style={styles.modalDesc}>Enter the 6-digit code sent to you</Text>
                <TextInput
                    style={[styles.textInputEnhanced, { letterSpacing: 8, fontSize: 24, textAlign: 'center', marginVertical: 15 }]}
                    placeholder="000000"
                    placeholderTextColor="#CBD5E1"
                    maxLength={6}
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    editable={!otpLoading}
                />
                {error ? (
                    <View style={styles.errorBoxEnhanced}>
                        <AlertCircle size={14} color="#EF4444" />
                        <Text style={styles.errorMsgEnhanced}>{error}</Text>
                    </View>
                ) : null}
                <Pressable style={[styles.primaryBtnEnhanced, otpLoading && { opacity: 0.7 }, { marginTop: 15 }]} onPress={onVerify} disabled={otpLoading}>
                    {otpLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Verify Code</Text>}
                </Pressable>
                <Pressable style={[styles.resendBtn, timer > 0 && { opacity: 0.5 }]} onPress={resend} disabled={timer > 0 || otpLoading}>
                    <Text style={styles.resendBtnText}>{timer > 0 ? `Resend code in ${timer}s` : 'Resend Code'}</Text>
                </Pressable>
            </View>
        </View>
    </Modal>
));

const UPIPaymentModal = React.memo(({ visible, onClose, onSuccess, planName, planPrice }) => (
    <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
                <View style={styles.modalHeaderRow}>
                    <Text style={styles.modalTitle}>Select Payment App</Text>
                    <Pressable onPress={onClose} hitSlop={15}><X size={24} color="#64748B" /></Pressable>
                </View>
                <View style={styles.paymentSummaryBox}>
                    <Text style={styles.paymentSummaryPlan}>{planName}</Text>
                    <Text style={styles.paymentSummaryPrice}>{planPrice}</Text>
                </View>
                <View style={styles.upiAppsContainer}>
                    {['GPay', 'PhonePe', 'Paytm', 'Amazon'].map(app => (
                        <Pressable key={app} style={styles.upiAppBtn} onPress={onSuccess}>
                            <View style={styles.upiAppIconDummy}><Text style={styles.upiAppInitial}>{app[0]}</Text></View>
                            <Text style={styles.upiAppName}>{app}</Text>
                        </Pressable>
                    ))}
                </View>
            </View>
        </View>
    </Modal>
));

export default function PatientSignupScreen({ navigation }) {
    const { signUp, signInWithGoogle, sendOtp, verifyOtp, user, signOut, injectSession, completeSignUp } = useAuth();

    // ── Flow State ────────────────────────────────────────────────────────────
    const [step, setStep] = useState(1);
    const [form, setForm] = useState({ fullName: '', email: '', phoneNumber: '', password: '', confirmPassword: '', city: '' });
    const [errors, setErrors] = useState({});
    
    // UI toggles
    const [showPass, setShowPass] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isEmailVerified, setIsEmailVerified] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);

    // Loaders
    const [signupLoading, setSignupLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [loadingCities, setLoadingCities] = useState(false);
    const [detectingLocation, setDetectingLocation] = useState(false);
    
    // OTP
    const [otpVisible, setOtpVisible] = useState(false);
    const [otp, setOtp] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [verificationField, setVerificationField] = useState('');
    const [resendTimer, setResendTimer] = useState(0);
    const [otpAttempts, setOtpAttempts] = useState(0);

    // Location / Payment
    const [availableCities, setAvailableCities] = useState([]);
    const [cityModalVisible, setCityModalVisible] = useState(false);
    const [citySearchQuery, setCitySearchQuery] = useState('');
    const [locationAddress, setLocationAddress] = useState('');
    const [selectedPlan, setSelectedPlan] = useState({ id: 'basic', name: 'Basic Plan', price: '₹500 / month' });
    const [upiModalVisible, setUpiModalVisible] = useState(false);
    const [paymentCrashWarning, setPaymentCrashWarning] = useState(false);

    const mainScrollRef = useRef(null);

    // Fade animation setup
    const fadeAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '148006126622-48vavb3em8f1fmsv2igj5o5tctc10a47.apps.googleusercontent.com',
            offlineAccess: true,
            forceCodeForRefreshToken: true,
        });

        const loadProgress = async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
                if (!raw) return;
                const progress = JSON.parse(raw);
                if (progress.step && progress.step > 1) setStep(progress.step);
                setForm(p => ({ ...p, email: progress.email || p.email, fullName: progress.fullName || p.fullName, city: progress.city || p.city }));
                if (progress.locationAddress) setLocationAddress(progress.locationAddress);
                if (progress.selectedPlan) setSelectedPlan(progress.selectedPlan);
                if (progress.paymentAttempted && progress.step === 3) setPaymentCrashWarning(true);
            } catch (err) {}
        };
        loadProgress();
    }, []);

    useEffect(() => {
        if (resendTimer <= 0) return;
        const interval = setInterval(() => setResendTimer(prev => prev - 1), 1000);
        return () => clearInterval(interval);
    }, [resendTimer]);

    const changeStep = (newStep) => {
        if (mainScrollRef.current) mainScrollRef.current.scrollTo({ y: 0, animated: true });
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true })
        ]).start();
        setTimeout(() => setStep(newStep), 150);
        
        AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
            step: newStep, email: form.email, fullName: form.fullName, city: form.city, locationAddress, selectedPlan
        })).catch(() => {});
        
        if (newStep === 2 && availableCities.length === 0) fetchCities();
    };

    const fetchCities = async () => {
        setLoadingCities(true);
        try {
            const res = await apiService.patients.getCities();
            if (res?.cities) setAvailableCities(res.cities);
        } catch (e) {}
        setLoadingCities(false);
    };

    const updateField = (key, val) => {
        setForm(prev => ({ ...prev, [key]: val }));
        setErrors(prev => prev[key] ? { ...prev, [key]: '' } : prev);
    };

    const handleGooglePress = async () => {
        try {
            setGoogleLoading(true);
            setErrors({});
            await GoogleSignin.hasPlayServices();
            const userInfo = await GoogleSignin.signIn();
            if (userInfo.data?.idToken) {
                const res = await signInWithGoogle(userInfo.data.idToken);
                if (res?.session) {
                    await injectSession(res.session);
                    changeStep(2);
                }
            }
        } catch (error) {
            setErrors({ general: 'Google sign-up failed' });
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleVerifyPress = async (field) => {
        const val = field === 'email' ? form.email.trim().toLowerCase() : form.phoneNumber.trim();
        if (!val) { setErrors({ [field === 'phone' ? 'phoneNumber' : field]: 'Required' }); return; }
        
        setVerificationField(field);
        setOtpLoading(true);
        try {
            await sendOtp(field, field === 'phone' ? `+91${val}` : val);
            setOtpVisible(true);
            setResendTimer(60);
            setOtpAttempts(0);
            setOtp('');
        } catch (error) {
            setErrors({ [field === 'phone' ? 'phoneNumber' : field]: 'Failed to send OTP' });
        } finally {
            setOtpLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length < 6) { setErrors({ otp: 'Please enter a 6-digit code' }); return; }
        const val = verificationField === 'email' ? form.email.trim().toLowerCase() : `+91${form.phoneNumber.trim()}`;
        setOtpLoading(true);
        try {
            await verifyOtp(verificationField, val, otp);
            if (verificationField === 'email') setIsEmailVerified(true);
            if (verificationField === 'phone') setIsPhoneVerified(true);
            setOtpVisible(false);
            setErrors(prev => ({ ...prev, [verificationField === 'phone' ? 'phoneNumber' : verificationField]: '' }));
        } catch (error) {
            setErrors({ otp: 'Invalid or expired code' });
        } finally {
            setOtpLoading(false);
        }
    };

    const handleResendOtp = async () => {
        if (resendTimer > 0) return;
        const val = verificationField === 'email' ? form.email.trim().toLowerCase() : `+91${form.phoneNumber.trim()}`;
        setOtpLoading(true);
        try {
            await sendOtp(verificationField, val);
            setResendTimer(60);
            setOtp('');
            setErrors({ otp: '' });
        } catch (err) {
            setErrors({ otp: 'Failed to resend code' });
        } finally {
            setOtpLoading(false);
        }
    };

    const handleStep1Continue = async () => {
        const e = {};
        if (!form.fullName.trim()) e.fullName = 'Required';
        if (!form.email.trim()) e.email = 'Required';
        if (!form.phoneNumber.trim() || form.phoneNumber.length < 10) e.phoneNumber = 'Valid 10-digit number required';
        if (!isEmailVerified) e.email = 'Please verify your email';
        if (!isPhoneVerified) e.phoneNumber = 'Please verify your phone number';
        if (form.password.length < 8) e.password = 'Must be at least 8 characters';
        if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
        
        if (Object.keys(e).length > 0) { setErrors(e); return; }

        Keyboard.dismiss();
        setSignupLoading(true);

        if (user && user.email?.toLowerCase() === form.email.toLowerCase()) {
            changeStep(2);
            setSignupLoading(false);
            return;
        }

        try {
            await signUp({
                email: form.email.trim().toLowerCase(),
                password: form.password,
                phone: `+91${form.phoneNumber.trim()}`,
                metadata: { full_name: form.fullName.trim() }
            });
            changeStep(2);
        } catch (error) {
            setErrors({ general: parseError(error).general || 'Signup failed' });
        } finally {
            setSignupLoading(false);
        }
    };

    const handleDetectLocation = async () => {
        setDetectingLocation(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') throw new Error('Permission denied');
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const res = await apiService.patients.reverseGeocode(loc.coords.latitude, loc.coords.longitude);
            if (res?.data?.city) {
                setForm({ ...form, city: res.data.city });
                setLocationAddress(res.data.display_name);
            }
        } catch (e) {
            setErrors({ location: 'Failed to detect location' });
        }
        setDetectingLocation(false);
    };

    const handleStep2Continue = async () => {
        if (!form.city) { setErrors({ location: 'Select your city' }); return; }
        setSignupLoading(true);
        try {
            await apiService.auth.updatePatientCity({ city: form.city });
        } catch (e) {}
        setSignupLoading(false);
        changeStep(3);
    };

    const handlePaymentSuccess = async () => {
        setUpiModalVisible(false);
        try {
            await apiService.patients.subscribe({ plan: selectedPlan.id, paid: 1 });
            changeStep(4);
        } catch (e) {
            changeStep(4); // Let them proceed even if validation fails locally for now
        }
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView ref={mainScrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <LinearGradient colors={['#1E3A8A', '#3B5BDB', '#60A5FA']} style={styles.hero}>
                    <View style={styles.headerRow}>
                        {step > 1 ? (
                            <Pressable onPress={() => changeStep(step - 1)} hitSlop={15}><ArrowLeft size={24} color="#FFF"/></Pressable>
                        ) : (
                            <View style={{width: 24}}/>
                        )}
                        <Text style={styles.headerTitle}>Samvaya Setup</Text>
                        <Pressable onPress={() => { AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY); signOut(); }} hitSlop={15}>
                            <LogOut size={20} color="#FFF"/>
                        </Pressable>
                    </View>
                </LinearGradient>
                
                <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
                    {step === 1 && (
                        <View>
                            <Pressable style={styles.googleBtn} onPress={handleGooglePress}>
                                {googleLoading ? <ActivityIndicator size="small" color="#1E293B" /> : <Text style={styles.googleText}>Sign Up with Google</Text>}
                            </Pressable>
                            
                            {errors.general && <View style={styles.errBox}><AlertCircle size={14} color="#EF4444"/><Text style={styles.errTxt}>{errors.general}</Text></View>}
                            
                            <Text style={styles.inputLabel}>Full Name</Text>
                            <View style={styles.inputWrap}><TextInput style={styles.input} value={form.fullName} onChangeText={v => updateField('fullName', v)} placeholder="John Doe" autoCorrect={false} importantForAutofill="no" /></View>
                            {errors.fullName && <Text style={styles.errTxt}>{errors.fullName}</Text>}
                            
                            <View style={styles.rowLabel}><Text style={styles.inputLabel}>Email</Text>{isEmailVerified && <CheckCircle2 size={14} color="#22C55E"/>}</View>
                            <View style={styles.row}>
                                <View style={[styles.inputWrap, {flex: 1}]}><TextInput style={styles.input} value={form.email} onChangeText={v => updateField('email', v)} placeholder="john@example.com" autoCapitalize="none" keyboardType="email-address" textContentType="none" importantForAutofill="no" /></View>
                                <Pressable style={[styles.verifyBtn, isEmailVerified && styles.verifiedBg]} onPress={() => !isEmailVerified && handleVerifyPress('email')}>
                                    <Text style={styles.verifyTxt}>{isEmailVerified ? 'Verified' : 'Verify'}</Text>
                                </Pressable>
                            </View>
                            {errors.email && <Text style={styles.errTxt}>{errors.email}</Text>}
                            
                            <View style={styles.rowLabel}><Text style={styles.inputLabel}>Phone Number (India)</Text>{isPhoneVerified && <CheckCircle2 size={14} color="#22C55E"/>}</View>
                            <View style={styles.row}>
                                <View style={[styles.inputWrap, {flex: 1}]}><TextInput style={styles.input} value={form.phoneNumber} onChangeText={v => updateField('phoneNumber', v)} placeholder="9876543210" keyboardType="phone-pad" maxLength={10} textContentType="none" importantForAutofill="no" /></View>
                                <Pressable style={[styles.verifyBtn, isPhoneVerified && styles.verifiedBg]} onPress={() => !isPhoneVerified && handleVerifyPress('phone')}>
                                    <Text style={styles.verifyTxt}>{isPhoneVerified ? 'Verified' : 'Verify'}</Text>
                                </Pressable>
                            </View>
                            {errors.phoneNumber && <Text style={styles.errTxt}>{errors.phoneNumber}</Text>}

                            <Text style={styles.inputLabel}>Password</Text>
                            <View style={styles.inputWrap}>
                                <TextInput style={styles.input} value={form.password} onChangeText={v => updateField('password', v)} secureTextEntry={!showPass} placeholder="••••••••" importantForAutofill="no" />
                                <Pressable onPress={() => setShowPass(!showPass)}>{showPass ? <Eye size={20} color="#8899BB"/> : <EyeOff size={20} color="#8899BB"/>}</Pressable>
                            </View>
                            <PasswordStrength password={form.password} />
                            
                            <Text style={styles.inputLabel}>Confirm Password</Text>
                            <View style={styles.inputWrap}>
                                <TextInput style={styles.input} value={form.confirmPassword} onChangeText={v => updateField('confirmPassword', v)} secureTextEntry={!showConfirm} placeholder="••••••••" importantForAutofill="no" />
                            </View>
                            {errors.confirmPassword && <Text style={styles.errTxt}>{errors.confirmPassword}</Text>}
                            
                            <Pressable style={styles.primaryBtn} onPress={handleStep1Continue} disabled={signupLoading}>
                                {signupLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.primaryBtnTxt}>Continue to Location</Text>}
                            </Pressable>
                        </View>
                    )}

                    {step === 2 && (
                        <View style={{paddingBottom: 20}}>
                            <Text style={styles.sectionTitle}>Where do you live?</Text>
                            <Text style={styles.sectionDesc}>We need your city to connect you with local Care Callers.</Text>
                            
                            <Pressable style={styles.primaryBtn} onPress={handleDetectLocation}>
                                {detectingLocation ? <ActivityIndicator size="small" color="#FFF"/> : <Text style={styles.primaryBtnTxt}>Detect Current Location</Text>}
                            </Pressable>
                            <Pressable style={styles.outlineBtn} onPress={() => setCityModalVisible(true)}>
                                <Text style={styles.outlineBtnTxt}>Search Manually</Text>
                            </Pressable>
                            
                            {errors.location && <Text style={styles.errTxt}>{errors.location}</Text>}
                            {locationAddress ? <Text style={styles.locResult}>Selected: {locationAddress}</Text> : null}

                            {form.city ? (
                                <Pressable style={[styles.primaryBtn, {marginTop: 40}]} onPress={handleStep2Continue} disabled={signupLoading}>
                                    <Text style={styles.primaryBtnTxt}>Continue to Plans</Text>
                                </Pressable>
                            ) : null}
                        </View>
                    )}

                    {step === 3 && (
                        <View style={{paddingBottom: 20}}>
                            <Text style={styles.sectionTitle}>Choose a Plan</Text>
                            
                            <View style={[styles.planCard, selectedPlan.id === 'basic' && styles.planCardActive]}>
                                <View style={styles.rowLabel}><Shield size={24} color="#3B5BDB"/><Text style={styles.planTitle}>Basic Plan</Text></View>
                                <Text style={styles.planPrice}>₹500 / mo</Text>
                                <View style={styles.planFeatures}>
                                    {['Daily Care Calls', 'Medication Tracking', 'Assigned Caller', 'Health History'].map(f => (
                                        <View key={f} style={styles.rowLabel}><Check size={14} color="#3B5BDB"/><Text style={styles.featureTxt}>{f}</Text></View>
                                    ))}
                                </View>
                                <Pressable style={styles.primaryBtn} onPress={() => { setSelectedPlan({ id: 'basic', name: 'Basic Plan', price: '₹500 / month' }); setUpiModalVisible(true); }}>
                                    <Text style={styles.primaryBtnTxt}>Pay ₹500 Now</Text>
                                </Pressable>
                            </View>

                            <View style={[styles.planCard, {opacity: 0.6, marginTop: 20}]}>
                                <View style={styles.rowLabel}><Crown size={24} color="#8899BB"/><Text style={[styles.planTitle, {color: '#8899BB'}]}>Premium Plan (Soon)</Text></View>
                                <Text style={[styles.planPrice, {color: '#8899BB'}]}>₹999 / mo</Text>
                            </View>
                        </View>
                    )}

                    {step === 4 && (
                        <View style={{alignItems: 'center', marginVertical: 40}}>
                            <CheckCircle2 color="#22C55E" size={80} />
                            <Text style={styles.sectionTitle}>Payment Successful!</Text>
                            <Text style={[styles.sectionDesc, {textAlign: 'center'}]}>A Care Caller will reach out within 24 hours to finish profile setup.</Text>
                            <Pressable style={[styles.primaryBtn, {width: '100%', marginTop: 30}]} onPress={() => changeStep(5)}>
                                <Text style={styles.primaryBtnTxt}>Continue</Text>
                            </Pressable>
                        </View>
                    )}

                    {step === 5 && (
                        <View style={{alignItems: 'center', marginVertical: 40}}>
                            <Sparkles color="#3B5BDB" size={80} />
                            <Text style={styles.sectionTitle}>All Systems Go</Text>
                            <Text style={[styles.sectionDesc, {textAlign: 'center'}]}>You are officially enrolled in the CareCo platform.</Text>
                            <Pressable style={[styles.primaryBtn, {width: '100%', marginTop: 30}]} onPress={() => { AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY); completeSignUp(); }}>
                                <Text style={styles.primaryBtnTxt}>Go to Dashboard</Text>
                            </Pressable>
                        </View>
                    )}
                </Animated.View>
            </ScrollView>

            <OTPModal visible={otpVisible} onClose={() => setOtpVisible(false)} otp={otp} setOtp={setOtp} onVerify={handleVerifyOtp} timer={resendTimer} resend={handleResendOtp} attempts={otpAttempts} error={errors.otp} otpLoading={otpLoading} />
            <UPIPaymentModal visible={upiModalVisible} onClose={() => setUpiModalVisible(false)} onSuccess={handlePaymentSuccess} planName={selectedPlan.name} planPrice={selectedPlan.price} />

            <Modal visible={cityModalVisible} animationType="slide" transparent>
                <View style={styles.modalSheetFull}>
                    <View style={styles.modalHeaderRow}>
                        <Text style={styles.modalTitle}>Search Cities</Text>
                        <Pressable onPress={() => setCityModalVisible(false)}><X size={24} color="#64748B"/></Pressable>
                    </View>
                    <View style={[styles.inputWrap, {marginTop: 15}]}>
                        <TextInput style={styles.input} placeholder="Type a city name..." value={citySearchQuery} onChangeText={setCitySearchQuery} />
                    </View>
                    <ScrollView style={{marginTop: 15, flex: 1}}>
                        {availableCities.filter(c => c.name.toLowerCase().includes(citySearchQuery.toLowerCase())).map(c => (
                            <Pressable key={c.id || c._id} style={styles.cityOpt} onPress={() => { setForm({...form, city: c.name}); setCityModalVisible(false); }}>
                                <Text style={styles.cityOptTxt}>{c.name}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#EEF1FF' },
    scroll: { flexGrow: 1, paddingBottom: 40 },
    hero: { padding: 40, paddingTop: 60, paddingBottom: 80, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '700' },
    card: { backgroundColor: '#FFF', margin: 20, marginTop: -50, borderRadius: 24, padding: 24, elevation: 8, shadowColor: '#3B5BDB', shadowOffset: {width: 0,height: 4}, shadowOpacity: 0.15, shadowRadius: 12 },
    
    sectionTitle: { fontSize: 24, fontWeight: 'bold', color: '#1E293B', marginBottom: 8, textAlign: 'center' },
    sectionDesc: { fontSize: 15, color: '#64748B', marginBottom: 24, textAlign: 'center' },
    
    inputLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 16, marginBottom: 6 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D0D9F5', borderRadius: 12, paddingHorizontal: 14, height: 50, backgroundColor: '#FAFAFD' },
    input: { flex: 1, color: '#1E293B', fontSize: 16 },
    
    rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    verifyBtn: { backgroundColor: '#3B5BDB', borderRadius: 12, paddingHorizontal: 16, height: 50, justifyContent: 'center' },
    verifiedBg: { backgroundColor: '#22C55E' },
    verifyTxt: { color: '#FFF', fontWeight: 'bold' },
    
    primaryBtn: { backgroundColor: '#3B5BDB', borderRadius: 12, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
    primaryBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    outlineBtn: { borderWidth: 2, borderColor: '#3B5BDB', borderRadius: 12, height: 54, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
    outlineBtnTxt: { color: '#3B5BDB', fontSize: 16, fontWeight: '700' },
    
    googleBtn: { flexDirection: 'row', borderWidth: 1, borderColor: '#D0D9F5', borderRadius: 12, height: 54, justifyContent: 'center', alignItems: 'center', marginBottom: 12, backgroundColor: '#FFF' },
    googleText: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
    
    errTxt: { color: '#EF4444', fontSize: 12, marginTop: 6, fontWeight: '500' },
    errBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8, marginBottom: 16 },
    
    planCard: { borderWidth: 1, borderColor: '#D0D9F5', borderRadius: 16, padding: 20, backgroundColor: '#FFF' },
    planCardActive: { borderColor: '#3B5BDB', backgroundColor: '#F8FAFC' },
    planTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
    planPrice: { fontSize: 24, fontWeight: '800', color: '#3B5BDB', marginVertical: 12 },
    planFeatures: { gap: 8, marginVertical: 12 },
    featureTxt: { fontSize: 14, color: '#475569' },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
    modalSheetFull: { flex: 1, backgroundColor: '#FFF', paddingTop: Platform.OS === 'ios' ? 60 : 40, padding: 24 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1E293B' },
    modalDesc: { color: '#64748B', marginBottom: 20 },
    
    cityOpt: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    cityOptTxt: { fontSize: 16, color: '#1E293B' },
    locResult: { marginTop: 12, color: '#3B5BDB', fontWeight: '500', textAlign: 'center' },
    
    strengthWrap: { marginTop: 8 },
    strengthBarRow: { flexDirection: 'row', gap: 4, height: 4, marginBottom: 4 },
    strengthSeg: { flex: 1, borderRadius: 2 },
    strengthLabel: { fontSize: 11, fontWeight: 'bold', textAlign: 'right' },
    
    paymentSummaryBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between' },
    paymentSummaryPlan: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
    paymentSummaryPrice: { fontSize: 16, fontWeight: 'bold', color: '#3B5BDB' },
    upiAppsContainer: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 },
    upiAppBtn: { alignItems: 'center', gap: 8 },
    upiAppIconDummy: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EEF1FF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D0D9F5' },
    upiAppInitial: { fontSize: 24, fontWeight: 'bold', color: '#3B5BDB' },
    upiAppName: { fontSize: 13, color: '#475569', fontWeight: '500' },
    
    primaryBtnEnhanced: { backgroundColor: '#3B5BDB', borderRadius: 12, height: 54, justifyContent: 'center', alignItems: 'center' },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    resendBtn: { marginTop: 12, height: 44, justifyContent: 'center', alignItems: 'center' },
    resendBtnText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
    
    textInputEnhanced: { borderWidth: 1, borderColor: '#D0D9F5', borderRadius: 12, paddingHorizontal: 16, height: 54, backgroundColor: '#FAFAFD', fontSize: 16, color: '#1E293B' },
    errorBoxEnhanced: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8 },
    errorMsgEnhanced: { color: '#EF4444', fontSize: 13, flex: 1 }
});