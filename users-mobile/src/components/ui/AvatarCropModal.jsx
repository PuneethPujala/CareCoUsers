import React, { useState, useEffect, useRef, useCallback } from 'react';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTAINER_SIZE = SCREEN_WIDTH - 40;
const CROP_SIZE = CONTAINER_SIZE; // Crop circle fills the container

export default function AvatarCropModal({
    visible,
    imageUri,
    onClose,
    onConfirm,
}) {
    const [processedUri, setProcessedUri] = useState(null);
    const [imageDims, setImageDims] = useState(null);
    const [loading, setLoading] = useState(true);
    const [cropping, setCropping] = useState(false);

    // Pan coordinates (offset from center)
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);

    // Scale / Zoom factor (1.0 to 3.0)
    const [scale, setScale] = useState(1);

    // Pan tracking refs
    const lastPanX = useRef(0);
    const lastPanY = useRef(0);

    // Calculate the base display size so the image covers the crop circle.
    // The shorter side of the image maps to CROP_SIZE, ensuring full coverage.
    let baseDisplayWidth = CROP_SIZE;
    let baseDisplayHeight = CROP_SIZE;

    if (imageDims) {
        const { width: iw, height: ih } = imageDims;
        const aspect = iw / ih;
        if (aspect >= 1) {
            // Landscape or square: height fits CROP_SIZE, width stretches
            baseDisplayHeight = CROP_SIZE;
            baseDisplayWidth = CROP_SIZE * aspect;
        } else {
            // Portrait: width fits CROP_SIZE, height stretches
            baseDisplayWidth = CROP_SIZE;
            baseDisplayHeight = CROP_SIZE / aspect;
        }
    }

    // Keep refs of current values to avoid stale closures in PanResponder
    const stateRef = useRef();
    stateRef.current = { scale, baseDisplayWidth, baseDisplayHeight, panX, panY };

    useEffect(() => {
        if (visible && imageUri) {
            setLoading(true);
            setCropping(false);
            setScale(1);
            setPanX(0);
            setPanY(0);
            lastPanX.current = 0;
            lastPanY.current = 0;
            setProcessedUri(null);

            const prepareImage = async () => {
                try {
                    // Normalize image to bake EXIF orientation and compress to 0.9
                    const processed = await ImageManipulator.manipulateAsync(
                        imageUri,
                        [],
                        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    setProcessedUri(processed.uri);
                    setImageDims({
                        width: processed.width,
                        height: processed.height,
                    });
                    setLoading(false);
                } catch (err) {
                    console.error('Failed to normalize image EXIF:', err);
                    // Fallback to original imageUri
                    setProcessedUri(imageUri);
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
            };

            prepareImage();
        }
    }, [visible, imageUri]);

    // Clamp panning so the image always covers the crop circle
    const clampPan = useCallback((currentPanX, currentPanY, currentScale) => {
        const wScaled = baseDisplayWidth * currentScale;
        const hScaled = baseDisplayHeight * currentScale;
        const maxDragX = Math.max(0, (wScaled - CROP_SIZE) / 2);
        const maxDragY = Math.max(0, (hScaled - CROP_SIZE) / 2);
        return {
            x: Math.max(-maxDragX, Math.min(maxDragX, currentPanX)),
            y: Math.max(-maxDragY, Math.min(maxDragY, currentPanY)),
        };
    }, [baseDisplayWidth, baseDisplayHeight]);

    // Re-clamp on scale changes
    useEffect(() => {
        if (!imageDims) return;
        const clamped = clampPan(panX, panY, scale);
        setPanX(clamped.x);
        setPanY(clamped.y);
        lastPanX.current = clamped.x;
        lastPanY.current = clamped.y;
    }, [scale, imageDims]);

    // Pan responder for dragging the image
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gs) =>
                Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
            onPanResponderGrant: () => {},
            onPanResponderMove: (evt, gestureState) => {
                const { scale: s, baseDisplayWidth: bdw, baseDisplayHeight: bdh } = stateRef.current;
                const wScaled = bdw * s;
                const hScaled = bdh * s;

                const maxDragX = Math.max(0, (wScaled - CROP_SIZE) / 2);
                const maxDragY = Math.max(0, (hScaled - CROP_SIZE) / 2);

                const nextX = lastPanX.current + gestureState.dx;
                const nextY = lastPanY.current + gestureState.dy;

                setPanX(Math.max(-maxDragX, Math.min(maxDragX, nextX)));
                setPanY(Math.max(-maxDragY, Math.min(maxDragY, nextY)));
            },
            onPanResponderRelease: () => {
                lastPanX.current = stateRef.current.panX;
                lastPanY.current = stateRef.current.panY;
            },
        })
    ).current;

    if (!visible) return null;

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

            // The actual rendered image size in layout pixels
            const renderedW = baseDisplayWidth * scale;
            const renderedH = baseDisplayHeight * scale;

            // The image center is at the container center + pan offset.
            // Image top-left in container coords:
            const imgLeft = (CONTAINER_SIZE - renderedW) / 2 + panX;
            const imgTop = (CONTAINER_SIZE - renderedH) / 2 + panY;

            // The crop circle is centered in the container:
            const cropLeft = (CONTAINER_SIZE - CROP_SIZE) / 2;
            const cropTop = (CONTAINER_SIZE - CROP_SIZE) / 2;

            // Distance from image top-left to crop region top-left (in layout px)
            const dx = cropLeft - imgLeft;
            const dy = cropTop - imgTop;

            // Ratio from layout pixels -> original image pixels
            const pxPerLayoutX = iw / renderedW;
            const pxPerLayoutY = ih / renderedH;

            // Map to original image coordinates
            const originX = dx * pxPerLayoutX;
            const originY = dy * pxPerLayoutY;
            const cropW = CROP_SIZE * pxPerLayoutX;
            const cropH = CROP_SIZE * pxPerLayoutY;

            // Clamp to valid bounds
            const finalX = Math.max(0, Math.round(originX));
            const finalY = Math.max(0, Math.round(originY));
            const finalW = Math.round(Math.min(cropW, iw - finalX));
            const finalH = Math.round(Math.min(cropH, ih - finalY));

            // Ensure minimum size
            const safeW = Math.max(10, finalW);
            const safeH = Math.max(10, finalH);

            const cropRes = await ImageManipulator.manipulateAsync(
                processedUri || imageUri,
                [
                    {
                        crop: {
                            originX: finalX,
                            originY: finalY,
                            width: safeW,
                            height: safeH,
                        },
                    },
                    {
                        resize: { width: 512, height: 512 },
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

    // Actual scaled image size for rendering
    const renderW = baseDisplayWidth * scale;
    const renderH = baseDisplayHeight * scale;

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
                                    source={{ uri: processedUri || imageUri }}
                                    style={{
                                        width: renderW,
                                        height: renderH,
                                        position: 'absolute',
                                        left: (CONTAINER_SIZE - renderW) / 2 + panX,
                                        top: (CONTAINER_SIZE - renderH) / 2 + panY,
                                    }}
                                    resizeMode="cover"
                                />

                                {/* Semi-transparent mask outside crop circle */}
                                <View style={styles.maskOverlay} pointerEvents="none">
                                    <View style={styles.cropCircleOutline} />
                                </View>

                                {/* Guide indicator */}
                                <View style={styles.dragHint} pointerEvents="none">
                                    <Move size={20} color="rgba(255,255,255,0.7)" />
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Instruction */}
                    <Text style={styles.hintText}>Drag to position. Use sliders to scale.</Text>

                    {/* Zoom Control */}
                    <View style={styles.sliderSection}>
                        <ZoomOut size={16} color="#64748B" />
                        <View style={styles.sliderTrackWrap}>
                            <View style={styles.sliderTrackLine} />
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

                    {/* Footer */}
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
        overflow: 'hidden',
        position: 'relative',
    },
    maskOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        // Dark overlay with a transparent circle cut out via border trick
        backgroundColor: 'transparent',
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
        alignSelf: 'center',
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
