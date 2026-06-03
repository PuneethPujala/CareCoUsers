import React, { useState, useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Pressable,
    Image,
    Dimensions,
    PanResponder,
    ActivityIndicator,
    Vibration,
    Platform,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { ZoomIn, ZoomOut, Move, Check, X } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONTAINER_SIZE = SCREEN_WIDTH - 40;
const CROP_SIZE = 240; // Size of the circular crop box in UI pixels

export default function AvatarCropModal({
    visible,
    imageUri,
    onClose,
    onConfirm,
}) {
    const [imageDims, setImageDims] = useState(null);
    const [loading, setLoading] = useState(true);
    const [cropping, setCropping] = useState(false);

    // Pan coordinates
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);

    // Scale / Zoom factor (1.0 to 3.0)
    const [scale, setScale] = useState(1);

    // Pan tracking refs
    const lastPanX = useRef(0);
    const lastPanY = useRef(0);

    useEffect(() => {
        if (visible && imageUri) {
            setLoading(true);
            setCropping(false);
            setScale(1);
            setPanX(0);
            setPanY(0);
            lastPanX.current = 0;
            lastPanY.current = 0;

            Image.getSize(
                imageUri,
                (width, height) => {
                    setImageDims({ width, height });
                    setLoading(false);
                },
                (error) => {
                    console.error('Failed to get image size:', error);
                    setLoading(false);
                }
            );
        }
    }, [visible, imageUri]);

    // Pan responder for dragging the image
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                // Lock current offset
            },
            onPanResponderMove: (evt, gestureState) => {
                // Calculate bounds to prevent dragging completely out
                const maxDragX = (CONTAINER_SIZE * scale) / 2;
                const maxDragY = (CONTAINER_SIZE * scale) / 2;

                const nextX = lastPanX.current + gestureState.dx;
                const nextY = lastPanY.current + gestureState.dy;

                // Clamp values so the image stays within viewport bounds
                setPanX(Math.max(-maxDragX, Math.min(maxDragX, nextX)));
                setPanY(Math.max(-maxDragY, Math.min(maxDragY, nextY)));
            },
            onPanResponderRelease: () => {
                lastPanX.current = panX;
                lastPanY.current = panY;
            },
        })
    ).current;

    if (!visible) return null;

    // Calculate display dimensions keeping aspect ratio
    let displayWidth = CONTAINER_SIZE;
    let displayHeight = CONTAINER_SIZE;

    if (imageDims) {
        const { width: iw, height: ih } = imageDims;
        if (iw > ih) {
            displayHeight = CONTAINER_SIZE;
            displayWidth = (iw / ih) * CONTAINER_SIZE;
        } else {
            displayWidth = CONTAINER_SIZE;
            displayHeight = (ih / iw) * CONTAINER_SIZE;
        }
    }

    const handleZoomChange = (val) => {
        setScale(val);
    };

    const handleSave = async () => {
        if (!imageDims) return;
        setCropping(true);
        Vibration.vibrate(50);

        try {
            const iw = imageDims.width;
            const ih = imageDims.height;

            // Scaled size in UI pixels
            const wScaled = displayWidth * scale;
            const hScaled = displayHeight * scale;

            // Offset of the image top-left relative to crop box top-left
            // Crop box top left is centered in container:
            const cropLeft = CONTAINER_SIZE / 2 - CROP_SIZE / 2;
            const cropTop = CONTAINER_SIZE / 2 - CROP_SIZE / 2;

            // Image top-left in container coords:
            const imgLeft = CONTAINER_SIZE / 2 - wScaled / 2 + panX;
            const imgTop = CONTAINER_SIZE / 2 - hScaled / 2 + panY;

            // UI coordinates to crop (distance from image top-left to crop box top-left)
            const dx = cropLeft - imgLeft;
            const dy = cropTop - imgTop;

            // Scaling factor from UI layout pixels to raw image pixels
            const scaleFactor = iw / wScaled;

            // Map layout pixels to original image dimensions
            const originX = dx * scaleFactor;
            const originY = dy * scaleFactor;
            const cropWidth = CROP_SIZE * scaleFactor;
            const cropHeight = CROP_SIZE * scaleFactor;

            // Clamping bounds to avoid out-of-bounds crops
            const finalX = Math.max(0, Math.min(iw - 10, originX));
            const finalY = Math.max(0, Math.min(ih - 10, originY));
            const finalW = Math.max(10, Math.min(iw - finalX, cropWidth));
            const finalH = Math.max(10, Math.min(ih - finalY, cropHeight));

            // Crop image using expo-image-manipulator
            const cropRes = await ImageManipulator.manipulateAsync(
                imageUri,
                [
                    {
                        crop: {
                            originX: Math.round(finalX),
                            originY: Math.round(finalY),
                            width: Math.round(finalW),
                            height: Math.round(finalH),
                        },
                    },
                    {
                        resize: {
                            width: 512,
                            height: 512,
                        },
                    },
                ],
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );

            onConfirm(cropRes);
        } catch (err) {
            console.error('Failed to crop avatar:', err);
        } finally {
            setCropping(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalBg}>
                <View style={styles.cardContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Crop Profile Picture</Text>
                        <Pressable onPress={onClose} style={styles.closeIcon}>
                            <X size={20} color="#64748B" />
                        </Pressable>
                    </View>

                    {/* Preview Area */}
                    <View style={styles.cropWindowWrap}>
                        {loading ? (
                            <View style={styles.loaderBox}>
                                <ActivityIndicator size="large" color="#6366F1" />
                            </View>
                        ) : (
                            <View style={styles.cropContainer} {...panResponder.panHandlers}>
                                {/* Draggable Image */}
                                <Image
                                    source={{ uri: imageUri }}
                                    style={{
                                        width: displayWidth,
                                        height: displayHeight,
                                        transform: [
                                            { translateX: panX },
                                            { translateY: panY },
                                            { scale: scale },
                                        ],
                                    }}
                                    resizeMode="cover"
                                />

                                {/* Semi-transparent mask outside crop area */}
                                <View style={styles.maskContainer} pointerEvents="none">
                                    <View style={styles.maskRow} />
                                    <View style={styles.maskMiddleRow}>
                                        <View style={styles.maskSide} />
                                        <View style={styles.cropCircleOutline} />
                                        <View style={styles.maskSide} />
                                    </View>
                                    <View style={styles.maskRow} />
                                </View>

                                {/* Guide indicator (Move instruction icon) */}
                                <View style={styles.dragHint} pointerEvents="none">
                                    <Move size={20} color="rgba(255,255,255,0.7)" />
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Instruction */}
                    <Text style={styles.hintText}>Drag to position. Use sliders to scale.</Text>

                    {/* Custom Zoom Slider bar */}
                    <View style={styles.sliderSection}>
                        <ZoomOut size={16} color="#64748B" />
                        <View style={styles.sliderTrackWrap}>
                            {/* Visual slider path */}
                            <View style={styles.sliderTrackLine} />
                            {/* Slide handler buttons or points */}
                            <View style={styles.scaleButtonsContainer}>
                                {[1.0, 1.4, 1.8, 2.2, 2.6, 3.0].map((sVal) => {
                                    const isActive = Math.abs(scale - sVal) < 0.2;
                                    return (
                                        <Pressable
                                            key={sVal}
                                            style={[
                                                styles.scaleStepDot,
                                                isActive && styles.scaleStepDotActive,
                                            ]}
                                            onPress={() => handleZoomChange(sVal)}
                                        >
                                            <Text
                                                style={[
                                                    styles.scaleStepText,
                                                    isActive && styles.scaleStepTextActive,
                                                ]}
                                            >
                                                {sVal.toFixed(1)}x
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>
                        <ZoomIn size={16} color="#64748B" />
                    </View>

                    {/* Footer Actions */}
                    <View style={styles.footer}>
                        <Pressable style={[styles.btn, styles.btnCancel]} onPress={onClose}>
                            <Text style={styles.btnTextCancel}>Cancel</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.btn, styles.btnSave, cropping && styles.btnDisabled]}
                            onPress={handleSave}
                            disabled={cropping}
                        >
                            {cropping ? (
                                <ActivityIndicator color="#FFF" size="small" />
                            ) : (
                                <>
                                    <Check size={18} color="#FFF" style={{ marginRight: 6 }} />
                                    <Text style={styles.btnTextSave}>Save Photo</Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardContainer: {
        width: SCREEN_WIDTH - 32,
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        padding: 20,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 15,
        elevation: 15,
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    closeIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropWindowWrap: {
        width: CONTAINER_SIZE,
        height: CONTAINER_SIZE,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    loaderBox: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cropContainer: {
        width: CONTAINER_SIZE,
        height: CONTAINER_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    maskContainer: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'column',
    },
    maskRow: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
    },
    maskMiddleRow: {
        height: CROP_SIZE,
        flexDirection: 'row',
    },
    maskSide: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
    },
    cropCircleOutline: {
        width: CROP_SIZE,
        height: CROP_SIZE,
        borderRadius: CROP_SIZE / 2,
        borderWidth: 3,
        borderColor: '#6366F1',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
    },
    dragHint: {
        position: 'absolute',
        bottom: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    hintText: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
        marginTop: 12,
        marginBottom: 8,
    },
    sliderSection: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 6,
        marginVertical: 8,
    },
    sliderTrackWrap: {
        flex: 1,
        marginHorizontal: 12,
        height: 40,
        justifyContent: 'center',
        position: 'relative',
    },
    sliderTrackLine: {
        height: 4,
        borderRadius: 2,
        backgroundColor: '#E2E8F0',
        position: 'absolute',
        left: 0,
        right: 0,
        top: 18,
    },
    scaleButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    scaleStepDot: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    scaleStepDotActive: {
        backgroundColor: '#6366F1',
        borderColor: '#6366F1',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    scaleStepText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#64748B',
    },
    scaleStepTextActive: {
        color: '#FFFFFF',
    },
    footer: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 16,
    },
    btn: {
        flex: 1,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    btnCancel: {
        backgroundColor: '#F1F5F9',
    },
    btnTextCancel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#64748B',
    },
    btnSave: {
        backgroundColor: '#6366F1',
    },
    btnTextSave: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    btnDisabled: {
        opacity: 0.6,
    },
});
