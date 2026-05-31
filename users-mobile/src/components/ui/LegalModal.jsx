import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    Animated,
    ScrollView,
    Dimensions,
    LayoutAnimation,
    Platform,
    UIManager
} from 'react-native';
import { X, ChevronDown, ChevronUp, AlertCircle, Shield } from 'lucide-react-native';
import { TERMS_CONTENT, PRIVACY_CONTENT, TERMS_VERSION, PRIVACY_VERSION } from '../../constants/legalContent';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function LegalModal({ visible, type, onClose }) {
    const [expandedSections, setExpandedSections] = useState({});
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const sections = type === 'terms' ? TERMS_CONTENT : PRIVACY_CONTENT;
    const title = type === 'terms' ? 'Terms & Conditions' : 'Privacy Policy';
    const version = type === 'terms' ? TERMS_VERSION : PRIVACY_VERSION;
    const lastUpdated = type === 'terms' ? 'April 24, 2026' : 'May 27, 2026';

    useEffect(() => {
        if (visible) {
            // Reset expansions
            setExpandedSections({});
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0, // Slide up to resting position (85% of screen height)
                    tension: 50,
                    friction: 9,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: SCREEN_HEIGHT,
                    duration: 250,
                    useNativeDriver: true,
                })
            ]).start();
        }
    }, [visible]);

    const toggleSection = (index) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedSections(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: SCREEN_HEIGHT,
                duration: 200,
                useNativeDriver: true,
            })
        ]).start(() => {
            if (onClose) onClose();
        });
    };

    if (!visible) return null;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="none"
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                {/* Backdrop Overlay */}
                <Animated.View 
                    style={[
                        styles.backdrop, 
                        { opacity: fadeAnim }
                    ]} 
                >
                    <Pressable style={styles.backdropPressable} onPress={handleClose} />
                </Animated.View>

                {/* Bottom Sheet Card Container */}
                <Animated.View 
                    style={[
                        styles.sheet, 
                        { transform: [{ translateY: slideAnim }] }
                    ]}
                >
                    {/* Header Bar Indicator */}
                    <View style={styles.dragIndicator} />

                    {/* Modal Title Header */}
                    <View style={styles.header}>
                        <View style={styles.titleContainer}>
                            <Shield size={22} color="#0EA5E9" style={styles.titleIcon} />
                            <Text style={styles.titleText}>{title}</Text>
                        </View>
                        <Pressable style={styles.closeButton} onPress={handleClose} hitSlop={10}>
                            <X size={20} color="#64748B" />
                        </Pressable>
                    </View>

                    {/* Scrollable Document Content */}
                    <ScrollView 
                        style={styles.scroll} 
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Document Version and Date Metadata */}
                        <View style={styles.metaContainer}>
                            <Text style={styles.metaText}>Version {version}</Text>
                            <Text style={styles.metaDivider}>•</Text>
                            <Text style={styles.metaText}>Last Updated: {lastUpdated}</Text>
                        </View>

                        {/* Medical Advice Disclaimer Card */}
                        <View style={styles.disclaimerCard}>
                            <AlertCircle size={20} color="#D97706" style={styles.disclaimerIcon} />
                            <View style={styles.disclaimerTextContainer}>
                                <Text style={styles.disclaimerTitle}>Medical Advice Disclaimer</Text>
                                <Text style={styles.disclaimerText}>
                                    CareMyMed does not replace professional medical advice, diagnosis, or treatment. Always consult your doctor for medical decisions.
                                </Text>
                            </View>
                        </View>

                        {/* Legal Sections (Collapsible Accordion) */}
                        {sections.map((section, index) => {
                            const isExpanded = !!expandedSections[index];
                            return (
                                <View key={index} style={styles.sectionContainer}>
                                    <Pressable 
                                        style={[
                                            styles.sectionHeader,
                                            isExpanded && styles.sectionHeaderExpanded
                                        ]} 
                                        onPress={() => toggleSection(index)}
                                    >
                                        <Text style={styles.sectionTitle}>{section.title}</Text>
                                        {isExpanded ? (
                                            <ChevronUp size={18} color="#0E172A" strokeWidth={2.5} />
                                        ) : (
                                            <ChevronDown size={18} color="#64748B" strokeWidth={2} />
                                        )}
                                    </Pressable>
                                    
                                    {isExpanded && (
                                        <View style={styles.sectionContent}>
                                            <Text style={styles.sectionText}>{section.content}</Text>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.45)', // dark glass overlay
    },
    backdropPressable: {
        flex: 1,
    },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        height: SCREEN_HEIGHT * 0.85,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 10,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    dragIndicator: {
        width: 38,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#E2E8F0',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    titleIcon: {
        marginRight: 8,
    },
    titleText: {
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        color: '#0F172A',
    },
    closeButton: {
        padding: 6,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    metaText: {
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
        color: '#64748B',
    },
    metaDivider: {
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
        color: '#94A3B8',
        marginHorizontal: 8,
    },
    disclaimerCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFBEB', // Amber light
        borderWidth: 1,
        borderColor: '#FEF3C7',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
    },
    disclaimerIcon: {
        marginRight: 12,
        marginTop: 2,
    },
    disclaimerTextContainer: {
        flex: 1,
    },
    disclaimerTitle: {
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
        color: '#B45309', // Amber dark
        marginBottom: 4,
    },
    disclaimerText: {
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        color: '#78350F',
        lineHeight: 18,
    },
    sectionContainer: {
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        marginBottom: 12,
        backgroundColor: '#FAFBFF',
        overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#FAFBFF',
    },
    sectionHeaderExpanded: {
        backgroundColor: '#F8FAFC',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    sectionTitle: {
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
        color: '#0F172A',
        flex: 1,
        paddingRight: 8,
    },
    sectionContent: {
        padding: 16,
        backgroundColor: '#FFFFFF',
    },
    sectionText: {
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        color: '#475569',
        lineHeight: 20,
    },
});
