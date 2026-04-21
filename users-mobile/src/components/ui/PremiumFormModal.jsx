import React, { useEffect, useRef } from 'react';
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
    StatusBar,
} from 'react-native';
import { X } from 'lucide-react-native';

/**
 * PremiumFormModal — A universal, keyboard-safe, full-screen form wrapper.
 *
 * Props:
 *   visible       - boolean controlling modal visibility
 *   title         - string header title
 *   onClose       - function called when user closes
 *   onSave        - function called when user taps save (optional; if omitted, no sticky button)
 *   saveText      - string for save button label (default: "Save")
 *   saving        - boolean to show loading spinner on save button
 *   saveDisabled  - boolean to disable save button
 *   children      - your custom form fields
 *   headerRight   - optional JSX to render in header right area (e.g. delete button)
 */
const PremiumFormModal = ({
    visible,
    title = 'Edit',
    onClose,
    onSave,
    saveText = 'Save',
    saving = false,
    saveDisabled = false,
    children,
    headerRight,
}) => {
    const slideAnim = useRef(new Animated.Value(0)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 1,
                    friction: 8,
                    tension: 65,
                    useNativeDriver: true,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            slideAnim.setValue(0);
            backdropAnim.setValue(0);
        }
    }, [visible]);

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
            onClose?.();
        });
    };

    const handleSave = () => {
        Vibration.vibrate(40);
        onSave?.();
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
            {/* Backdrop */}
            <TouchableWithoutFeedback onPress={handleClose}>
                <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
            </TouchableWithoutFeedback>

            {/* Full-screen sheet */}
            <Animated.View
                style={[
                    styles.sheetContainer,
                    {
                        transform: [
                            {
                                translateY: slideAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [1200, 0],
                                }),
                            },
                        ],
                    },
                ]}
            >
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                >
                    {/* Drag Handle */}
                    <View style={styles.handleWrap}>
                        <View style={styles.handle} />
                    </View>

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title} numberOfLines={1}>
                            {title}
                        </Text>
                        <View style={styles.headerActions}>
                            {headerRight}
                            <Pressable
                                onPress={handleClose}
                                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
                                hitSlop={12}
                            >
                                <X size={22} color="#64748B" />
                            </Pressable>
                        </View>
                    </View>

                    {/* Scrollable Form Body */}
                    <ScrollView
                        style={styles.scrollBody}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                        bounces={true}
                    >
                        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                            <View>{children}</View>
                        </TouchableWithoutFeedback>
                    </ScrollView>

                    {/* Sticky Save Button — always above keyboard */}
                    {onSave && (
                        <View style={styles.stickyFooter}>
                            <Pressable
                                onPress={handleSave}
                                disabled={saving || saveDisabled}
                                style={({ pressed }) => [
                                    styles.saveBtn,
                                    pressed && styles.saveBtnPressed,
                                    (saving || saveDisabled) && styles.saveBtnDisabled,
                                ]}
                            >
                                {saving ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <Text style={styles.saveBtnText}>{saveText}</Text>
                                )}
                            </Pressable>
                        </View>
                    )}
                </KeyboardAvoidingView>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
    },
    sheetContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 80 : 100, // Provides a nice gap at the top so it doesn't collide
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 20,
        overflow: 'hidden',
    },
    handleWrap: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 4,
    },
    handle: {
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#CBD5E1',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0F172A',
        flex: 1,
        letterSpacing: -0.3,
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
    scrollBody: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 40,
    },
    stickyFooter: {
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        backgroundColor: '#FFFFFF',
    },
    saveBtn: {
        height: 56,
        borderRadius: 16,
        backgroundColor: '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
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
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 0.2,
    },
});

export default PremiumFormModal;
