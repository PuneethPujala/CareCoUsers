import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Theme } from '../../theme/theme';

const { width } = Dimensions.get('window');

const CustomAlertModal = ({ visible, title, message, buttons, onClose, type = 'info' }) => {
    if (!visible) return null;

    const getIcon = () => {
        switch (type) {
            case 'error': return { name: 'alert-triangle', color: '#EF4444', bg: '#FEF2F2' };
            case 'warning': return { name: 'alert-circle', color: '#F59E0B', bg: '#FFFBEB' };
            case 'success': return { name: 'check-circle', color: '#10B981', bg: '#ECFDF5' };
            case 'destructive': return { name: 'trash-2', color: '#EF4444', bg: '#FEF2F2' };
            default: return { name: 'info', color: '#6366F1', bg: '#EEF2FF' };
        }
    };

    const iconStyle = getIcon();

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.alertBox}>
                    <View style={s.header}>
                        <View style={[s.iconContainer, { backgroundColor: iconStyle.bg }]}>
                            <Feather name={iconStyle.name} size={28} color={iconStyle.color} />
                        </View>
                        <Text style={[s.title, Theme.typography.common]}>{title}</Text>
                        <Text style={s.message}>{message}</Text>
                    </View>

                    <View style={s.spacer} />

                    <View style={s.buttonGrid}>
                        {buttons.map((btn, index) => {
                            const isDestructive = btn.style === 'destructive';
                            const isCancel = btn.style === 'cancel';
                            
                            return (
                                <TouchableOpacity 
                                    key={index} 
                                    style={[
                                        s.button,
                                        isCancel ? s.buttonCancel : (isDestructive ? s.buttonDestructive : s.buttonDefault),
                                        buttons.length > 1 && { flex: 1, marginHorizontal: 4 }
                                    ]}
                                    onPress={() => {
                                        if (btn.onPress) btn.onPress();
                                        onClose();
                                    }}
                                >
                                    <Text style={[
                                        s.buttonText, 
                                        isCancel ? { color: '#64748B' } : { color: '#FFFFFF' }
                                    ]}>
                                        {btn.text}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                        {(!buttons || buttons.length === 0) && (
                            <TouchableOpacity style={[s.button, s.buttonDefault, { flex: 1 }]} onPress={onClose}>
                                <Text style={[s.buttonText, { color: '#FFFFFF' }]}>OK</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    alertBox: {
        width: width - 48,
        maxWidth: 400,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        ...Theme.shadows.sharp,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    header: {
        alignItems: 'center',
        marginBottom: 8,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1E293B',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
    },
    spacer: {
        height: 24,
    },
    buttonGrid: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'center',
    },
    button: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonCancel: {
        backgroundColor: '#F1F5F9',
    },
    buttonDefault: {
        backgroundColor: '#6366F1',
        ...Theme.shadows.sharp,
    },
    buttonDestructive: {
        backgroundColor: '#EF4444',
        ...Theme.shadows.sharp,
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.5,
    }
});

export default CustomAlertModal;
