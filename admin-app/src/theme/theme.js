// admin-app/src/theme/theme.js

export const Theme = {
    colors: {
        background: {
            primary: '#F8FAFC',    // Slate 50 (Stunning clean light background)
            secondary: '#FFFFFF',  // White for cards
            card: '#FFFFFF',
            hover: '#F1F5F9',      // Slate 100
        },
        border: 'rgba(226, 232, 240, 0.8)', // Slate 200 border
        glass: 'rgba(255, 255, 255, 0.9)',  // Frosty white glass
        accents: {
            primary: ['#6366F1', '#4F46E5'], // Premium Indigo
            secondary: ['#9333EA', '#7C3AED'], // Vibrant Purple
            success: ['#10B981', '#059669'], // Emerald
            warning: ['#F59E0B', '#D97706'], // Amber
            danger: ['#EF4444', '#DC2626'],  // Red
            info: ['#3B82F6', '#2563EB'],    // Blue
        },
        text: {
            primary: '#0F172A',    // Slate 900 (Deep contrast)
            secondary: '#475569',  // Slate 600 (Soft contrast)
            tertiary: '#94A3B8',   // Slate 400 (Metadata/Icons)
            inverse: '#FFFFFF',    // White text on dark accents
        },
    },
    typography: {
        fontFamily: 'Inter',
        display: {
            fontSize: 48,
            fontWeight: '800',
            letterSpacing: -1.5,
        },
        h1: {
            fontSize: 28,
            fontWeight: '800',
            letterSpacing: -0.5,
        },
        h2: {
            fontSize: 18,
            fontWeight: '700',
            letterSpacing: -0.3,
        },
        body: {
            fontSize: 15,
            fontWeight: '600',
            letterSpacing: -0.2,
        },
        caption: {
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
        },
        common: {
            includeFontPadding: false,
            textAlignVertical: 'center',
        }
    },
    spacing: {
        section: 48,
        card: 24,
        element: 16,
        tight: 12,
        micro: 8,
    },
    shadows: {
        card: {
            shadowColor: '#64748B',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.1,
            shadowRadius: 20,
            elevation: 5,
        },
        sharp: {
            shadowColor: '#94A3B8',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 3,
        },
        glow: {
            shadowColor: '#6366F1',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 8,
        },
    },
    radius: {
        card: 16,
        button: 12,
        hero: 20,
        inner: 12,
    },
};
