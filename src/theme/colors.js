/**
 * CareConnect Design System
 * Blue-gradient foundation with role-specific accents
 */

export const Colors = {
    // ─── Primary Blue System ─────────────────────────
    primary: '#2563EB',
    primaryLight: '#3B82F6',
    primaryDark: '#1E40AF',
    primarySoft: '#60A5FA',
    accent: '#60A5FA',

    // ─── Surfaces ────────────────────────────────────
    white: '#FFFFFF',
    background: '#F8FAFC',
    backgroundBlue: '#EFF6FF',
    surface: '#FFFFFF',
    surfaceAlt: '#EFF6FF',
    surfaceElevated: '#FFFFFF',

    // ─── Text ────────────────────────────────────────
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    textOnPrimary: '#FFFFFF',
    textOnDark: '#F1F5F9',

    // ─── Borders ─────────────────────────────────────
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    divider: '#E2E8F0',
    borderFocus: '#2563EB',

    // ─── Semantic ────────────────────────────────────
    success: '#10B981',
    successLight: '#ECFDF5',
    warning: '#F59E0B',
    warningLight: '#FFFBEB',
    error: '#EF4444',
    errorLight: '#FEF2F2',
    info: '#3B82F6',
    infoLight: '#EFF6FF',

    // ─── Gradients ───────────────────────────────────
    gradient: ['#2563EB', '#3B82F6'],
    gradientFull: ['#1E40AF', '#2563EB', '#3B82F6'],
    gradientSoft: ['#3B82F6', '#60A5FA'],
    gradientDark: ['#1E3A8A', '#1E40AF'],

    // ─── Role Accent Gradients ───────────────────────
    roleGradient: {
        super_admin: ['#7C3AED', '#8B5CF6'],
        org_admin: ['#6D28D9', '#7C3AED'],
        care_manager: ['#059669', '#10B981'],
        caller: ['#2563EB', '#3B82F6'],
        mentor: ['#D97706', '#F59E0B'],
        patient: ['#0891B2', '#06B6D4'],
    },

    // ─── Role Accent Colors ─────────────────────────
    role: {
        super_admin: '#7C3AED',
        org_admin: '#6D28D9',
        care_manager: '#059669',
        caller: '#2563EB',
        mentor: '#D97706',
        patient: '#0891B2',
    },
};

// ─── Spacing (8px Grid) ─────────────────────────────
export const Spacing = {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
};

// ─── Typography ─────────────────────────────────────
export const Typography = {
    h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    h3: { fontSize: 18, fontWeight: '700' },
    body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
    bodyMedium: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
    bodySemibold: { fontSize: 15, fontWeight: '600' },
    caption: { fontSize: 13, fontWeight: '500' },
    captionBold: { fontSize: 13, fontWeight: '700' },
    tiny: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
    button: { fontSize: 16, fontWeight: '700' },
};

// ─── Border Radius ──────────────────────────────────
export const Radius = {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    full: 999,
};

// ─── Shadows ────────────────────────────────────────
export const Shadows = {
    sm: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 2,
    },
    md: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
        elevation: 4,
    },
    lg: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 8,
    },
    xl: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 28,
        elevation: 12,
    },
    card: {
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
};
