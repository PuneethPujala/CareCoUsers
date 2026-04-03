import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, TextInput, Pressable, ScrollView,
    Platform, SafeAreaView, ActivityIndicator, Animated, TouchableOpacity
} from 'react-native';
import {
    ChevronLeft, Search, Plus, MapPin, ChevronRight, Navigation,
    Home, Briefcase, Users, Pencil, Trash2, X, Heart
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { colors } from '../../theme';
import { apiService } from '../../lib/api';

export default function LocationSearchScreen({ navigation }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [cities, setCities] = useState([]);
    const [filteredCities, setFilteredCities] = useState([]);
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [deletingId, setDeletingId] = useState(null);

    useEffect(() => { loadCities(); }, []);

    useFocusEffect(
        useCallback(() => { loadSavedAddresses(); }, [])
    );

    const loadSavedAddresses = async () => {
        try {
            const res = await apiService.patients.getSavedAddresses();
            setSavedAddresses(res.data.saved_addresses || []);
        } catch (err) {
            console.warn('Failed to load saved addresses:', err.message);
        }
    };

    useEffect(() => {
        let timeoutId;
        if (!searchQuery.trim()) {
            setFilteredCities([]);
        } else if (searchQuery.length > 2) {
            const localResults = cities.filter(city =>
                city.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
            timeoutId = setTimeout(async () => {
                try {
                    setLoading(true);
                    const res = await apiService.patients.searchLocation(searchQuery);
                    const remoteResults = (res.data.results || []).map(r => ({
                        _id: `remote_${r.id}`,
                        name: r.name,
                        display_name: r.display_name,
                        city: r.city,
                        state: r.state,
                        pincode: r.pincode
                    }));
                    const combined = [...localResults];
                    remoteResults.forEach(rem => {
                        if (!combined.some(loc => loc.name.toLowerCase() === rem.name.toLowerCase())) {
                            combined.push(rem);
                        }
                    });
                    setFilteredCities(combined);
                } catch (err) {
                    setFilteredCities(localResults);
                } finally {
                    setLoading(false);
                }
            }, 500);
        }
        return () => clearTimeout(timeoutId);
    }, [searchQuery, cities]);

    const loadCities = async () => {
        try {
            const res = await apiService.patients.getCities();
            setCities(res.data.cities || []);
        } catch (err) {
            console.warn('Failed to load cities:', err.message);
        }
    };

    const handleDetectLocation = async () => {
        try {
            setIsLocating(true);
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;
            const res = await apiService.patients.reverseGeocode(latitude, longitude);
            const city = res.data.address?.city || res.data.address?.town || res.data.address?.village;
            if (city) handleSelectLocation(city);
        } catch (err) {
            console.warn('Location detection failed:', err.message);
        } finally {
            setIsLocating(false);
        }
    };

    const handleSelectLocation = async (city) => {
        try {
            setLoading(true);
            await apiService.auth.updatePatientCity({ city });
            navigation.goBack();
        } catch (err) {
            console.warn('Failed to update city:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEditAddress = (address) => {
        navigation.navigate('AddAddress', { address });
    };

    // ── Direct delete — no Alert.alert (broken on some Android) ────────
    const handleDeleteAddress = async (id) => {
        console.log('Deleting address:', id);
        setDeletingId(id);

        // Optimistic removal
        const backup = [...savedAddresses];
        setSavedAddresses(prev => prev.filter(a => a._id !== id));

        try {
            await apiService.patients.deleteSavedAddress(id);
            console.log('Delete successful');
        } catch (err) {
            console.error('Delete failed:', err?.response?.data || err.message);
            setSavedAddresses(backup);
        } finally {
            setDeletingId(null);
        }
    };

    const getIconForLabel = (label) => {
        switch (label) {
            case 'Home': return <Home size={20} color="#3B86FF" />;
            case 'Office': return <Briefcase size={20} color="#F59E0B" />;
            case 'Family': return <Users size={20} color="#10B981" />;
            default: return <Heart size={20} color="#EC4899" />;
        }
    };

    const getLabelColor = (label) => {
        switch (label) {
            case 'Home': return '#3B86FF';
            case 'Office': return '#F59E0B';
            case 'Family': return '#10B981';
            default: return '#EC4899';
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={28} color="#1E293B" />
                </Pressable>
                <Text style={styles.headerTitle}>Search your location</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Search Bar */}
                <View style={styles.searchSection}>
                    <View style={styles.searchBar}>
                        <Search size={20} color="#3B86FF" style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search locality, sector, area"
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <Pressable onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                                <X size={18} color="#94A3B8" />
                            </Pressable>
                        )}
                        {loading && <ActivityIndicator size="small" color="#3B86FF" style={{ marginLeft: 8 }} />}
                    </View>
                </View>

                {/* Quick Actions */}
                <View style={styles.actionsCard}>
                    <Pressable
                        style={styles.actionRow}
                        onPress={() => navigation.navigate('AddAddress')}
                    >
                        <View style={[styles.actionIconPill, { backgroundColor: '#F0F7FF' }]}>
                            <Plus size={20} color="#3B86FF" />
                        </View>
                        <Text style={styles.actionText}>Add address</Text>
                        <ChevronRight size={20} color="#CBD5E1" />
                    </Pressable>

                    <View style={styles.divider} />

                    <Pressable
                        style={styles.actionRow}
                        onPress={handleDetectLocation}
                        disabled={isLocating}
                    >
                        <View style={[styles.actionIconPill, { backgroundColor: '#EFF6FF' }]}>
                            {isLocating ? (
                                <ActivityIndicator size="small" color="#3B86FF" />
                            ) : (
                                <Navigation size={18} color="#3B86FF" fill="#3B86FF" />
                            )}
                        </View>
                        <Text style={styles.actionText}>
                            {isLocating ? 'Detecting...' : 'Use current location'}
                        </Text>
                        <ChevronRight size={20} color="#CBD5E1" />
                    </Pressable>
                </View>

                {/* Search Results */}
                {searchQuery.length > 2 ? (
                    <>
                        <Text style={styles.sectionTitle}>SEARCH RESULTS</Text>
                        {filteredCities.length > 0 ? (
                            filteredCities.map((item) => (
                                <Pressable
                                    key={item._id}
                                    style={styles.resultItem}
                                    onPress={() => handleSelectLocation(item.city || item.name)}
                                >
                                    <View style={styles.resultIcon}>
                                        <MapPin size={20} color="#3B86FF" />
                                    </View>
                                    <View style={styles.resultInfo}>
                                        <Text style={styles.resultName}>{item.name}</Text>
                                        <Text style={styles.resultAddress} numberOfLines={1}>
                                            {item.display_name || `${item.city || ''}${item.city && item.state ? ', ' : ''}${item.state || ''}`}
                                        </Text>
                                    </View>
                                    <ChevronRight size={18} color="#CBD5E1" />
                                </Pressable>
                            ))
                        ) : !loading ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No places found matching "{searchQuery}"</Text>
                            </View>
                        ) : null}
                    </>
                ) : (
                    <>
                        {/* Saved Addresses */}
                        {savedAddresses.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>SAVED ADDRESSES</Text>
                                {savedAddresses.map((item) => {
                                    const isDeleting = deletingId === item._id;
                                    const labelColor = getLabelColor(item.label);
                                    return (
                                        <View key={item._id} style={[styles.addressCard, isDeleting && { opacity: 0.4 }]}>
                                            <Pressable
                                                style={styles.addressMain}
                                                onPress={() => handleSelectLocation(item.city)}
                                                disabled={isDeleting}
                                            >
                                                <View style={[styles.addressIconBox, { backgroundColor: labelColor + '12' }]}>
                                                    {getIconForLabel(item.label)}
                                                </View>
                                                <View style={styles.addressInfo}>
                                                    <Text style={styles.addressLabel}>{item.label}</Text>
                                                    <Text style={styles.addressText} numberOfLines={1}>
                                                        {item.flat_no ? `${item.flat_no}, ` : ''}{item.street ? `${item.street}, ` : ''}{item.address_line || item.title}
                                                    </Text>
                                                    {item.postcode && (
                                                        <Text style={styles.addressPincode}>{item.postcode}</Text>
                                                    )}
                                                </View>
                                            </Pressable>

                                            <View style={styles.addressActions}>
                                                <TouchableOpacity
                                                    onPress={() => handleEditAddress(item)}
                                                    style={styles.actionBtn}
                                                    activeOpacity={0.5}
                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                >
                                                    <Pencil size={16} color="#64748B" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleDeleteAddress(item._id)}
                                                    style={[styles.actionBtn, styles.deleteBtn]}
                                                    activeOpacity={0.5}
                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                    disabled={isDeleting}
                                                >
                                                    {isDeleting ? (
                                                        <ActivityIndicator size="small" color="#EF4444" />
                                                    ) : (
                                                        <Trash2 size={16} color="#EF4444" />
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })}
                            </>
                        )}
                    </>
                )}
            </ScrollView>

            {loading && !searchQuery && (
                <View style={styles.overlayLoader}>
                    <ActivityIndicator size="large" color="#3B86FF" />
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 40 : 10,
        paddingBottom: 20,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backBtn: { padding: 8, marginLeft: -8 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginLeft: 8 },
    content: { padding: 20, paddingBottom: 40 },

    // Search
    searchSection: { marginBottom: 24 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    searchIcon: { marginRight: 12 },
    searchInput: { flex: 1, fontSize: 16, color: '#1E293B', fontWeight: '500' },

    // Actions Card
    actionsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 3,
        marginBottom: 32,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
    },
    actionIconPill: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    actionText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#3B86FF' },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 18 },

    // Section
    sectionTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 1.5,
        marginBottom: 16,
        marginLeft: 4,
    },

    // Search Results
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    resultIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F0F7FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    resultInfo: { flex: 1 },
    resultName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
    resultAddress: { fontSize: 13, color: '#64748B', marginTop: 2 },

    // Saved Addresses
    addressCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
    },
    addressMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    addressIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    addressInfo: { flex: 1 },
    addressLabel: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 2 },
    addressText: { fontSize: 13, color: '#64748B', fontWeight: '400', lineHeight: 18 },
    addressPincode: { fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '600' },
    addressActions: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 12,
        gap: 6,
    },
    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteBtn: {
        backgroundColor: '#FEF2F2',
    },

    // States
    overlayLoader: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    emptyState: { padding: 40, alignItems: 'center' },
    emptyText: { color: '#94A3B8', fontSize: 16, textAlign: 'center' },
});
