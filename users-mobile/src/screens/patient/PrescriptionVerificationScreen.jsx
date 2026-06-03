import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    View, Text, StyleSheet, ScrollView, TextInput, Pressable,
    ActivityIndicator, Image, Dimensions, Animated, KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2, ChevronLeft, Shield, Wand2, X, Plus, Info, UploadCloud } from 'lucide-react-native';
import { apiService } from '../../lib/api';
import AlertManager from '../../utils/AlertManager';

const { width: SW } = Dimensions.get('window');

const ProcessingOverlay = ({ imageUri }) => {
    const pulseAnim = useRef(new Animated.Value(0.4)).current;
    const scanLineAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.timing(scanLineAnim, {
                toValue: 200,
                duration: 2000,
                useNativeDriver: true,
            })
        ).start();
    }, []);

    return (
        <View style={styles.overlayContainer}>
            <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: imageUri }} style={styles.previewImageBlur} blurRadius={4} />
                <View style={styles.imageOverlayDark} />
                <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineAnim }] }]} />
            </View>
            <Animated.View style={{ opacity: pulseAnim, alignItems: 'center', marginTop: 40 }}>
                <Wand2 size={40} color="#6366F1" strokeWidth={1.5} />
                <Text style={styles.analyzingText}>Analyzing Prescription...</Text>
                <Text style={styles.analyzingSub}>Extracting medications, dosages, and schedules securely.</Text>
            </Animated.View>
        </View>
    );
};

export default function PrescriptionVerificationScreen({ navigation, route }) {
    const { imageBase64, imageUri } = route.params;
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const [isAnalyzing, setIsAnalyzing] = useState(true);
    const [medications, setMedications] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const processImage = async () => {
            let success = false;
            try {
                const response = await apiService.patients.extractOCR(imageBase64);
                if (isMounted) {
                    if (response.data?.success && response.data?.data?.medications) {
                        setMedications(response.data.data.medications);
                        success = true;
                    } else {
                        throw new Error('Could not parse medications from image.');
                    }
                }
            } catch (error) {
                if (isMounted) {
                    AlertManager.alert(
                        'Extraction Failed',
                        'We could not cleanly read this prescription. Would you like to proceed and enter the medications manually?',
                        [
                            {
                                text: 'Proceed Manually',
                                onPress: () => {
                                    setMedications([]);
                                    setIsAnalyzing(false);
                                }
                            },
                            {
                                text: 'Cancel',
                                style: 'cancel',
                                onPress: () => navigation.goBack()
                            }
                        ]
                    );
                }
            } finally {
                if (isMounted && success) {
                    setIsAnalyzing(false);
                }
            }
        };

        // Small delay to let the mounting transition finish before freezing UI with base64 post
        setTimeout(() => {
            processImage();
        }, 500);

        return () => { isMounted = false; };
    }, [imageBase64, navigation]);

    const handleFieldChange = (id, field, value) => {
        setMedications(prev => prev.map(m => m.id === id ? { ...m, [field]: value, isEdited: true } : m));
    };

    const removeMedication = (id) => {
        setMedications(prev => prev.filter(m => m.id !== id));
    };

    const addManualMedication = () => {
        setMedications(prev => [...prev, {
            id: Math.random().toString(36).substring(7),
            name: '',
            dosage: '',
            frequency: '',
            duration: '',
            confidence: 1.0, // Manual entries are confident
            isEdited: true
        }]);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Filter out empty ones
            const validMeds = medications.filter(m => m.name && m.name.trim() !== '');
            const medNames = validMeds.map(m => m.name.trim()).join(', ');

            // 1. Upload prescription to database
            const uploadRes = await apiService.patients.uploadPrescription({
                file_base64: imageBase64,
                content_type: 'image/jpeg'
            });

            const uploadedArray = uploadRes.data?.uploaded_prescriptions || [];
            const fileUrl = uploadedArray[uploadedArray.length - 1]?.file_url || '';

            // 2. Submit the modification request
            await apiService.patients.requestMedicationModification({
                description: `Patient uploaded a prescription for review. Medicines: ${medNames || 'none'}`,
                file_url: fileUrl,
                extracted_medicines: validMeds.map(m => ({
                    name: m.name,
                    dosage: m.dosage || '',
                    frequency: m.frequency || '',
                    duration: m.duration || ''
                }))
            });

            // 3. Trigger refresh callback if provided
            if (route.params.onVerifySave) {
                route.params.onVerifySave();
            }
            
            AlertManager.alert(
                'Prescription Saved',
                'Would you like Care Assistant to explain these medicines, what they are for, and any precautions?',
                [
                    { 
                        text: 'Yes, Explain', 
                        onPress: () => {
                            navigation.navigate('Chatbot', { 
                                initialQuery: `I just uploaded a new prescription with: ${validMeds.map(m => m.name).join(', ')}. Please explain what these are for and any precautions in simple terms.` 
                            });
                        }
                    },
                    { 
                        text: 'No, thanks', 
                        style: 'cancel',
                        onPress: () => navigation.goBack()
                    }
                ]
            );
        } catch (error) {
            console.error('Failed to save prescription and request review:', error);
            AlertManager.alert('Error', 'Failed to save medications.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isAnalyzing) {
        return (
            <View style={styles.root}>
                <ProcessingOverlay imageUri={imageUri} />
            </View>
        );
    }

    return (
        <View style={styles.root}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color="#0F172A" />
                </Pressable>
                <View style={styles.headerTextWrap}>
                    <Text style={styles.headerTitle}>Verify Details</Text>
                    <Text style={styles.headerSub}>Please verify extracted medicines</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={{ flex: 1 }}
            >
                <ScrollView 
                    style={styles.scroll} 
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.trustBanner}>
                        <Shield size={20} color="#10B981" />
                        <Text style={styles.trustText}>
                            Review and correct any fields below. Fields with a yellow warning need extra attention.
                        </Text>
                    </View>

                    {/* Prescription Document Preview */}
                    <Text style={styles.sectionTitle}>Prescription Document</Text>
                    {imageUri ? (
                        <View style={styles.imageFrame}>
                            <Image
                                source={{ uri: imageUri }}
                                style={styles.prescriptionImage}
                                resizeMode="contain"
                            />
                        </View>
                    ) : (
                        <View style={styles.noImageFrame}>
                            <Text style={styles.noImageText}>No prescription image provided.</Text>
                        </View>
                    )}

                    {medications.map((med, index) => {
                        const needsConfirmation = med.confidence < 0.7 && !med.isEdited;
                        return (
                            <View key={med.id} style={[styles.medCard, needsConfirmation && styles.medCardWarning]}>
                                <View style={styles.cardHeader}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={styles.medIndex}>#{index + 1}</Text>
                                        {needsConfirmation && (
                                            <View style={styles.warningBadge}>
                                                <AlertCircle size={12} color="#D97706" />
                                                <Text style={styles.warningBadgeText}>Needs confirmation</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Pressable onPress={() => removeMedication(med.id)} style={{ padding: 4 }}>
                                        <X size={18} color="#94A3B8" />
                                    </Pressable>
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Medicine Name</Text>
                                    <TextInput 
                                        style={styles.textInput}
                                        value={med.name}
                                        onChangeText={(val) => handleFieldChange(med.id, 'name', val)}
                                        placeholder="e.g. Metformin"
                                    />
                                </View>

                                <View style={styles.rowInputs}>
                                    <View style={[styles.inputGroup, { flex: 1 }]}>
                                        <Text style={styles.inputLabel}>Dosage</Text>
                                        <TextInput 
                                            style={styles.textInput}
                                            value={med.dosage}
                                            onChangeText={(val) => handleFieldChange(med.id, 'dosage', val)}
                                            placeholder="e.g. 500mg"
                                        />
                                    </View>
                                    <View style={[styles.inputGroup, { flex: 1 }]}>
                                        <Text style={styles.inputLabel}>Frequency</Text>
                                        <TextInput 
                                            style={styles.textInput}
                                            value={med.frequency}
                                            onChangeText={(val) => handleFieldChange(med.id, 'frequency', val)}
                                            placeholder="e.g. Twice Daily"
                                        />
                                    </View>
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Duration</Text>
                                    <TextInput 
                                        style={styles.textInput}
                                        value={med.duration}
                                        onChangeText={(val) => handleFieldChange(med.id, 'duration', val)}
                                        placeholder="e.g. 30 days"
                                    />
                                </View>
                            </View>
                        );
                    })}

                    <Pressable style={styles.addManualBtn} onPress={addManualMedication}>
                        <Plus size={20} color="#6366F1" />
                        <Text style={styles.addManualText}>Add Missing Medicine</Text>
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Bottom Sticky Action */}
            <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <Pressable 
                    style={[styles.saveBtn, medications.length === 0 && styles.saveBtnDisabled]} 
                    disabled={medications.length === 0 || isSaving}
                    onPress={handleSave}
                >
                    <LinearGradient colors={['#6366F1', '#4F46E5']} style={StyleSheet.absoluteFill} />
                    {isSaving ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.saveBtnText}>Save & Confirm</Text>
                    )}
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F8FAFC' },
    
    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingBottom: 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
        zIndex: 10
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTextWrap: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    headerSub: { fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '500' },
    
    scroll: { flex: 1 },
    scrollContent: { padding: 20, gap: 16 },

    trustBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#ECFDF5', padding: 14, borderRadius: 12,
        borderWidth: 1, borderColor: '#A7F3D0'
    },
    trustText: { flex: 1, fontSize: 13, color: '#065F46', lineHeight: 20 },

    medCard: {
        backgroundColor: '#FFF', borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2
    },
    medCardWarning: {
        borderColor: '#FDE68A',
        backgroundColor: '#FFFBEB'
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    medIndex: { fontSize: 13, fontWeight: '800', color: '#64748B' },
    warningBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    warningBadgeText: { fontSize: 11, fontWeight: '700', color: '#D97706' },

    inputGroup: { marginBottom: 12 },
    rowInputs: { flexDirection: 'row', gap: 12 },
    inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, letterSpacing: 0.5 },
    textInput: {
        backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 15, color: '#0F172A', fontWeight: '500',
        borderWidth: 1, borderColor: 'transparent'
    },

    addManualBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#E0E7FF', borderStyle: 'dashed',
        backgroundColor: '#FFF', marginTop: 8
    },
    addManualText: { fontSize: 15, fontWeight: '700', color: '#6366F1' },

    bottomBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: '#FFF', paddingTop: 16, paddingHorizontal: 24,
        borderTopWidth: 1, borderTopColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 10
    },
    saveBtn: {
        height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },

    imageFrame: { width: '100%', height: 260, borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1', overflow: 'hidden', backgroundColor: '#F8FAFC', marginVertical: 8 },
    prescriptionImage: { width: '100%', height: '100%' },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: '#334155', marginTop: 12, letterSpacing: 0.3 },
    noImageFrame: { width: '100%', height: 100, borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
    noImageText: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },

    // Overlay styles
    overlayContainer: { flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
    imagePreviewWrap: {
        width: SW * 0.7, height: SW * 0.9, borderRadius: 20, overflow: 'hidden',
        borderWidth: 2, borderColor: '#334155'
    },
    previewImageBlur: { width: '100%', height: '100%', opacity: 0.6 },
    imageOverlayDark: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.4)' },
    scanLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#6366F1', shadowColor: '#818CF8', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 5 },
    analyzingText: { fontSize: 24, fontWeight: '800', color: '#FFF', marginTop: 24 },
    analyzingSub: { fontSize: 14, color: '#94A3B8', marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 }
});
