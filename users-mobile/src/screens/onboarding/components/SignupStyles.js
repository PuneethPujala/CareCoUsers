import { StyleSheet, Platform } from 'react-native';

export const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 40 },

    hero: {
        height: 300,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 60,
        overflow: 'hidden',
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 40,
    },
    orb1: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.1)', top: -100, left: -50 },
    orb2: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -60, right: -40 },
    orb3: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', top: 40, right: 20 },
    orb4: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.06)', bottom: 20, left: 30 },

    heroContent: { alignItems: 'center', zIndex: 10 },
    iconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    heroLabel: { fontSize: 13, ...FONT.bold, color: 'rgba(255,255,255,0.7)', letterSpacing: 5, marginBottom: 8 },
    heroTitle: { fontSize: 24, ...FONT.heavy, color: '#FFFFFF', textAlign: 'center', paddingHorizontal: 20 },

    modernProgressContainer: {
        flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
        marginTop: 20, paddingHorizontal: 8,
        alignSelf: 'stretch',
    },
    stepDotWrap: { alignItems: 'center', width: 54 },
    stepLabelContainer: { height: 16, justifyContent: 'center', marginTop: 4 },
    stepDot: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
        alignItems: 'center', justifyContent: 'center',
    },
    stepDotDone: { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#FFFFFF' },
    stepDotActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, elevation: 5 },
    stepDotLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.8)' },
    stepNameLabel: { fontSize: 9, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.1, textAlign: 'center' },
    stepConnector: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: -8, marginTop: 14, minWidth: 4, zIndex: -1 },
    stepConnectorDone: { backgroundColor: '#FFFFFF' },

    formCard: {
        marginTop: -30,
        marginHorizontal: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 32,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1, shadowRadius: 20,
        elevation: 10,
    },

    fieldGroup: { marginBottom: 18 },
    label: { fontSize: 13, ...FONT.bold, color: '#475569', marginBottom: 8, marginLeft: 4, letterSpacing: 0.3 },
    inlineIconBox: {
        width: 36, height: 36, borderRadius: 12,
        backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    inputWrapEnhanced: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1.5, borderColor: '#E2E8F0',
        borderRadius: 20, height: 58,
        paddingHorizontal: 14,
    },
    inputFocusedEnhanced: {
        borderColor: '#6366F1',
        backgroundColor: '#FFFFFF',
        shadowColor: '#6366F1', shadowOpacity: 0.1, shadowRadius: 10,
    },
    inputErrorEnhanced: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
    textInputEnhanced: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 14 : undefined, height: '100%', fontSize: 16, color: '#0F172A', ...FONT.semibold, includeFontPadding: false },
    textPrefixStyle: { fontSize: 16, color: '#0F172A', ...FONT.bold, marginRight: 8, paddingVertical: Platform.OS === 'ios' ? 14 : undefined },
    rightIconWrap: { marginLeft: 10 },
    errorTextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 4 },
    fieldErrorEnhanced: { color: '#EF4444', fontSize: 12, ...FONT.medium },

    primaryBtnEnhanced: {
        height: 60, borderRadius: 24, marginTop: 20,
        overflow: 'hidden',
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25, shadowRadius: 15, elevation: 8,
    },
    primaryBtnGradientEnhanced: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 17, ...FONT.bold },

    secondaryBtnEnhanced: {
        height: 58, borderRadius: 20, backgroundColor: '#F1F5F9',
        alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    secondaryBtnTextEnhanced: { color: '#475569', fontSize: 16, ...FONT.bold },

    googleBtnEnhanced: {
        flexDirection: 'row', height: 58, borderRadius: 20, backgroundColor: '#FFFFFF',
        borderWidth: 1.5, borderColor: '#E2E8F0',
        alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20,
    },
    googleIconWrap: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#EB4335', alignItems: 'center', justifyContent: 'center' },
    googleTextG: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    googleBtnText: { fontSize: 15, ...FONT.bold, color: '#1E293B' },

    dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
    dividerText: { marginHorizontal: 16, fontSize: 12, color: '#94A3B8', ...FONT.heavy },

    loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    loginText: { fontSize: 14, color: '#64748B', ...FONT.regular },
    loginAction: { fontSize: 14, ...FONT.heavy, color: '#6366F1' },

    verifyFieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    verifyBtnSmall: {
        height: 58,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 21,
    },
    verifiedBtn: { backgroundColor: '#22C55E' },
    verifyBtnText: { fontSize: 13, ...FONT.bold, color: '#6366F1' },

    strengthWrap: { marginTop: 10, paddingHorizontal: 4 },
    strengthBarRow: { flexDirection: 'row', gap: 4, height: 4, marginBottom: 6 },
    strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
    strengthLabel: { fontSize: 12, ...FONT.bold },

    reqWrap: { marginTop: 12, paddingHorizontal: 8, gap: 4 },
    reqItem: { fontSize: 13, ...FONT.medium },

    locationHeader: { alignItems: 'center', marginBottom: 24 },
    locationIconBox: { width: 64, height: 64, borderRadius: 24, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    locationTitle: { fontSize: 18, ...FONT.bold, color: '#1E293B' },
    locationSub: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },

    detectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingVertical: 14, borderRadius: 16,
        backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#6366F1',
    },
    detectText: { fontSize: 15, ...FONT.bold, color: '#6366F1' },
    locationDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 24 },
    citySelectorBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, height: 58, borderRadius: 16,
        backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
    },
    citySelectorText: { fontSize: 15, ...FONT.semibold, color: '#0F172A' },
    cityPlaceholder: { color: '#94A3B8' },

    planGrid: { gap: 12 },
    planCard: {
        flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20,
        borderRadius: 24, backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#F1F5F9',
    },
    planCardActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF', shadowColor: '#6366F1', shadowOpacity: 0.08, shadowRadius: 10 },
    planIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    planTitle: { fontSize: 16, ...FONT.bold, color: '#1E293B' },
    planPrice: { fontSize: 14, ...FONT.medium, color: '#64748B', marginTop: 2 },
    checkCircle: { marginLeft: 'auto' },

    paymentAlert: {
        flexDirection: 'row', backgroundColor: '#FEF9C3', borderRadius: 16, padding: 14, gap: 10, marginTop: 20,
    },
    paymentAlertText: { fontSize: 13, color: '#854D0E', flex: 1, ...FONT.medium },

    finalState: { alignItems: 'center', paddingBottom: 20 },
    successOrb: {
        width: 140, height: 140, borderRadius: 70, backgroundColor: '#F0F3FF',
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    finalTitle: { fontSize: 26, ...FONT.heavy, color: '#1E293B', textAlign: 'center' },
    finalSub: { fontSize: 15, color: '#475569', textAlign: 'center', marginTop: 12, paddingHorizontal: 20, lineHeight: 22 },
    finalCard: {
        width: '100%', backgroundColor: '#F8FAFC', borderRadius: 24, padding: 24, marginTop: 32, marginBottom: 20,
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    finalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    finalCardText: { fontSize: 15, ...FONT.semibold, color: '#334155' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, maxHeight: '92%', marginTop: 60 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, ...FONT.heavy, color: '#1E293B' },
    modalSub: { fontSize: 13, color: '#94A3B8', ...FONT.medium, marginTop: 2 },

    otpSubtext: { fontSize: 14, color: '#64748B', lineHeight: 20 },
    resendRow: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
    timerText: { fontSize: 13, ...FONT.bold, color: '#94A3B8' },
    resendAction: { fontSize: 14, ...FONT.heavy, color: '#6366F1' },
    attemptsText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 12 },

    paymentSummary: { backgroundColor: '#F1F5F9', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 24 },
    payPlanName: { fontSize: 14, ...FONT.bold, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
    payAmount: { fontSize: 32, ...FONT.heavy, color: '#1E293B', marginTop: 4 },
    paySubtext: { fontSize: 13, ...FONT.bold, color: '#94A3B8', marginBottom: 16, marginLeft: 4 },
    upiRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 16, marginBottom: 10 },
    upiIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    upiAppName: { flex: 1, fontSize: 16, ...FONT.bold, color: '#1E293B' },
    upiAction: { fontSize: 14, ...FONT.bold, color: '#6366F1' },
    payDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 20 },
    payManualBtn: {
        flexDirection: 'row', height: 58, borderRadius: 24, backgroundColor: '#1E293B',
        alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    payManualText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },

    cityList: { maxHeight: 300, marginTop: 10 },
    cityItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    cityItemText: { fontSize: 16, ...FONT.medium, color: '#1E293B' },
    cityOption: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
    },
    cityOptionActive: { backgroundColor: '#F8FAFF' },
    cityIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    cityName: { fontSize: 16, ...FONT.semibold, color: '#1E293B' },
    cityState: { fontSize: 13, ...FONT.medium, color: '#94A3B8', marginTop: 2 },
    radioOutline: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
    radioActive: { borderColor: '#3B5BDB' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B5BDB' },

    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#F8FAFC', borderRadius: 16,
        paddingHorizontal: 16, height: 48,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    searchInput: { flex: 1, fontSize: 15, color: '#0F172A', ...FONT.medium, paddingVertical: 0 },

    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyTitle: { fontSize: 16, ...FONT.bold, color: '#64748B', marginTop: 12 },
    emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, lineHeight: 18 },

    closeBtnBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

    footer: { padding: 32, alignItems: 'center' },
    footerText: { fontSize: 14, color: '#64748B', ...FONT.regular },
    footerAction: { fontSize: 14, ...FONT.heavy, color: '#6366F1' },
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
    planPriceEnhanced: { fontSize: 24, ...FONT.heavy, color: '#6366F1', marginTop: 2 },
    planPriceSub: { fontSize: 14, ...FONT.bold, color: '#94A3B8' },
    selectedCheck: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
    planFeaturesEnhanced: { gap: 12, marginBottom: 24 },
    featureLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureTextEnhanced: { fontSize: 14, ...FONT.semibold, color: '#475569' },

    planActionBtn: { height: 54, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnActive: { backgroundColor: '#6366F1' },
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
    locationPrimaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        height: 60, borderRadius: 24, backgroundColor: '#6366F1',
        width: '100%', gap: 12, marginTop: 24,
        shadowColor: '#6366F1', shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
    },
    locationPrimaryBtnText: { color: '#FFFFFF', fontSize: 16, ...FONT.bold },
    locationSecondaryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 16, marginTop: 8,
    },
    locationSecondaryBtnText: { fontSize: 15, ...FONT.bold, color: '#6366F1' },
    locationSuccessToast: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#F0FDF4', padding: 16, borderRadius: 20,
        marginTop: 24, width: '100%', borderWidth: 1, borderColor: '#DCFCE7',
    },
    locationSuccessText: { fontSize: 14, color: '#15803D', ...FONT.semibold, flex: 1 },
    locationErrorText: { fontSize: 14, color: '#EF4444', ...FONT.medium, marginTop: 12, textAlign: 'center' },

    centerStepEnhanced: { alignItems: 'center', width: '100%' },

    processingContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 300,
    },
    processingTitle: { fontSize: 22, ...FONT.heavy, color: '#1E293B', marginTop: 32, textAlign: 'center' },
    processingSub: { fontSize: 15, color: '#64748B', textAlign: 'center', marginTop: 12, paddingHorizontal: 30, lineHeight: 22 },
    processingProgress: { marginTop: 40, padding: 8, borderRadius: 24, backgroundColor: '#F8FAFC' },

    genderBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
    genderBtnActive: { backgroundColor: '#EFF3FF', borderColor: '#3B5BDB' },
    genderBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#64748B' },
});
