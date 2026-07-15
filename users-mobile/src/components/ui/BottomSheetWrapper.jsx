import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useMotion } from '../../theme/MotionProvider';
import { X } from 'lucide-react-native';

/**
 * BottomSheetWrapper — Reusable physics-driven bottom sheet.
 *
 * Built on @gorhom/bottom-sheet v5. Provides:
 * - Configurable multi-stop snap points
 * - Animated backdrop dimming
 * - Drag handle indicator
 * - Optional title bar with close button
 * - Reduce Motion graceful degradation
 * - Keyboard awareness (built-in)
 *
 * @param {boolean} isOpen — Whether the sheet is visible.
 * @param {function} onClose — Called when the sheet is dismissed.
 * @param {Array<string>} snapPoints — Snap positions (e.g. ['40%', '80%']).
 * @param {string} title — Optional header title.
 * @param {React.ReactNode} children — Sheet body content.
 * @param {boolean} scrollable — Whether the content should be scrollable.
 */
export default function BottomSheetWrapper({
    isOpen,
    onClose,
    snapPoints = ['40%', '80%'],
    title,
    children,
    scrollable = true,
    enablePanDownToClose = true,
}) {
    const { reduceMotion } = useMotion();
    const bottomSheetRef = useRef(null);

    const memoSnapPoints = useMemo(() => snapPoints, [snapPoints]);

    useEffect(() => {
        if (isOpen) {
            bottomSheetRef.current?.snapToIndex?.(0);
        } else {
            bottomSheetRef.current?.close?.();
        }
    }, [isOpen]);

    const handleSheetChanges = useCallback((index) => {
        if (index === -1 && onClose) {
            onClose();
        }
    }, [onClose]);

    const renderBackdrop = useCallback(
        (props) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.5}
                pressBehavior="close"
            />
        ),
        []
    );

    const ContentWrapper = scrollable ? BottomSheetScrollView : View;
    const contentWrapperProps = scrollable
        ? { contentContainerStyle: styles.scrollContent }
        : { style: styles.scrollContent };

    return (
        <BottomSheet
            ref={bottomSheetRef}
            index={isOpen ? 0 : -1}
            snapPoints={memoSnapPoints}
            onChange={handleSheetChanges}
            enablePanDownToClose={enablePanDownToClose}
            backdropComponent={renderBackdrop}
            handleIndicatorStyle={styles.handleIndicator}
            handleStyle={styles.handleContainer}
            backgroundStyle={styles.sheetBackground}
            animateOnMount={!reduceMotion}
            enableDynamicSizing={false}
        >
            {title && (
                <View style={styles.titleRow}>
                    <Text style={styles.titleText}>{title}</Text>
                    <Pressable
                        onPress={onClose}
                        style={styles.closeButton}
                        hitSlop={12}
                    >
                        <X size={20} color="#64748B" strokeWidth={2.5} />
                    </Pressable>
                </View>
            )}

            <ContentWrapper {...contentWrapperProps}>
                {children}
            </ContentWrapper>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    handleContainer: {
        paddingTop: 12,
        paddingBottom: 4,
    },
    handleIndicator: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CBD5E1',
    },
    sheetBackground: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    titleText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#0F172A',
        fontFamily: 'Inter_700Bold',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 40,
    },
});
