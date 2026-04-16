import { StyleSheet } from 'react-native';
import { Colors, Shadows } from './colors';

export const Typography = StyleSheet.create({
    h1: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
    h2: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
    h3: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
    body: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
    bodySmall: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
    caption: { fontSize: 11, color: Colors.textMuted, letterSpacing: 0.5 },
    label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 0.5 },
    button: { fontSize: 16, fontWeight: '700', color: Colors.textOnPrimary },
});

export const SharedStyles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    screenWhite: {
        flex: 1,
        backgroundColor: Colors.white,
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 16,
        ...Shadows.sm,
    },
    cardLarge: {
        backgroundColor: Colors.white,
        borderRadius: 20,
        padding: 20,
        ...Shadows.md,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: Colors.border,
        gap: 10,
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: Colors.textPrimary,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.divider,
        marginVertical: 16,
    },
});
