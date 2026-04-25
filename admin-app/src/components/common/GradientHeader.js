import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, Modal, TextInput, Alert, ActivityIndicator, Dimensions, LogBox } from 'react-native';
import { Feather } from '@expo/vector-icons';

LogBox.ignoreLogs(['The Geocoding API has been removed in SDK 49', 'use Place Autocomplete service']);
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Theme } from '../../theme/theme';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../lib/api';

export default function GradientHeader({
    title, subtitle, onBack,
    rightAction, children,
    barStyle = 'dark-content',
}) {
    const navigation = useNavigation();
    const { user, profile } = useAuth();

    const [greeting, setGreeting] = useState('Good Morning,');
    const [currentDate, setCurrentDate] = useState('');
    const [locationText, setLocationText] = useState('Fetching location...');
    const [locationLoading, setLocationLoading] = useState(true);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [manualAddress, setManualAddress] = useState('');
    const [savingAddress, setSavingAddress] = useState(false);

    useEffect(() => {
        const now = new Date();
        const hour = now.getHours();
        if (hour < 12) setGreeting('Good Morning,');
        else if (hour < 17) setGreeting('Good Afternoon,');
        else setGreeting('Good Evening,');

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        setCurrentDate(`${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`);
    }, []);

    // Fetch real-time location on mount
    useEffect(() => {
        // If profile already has a stored address, show it first
        if (profile?.address?.formattedAddress) {
            setLocationText(profile.address.formattedAddress);
            setLocationLoading(false);
        } else if (profile?.address?.city) {
            setLocationText(`${profile.address.city}${profile.address.state ? ', ' + profile.address.state : ''}`);
            setLocationLoading(false);
        } else {
            fetchCurrentLocation();
        }
    }, [profile?.address]);

    const fetchCurrentLocation = async () => {
        try {
            setLocationLoading(true);
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLocationText(profile?.address?.formattedAddress || 'Location unavailable');
                setLocationLoading(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const [geocode] = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            });

            if (geocode) {
                const parts = [];
                if (geocode.subregion || geocode.district) parts.push(geocode.subregion || geocode.district);
                if (geocode.city) parts.push(geocode.city);
                const displayLocation = parts.length > 0 ? parts.join(', ') : (geocode.region || 'Unknown location');
                setLocationText(displayLocation);

                // Auto-save coordinates to profile (fire-and-forget)
                if (profile?._id || profile?.id) {
                    const profileId = profile._id || profile.id;
                    apiService.profiles.update(profileId, {
                        address: {
                            ...(profile?.address || {}),
                            city: geocode.city || '',
                            state: geocode.region || '',
                            country: geocode.country || '',
                            postalCode: geocode.postalCode || '',
                            coordinates: {
                                lat: location.coords.latitude,
                                lng: location.coords.longitude,
                            },
                            formattedAddress: displayLocation,
                        }
                    }).catch(err => console.warn('Auto-save location failed:', err.message));
                }
            }
        } catch (error) {
            console.warn('Location fetch failed:', error.message);
            if (!profile?.address?.formattedAddress) {
                setLocationText('Tap to set location');
            }
        } finally {
            setLocationLoading(false);
        }
    };

    const handleSaveManualAddress = async () => {
        if (!manualAddress.trim()) {
            Alert.alert('Error', 'Please enter an address');
            return;
        }

        try {
            setSavingAddress(true);
            const profileId = profile?._id || profile?.id;
            if (!profileId) {
                Alert.alert('Error', 'Profile not found');
                return;
            }

            let coordinates = profile?.address?.coordinates || {};

            await apiService.profiles.update(profileId, {
                address: {
                    ...(profile?.address || {}),
                    formattedAddress: manualAddress.trim(),
                    coordinates,
                }
            });

            setLocationText(manualAddress.trim());
            setShowLocationModal(false);
            setManualAddress('');
            Alert.alert('Success', 'Address saved successfully');
        } catch (error) {
            console.error('Save address failed:', error);
            Alert.alert('Error', 'Failed to save address. Please try again.');
        } finally {
            setSavingAddress(false);
        }
    };

    const fullName = profile?.fullName || user?.user_metadata?.full_name || 'Admin User';
    const firstName = fullName.split(' ')[0];
    const initial = firstName.charAt(0).toUpperCase();
    const isDashboard = !onBack;

    // Premium Floating Graphic (Dashboard Only)
    const DecorativeCircle = () => isDashboard ? (
        <View style={{
            position: 'absolute', top: -50, right: -30, width: 140, height: 140, 
            borderRadius: 70, backgroundColor: 'rgba(99, 102, 241, 0.05)', zIndex: -1 
        }} />
    ) : null;

    // Status bar height for Android (SafeAreaView may not work in Expo Go on all devices)
    const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 44) : 0;

    return (
        <View style={styles.container}>
            <StatusBar barStyle={barStyle} backgroundColor="transparent" translucent />
            {/* Explicit spacer for status bar — guarantees breathing room on Android */}
            <View style={{ height: STATUSBAR_HEIGHT }} />
            
            <DecorativeCircle />
            {/* ─── Top action row ─── */}
            <View style={styles.topRow}>
                {isDashboard ? (
                    <TouchableOpacity 
                        style={styles.locationRow} 
                        activeOpacity={0.7}
                        onPress={() => setShowLocationModal(true)}
                    >
                        <Feather name="map-pin" size={13} color="#6366F1" />
                        {locationLoading ? (
                            <ActivityIndicator size="small" color="#6366F1" style={{ marginLeft: 5 }} />
                        ) : (
                            <Text style={styles.locationText} numberOfLines={1}>{locationText}</Text>
                        )}
                        <Feather name="chevron-down" size={12} color="#6366F1" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
                        <Feather name="arrow-left" size={20} color="#0F172A" />
                    </TouchableOpacity>
                )}

                <View style={{ flex: 1 }} />

                {isDashboard ? (
                    <View style={styles.actionsRow}>
                        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => navigation.navigate('Notifications')}>
                            <Feather name="bell" size={18} color="#0F172A" />
                            <View style={styles.notifDot} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.avatarBtn} activeOpacity={0.7} onPress={() => navigation.navigate('Profile')}>
                            <LinearGradient colors={Theme.colors.accents.primary} style={styles.avatarGrad}>
                                <Text style={styles.avatarText}>{initial}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                ) : (
                    rightAction || null
                )}
            </View>

            {/* ─── Title area ─── */}
            {isDashboard ? (
                <View style={styles.dashTitleArea}>
                    <Text style={styles.greetingText}>{greeting}</Text>
                    <Text style={styles.nameText}>{firstName}</Text>
                    <Text style={styles.dateText}>{currentDate}</Text>
                </View>
            ) : (
                <View style={styles.subTitleArea}>
                    {subtitle && <Text style={styles.subPageSubtitle}>{subtitle}</Text>}
                    <Text style={styles.subPageTitle}>{title}</Text>
                </View>
            )}

            {children}

            {/* ─── Location Modal ─── */}
            <Modal
                visible={showLocationModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowLocationModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, Theme.typography.common]}>Set Your Location</Text>
                            <TouchableOpacity onPress={() => setShowLocationModal(false)} activeOpacity={0.7}>
                                <Feather name="x" size={22} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        {/* Current location button */}
                        <TouchableOpacity 
                            style={styles.currentLocationBtn} 
                            activeOpacity={0.8}
                            onPress={() => {
                                setShowLocationModal(false);
                                fetchCurrentLocation();
                            }}
                        >
                            <View style={styles.currentLocIcon}>
                                <Feather name="navigation" size={18} color="#6366F1" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.currentLocTitle, Theme.typography.common]}>Use Current Location</Text>
                                <Text style={[styles.currentLocSubtext, Theme.typography.common]}>Auto-detect via GPS</Text>
                            </View>
                            <Feather name="chevron-right" size={18} color="#94A3B8" />
                        </TouchableOpacity>

                        <View style={styles.dividerRow}>
                            <View style={styles.dividerLine} />
                            <Text style={[styles.dividerText, Theme.typography.common]}>OR</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        {/* Manual entry */}
                        <Text style={[styles.inputLabel, Theme.typography.common]}>Enter Address Manually</Text>
                        <TextInput
                            style={[styles.addressInput, Theme.typography.common]}
                            placeholder="e.g. 123 Main St, City, State"
                            placeholderTextColor="#94A3B8"
                            value={manualAddress}
                            onChangeText={setManualAddress}
                            multiline
                            numberOfLines={2}
                        />

                        <TouchableOpacity 
                            style={[styles.saveBtn, savingAddress && styles.saveBtnDisabled]} 
                            activeOpacity={0.8}
                            onPress={handleSaveManualAddress}
                            disabled={savingAddress}
                        >
                            {savingAddress ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Text style={[styles.saveBtnText, Theme.typography.common]}>Save Address</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: '#F8FAFC',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        zIndex: 10,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        marginBottom: 16,
    },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '55%' },
    locationText: { color: '#6366F1', fontSize: 13, fontWeight: '700', letterSpacing: 0.2, flexShrink: 1 },
    backBtn: {
        width: 38, height: 38, borderRadius: 12,
        backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Theme.shadows.sharp,
    },
    actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#F1F5F9',
        ...Theme.shadows.sharp,
    },
    notifDot: {
        position: 'absolute', top: 10, right: 12, width: 7, height: 7, borderRadius: 3.5,
        backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#FFFFFF',
    },
    avatarBtn: { width: 40, height: 40, borderRadius: 12, overflow: 'hidden' },
    avatarGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
    dashTitleArea: { paddingLeft: 2, paddingBottom: 8 },
    greetingText: { fontSize: 14, fontWeight: '600', color: '#64748B', marginBottom: 4 },
    nameText: { fontSize: 28, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5, marginBottom: 4 },
    dateText: { fontSize: 12, fontWeight: '700', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase' },
    subTitleArea: { paddingLeft: 2, paddingBottom: 8 },
    subPageSubtitle: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
    subPageTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', letterSpacing: -0.3 },

    // ─── Location Modal ───
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.3,
    },
    currentLocationBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        padding: 16,
        borderRadius: 16,
        gap: 12,
    },
    currentLocIcon: {
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: '#EEF2FF',
        alignItems: 'center', justifyContent: 'center',
    },
    currentLocTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 2,
    },
    currentLocSubtext: {
        fontSize: 12,
        fontWeight: '500',
        color: '#64748B',
    },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
        gap: 12,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#E2E8F0',
    },
    dividerText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#94A3B8',
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#475569',
        marginBottom: 8,
    },
    addressInput: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        color: '#0F172A',
        fontWeight: '500',
        minHeight: 60,
        textAlignVertical: 'top',
        marginBottom: 16,
    },
    saveBtn: {
        backgroundColor: '#6366F1',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveBtnDisabled: {
        opacity: 0.6,
    },
    saveBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
});
