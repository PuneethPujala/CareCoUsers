import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Check, Sparkles, Activity, ShieldCheck, Zap } from 'lucide-react-native';
import CheckoutBottomSheet from '../../components/premium/CheckoutBottomSheet';

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
    { icon: Activity, title: 'Catch risky health patterns earlier', color: '#EF4444' },
    { icon: Sparkles, title: 'Smarter personalized health guidance', color: '#A855F7' },
    { icon: Zap, title: 'Never lose medication history', color: '#F59E0B' },
];

export default function PremiumShowcaseScreen({ navigation, route }) {
    const isRenewal = route.params?.isRenewal || false;
    const [selectedPlanId, setSelectedPlanId] = useState('premium_annual');
    const [showCheckout, setShowCheckout] = useState(false);

    const selectedPlan = PLANS.find(p => p.id === selectedPlanId);

    const handleSuccess = () => {
        // Wait a little before replacing to prevent glitchy transitions
        setTimeout(() => {
            if (isRenewal) {
                // If they are an existing user renewing, go straight back to dashboard
                navigation.navigate('PatientTabs', { screen: 'PatientHome' });
            } else {
                // New user flow
                navigation.replace('WaitingRoom', { plan: selectedPlan });
            }
        }, 500);
    };

    return (
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
    ctaText: { color: '#FFF', fontSize: 17, fontWeight: '800' }
});
