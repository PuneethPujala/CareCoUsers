import { StyleSheet, Platform } from 'react-native';

export const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' }, // Form area is white
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 40 },

    hero: {
        height: 280,
        backgroundColor: '#5c55e9', // Solid vibrant purple from mockup
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 70,
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 40,
        zIndex: 1,
    },
    heroContent: { alignItems: 'center', zIndex: 10 },
    heroLogoContainer: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
    },
    heroLabel: { fontSize: 13, ...FONT.bold, color: '#FFFFFF', letterSpacing: 4, opacity: 0.9, marginBottom: 12 },
    heroTitle: { fontSize: 26, ...FONT.heavy, color: '#FFFFFF', textAlign: 'center', paddingHorizontal: 20 },
    heroSubtitle: { fontSize: 15, color: '#FFFFFF', textAlign: 'center', marginTop: 8, opacity: 0.8 },

    modernProgressContainer: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderRadius: 32,
        paddingHorizontal: 24, paddingVertical: 18,
        marginHorizontal: 16,
        marginTop: -30,
        zIndex: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05, shadowRadius: 15, elevation: 5,
    },
    stepDotWrap: { alignItems: 'center', width: 48 },
    stepLabelContainer: { height: 16, justifyContent: 'center', marginTop: 6 },
    stepDot: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: '#CBD5E1',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 2,
    },
    stepDotDone: { backgroundColor: '#5c55e9', borderColor: '#5c55e9' },
    stepDotActive: { backgroundColor: '#5c55e9', borderColor: '#5c55e9', shadowColor: '#5c55e9', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
    stepDotLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#94A3B8' },
    stepNameLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#94A3B8', letterSpacing: 0.1, textAlign: 'center' },
    stepConnector: { position: 'absolute', top: 32, left: 24, right: 24, height: 2, backgroundColor: '#E2E8F0', zIndex: 1 },
    stepConnectorDone: { backgroundColor: '#5c55e9' },

    formCard: {
        marginTop: 24,
        marginHorizontal: 24,
        backgroundColor: 'transparent',
    },

    stepHeaderContainer: { marginBottom: 24 },
    stepTitle: { fontSize: 22, ...FONT.heavy, color: '#1E293B', marginBottom: 6 },
    stepSubtitle: { fontSize: 14, ...FONT.medium, color: '#64748B', lineHeight: 20 },

    fieldGroup: { marginBottom: 18 },
    label: { fontSize: 13, ...FONT.bold, color: '#1E293B', marginBottom: 8, marginLeft: 4 },
    inlineIconBox: { width: 32, alignItems: 'center', justifyContent: 'center', paddingLeft: 6 },
    inputWrapEnhanced: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: '#E2E8F0',
        borderRadius: 16, height: 56,
        paddingHorizontal: 12,
    },
    inputFocusedEnhanced: { borderColor: '#5c55e9', backgroundColor: '#FFFFFF' },
    inputErrorEnhanced: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
    textInputEnhanced: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 14 : undefined, height: '100%', fontSize: 16, color: '#0F172A', ...FONT.medium, includeFontPadding: false },
    textPrefixStyle: { fontSize: 16, color: '#0F172A', ...FONT.medium, marginRight: 8, paddingVertical: Platform.OS === 'ios' ? 14 : undefined },
    rightIconWrap: { marginLeft: 10 },
    errorTextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 4 },
    fieldErrorEnhanced: { color: '#EF4444', fontSize: 12, ...FONT.medium },

    primaryBtnEnhanced: {
        height: 56, borderRadius: 16, marginTop: 10,
        backgroundColor: '#5c55e9',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    primaryBtnGradientEnhanced: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },
    primaryBtnIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

    secondaryBtnEnhanced: {
        height: 56, borderRadius: 16, backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: '#5A51EA',
        alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    secondaryBtnTextEnhanced: { color: '#5A51EA', fontSize: 16, ...FONT.bold },

    googleBtnEnhanced: {
        flexDirection: 'row', height: 56, borderRadius: 16, backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: '#E2E8F0',
        alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24,
    },
    googleIconWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    googleTextG: { color: '#EB4335', fontSize: 18, fontWeight: 'bold' },
    googleBtnText: { fontSize: 16, ...FONT.bold, color: '#1E293B' },

    dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
    dividerText: { marginHorizontal: 16, fontSize: 12, color: '#94A3B8', ...FONT.semibold, letterSpacing: 0.5 },

    loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    loginText: { fontSize: 14, color: '#64748B', ...FONT.medium },
    loginAction: { fontSize: 14, ...FONT.bold, color: '#5A51EA' },

    verifyFieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    verifyBtnSmall: {
        height: 56, paddingHorizontal: 16, borderRadius: 16, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginTop: 21,
    },
    verifiedBtn: { backgroundColor: '#22C55E' },
    verifyBtnText: { fontSize: 13, ...FONT.bold, color: '#5c55e9' },

    strengthWrap: { marginTop: 10, paddingHorizontal: 4 },
    strengthBarRow: { flexDirection: 'row', gap: 4, height: 4, marginBottom: 6 },
    strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
    strengthLabel: { fontSize: 12, ...FONT.bold },

    reqWrap: { marginTop: 12, paddingHorizontal: 8, gap: 4 },
    reqItem: { fontSize: 13, ...FONT.medium },

    locationHeader: { alignItems: 'center', marginBottom: 24 },
    locationIconBox: { width: 64, height: 64, borderRadius: 24, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    locationTitle: { fontSize: 24, ...FONT.heavy, color: '#1E293B', textAlign: 'center' },
    locationSub: { fontSize: 15, color: '#64748B', textAlign: 'center', marginTop: 8, paddingHorizontal: 20, lineHeight: 22 },

    detectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 16, backgroundColor: '#5c55e9', width: '100%',
    },
    detectText: { fontSize: 16, ...FONT.bold, color: '#FFFFFF' },
    citySelectorBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 16, marginTop: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0', width: '100%'
    },
    citySelectorText: { fontSize: 16, ...FONT.bold, color: '#1E293B' },
    locationDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 24 },
    cityPlaceholder: { color: '#94A3B8' },

    planGrid: { gap: 12 },
    planCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 24, backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#F1F5F9' },
    planCardActive: { borderColor: '#5c55e9', backgroundColor: '#EEF2FF', shadowColor: '#5c55e9', shadowOpacity: 0.08, shadowRadius: 10 },
    planIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    planTitle: { fontSize: 16, ...FONT.bold, color: '#1E293B' },
    planPrice: { fontSize: 14, ...FONT.medium, color: '#64748B', marginTop: 2 },
    checkCircle: { marginLeft: 'auto' },

    paymentAlert: { flexDirection: 'row', backgroundColor: '#FEF9C3', borderRadius: 16, padding: 14, gap: 10, marginTop: 20 },
    paymentAlertText: { fontSize: 13, color: '#854D0E', flex: 1, ...FONT.medium },

    finalState: { alignItems: 'center', paddingBottom: 20, paddingTop: 10 },
    successOrb: {
        width: 160, height: 160, borderRadius: 80, backgroundColor: '#F8F9FE',
        alignItems: 'center', justifyContent: 'center', marginBottom: 32,
    },
    finalTitle: { fontSize: 28, ...FONT.heavy, color: '#1E293B', textAlign: 'center' },
    finalSub: { fontSize: 16, color: '#64748B', textAlign: 'center', marginTop: 12, paddingHorizontal: 20, lineHeight: 24 },
    finalCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginTop: 32, marginBottom: 32, gap: 16 },
    finalRow: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16 },
    finalIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    finalCardTitle: { fontSize: 16, ...FONT.bold, color: '#1E293B' },
    finalCardText: { fontSize: 13, ...FONT.medium, color: '#64748B', marginTop: 2, lineHeight: 18 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, maxHeight: '92%', marginTop: 60 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, ...FONT.heavy, color: '#1E293B' },
    modalSub: { fontSize: 13, color: '#94A3B8', ...FONT.medium, marginTop: 2 },

    otpSubtext: { fontSize: 14, color: '#64748B', lineHeight: 20 },
    resendRow: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
    timerText: { fontSize: 13, ...FONT.bold, color: '#94A3B8' },
    resendAction: { fontSize: 14, ...FONT.heavy, color: '#5c55e9' },
    attemptsText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 12 },

    paymentSummary: { backgroundColor: '#F1F5F9', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 24 },
    payPlanName: { fontSize: 14, ...FONT.bold, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
    payAmount: { fontSize: 32, ...FONT.heavy, color: '#1E293B', marginTop: 4 },
    paySubtext: { fontSize: 13, ...FONT.bold, color: '#94A3B8', marginBottom: 16, marginLeft: 4 },
    upiRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 16, marginBottom: 10 },
    upiIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    upiAppName: { flex: 1, fontSize: 16, ...FONT.bold, color: '#1E293B' },
    upiAction: { fontSize: 14, ...FONT.bold, color: '#5c55e9' },
    payDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 20 },
    payManualBtn: { flexDirection: 'row', height: 58, borderRadius: 24, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', gap: 12 },
    payManualText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },

    cityList: { maxHeight: 300, marginTop: 10 },
    cityItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    cityItemText: { fontSize: 16, ...FONT.medium, color: '#1E293B' },
    cityOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
    cityOptionActive: { backgroundColor: '#F8FAFF' },
    cityIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    cityName: { fontSize: 16, ...FONT.semibold, color: '#1E293B' },
    cityState: { fontSize: 13, ...FONT.medium, color: '#94A3B8', marginTop: 2 },
    radioOutline: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
    radioActive: { borderColor: '#3B5BDB' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B5BDB' },

    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 16, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: '#E2E8F0' },
    searchInput: { flex: 1, fontSize: 15, color: '#0F172A', ...FONT.medium, paddingVertical: 0 },

    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyTitle: { fontSize: 16, ...FONT.bold, color: '#64748B', marginTop: 12 },
    emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, lineHeight: 18 },

    closeBtnBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

    footer: { padding: 32, alignItems: 'center' },
    footerText: { fontSize: 14, color: '#64748B', ...FONT.regular },
    footerAction: { fontSize: 14, ...FONT.heavy, color: '#5c55e9' },
    madeWith: { fontSize: 12, ...FONT.bold, color: '#CBD5E1', marginTop: 24 },

    planCardGhost: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 24, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', marginBottom: 12 },
    ghostIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    planTitleGhost: { fontSize: 16, ...FONT.bold, color: '#64748B' },
    planDesc: { fontSize: 13, ...FONT.medium, color: '#94A3B8' },

    planCardEnhanced: { borderRadius: 32, marginBottom: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#F1F5F9' },
    planCardGradient: { padding: 24 },
    planCardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    planIconBoxEnhanced: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    planPriceCol: { flex: 1 },
    planTitleEnhanced: { fontSize: 18, ...FONT.heavy, color: '#1E293B' },
    planPriceEnhanced: { fontSize: 24, ...FONT.heavy, color: '#5c55e9', marginTop: 2 },
    planPriceSub: { fontSize: 14, ...FONT.bold, color: '#94A3B8' },
    selectedCheck: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#5c55e9', alignItems: 'center', justifyContent: 'center' },
    planFeaturesEnhanced: { gap: 12, marginBottom: 24 },
    featureLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureTextEnhanced: { fontSize: 14, ...FONT.semibold, color: '#475569' },

    planActionBtn: { height: 54, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnActive: { backgroundColor: '#5c55e9' },
    btnInactive: { backgroundColor: '#F1F5F9' },
    txtActive: { color: '#FFFFFF', fontSize: 15, ...FONT.bold },
    txtInactive: { color: '#64748B', fontSize: 15, ...FONT.bold },
    planActionBtnText: { fontSize: 15, ...FONT.bold },

    premiumBadge: { position: 'absolute', top: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, zIndex: 10 },
    premiumBadgeText: { fontSize: 10, ...FONT.heavy, color: '#FFFFFF' },

    successCelebrationCard: { width: '100%', borderRadius: 32, padding: 32, alignItems: 'center', marginBottom: 20 },
    largeSuccessCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    successTitle: { fontSize: 24, ...FONT.heavy, color: '#166534', textAlign: 'center' },
    successSubtitle: { fontSize: 16, ...FONT.medium, color: '#15803D', textAlign: 'center', marginTop: 8 },

    nextStepsCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, borderWidth: 1, borderColor: '#F1F5F9' },
    nextStepsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    nextStepsTitle: { fontSize: 14, ...FONT.heavy, color: '#3B5BDB', letterSpacing: 1 },
    nextStepsDesc: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 20 },
    journeyList: { gap: 16 },
    journeyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    journeyIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EFF3FF', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    journeyText: { flex: 1, fontSize: 14, ...FONT.semibold, color: '#334155', lineHeight: 20 },

    errorBoxEnhanced: { flexDirection: 'row', gap: 12, backgroundColor: '#FFFBEB', padding: 16, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#FEF3C7' },
    errorMsgEnhanced: { fontSize: 14, ...FONT.medium, flex: 1, lineHeight: 20 },

    locationTitlePremium: { fontSize: 24, ...FONT.heavy, color: '#1E293B', textAlign: 'center' },
    locationSubtitlePremium: { fontSize: 15, color: '#475569', textAlign: 'center', marginTop: 12, paddingHorizontal: 30, lineHeight: 22 },
    locationPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 60, borderRadius: 24, backgroundColor: '#5c55e9', width: '100%', gap: 12, marginTop: 24, shadowColor: '#5c55e9', shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
    locationPrimaryBtnText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },
    locationSecondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, marginTop: 8 },
    locationSecondaryBtnText: { fontSize: 15, ...FONT.bold, color: '#5c55e9' },
    locationSuccessToast: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0FDF4', padding: 16, borderRadius: 20, marginTop: 24, width: '100%', borderWidth: 1, borderColor: '#DCFCE7' },
    locationSuccessText: { fontSize: 14, color: '#15803D', ...FONT.semibold, flex: 1 },
    locationErrorText: { fontSize: 14, color: '#EF4444', ...FONT.medium, marginTop: 12, textAlign: 'center' },

    centerStepEnhanced: { alignItems: 'center', width: '100%' },

    processingContainer: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
    processingTitle: { fontSize: 22, ...FONT.heavy, color: '#1E293B', marginTop: 32, textAlign: 'center' },
    processingSub: { fontSize: 15, color: '#64748B', textAlign: 'center', marginTop: 12, paddingHorizontal: 30, lineHeight: 22 },
    processingProgress: { marginTop: 40, padding: 8, borderRadius: 24, backgroundColor: '#F8FAFC' },

    genderBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center' },
    genderBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#5A51EA' },
    genderBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#64748B' },
});
