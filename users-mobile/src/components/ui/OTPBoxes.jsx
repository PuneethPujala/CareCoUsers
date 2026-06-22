import React, { useRef } from 'react';
import { View, TextInput, Pressable, StyleSheet, Text, Platform, useWindowDimensions } from 'react-native';

export default function OTPBoxes({
    value = '',
    onChange,
    onComplete,
    length = 6,
    editable = true,
    autoFocus = true,
    activeBorderColor = '#2563EB',
    activeBgColor = '#EFF6FF',
    boxWidth = 46,
    boxHeight = 56,
    borderRadius = 14,
    gap = 8,
    fontSize = 22,
    textColor = '#0F172A',
    fontFamily = 'Inter_700Bold',
}) {
    const inputRef = useRef(null);
    const { width: screenWidth } = useWindowDimensions();

    // Determine dynamic sizes to prevent container overflow on smaller screens
    let finalBoxWidth = boxWidth;
    let finalBoxHeight = boxHeight;
    let finalGap = gap;
    let finalFontSize = fontSize;

    // Safe margin considering modal container paddings (typically 16-24px on each side)
    const maxAllowedWidth = screenWidth - 64;
    const totalWidth = length * boxWidth + (length - 1) * gap;

    if (totalWidth > maxAllowedWidth) {
        const ratio = maxAllowedWidth / totalWidth;
        finalBoxWidth = Math.max(32, Math.floor(boxWidth * ratio));
        finalGap = Math.max(4, Math.floor(gap * ratio));
        finalBoxHeight = Math.max(40, Math.floor(boxHeight * ratio));
        finalFontSize = Math.max(16, Math.floor(fontSize * ratio));
    }

    const handlePress = () => {
        if (editable) {
            inputRef.current?.focus();
        }
    };

    const handleTextChange = (text) => {
        // Strip non-digits and limit length
        const cleaned = text.replace(/\D/g, '').slice(0, length);
        onChange(cleaned);
        if (cleaned.length === length) {
            onComplete?.(cleaned);
        }
    };

    return (
        <Pressable
            style={styles.container}
            onPress={handlePress}
            accessible={true}
            accessibilityLabel="Verification code input"
            accessibilityHint="Double tap to type or paste the code"
            accessibilityRole="adjustable"
            accessibilityValue={{
                text: value ? value.split('').join(' ') : 'Empty',
            }}
        >
            {/* 1. Hidden input handling OS Autofill, paste, and focus */}
            <TextInput
                ref={inputRef}
                style={styles.hiddenInput}
                value={value}
                onChangeText={handleTextChange}
                keyboardType="number-pad"
                maxLength={length}
                editable={editable}
                autoFocus={autoFocus}
                textContentType="oneTimeCode" // iOS Autofill
                autoComplete="sms-otp"         // Android Autofill
                importantForAutofill="yes"
                caretHidden={true}
                selectTextOnFocus={false}
                selectionColor="transparent"
            />

            {/* 2. Visual layout cards */}
            <View style={[styles.row, { gap: finalGap }]}>
                {Array.from({ length }).map((_, i) => {
                    const char = value[i] || '';
                    
                    // Box is considered focused if the current string length points to it.
                    // If length is filled, the last box remains active.
                    const isCurrentFocus = value.length === i || (value.length === length && i === length - 1);
                    const hasChar = !!char;

                    return (
                        <View
                            key={i}
                            importantForAccessibility="no"
                            style={[
                                styles.box,
                                {
                                    width: finalBoxWidth,
                                    height: finalBoxHeight,
                                    borderRadius,
                                    borderColor: isCurrentFocus && editable ? activeBorderColor : '#E2E8F0',
                                    backgroundColor: isCurrentFocus && editable ? activeBgColor : '#FFFFFF',
                                },
                                hasChar && styles.boxFilled,
                            ]}
                        >
                            <Text
                                style={{
                                    fontSize: finalFontSize,
                                    color: textColor,
                                    fontFamily,
                                }}
                            >
                                {char}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 20,
    },
    hiddenInput: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        opacity: 0.01,
        color: 'transparent',
        zIndex: 1,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    box: {
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.02,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
            },
            android: {
                elevation: 0,
            },
        }),
    },
    boxFilled: {
        // Subtle internal styles can go here
    },
});
