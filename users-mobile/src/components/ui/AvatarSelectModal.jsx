import React, { useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Animated,
    Pressable,
    Dimensions,
    Platform,
    TouchableWithoutFeedback,
    Vibration,
    Image,
} from 'react-native';
import { Camera, Image as ImageIcon, Trash2, X, User } from 'lucide-react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const AvatarSelectModal = ({
    visible,
    onClose,
    onSelectSource,
    onRemove,
    currentAvatarUrl,
    userName,
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

    const handleSelect = (source) => {
        Vibration.vibrate(45);
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start(() => {
            onClose?.();
            onSelectSource?.(source);
        });
    };

    const handleRemove = () => {
        Vibration.vibrate(45);
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start(() => {
            onClose?.();
            onRemove?.();
        });
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
            {/* Backdrop */}
            <TouchableWithoutFeedback onPress={handleClose}>
                <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
            </TouchableWithoutFeedback>

            <View style={styles.sheetWrapper}>
                <Animated.View
                    style={[
                        styles.sheetContainer,
                        {
                            transform: [
                                {
                                    translateY: slideAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [SCREEN_HEIGHT * 0.4, 0],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    {/* Grab handle/indicator */}
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>Profile Picture</Text>
                            <Text style={styles.subtitle}>Choose an option to update your photo</Text>
                        </View>
                        <Pressable onPress={handleClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]} hitSlop={12}>
                            <X size={20} color="#64748B" />
                        </Pressable>
                    </View>

                    {/* Current Avatar Preview */}
                    <View style={styles.avatarPreviewContainer}>
                        <View style={styles.avatarPreviewRing}>
                            {currentAvatarUrl ? (
                                <Image
                                    source={{ uri: currentAvatarUrl }}
                                    style={styles.avatarPreviewImage}
                                />
                            ) : (
                                <View style={styles.avatarPreviewFallback}>
                                    <User size={36} color="#94A3B8" strokeWidth={1.5} />
                                </View>
                            )}
                        </View>
                        <Text style={styles.avatarPreviewLabel}>
                            {currentAvatarUrl ? 'Current Photo' : 'No Photo Set'}
                        </Text>
                    </View>

                    {/* Actions List */}
                    <View style={styles.actionsContainer}>
                        <Pressable
                            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                            onPress={() => handleSelect('camera')}
                        >
                            <View style={[styles.iconBox, { backgroundColor: '#EEF2FF' }]}>
                                <Camera size={22} color="#6366F1" strokeWidth={2} />
                            </View>
                            <Text style={styles.actionText}>Take Photo</Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                            onPress={() => handleSelect('library')}
                        >
                            <View style={[styles.iconBox, { backgroundColor: '#EEF2FF' }]}>
                                <ImageIcon size={22} color="#6366F1" strokeWidth={2} />
                            </View>
                            <Text style={styles.actionText}>Choose from Gallery</Text>
                        </Pressable>

                        {currentAvatarUrl ? (
                            <Pressable
                                style={({ pressed }) => [styles.actionRow, styles.actionRowDestructive, pressed && styles.actionRowPressed]}
                                onPress={handleRemove}
                            >
                                <View style={[styles.iconBox, { backgroundColor: '#FFF1F2' }]}>
                                    <Trash2 size={22} color="#EF4444" strokeWidth={2} />
                                </View>
                                <Text style={[styles.actionText, styles.actionTextDestructive]}>Remove Photo</Text>
                            </Pressable>
                        ) : null}
                    </View>

                    {/* Cancel Button */}
                    <Pressable
                        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
                        onPress={handleClose}
                    >
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
    },
    sheetWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 44 : 28,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 20,
    },
    handle: {
        width: 48,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#E2E8F0',
        alignSelf: 'center',
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.4,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '500',
        color: '#64748B',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
    avatarPreviewContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    avatarPreviewRing: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 3,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarPreviewImage: {
        width: 90,
        height: 90,
        borderRadius: 45,
    },
    avatarPreviewFallback: {
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarPreviewLabel: {
        marginTop: 8,
        fontSize: 13,
        fontWeight: '600',
        color: '#94A3B8',
        letterSpacing: 0.2,
    },
    actionsContainer: {
        gap: 12,
        marginBottom: 16,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        padding: 16,
        gap: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    actionRowDestructive: {
        borderColor: '#FFF1F2',
        backgroundColor: '#FFF8F8',
    },
    actionRowPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.99 }],
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#334155',
    },
    actionTextDestructive: {
        color: '#EF4444',
    },
    cancelBtn: {
        height: 54,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    cancelBtnPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.99 }],
    },
    cancelBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#64748B',
    },
});

export default AvatarSelectModal;
