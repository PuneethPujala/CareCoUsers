import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    Animated,
    ScrollView,
    Dimensions,
    Platform,
    useWindowDimensions
} from 'react-native';
import { X, AlertCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TERMS_CONTENT, PRIVACY_CONTENT, TERMS_VERSION, PRIVACY_VERSION } from '../../constants/legalContent';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function LegalModal({ visible, type, onClose, onAccept }) {
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const isWide = windowWidth > 550;

    const [activeSection, setActiveSection] = useState(0);
    const [hasRead, setHasRead] = useState(false);

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scrollProgress = useRef(new Animated.Value(0)).current;

    const scrollViewRef = useRef(null);
    const sectionLayouts = useRef({});

    const sections = type === 'terms' ? TERMS_CONTENT : PRIVACY_CONTENT;
    const title = type === 'terms' ? 'Terms & Conditions' : 'Privacy Policy';
    const version = type === 'terms' ? TERMS_VERSION : PRIVACY_VERSION;
    const lastUpdated = type === 'terms' ? 'April 24, 2026' : 'May 27, 2026';

    useEffect(() => {
        if (visible) {
            setHasRead(false);
            setActiveSection(0);
            scrollProgress.setValue(0);
            sectionLayouts.current = {};

            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 50,
                    friction: 9,
                    useNativeDriver: true,
                })
            ]).start();
        }
    }, [visible]);

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

    const handleAccept = () => {
        if (onAccept) {
            onAccept();
        }
        handleClose();
    };

    const splitTitle = (titleStr) => {
        const numPart = titleStr.slice(0, 2);
        const textPart = titleStr.slice(2);
        return { numPart, textPart };
    };

    const scrollToSection = (index) => {
        const y = sectionLayouts.current[index];
        if (y !== undefined && scrollViewRef.current) {
            scrollViewRef.current.scrollTo({ y: y, animated: true });
            setActiveSection(index);
        }
    };

    const handleScroll = (event) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const yOffset = contentOffset.y;
        
        // Calculate reading progress percentage
        const totalScrollableHeight = contentSize.height - layoutMeasurement.height;
        const progress = totalScrollableHeight > 0 ? yOffset / totalScrollableHeight : 0;
        
        scrollProgress.setValue(Math.min(Math.max(progress, 0), 1));

        // Scroll to bottom detection (92% or close to bottom)
        if (progress >= 0.92) {
            setHasRead(true);
        }

        // Dynamic active section selection
        let currentActive = 0;
        const sortedIndices = Object.keys(sectionLayouts.current)
            .map(Number)
            .sort((a, b) => a - b);
            
        for (const idx of sortedIndices) {
            const sectionY = sectionLayouts.current[idx];
            if (yOffset >= sectionY - 80) {
                currentActive = idx;
            }
        }
        
        if (currentActive !== activeSection) {
            setActiveSection(currentActive);
        }
    };

    const renderSerifTitle = () => {
        if (type === 'terms') {
            return (
                <Text style={styles.serifTitle}>
                    Terms &{"\n"}
                    <Text style={styles.serifTitleItalic}>Conditions</Text>
                </Text>
            );
        } else {
            return (
                <Text style={styles.serifTitle}>
                    Privacy &{"\n"}
                    <Text style={styles.serifTitleItalic}>Policy</Text>
                </Text>
            );
        }
    };

    if (!visible) return null;

    const sidebarWidth = isWide ? 160 : 46;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="none"
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                {/* Backdrop Overlay */}
                <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                    <Pressable style={styles.backdropPressable} onPress={handleClose} />
                </Animated.View>

                {/* Bottom Sheet Card Container */}
                <Animated.View 
                    style={[
                        styles.sheet, 
                        { 
                            transform: [{ translateY: slideAnim }],
                            paddingBottom: onAccept ? Math.max(insets.bottom, 16) : Math.max(insets.bottom, 24)
                        }
                    ]}
                >
                    {/* Modal Title Header */}
                    <View style={styles.header}>
                        <Text style={styles.brandLogo}>CareMyMed</Text>
                        <Text style={styles.headerMeta}>{title} • v{version}</Text>
                        <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={10}>
                            <X size={18} color="#000000" />
                        </Pressable>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarContainer}>
                        <Animated.View style={[styles.progressBar, {
                            width: scrollProgress.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                                extrapolate: 'clamp'
                            })
                        }]} />
                    </View>

                    {/* Sidebar + Scroll Content Layout */}
                    <View style={styles.bodyRow}>
                        {/* Sticky TOC Sidebar */}
                        <View style={[styles.sidebar, { width: sidebarWidth }]}>
                            <Text style={styles.sidebarHeader}>TOC</Text>
                            {sections.map((sec, idx) => {
                                const isActive = activeSection === idx;
                                const { numPart, textPart } = splitTitle(sec.title);
                                return (
                                    <Pressable
                                        key={idx}
                                        style={styles.sidebarItem}
                                        onPress={() => scrollToSection(idx)}
                                    >
                                        <Text style={[
                                            styles.sidebarNumber,
                                            isActive && styles.sidebarNumberActive
                                        ]}>
                                            {numPart}
                                        </Text>
                                        {isWide && (
                                            <Text 
                                                style={[
                                                    styles.sidebarText,
                                                    isActive && styles.sidebarTextActive
                                                ]} 
                                                numberOfLines={1}
                                            >
                                                {textPart.trim()}
                                            </Text>
                                        )}
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Scroll Content */}
                        <ScrollView
                            ref={scrollViewRef}
                            style={styles.scrollView}
                            contentContainerStyle={styles.scrollViewContent}
                            onScroll={handleScroll}
                            scrollEventThrottle={16}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.metaHeaderRow}>
                                <Text style={styles.lastUpdatedText}>Last Updated: {lastUpdated}</Text>
                            </View>

                            {renderSerifTitle()}

                            <Text style={styles.subtitleText}>
                                Please read these terms carefully before using CareMyMed. They govern your use of our platform and services.
                            </Text>

                            {/* Medical Advice Disclaimer Card */}
                            <View style={styles.disclaimerBox}>
                                <Text style={styles.disclaimerLabel}>Medical Advice Disclaimer</Text>
                                <Text style={styles.disclaimerText}>
                                    CareMyMed does not replace professional medical advice, diagnosis, or treatment. Always consult your doctor for medical decisions.
                                </Text>
                            </View>

                            {/* Legal Sections */}
                            {sections.map((section, index) => {
                                const { numPart, textPart } = splitTitle(section.title);
                                return (
                                    <View 
                                        key={index} 
                                        style={styles.sectionContainer} 
                                        onLayout={(e) => { 
                                            sectionLayouts.current[index] = e.nativeEvent.layout.y; 
                                        }}
                                    >
                                        <View style={styles.sectionHeader}>
                                            <Text style={styles.sectionNumber}>{numPart}</Text>
                                            <Text style={styles.sectionTitleSerif}>{textPart}</Text>
                                        </View>
                                        <Text style={styles.sectionContentText}>{section.content}</Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* Bottom Action Buttons Enforcing Reading */}
                    {onAccept && (
                        <View style={styles.bottomActionBar}>
                            {!hasRead && (
                                <View style={styles.bottomReadingNote}>
                                    <Text style={styles.readingNoteText}>Scroll to the bottom to accept</Text>
                                </View>
                            )}
                            <Pressable style={styles.declineBtn} onPress={handleClose}>
                                <Text style={styles.declineBtnText}>Decline</Text>
                            </Pressable>
                            <Pressable 
                                style={[
                                    styles.acceptBtn,
                                    hasRead && styles.acceptBtnActive
                                ]} 
                                onPress={handleAccept}
                                disabled={!hasRead}
                            >
                                <Text style={[
                                    styles.acceptBtnText,
                                    hasRead && styles.acceptBtnTextActive
                                ]}>
                                    Accept & Continue
                                </Text>
                            </Pressable>
                        </View>
                    )}
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
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    backdropPressable: {
        flex: 1,
    },
    sheet: {
        backgroundColor: '#fafaf8',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        height: SCREEN_HEIGHT * 0.92,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 10,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
        backgroundColor: '#fafaf8',
    },
    brandLogo: {
        fontSize: 14,
        fontFamily: 'Inter_800ExtraBold',
        color: '#000000',
    },
    headerMeta: {
        fontSize: 10,
        fontFamily: 'Inter_700Bold',
        color: '#64748B',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    closeBtn: {
        padding: 6,
        borderRadius: 8,
        backgroundColor: '#f1f1ee',
    },
    progressBarContainer: {
        height: 2.5,
        backgroundColor: '#e2e8f0',
        width: '100%',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#e8ff47',
    },
    bodyRow: {
        flex: 1,
        flexDirection: 'row',
    },
    sidebar: {
        paddingVertical: 20,
        paddingHorizontal: 6,
        borderRightWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#fafaf8',
        alignItems: 'center',
    },
    sidebarHeader: {
        fontSize: 8,
        fontFamily: 'Inter_700Bold',
        color: '#94a3b8',
        letterSpacing: 1,
        marginBottom: 16,
    },
    sidebarItem: {
        paddingVertical: 12,
        paddingHorizontal: 4,
        width: '100%',
        alignItems: 'center',
        flexDirection: 'row',
        gap: 6,
    },
    sidebarNumber: {
        fontSize: 13,
        fontFamily: 'Inter_600SemiBold',
        color: '#94a3b8',
        textAlign: 'center',
        minWidth: 20,
    },
    sidebarNumberActive: {
        color: '#000000',
        fontFamily: 'Inter_800ExtraBold',
    },
    sidebarText: {
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
        color: '#64748B',
        flex: 1,
    },
    sidebarTextActive: {
        color: '#000000',
        fontFamily: 'Inter_700Bold',
    },
    scrollView: {
        flex: 1,
        backgroundColor: '#fafaf8',
    },
    scrollViewContent: {
        paddingHorizontal: 20,
        paddingVertical: 24,
        paddingBottom: 120,
    },
    metaHeaderRow: {
        marginBottom: 10,
    },
    lastUpdatedText: {
        fontSize: 11,
        fontFamily: 'Inter_600SemiBold',
        color: '#94a3b8',
    },
    serifTitle: {
        fontSize: 32,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        fontWeight: '700',
        color: '#000000',
        lineHeight: 38,
        marginBottom: 10,
    },
    serifTitleItalic: {
        fontStyle: 'italic',
        fontWeight: '300',
    },
    subtitleText: {
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        color: '#64748B',
        lineHeight: 20,
        marginBottom: 20,
    },
    disclaimerBox: {
        backgroundColor: '#FFFBEB',
        borderWidth: 1,
        borderColor: '#FEF3C7',
        borderRadius: 16,
        padding: 16,
        marginBottom: 28,
    },
    disclaimerLabel: {
        fontSize: 11,
        fontFamily: 'Inter_700Bold',
        color: '#B45309',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    disclaimerText: {
        fontSize: 13,
        fontFamily: 'Inter_500Medium',
        color: '#78350F',
        lineHeight: 18,
    },
    sectionContainer: {
        marginBottom: 32,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 10,
        gap: 6,
    },
    sectionNumber: {
        fontSize: 12,
        fontFamily: 'Inter_700Bold',
        color: '#94a3b8',
    },
    sectionTitleSerif: {
        fontSize: 19,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        fontWeight: '700',
        color: '#000000',
    },
    sectionContentText: {
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        color: '#475569',
        lineHeight: 22,
    },
    bottomActionBar: {
        paddingHorizontal: 20,
        paddingTop: 16,
        borderTopWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#fafaf8',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    bottomReadingNote: {
        position: 'absolute',
        bottom: 64,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(250, 250, 248, 0.95)',
        paddingVertical: 8,
        alignItems: 'center',
        borderTopWidth: 1,
        borderColor: '#e2e8f0',
    },
    readingNoteText: {
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
        color: '#64748B',
    },
    declineBtn: {
        flex: 1,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#fafaf8',
    },
    declineBtnText: {
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
        color: '#64748B',
    },
    acceptBtn: {
        flex: 2,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        backgroundColor: '#E2E8F0',
    },
    acceptBtnActive: {
        backgroundColor: '#e8ff47',
        borderWidth: 1,
        borderColor: '#d2eb3a',
    },
    acceptBtnText: {
        fontSize: 14,
        fontFamily: 'Inter_700Bold',
        color: '#94A3B8',
    },
    acceptBtnTextActive: {
        color: '#000000',
    },
});
