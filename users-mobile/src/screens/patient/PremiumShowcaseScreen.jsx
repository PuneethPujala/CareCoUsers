import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Dimensions, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
    ChevronLeft, ChevronRight, Check, Sparkles, Activity, 
    ShieldCheck, Zap, Crown, Calendar, CalendarRange 
} from 'lucide-react-native';
import CheckoutBottomSheet from '../../components/premium/CheckoutBottomSheet';
import TabScreenTransition from '../../components/ui/TabScreenTransition';
import usePatientStore from '../../store/usePatientStore';
import AlertManager from '../../utils/AlertManager';

const { width: SW } = Dimensions.get('window');

const PLANS = [
    {
        id: 'premium_annual',
        name: 'Annual Premium',
        price: '₹8,000/yr',
        subtitle: 'Billed yearly',
        badge: 'SAVE 17%',
        color: '#A855F7',
        gradient: ['#A855F7', '#7E22CE']
    },
    {
        id: 'premium_monthly',
        name: 'Monthly Premium',
        price: '₹800/mo',
        subtitle: 'Billed monthly',
        color: '#64748B',
        gradient: ['#64748B', '#475569']
    }
];

const BENEFITS = [
    { icon: Activity, title: 'Early health insights', subtitle: 'AI-powered health monitoring', color: '#EF4444' },
    { icon: Sparkles, title: 'Personalized guidance', subtitle: 'Tailored insights that adapt to you', color: '#A855F7' },
    { icon: Zap, title: 'Complete sync history', subtitle: 'Secure, complete & always accessible', color: '#F59E0B' },
];

export default function PremiumShowcaseScreen({ navigation, route }) {
    const patient = usePatientStore(state => state.patient);
    const subscription = patient?.subscription;
    const plan = subscription?.plan || 'free';
    const status = subscription?.status || 'none';
    const expiresAt = subscription?.expires_at;

    const [selectedPlanId, setSelectedPlanId] = useState('premium_annual');
    const [showCheckout, setShowCheckout] = useState(false);

    const selectedPlan = PLANS.find(p => p.id === selectedPlanId);

    const handleSuccess = () => {
        // Wait a little before replacing to prevent glitchy transitions
        setTimeout(() => {
            const forcedRenewal = route.params?.isRenewal || false;
            const isRenewalFlow = forcedRenewal || (plan !== 'free' && expiresAt);
            if (isRenewalFlow) {
                // If they are an existing user renewing, go straight back to dashboard
                navigation.navigate('PatientTabs', { screen: 'PatientHome' });
            } else {
                // New user flow
                navigation.replace('WaitingRoom', { plan: selectedPlan });
            }
        }, 500);
    };

    // Determine Dynamic Expiration/Urgency metrics
    const now = new Date();
    const expiryDate = expiresAt ? new Date(expiresAt) : null;
    
    // Fallback metrics for design rendering in mocked flows
    const finalExpiryDate = expiryDate || new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    const finalDaysRemaining = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 8;

    const expiryDateFormatted = finalExpiryDate.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    });

    // 4-State UI Switch
    let uiState = 'NONE'; // NONE, ACTIVE, EXPIRING_SOON, EXPIRED
    if (plan !== 'free' && plan !== 'none') {
        if (status === 'active' || status === 'trialing') {
            if (expiryDate && finalDaysRemaining <= 14) {
                uiState = 'EXPIRING_SOON';
            } else {
                uiState = 'ACTIVE';
            }
        } else if (status === 'expired') {
            uiState = 'EXPIRED';
        }
    }

    // Force EXPIRING_SOON if isRenewal navigation param is passed
    const forcedRenewal = route.params?.isRenewal || false;
    const isRenewal = forcedRenewal || (plan !== 'free' && expiresAt);
    if (forcedRenewal) {
        uiState = 'EXPIRING_SOON';
    }

    let urgencyColor = '#10B981'; // green
    let urgencyLabel = 'Premium Active';
    if (finalDaysRemaining < 3) {
        urgencyColor = '#EF4444'; // red
        urgencyLabel = 'Expires soon';
    } else if (finalDaysRemaining <= 14) {
        urgencyColor = '#F59E0B'; // orange
        urgencyLabel = 'Expiring soon';
    }

    // EXPIRING SOON RENEWAL REMINDER LAYOUT
    if (uiState === 'EXPIRING_SOON') {
        return (
            <TabScreenTransition>
                <View style={s.containerRenewal}>
                    {/* Header Row */}
                    <View style={s.headerRow}>
                        <Pressable onPress={() => navigation.goBack()} style={s.circleBackBtn}>
                            <ChevronLeft size={24} color="#0F172A" />
                        </Pressable>
                        <Pressable onPress={() => navigation.goBack()}>
                            <Text style={s.notNowText}>Not now</Text>
                        </Pressable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContentRenewal}>
                        {/* Hero Section */}
                        <View style={s.heroRow}>
                            <View style={s.heroLeft}>
                                <Text style={s.heroTitle}>Keep your Premium benefits</Text>
                                <Text style={s.heroSub}>Your Annual Premium plan expires on {expiryDateFormatted}.</Text>
                            </View>
                            <View style={s.heroRight}>
                                <View style={s.shieldWrapper}>
                                    <View style={s.shieldBackground}>
                                        <ShieldCheck size={48} color="#7C3AED" fill="#F3E8FF" strokeWidth={1.5} />
                                    </View>
                                    <View style={s.sparkleOverShield}>
                                        <Sparkles size={16} color="#7C3AED" fill="#7C3AED" />
                                    </View>
                                    <View style={s.crownOverlayBadge}>
                                        <Crown size={10} color="#FFFFFF" fill="#FFFFFF" />
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Bento Double Column Status Card */}
                        <View style={s.bentoCard}>
                            <View style={s.bentoCol}>
                                <View style={s.bentoIconWrapper}>
                                    <Calendar size={20} color="#7C3AED" />
                                </View>
                                <View style={s.bentoTextWrap}>
                                    <Text style={s.bentoLabel}>Plan valid until</Text>
                                    <Text style={s.bentoValue}>{expiryDateFormatted.split(' ').slice(0, 2).join(' ')}</Text>
                                </View>
                            </View>
                            <View style={s.bentoDivider} />
                            <View style={s.bentoCol}>
                                <View style={s.bentoIconWrapperGreen}>
                                    <Sparkles size={20} color="#10B981" />
                                </View>
                                <View style={s.bentoTextWrap}>
                                    <Text style={s.bentoLabel}>Current plan</Text>
                                    <Text style={s.bentoValue}>Annual Premium</Text>
                                </View>
                            </View>
                        </View>

                        {/* Native Urgency Status Indicator */}
                        <View style={s.urgencyBar}>
                            <View style={[s.urgencyDot, { backgroundColor: urgencyColor }]} />
                            <Text style={[s.urgencyText, { color: urgencyColor }]}>
                                {finalDaysRemaining} days remaining ({urgencyLabel})
                            </Text>
                        </View>

                        {/* Why stay Premium? */}
                        <Text style={s.sectionHeader}>Why stay Premium?</Text>
                        <View style={s.benefitsBlockRenewal}>
                            {BENEFITS.map((b, i) => (
                                <View key={i} style={s.benefitRowRenewal}>
                                    <View style={[s.benefitIconBoxRenewal, { backgroundColor: b.color + '15' }]}>
                                        <b.icon size={18} color={b.color} strokeWidth={2.5} />
                                    </View>
                                    <View style={s.benefitContentRenewal}>
                                        <Text style={s.benefitTitleRenewal}>{b.title}</Text>
                                        <Text style={s.benefitSubRenewal}>{b.subtitle}</Text>
                                    </View>
                                    <ChevronRight size={18} color="#94A3B8" />
                                </View>
                            ))}
                        </View>

                        {/* Pricing Toggle Cards */}
                        <Text style={s.sectionHeader}>Choose your plan</Text>
                        <View style={[s.plansGrid, { marginBottom: 28 }]}>
                            {PLANS.map(plan => {
                                const isSelected = selectedPlanId === plan.id;
                                return (
                                    <Pressable 
                                        key={plan.id}
                                        onPress={() => setSelectedPlanId(plan.id)}
                                        style={[s.planCard, isSelected && s.planCardActive, { borderColor: isSelected ? plan.color : '#E2E8F0' }]}
                                    >
                                        {plan.badge && (
                                            <View style={s.badge}>
                                                <Text style={s.badgeText}>{plan.badge}</Text>
                                            </View>
                                        )}
                                        <Text style={[s.planName, isSelected && { color: plan.color }]}>{plan.name}</Text>
                                        <Text style={[s.planPrice, isSelected && { color: plan.color }]}>{plan.price}</Text>
                                        <Text style={s.planSub}>{plan.subtitle}</Text>

                                        <View style={[s.radio, isSelected && { borderColor: plan.color }]}>
                                            {isSelected && <View style={[s.radioFill, { backgroundColor: plan.color }]} />}
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Actions Block */}
                        <View style={s.actionsContainer}>
                            <Pressable 
                                style={({ pressed }) => [s.continueBtn, pressed && { opacity: 0.95 }]}
                                onPress={() => setShowCheckout(true)}
                            >
                                <LinearGradient colors={selectedPlan.gradient} style={s.continueGradient}>
                                    <Text style={s.continueText}>Continue with {selectedPlan.name.split(' ')[0]}</Text>
                                    <Text style={s.continueSubText}>Keep all Premium benefits</Text>
                                </LinearGradient>
                            </Pressable>
                        </View>

                        {/* Footer Information */}
                        <View style={s.footerContainer}>
                            <View style={s.footerLeft}>
                                <ShieldCheck size={14} color="#94A3B8" />
                                <Text style={s.footerLabel}>Cancel anytime • Secure payment</Text>
                            </View>
                            <Pressable 
                                style={s.footerRight} 
                                onPress={() => {
                                    const subUrl = Platform.OS === 'ios'
                                        ? 'https://apps.apple.com/account/subscriptions'
                                        : 'https://play.google.com/store/account/subscriptions';
                                    Linking.openURL(subUrl).catch(() => {
                                        AlertManager.alert('Manage Subscription', 'Please open the App Store or Play Store to manage your subscription.');
                                    });
                                }}
                            >
                                <Text style={s.manageSubscriptionText}>Manage subscription</Text>
                                <ChevronRight size={14} color="#7C3AED" />
                            </Pressable>
                        </View>
                    </ScrollView>

                    <CheckoutBottomSheet 
                        visible={showCheckout} 
                        onClose={() => setShowCheckout(false)} 
                        plan={selectedPlan}
                        onSuccess={handleSuccess}
                        isRenewal={true}
                    />
                </View>
            </TabScreenTransition>
        );
    }

    // PREMIUM ACTIVE SCREEN STATE
    if (uiState === 'ACTIVE') {
        return (
            <TabScreenTransition>
                <View style={s.containerActive}>
                    <View style={s.headerRow}>
                        <Pressable onPress={() => navigation.goBack()} style={s.circleBackBtn}>
                            <ChevronLeft size={24} color="#0F172A" />
                        </Pressable>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContentActive}>
                        <View style={s.activeHero}>
                            <View style={s.activeShield}>
                                <ShieldCheck size={48} color="#10B981" fill="#D1FAE5" />
                            </View>
                            <Text style={s.activeTitle}>Premium Active</Text>
                            <Text style={s.activeSub}>You are currently enjoying advanced health monitoring, warnings, and RAG analysis.</Text>
                        </View>

                        <View style={s.activeCard}>
                            <Text style={s.activeCardLabel}>Current Plan</Text>
                            <Text style={s.activeCardValue}>Annual Premium</Text>
                            <Text style={s.activeCardExpiry}>Valid until {expiryDateFormatted}</Text>
                        </View>

                        <Pressable style={s.activeBackBtn} onPress={() => navigation.goBack()}>
                            <Text style={s.activeBackText}>Back to Dashboard</Text>
                        </Pressable>

                        <Pressable 
                            style={[s.activeBackBtn, { marginTop: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#CBD5E1' }]} 
                            onPress={() => {
                                const subUrl = Platform.OS === 'ios'
                                    ? 'https://apps.apple.com/account/subscriptions'
                                    : 'https://play.google.com/store/account/subscriptions';
                                Linking.openURL(subUrl).catch(() => {
                                    AlertManager.alert('Manage Subscription', 'Please open the App Store or Play Store to manage your subscription.');
                                });
                            }}
                        >
                            <Text style={s.activeBackText}>Manage Subscription</Text>
                        </Pressable>
                    </ScrollView>
                </View>
            </TabScreenTransition>
        );
    }

    // PREMIUM EXPIRED RENEWAL STATE
    if (uiState === 'EXPIRED') {
        return (
            <TabScreenTransition>
                <View style={s.containerActive}>
                    <View style={s.headerRow}>
                        <Pressable onPress={() => navigation.goBack()} style={s.circleBackBtn}>
                            <ChevronLeft size={24} color="#0F172A" />
                        </Pressable>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContentActive}>
                        <View style={s.activeHero}>
                            <View style={s.activeShield}>
                                <ShieldCheck size={48} color="#EF4444" fill="#FEE2E2" />
                            </View>
                            <Text style={s.activeTitle}>Premium Expired</Text>
                            <Text style={s.activeSub}>Renew your membership to restore vital alerts, chatbot history, and device integrations.</Text>
                        </View>

                        {/* Pricing Cards */}
                        <Text style={s.sectionLabel}>Choose your plan</Text>
                        <View style={s.plansGrid}>
                            {PLANS.map(plan => {
                                const isSelected = selectedPlanId === plan.id;
                                return (
                                    <Pressable 
                                        key={plan.id}
                                        onPress={() => setSelectedPlanId(plan.id)}
                                        style={[s.planCard, isSelected && s.planCardActive, { borderColor: isSelected ? plan.color : '#E2E8F0' }]}
                                    >
                                        {plan.badge && (
                                            <View style={s.badge}>
                                                <Text style={s.badgeText}>{plan.badge}</Text>
                                            </View>
                                        )}
                                        <Text style={[s.planName, isSelected && { color: plan.color }]}>{plan.name}</Text>
                                        <Text style={[s.planPrice, isSelected && { color: plan.color }]}>{plan.price}</Text>
                                        <Text style={s.planSub}>{plan.subtitle}</Text>

                                        <View style={[s.radio, isSelected && { borderColor: plan.color }]}>
                                            {isSelected && <View style={[s.radioFill, { backgroundColor: plan.color }]} />}
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Pressable 
                            style={({ pressed }) => [s.renewBtn, pressed && { opacity: 0.95 }]}
                            onPress={() => setShowCheckout(true)}
                        >
                            <LinearGradient colors={selectedPlan.gradient} style={s.renewGradient}>
                                <Text style={s.renewBtnText}>Renew Plan</Text>
                            </LinearGradient>
                        </Pressable>
                    </ScrollView>

                    <CheckoutBottomSheet 
                        visible={showCheckout} 
                        onClose={() => setShowCheckout(false)} 
                        plan={selectedPlan}
                        onSuccess={handleSuccess}
                        isRenewal={true}
                    />
                </View>
            </TabScreenTransition>
        );
    }

    // DEFAULT UPGRADE PAYWALL STATE
    return (
        <TabScreenTransition>
        <View style={s.container}>
            {/* Header Graphics */}
            <LinearGradient colors={['#F3E8FF', '#FFFFFF']} style={s.headerGraphic}>
                <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
                    <ChevronLeft size={24} color="#0F172A" />
                </Pressable>
                
                <View style={s.iconWrap}>
                    <LinearGradient colors={['#A855F7', '#6366F1']} style={s.iconGradient}>
                        <Sparkles size={40} color="#FFF" strokeWidth={2.5} />
                    </LinearGradient>
                </View>
                <Text style={s.title}>Upgrade your care.</Text>
                <Text style={s.subtitle}>Join thousands of members taking control of their long-term health.</Text>
            </LinearGradient>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
                
                {/* Benefits List */}
                <View style={s.benefitsBlock}>
                    {BENEFITS.map((b, i) => (
                        <View key={i} style={s.benefitRow}>
                            <View style={[s.benefitIconBox, { backgroundColor: b.color + '15' }]}>
                                <b.icon size={18} color={b.color} strokeWidth={2.5} />
                            </View>
                            <Text style={s.benefitText}>{b.title}</Text>
                        </View>
                    ))}
                </View>

                {/* Pricing Toggle Cards */}
                <Text style={s.sectionLabel}>Choose your plan</Text>
                <View style={s.plansGrid}>
                    {PLANS.map(plan => {
                        const isSelected = selectedPlanId === plan.id;
                        return (
                            <Pressable 
                                key={plan.id}
                                onPress={() => setSelectedPlanId(plan.id)}
                                style={[s.planCard, isSelected && s.planCardActive, { borderColor: isSelected ? plan.color : '#E2E8F0' }]}
                            >
                                {plan.badge && (
                                    <View style={s.badge}>
                                        <Text style={s.badgeText}>{plan.badge}</Text>
                                    </View>
                                )}
                                <Text style={[s.planName, isSelected && { color: plan.color }]}>{plan.name}</Text>
                                <Text style={[s.planPrice, isSelected && { color: plan.color }]}>{plan.price}</Text>
                                <Text style={s.planSub}>{plan.subtitle}</Text>

                                <View style={[s.radio, isSelected && { borderColor: plan.color }]}>
                                    {isSelected && <View style={[s.radioFill, { backgroundColor: plan.color }]} />}
                                </View>
                            </Pressable>
                        );
                    })}
                </View>

                {/* Trust Footer */}
                <View style={s.trustFooter}>
                    <ShieldCheck size={16} color="#94A3B8" />
                    <Text style={s.trustText}>Cancel anytime. No hidden fees.</Text>
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={s.bottomBar}>
                <Pressable onPress={() => setShowCheckout(true)}>
                    <LinearGradient colors={selectedPlan.gradient} style={s.ctaBtn}>
                        <Text style={s.ctaText}>Continue with {selectedPlan.name.split(' ')[0]}</Text>
                    </LinearGradient>
                </Pressable>
            </View>

            <CheckoutBottomSheet 
                visible={showCheckout} 
                onClose={() => setShowCheckout(false)} 
                plan={selectedPlan}
                onSuccess={handleSuccess}
                isRenewal={isRenewal}
            />
        </View>
        </TabScreenTransition>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    
    headerGraphic: { paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' },
    backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 34, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    iconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF', padding: 6, shadowColor: '#A855F7', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, marginBottom: 24, marginTop: 10 },
    iconGradient: { flex: 1, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 32, fontWeight: '900', color: '#0F172A', textAlign: 'center', letterSpacing: -1, marginBottom: 12 },
    subtitle: { fontSize: 16, color: '#475569', textAlign: 'center', lineHeight: 24, paddingHorizontal: 16 },

    scrollContent: { paddingHorizontal: 24, paddingBottom: 100 },
    
    benefitsBlock: { marginVertical: 32, gap: 20 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    benefitIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    benefitText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#334155' },

    sectionLabel: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', color: '#94A3B8', letterSpacing: 1, marginBottom: 16, marginTop: 10 },
    plansGrid: { gap: 16 },
    planCard: { position: 'relative', borderWidth: 2, borderRadius: 20, padding: 20, backgroundColor: '#F8FAFC' },
    planCardActive: { backgroundColor: '#FAF5FF', shadowColor: '#A855F7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
    badge: { position: 'absolute', top: -12, right: 20, backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    badgeText: { color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
    planName: { fontSize: 15, fontWeight: '700', color: '#64748B', marginBottom: 4 },
    planPrice: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 2 },
    planSub: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
    
    radio: { position: 'absolute', right: 20, top: '50%', marginTop: -12, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
    radioFill: { width: 12, height: 12, borderRadius: 6 },

    trustFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32 },
    trustText: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: Platform.OS === 'ios' ? 32 : 24, borderTopWidth: 1, borderTopColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.03, shadowRadius: 20, elevation: 20 },
    ctaBtn: { paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    ctaText: { color: '#FFF', fontSize: 17, fontWeight: '800' },

    // RENEWAL STYLING
    containerRenewal: { flex: 1, backgroundColor: '#F8FAFC' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: 16 },
    circleBackBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    notNowText: { color: '#7C3AED', fontWeight: '600', fontSize: 15, paddingHorizontal: 8, paddingVertical: 4 },
    scrollContentRenewal: { paddingHorizontal: 24, paddingBottom: 40 },
    
    heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 8 },
    heroLeft: { flex: 1, paddingRight: 16 },
    heroTitle: { fontSize: 26, fontWeight: '800', color: '#1E1B4B', lineHeight: 32, marginBottom: 8, letterSpacing: -0.5 },
    heroSub: { fontSize: 14, color: '#475569', lineHeight: 20 },
    heroRight: { width: 80, alignItems: 'flex-end' },
    
    shieldWrapper: { width: 68, height: 68, position: 'relative' },
    shieldBackground: { width: 68, height: 68, borderRadius: 18, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' },
    sparkleOverShield: { position: 'absolute', top: 16, left: 16 },
    crownOverlayBadge: { position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FBBF24', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

    bentoCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.02, shadowRadius: 12, elevation: 2, marginBottom: 16, alignItems: 'center' },
    bentoCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    bentoIconWrapper: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' },
    bentoIconWrapperGreen: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
    bentoTextWrap: { flex: 1 },
    bentoLabel: { fontSize: 11, color: '#64748B', fontWeight: '500', marginBottom: 2 },
    bentoValue: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
    bentoDivider: { width: 1, height: 32, backgroundColor: '#F1F5F9', marginHorizontal: 12 },

    urgencyBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', alignSelf: 'flex-start', marginBottom: 28, shadowColor: '#0F172A', shadowOpacity: 0.01, shadowRadius: 4, elevation: 1 },
    urgencyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    urgencyText: { fontSize: 12, fontWeight: '700' },

    sectionHeader: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
    benefitsBlockRenewal: { gap: 12, marginBottom: 28 },
    benefitRowRenewal: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 14, borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9' },
    benefitIconBoxRenewal: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    benefitContentRenewal: { flex: 1 },
    benefitTitleRenewal: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 2 },
    benefitSubRenewal: { fontSize: 12, color: '#64748B' },

    infoPlanCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAF5FF', borderWidth: 2, borderColor: '#C084FC', borderRadius: 20, padding: 20, marginBottom: 28 },
    infoPlanLeft: { flex: 1 },
    infoPlanTitle: { fontSize: 15, fontWeight: '700', color: '#7E22CE', marginBottom: 4 },
    infoPlanPrice: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 2 },
    infoPlanSub: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    infoPlanRight: { alignItems: 'flex-end' },
    saveBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 4 },
    saveBadgeText: { color: '#15803D', fontSize: 10, fontWeight: '800' },
    saveCrossPrice: { fontSize: 14, color: '#94A3B8', textDecorationLine: 'line-through' },

    actionsContainer: { gap: 12, marginBottom: 28 },
    continueBtn: { borderRadius: 16, overflow: 'hidden' },
    continueGradient: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    continueText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    continueSubText: { color: '#E9D5FF', fontSize: 12, marginTop: 2 },
    exploreBtn: { borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    exploreBtnText: { color: '#475569', fontSize: 15, fontWeight: '700' },

    footerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16, paddingBottom: 16 },
    footerLeft: { flexDirection: 'row', alignItems: 'center' },
    footerLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginLeft: 6 },
    footerRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    manageSubscriptionText: { fontSize: 13, color: '#7C3AED', fontWeight: '700' },

    // ACTIVE / EXPIRED BASE STATE
    containerActive: { flex: 1, backgroundColor: '#F8FAFC' },
    scrollContentActive: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
    activeHero: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
    activeShield: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4 },
    activeTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
    activeSub: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
    
    activeCard: { backgroundColor: '#FFFFFF', width: '100%', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#0F172A', shadowOpacity: 0.02, shadowRadius: 12, elevation: 2, marginBottom: 32 },
    activeCardLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    activeCardValue: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
    activeCardExpiry: { fontSize: 14, color: '#64748B', fontWeight: '500' },

    activeBackBtn: { width: '100%', backgroundColor: '#F1F5F9', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    activeBackText: { color: '#475569', fontSize: 16, fontWeight: '700' },

    renewBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 24 },
    renewGradient: { paddingVertical: 18, alignItems: 'center' },
    renewBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }
});
