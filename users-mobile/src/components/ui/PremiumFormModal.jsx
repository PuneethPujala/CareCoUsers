import React, { useEffect, useRef, useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Animated,
    Pressable,
    KeyboardAvoidingView,
    ScrollView,
    Platform,
    Keyboard,
    TouchableWithoutFeedback,
    Vibration,
    ActivityIndicator,
    Dimensions,
    PanResponder,
    DeviceEventEmitter,
    LayoutAnimation,
    UIManager,
} from 'react-native';
import { X, Save } from 'lucide-react-native';
import { colors, radius, motion } from '../../theme';
import ScalePressable from './ScalePressable';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FONT = {
    regular: { fontFamily: 'Inter', fontWeight: '400' },
    medium: { fontFamily: 'Inter', fontWeight: '500' },
    semibold: { fontFamily: 'Inter', fontWeight: '600' },
    bold: { fontFamily: 'Inter', fontWeight: '700' },
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * PremiumFormModal — A universal, keyboard-safe, bottom-sheet form wrapper.
 */
let activeModalsCount = 0;

const PremiumFormModal = ({
    visible,
    title = 'Edit',
    subtitle,
    onClose,
    onSave,
    saveText = 'Save',
    saving = false,
    saveDisabled = false,
    children,
    headerRight,
    centered = false,
    icon,
}) => {
    const slideAnim = useRef(new Animated.Value(0)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const panY = useRef(new Animated.Value(0)).current;
    const wasVisibleRef = useRef(false);

    useEffect(() => {
        if (visible) {
            panY.setValue(0);
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 1,
                    friction: 7,
                    tension: 45,
                    useNativeDriver: true,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start();

            if (!wasVisibleRef.current) {
                wasVisibleRef.current = true;
                activeModalsCount++;
                DeviceEventEmitter.emit('FORM_MODAL_VISIBLE', activeModalsCount > 0);
            }
        } else {
            slideAnim.setValue(0);
            backdropAnim.setValue(0);
            panY.setValue(0);

            if (wasVisibleRef.current) {
                wasVisibleRef.current = false;
                activeModalsCount = Math.max(0, activeModalsCount - 1);
                DeviceEventEmitter.emit('FORM_MODAL_VISIBLE', activeModalsCount > 0);
            }
        }

        return () => {
            if (wasVisibleRef.current) {
                wasVisibleRef.current = false;
                activeModalsCount = Math.max(0, activeModalsCount - 1);
                DeviceEventEmitter.emit('FORM_MODAL_VISIBLE', activeModalsCount > 0);
            }
        };
    }, [visible]);

    // Track keyboard height with fluid LayoutAnimation height morphing
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (e) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setKeyboardHeight(e.endCoordinates.height);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setKeyboardHeight(0);
        });
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const handleClose = () => {
        Vibration.vibrate(30);
        Keyboard.dismiss();
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            panY.setValue(0);
            onClose?.();
        });
    };

    const handleSave = () => {
        Vibration.vibrate(40);
        onSave?.();
    };

    // PanResponder to support interactive swipe down to dismiss
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return !centered && gestureState.dy > 5 && Math.abs(gestureState.dx) < 15;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.8) {
                    Vibration.vibrate(30);
                    Keyboard.dismiss();
                    Animated.parallel([
                        Animated.timing(slideAnim, {
                            toValue: 0,
                            duration: 180,
                            useNativeDriver: true,
                        }),
                        Animated.timing(backdropAnim, {
                            toValue: 0,
                            duration: 180,
                            useNativeDriver: true,
                        }),
                    ]).start(() => {
                        panY.setValue(0);
                        onClose?.();
                    });
                } else {
                    Animated.spring(panY, {
                        toValue: 0,
                        ...motion.springSoft,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    const androidKeyboardPad = Platform.OS === 'android' ? keyboardHeight : 0;

    // Organic scale morph interpolator for smooth spring entry/exit
    const sheetScaleMorph = slideAnim.interpolate({
        inputRange: [0, 0.6, 0.88, 1],
        outputRange: [0.92, 0.97, 1.012, 1],
    });

    const sheetTranslateY = Animated.add(
        slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [SCREEN_HEIGHT, 0],
        }),
        panY
    );

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
            {/* Backdrop */}
            <TouchableWithoutFeedback onPress={handleClose}>
                <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
            </TouchableWithoutFeedback>

            <View
                style={[styles.sheetWrapper, centered ? { paddingHorizontal: 20 } : { paddingHorizontal: 0 }, centered && styles.sheetWrapperCentered]}
                pointerEvents="box-none"
            >
              <Animated.View
                style={[
                    centered ? styles.animatedCentered : styles.animatedBottomSheet,
                    {
                        opacity: slideAnim,
                        transform: centered
                            ? [
                                  {
                                      scale: slideAnim.interpolate({
                                          inputRange: [0, 0.8, 1],
                                          outputRange: [0.92, 1.02, 1],
                                      }),
                                  },
                              ]
                            : [
                                  { translateY: sheetTranslateY },
                                  { scale: sheetScaleMorph },
                              ],
                    },
                ]}
                pointerEvents="box-none"
              >
                <View style={[
                    styles.sheetContainer,
                    centered && styles.sheetContainerCentered,
                    androidKeyboardPad > 0 && { maxHeight: SCREEN_HEIGHT - androidKeyboardPad - 40 }
                ]}>
                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                    >
                        {/* Top drag handle indicator for bottom sheets */}
                        {!centered && (
                            <View {...panResponder.panHandlers} style={{ width: '100%', alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                                <View style={styles.sheetHandle} />
                            </View>
                        )}

                        {/* Header */}
                        <View style={[
                            styles.header,
                            centered && styles.headerCentered,
                            !centered && { paddingTop: 12, borderBottomWidth: 0 }
                        ]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                                {icon && (
                                    <View style={[styles.iconCircle, { backgroundColor: '#FAF5FF', width: 44, height: 44, borderRadius: 22 }]}>
                                        {icon}
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.title} numberOfLines={1}>
                                        {title}
                                    </Text>
                                    {subtitle && (
                                        <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '500' }}>
                                            {subtitle}
                                        </Text>
                                    )}
                                </View>
                            </View>
                            <View style={styles.headerActions}>
                                {headerRight}
                                <Pressable
                                    onPress={handleClose}
                                    style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
                                    hitSlop={12}
                                >
                                    <X size={20} color="#64748B" strokeWidth={2.5} />
                                </Pressable>
                            </View>
                        </View>

                        {/* Scrollable Form Body */}
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={[
                                styles.scrollContent,
                                androidKeyboardPad > 0 && { paddingBottom: 24 },
                            ]}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            bounces={true}
                            nestedScrollEnabled={true}
                        >
                            {children}
                        </ScrollView>

                        {/* Sticky Save Button — anchored at sheet bottom */}
                        {onSave && (
                            <View style={[
                                styles.stickyFooter,
                                androidKeyboardPad > 0 && { paddingBottom: 16 }
                            ]}>
                                <ScalePressable
                                    onPress={handleSave}
                                    disabled={saving || saveDisabled}
                                    pressScale={0.97}
                                    hapticType="selection"
                                    style={[
                                        styles.saveBtn,
                                        (saving || saveDisabled) && styles.saveBtnDisabled,
                                    ]}
                                >
                                    {saving ? (
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                    ) : (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                            <Save size={18} color="#FFFFFF" strokeWidth={2.5} />
                                            <Text style={styles.saveBtnText}>{saveText}</Text>
                                        </View>
                                    )}
                                </ScalePressable>
                            </View>
                        )}
                    </KeyboardAvoidingView>
                </View>
              </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
    },
    sheetWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        top: 0,
        justifyContent: 'flex-end',
    },
    sheetWrapperCentered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    animatedBottomSheet: {
        width: '100%',
        justifyContent: 'flex-end',
    },
    animatedCentered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    sheetContainerCentered: {
        minHeight: 0,
        marginBottom: 0,
        borderRadius: 28,
        width: '92%',
        maxWidth: 400,
    },
    headerCentered: {
        borderBottomWidth: 0,
        paddingBottom: 8,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetContainer: {
        minHeight: SCREEN_HEIGHT * 0.62,
        maxHeight: SCREEN_HEIGHT * 0.92,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -12 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 24,
        overflow: 'hidden',
        marginBottom: 0,
    },
    sheetHandle: {
        width: 46,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#E2E8F0',
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 2,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    title: {
        fontSize: 20,
        ...FONT.bold,
        color: colors.textPrimary || '#0F172A',
        letterSpacing: -0.4,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 40,
        flexGrow: 1,
        gap: 16,
    },
    stickyFooter: {
        paddingHorizontal: 24,
        paddingTop: 14,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        borderTopWidth: 1,
        borderTopColor: '#F8FAFC',
        backgroundColor: '#FFFFFF',
    },
    saveBtn: {
        height: 56,
        borderRadius: radius.lg || 16,
        backgroundColor: colors.primary || '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary || '#2563EB',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    saveBtnPressed: {
        transform: [{ scale: 0.97 }],
        opacity: 0.9,
    },
    saveBtnDisabled: {
        opacity: 0.5,
    },
    saveBtnText: {
        fontSize: 17,
        ...FONT.bold,
        color: '#FFFFFF',
        letterSpacing: 0.2,
    },
});

export default PremiumFormModal;
