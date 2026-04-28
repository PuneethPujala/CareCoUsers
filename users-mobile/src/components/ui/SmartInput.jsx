/**
 * SmartInput — Premium stateful input component
 *
 * Features:
 * - Focus state   → indigo border + label highlight
 * - Filled state  → subtle green tint
 * - Error state   → red border + red background tint
 * - Micro-animation on focus/blur via Animated spring
 *
 * Variants: "default" (height: 48) | "compact" (height: 42) | "multiline"
 *
 * Usage:
 *   <SmartInput
 *     label="Heart Rate (bpm)"
 *     value={val}
 *     onChangeText={setVal}
 *     placeholder="72"
 *     keyboardType="numeric"
 *     error={touched && !val ? 'Required' : null}
 *     variant="default"
 *   />
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Animated, StyleSheet, Platform } from 'react-native';

const COLORS = {
  border: '#E2E8F0',
  borderFocus: '#6366F1',
  borderError: '#EF4444',
  bg: '#FAFBFF',
  bgFilled: '#F8FFF8',
  bgError: '#FFF5F5',
  label: '#64748B',
  labelFocus: '#6366F1',
  labelError: '#EF4444',
  text: '#0F172A',
  placeholder: '#94A3B8',
  errorText: '#DC2626',
};

export default function SmartInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  variant = 'default',     // 'default' | 'compact' | 'multiline'
  style,
  labelStyle,
  maxLength,
  autoCapitalize,
  returnKeyType,
  multiline,
  textAlignVertical,
  secureTextEntry,
  editable = true,
  leftAccessory,
  rightAccessory,
  ...rest
}) {
  const [isFocused, setIsFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const isFilled = value && value.length > 0;
  const hasError = !!error;
  const isMultiline = variant === 'multiline' || multiline;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(borderAnim, {
        toValue: isFocused ? 1 : 0,
        friction: 8,
        tension: 100,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1.005 : 1,
        friction: 10,
        tension: 120,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isFocused]);

  // Interpolated border color: default → focus → error
  const borderColor = hasError
    ? COLORS.borderError
    : borderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [COLORS.border, COLORS.borderFocus],
      });

  // Background color based on state
  const backgroundColor = hasError
    ? COLORS.bgError
    : isFilled && !isFocused
    ? COLORS.bgFilled
    : COLORS.bg;

  // Label color
  const labelColor = hasError
    ? COLORS.labelError
    : isFocused
    ? COLORS.labelFocus
    : COLORS.label;

  // Height based on variant
  const inputHeight = variant === 'compact' ? 42 : isMultiline ? 100 : 48;

  return (
    <View style={[styles.container, style]}>
      {label && (
        <Animated.Text
          style={[
            styles.label,
            { color: labelColor },
            isFocused && styles.labelFocused,
            labelStyle,
          ]}
        >
          {label}
        </Animated.Text>
      )}

      <Animated.View
        style={[
          styles.inputWrapper,
          {
            borderColor,
            backgroundColor,
            height: isMultiline ? undefined : inputHeight,
            minHeight: isMultiline ? inputHeight : undefined,
            transform: [{ scale: scaleAnim }],
          },
          hasError && styles.inputError,
        ]}
      >
        {leftAccessory}
        <TextInput
          style={[
            styles.input,
            isMultiline && styles.inputMultiline,
            !editable && styles.inputDisabled,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.placeholder}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType}
          multiline={isMultiline}
          textAlignVertical={isMultiline ? 'top' : textAlignVertical}
          secureTextEntry={secureTextEntry}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...rest}
        />
        {rightAccessory}
      </Animated.View>

      {hasError && typeof error === 'string' && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  labelFocused: {
    fontWeight: '900',
  },
  inputWrapper: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 0 : 0,
  },
  inputMultiline: {
    paddingTop: 14,
    paddingBottom: 14,
    flex: 1,
    textAlignVertical: 'top',
  },
  inputDisabled: {
    color: '#94A3B8',
  },
  inputError: {
    borderWidth: 2,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
    marginTop: 4,
    marginLeft: 4,
  },
});
