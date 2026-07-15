/**
 * CustomAlert — Premium CareMyMed alert modal
 *
 * A beautiful, animated replacement for React Native's native Alert.alert().
 * Supports success, error, warning, and info variants with matching icons
 * and color accents.
 *
 * This component is mounted ONCE at the app root and controlled via AlertManager.
 */
import React, { useState, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { useMotion } from '../../theme/MotionProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ALERT_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);

const THEME = {
  success: { accent: '#10B981', bg: '#ECFDF5', icon: '✓', iconBg: '#D1FAE5' },
  error:   { accent: '#EF4444', bg: '#FEF2F2', icon: '!', iconBg: '#FEE2E2' },
  warning: { accent: '#F59E0B', bg: '#FFFBEB', icon: '⚠', iconBg: '#FEF3C7' },
  info:    { accent: '#6366F1', bg: '#EEF2FF', icon: 'i', iconBg: '#E0E7FF' },
};

const CustomAlert = forwardRef((_, ref) => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState([]);
  const [type, setType] = useState('info');

  const { getSpring, getDuration } = useMotion();

  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);

  const show = useCallback((t, msg, btns, options) => {
    setTitle(t || '');
    setMessage(msg || '');
    setType(options?.type || inferType(t, btns));
    setButtons(btns && btns.length > 0 ? btns : [{ text: 'OK' }]);
    setVisible(true);
  }, []);

  useImperativeHandle(ref, () => ({ show }), [show]);

  useEffect(() => {
    if (visible) {
      scale.value = 0.85;
      opacity.value = 0;
      scale.value = withSpring(1, getSpring('default'));
      opacity.value = withTiming(1, { duration: getDuration('fast') });
    }
  }, [visible, getSpring, getDuration]);

  const dismiss = useCallback((callback) => {
    scale.value = withSpring(0.85, getSpring('default'));
    opacity.value = withTiming(0, { duration: getDuration('fast') }, (finished) => {
      if (finished) {
        runOnJS(setVisible)(false);
        if (callback) {
          runOnJS(callback)();
        }
      }
    });
  }, [scale, opacity, getSpring, getDuration]);

  const handleButtonPress = useCallback((btn) => {
    dismiss(btn.onPress);
  }, [dismiss]);

  const theme = THEME[type] || THEME.info;
  const shouldStack = buttons.length > 2 || buttons.some(b => (b.text || '').length > 12);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss()}
    >
      {visible ? (
        <Reanimated.View style={[styles.overlay, overlayStyle]}>
          <Pressable 
            style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]} 
            onPress={() => dismiss()} 
          />
          <Reanimated.View
            style={[
              styles.container,
              containerStyle,
            ]}
          >
            {/* Icon badge */}
            <View style={[styles.iconCircle, { backgroundColor: theme.iconBg }]}>
              <Text style={[styles.iconText, { color: theme.accent }]}>
                {theme.icon}
              </Text>
            </View>

            {/* Title */}
            {title ? <Text style={styles.title}>{title}</Text> : null}

            {/* Message */}
            {message ? <Text style={styles.message}>{message}</Text> : null}

            {/* Buttons */}
            <View style={[
              styles.buttonRow,
              buttons.length === 1 && styles.buttonRowSingle,
              shouldStack && { flexDirection: 'column-reverse', gap: 8 },
            ]}>
              {buttons.map((btn, idx) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                const isPrimary = !isCancel && !isDestructive && (buttons.length === 1 || idx === buttons.length - 1);

                let buttonStyle = styles.btnDefault;
                let textStyle = styles.btnTextDefault;

                if (isDestructive) {
                  buttonStyle = styles.btnDestructive;
                  textStyle = styles.btnTextDestructive;
                } else if (isCancel) {
                  buttonStyle = styles.btnCancel;
                  textStyle = styles.btnTextCancel;
                } else if (isPrimary) {
                  buttonStyle = [styles.btnPrimary, { backgroundColor: theme.accent }];
                  textStyle = styles.btnTextPrimary;
                }

                return (
                  <Pressable
                    key={idx}
                    style={({ pressed }) => [
                      styles.btn,
                      buttonStyle,
                      (buttons.length === 1 || shouldStack) && styles.btnFull,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={() => handleButtonPress(btn)}
                  >
                    <Text 
                      style={[styles.btnText, textStyle]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {btn.text || 'OK'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Reanimated.View>
        </Reanimated.View>
      ) : null}
    </Modal>
  );
});

/**
 * Infer alert type from title keywords when no explicit type is provided.
 */
function inferType(title, buttons) {
  const t = (title || '').toLowerCase();
  if (t.includes('success') || t.includes('updated') || t.includes('saved') || t.includes('copied')) return 'success';
  if (t.includes('error') || t.includes('failed') || t.includes('invalid')) return 'error';
  if (t.includes('warning') || t.includes('slow') || t.includes('caution')) return 'warning';
  if (buttons?.some(b => b.style === 'destructive')) return 'warning';
  return 'info';
}

CustomAlert.displayName = 'CustomAlert';

export default CustomAlert;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  container: {
    width: ALERT_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: { elevation: 24 },
    }),
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 22,
    fontWeight: '900',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  buttonRowSingle: {
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnFull: {
    flex: undefined,
    width: '100%',
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  btnPrimary: {
    backgroundColor: '#6366F1',
  },
  btnTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  btnCancel: {
    backgroundColor: '#F1F5F9',
  },
  btnTextCancel: {
    color: '#64748B',
    fontWeight: '600',
  },
  btnDestructive: {
    backgroundColor: '#FEF2F2',
  },
  btnTextDestructive: {
    color: '#EF4444',
    fontWeight: '700',
  },
  btnDefault: {
    backgroundColor: '#F1F5F9',
  },
  btnTextDefault: {
    color: '#334155',
    fontWeight: '600',
  },
  btnText: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
});
