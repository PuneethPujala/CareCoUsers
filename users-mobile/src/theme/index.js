/**
 * CareMyMed Users App — Theme
 * Design tokens for the CareMyMed Users App
 * (Mirrors shared/theme/tokens.js — kept in-app for Metro bundler compatibility)
 */

export const colors = {
    // ─── Core Brand ────────────────────────────
    primary: '#6366F1',
    primaryMid: '#4F46E5',
    accent: '#818CF8',

    // ─── Surfaces ──────────────────────────────
    background: '#F4F7FB',
    surface: '#FFFFFF',
    surfaceAlt: '#EDF2F7',

    // ─── Semantic ──────────────────────────────
    success: '#22C55E',
    successLight: '#DCFCE7',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    danger: '#EF4444',
    dangerLight: '#FEE2E2',

    // ─── Text ──────────────────────────────────
    textPrimary: '#1A202C',
    textSecondary: '#4A5568',
    textMuted: '#94A3B8',
    textOnPrimary: '#FFFFFF',
    textOnDark: '#F1F5F9',

    // ─── Borders ───────────────────────────────
    border: '#BDD4EE',
    borderLight: '#E2E8F0',
    divider: '#E2E8F0',

    // ─── Gradients ─────────────────────────────
    gradientPrimary: ['#4F46E5', '#6366F1'],
    gradientAccent: ['#6366F1', '#818CF8'],
    gradientSoft: ['#818CF8', '#C7D2FE'],

    // ─── Status Indicators ─────────────────────
    calledToday: '#22C55E',
    notCalled3Days: '#F59E0B',
    notCalled7Days: '#EF4444',

    // ─── Role Accents ──────────────────────────
    rolePatient: '#3A86FF',
    roleCaller: '#0A2463',
    roleManager: '#059669',
    roleOrgAdmin: '#6D28D9',
    roleSuperAdmin: '#7C3AED',
};

export const typography = {
    fontFamily: 'Inter',
    heading: { fontWeight: '700' },
    body: { fontWeight: '400' },
    label: { fontWeight: '600' },
    sizes: {
        display: 32,
        h1: 28,
        h2: 22,
        h3: 18,
        body: 15,
        caption: 13,
        tiny: 11,
        button: 16,
        label: 12,
    },
};

export const radius = {
    card: 12,
    button: 8,
    chip: 999,
    input: 10,
    sm: 6,
    md: 12,
    lg: 16,
    xl: 20,
    full: 999,
};

export const spacing = {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
    base: 8,
};

export const shadows = {
    sm: {
        shadowColor: '#0A2463',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 2,
    },
    md: {
        shadowColor: '#0A2463',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
        elevation: 4,
    },
    lg: {
        shadowColor: '#0A2463',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 8,
    },
    card: {
        shadowColor: '#4A5568',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
};

// App-specific helpers
export const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    ...shadows.card,
    padding: spacing.md,
};

export const headerGradient = [colors.primary, colors.primaryMid];

export default { colors, typography, radius, spacing, shadows };
