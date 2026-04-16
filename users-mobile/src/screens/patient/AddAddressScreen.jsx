import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable, ScrollView,
    Platform, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView
} from 'react-native';
import {
    ChevronLeft, Search, MapPin, Navigation,
    Home, Briefcase, Users, Heart, Hash, Building2, Map, Check
} from 'lucide-react-native';
import { colors } from '../../theme';
import { apiService } from '../../lib/api';

const LABELS = [
    { id: 'Home', icon: Home, color: '#3B86FF', label: 'Home' },
    { id: 'Office', icon: Briefcase, color: '#F59E0B', label: 'Office' },
    { id: 'Family', icon: Users, color: '#10B981', label: 'Family' },
    { id: 'Other', icon: Heart, color: '#EC4899', label: 'Other' },
];

export default function AddAddressScreen({ navigation, route }) {
    const editAddress = route.params?.address;
    const isEditing = !!editAddress;

    const [selectedLabel, setSelectedLabel] = useState(editAddress?.label || 'Home');
    const [saving, setSaving] = useState(false);

    // Address fields
    const [flatNo, setFlatNo] = useState(editAddress?.flat_no || '');
    const [street, setStreet] = useState(editAddress?.street || '');
    const [pincode, setPincode] = useState(editAddress?.postcode || '');

    // Location search
    const [searchQuery, setSearchQuery] = useState(editAddress?.address_line || '');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState(editAddress ? {
        name: editAddress.title,
        display_name: editAddress.address_line,
        city: editAddress.city,
        state: editAddress.state,
        pincode: editAddress.postcode,
        lat: editAddress.lat,
        lon: editAddress.lon
    } : null);

    // Search locality
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const q = searchQuery.trim();
            if (q.length > 2 && q !== selectedPlace?.display_name && !/^\d{6}$/.test(q)) {
                doSearch(q);
            } else {
                setResults([]);
            }
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    // Auto-fetch on pincode
    useEffect(() => {
        if (pincode.length === 6 && /^\d{6}$/.test(pincode) && pincode !== selectedPlace?.pincode) {
            doSearch(pincode, true);
        }
    }, [pincode]);

    const doSearch = async (query, autoSelect = false) => {
        try {
            setSearching(true);
            const res = await apiService.patients.searchLocation(query);
            const found = res.data.results || [];
            if (autoSelect && found.length > 0) {
                handleSelectPlace(found[0]);
            } else {
                setResults(found);
            }
        } catch (err) {
            console.warn('Search failed:', err.message);
        } finally {
            setSearching(false);
        }
    };

    const handleSelectPlace = (place) => {
        setSelectedPlace(place);
        setSearchQuery(place.display_name);
        if (place.pincode && !pincode) setPincode(place.pincode);
        setResults([]);
    };

    const handleSave = async () => {
        if (!selectedPlace) {
            Alert.alert('Location Required', 'Please enter a Pincode or search for an area.');
            return;
        }
        try {
            setSaving(true);
            const data = {
                label: selectedLabel,
                title: selectedPlace.name,
                address_line: selectedPlace.display_name,
                flat_no: flatNo,
                street,
                city: selectedPlace.city,
                state: selectedPlace.state,
                postcode: pincode || selectedPlace.pincode,
                lat: selectedPlace.lat,
                lon: selectedPlace.lon
            };
            if (isEditing) {
                await apiService.patients.updateSavedAddress(editAddress._id, data);
            } else {
                await apiService.patients.addSavedAddress(data);
            }
            navigation.goBack();
        } catch (err) {
            Alert.alert('Error', `Failed to ${isEditing ? 'update' : 'save'} address.`);
        } finally {
            setSaving(false);
        }
    };

    const canSave = !!selectedPlace && !saving;

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <ChevronLeft size={28} color="#1E293B" />
                    </Pressable>
                    <Text style={styles.headerTitle}>{isEditing ? 'Edit Address' : 'Add New Address'}</Text>
                </View>

                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                    {/* ── Step 1: Pincode ──────────────────── */}
                    <View style={styles.stepCard}>
                        <View style={styles.stepHeader}>
                            <View style={[styles.stepBadge, pincode.length === 6 && styles.stepBadgeDone]}>
                                {pincode.length === 6 ? <Check size={14} color="#FFF" /> : <Text style={styles.stepNum}>1</Text>}
                            </View>
                            <Text style={styles.stepTitle}>Enter Pincode</Text>
                        </View>
                        <View style={[styles.inputGroup, pincode.length === 6 && styles.inputGroupActive]}>
                            <Map size={18} color={pincode.length === 6 ? '#3B86FF' : '#94A3B8'} />
                            <TextInput
                                style={[styles.formInput, pincode.length === 6 && { color: '#3B86FF', fontWeight: '700' }]}
                                placeholder="6-digit Pincode"
                                placeholderTextColor="#CBD5E1"
                                value={pincode}
                                onChangeText={setPincode}
                                keyboardType="number-pad"
                                maxLength={6}
                            />
                            {searching && pincode.length === 6 && <ActivityIndicator size="small" color="#3B86FF" />}
                        </View>

                        {/* Show auto-fetched location */}
                        {selectedPlace && (
                            <View style={styles.locationPreview}>
                                <Navigation size={16} color="#3B86FF" />
                                <Text style={styles.locationPreviewText} numberOfLines={1}>
                                    {selectedPlace.name} — {selectedPlace.city}, {selectedPlace.state}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* ── Step 2: Address Details ──────────── */}
                    <View style={styles.stepCard}>
                        <View style={styles.stepHeader}>
                            <View style={[styles.stepBadge, (flatNo || street) && styles.stepBadgeDone]}>
                                {(flatNo || street) ? <Check size={14} color="#FFF" /> : <Text style={styles.stepNum}>2</Text>}
                            </View>
                            <Text style={styles.stepTitle}>Address Details</Text>
                        </View>
                        <View style={styles.inputGroup}>
                            <Hash size={18} color="#64748B" />
                            <TextInput
                                style={styles.formInput}
                                placeholder="Flat / House No. / Floor"
                                placeholderTextColor="#CBD5E1"
                                value={flatNo}
                                onChangeText={setFlatNo}
                            />
                        </View>
                        <View style={[styles.inputGroup, { marginTop: 10 }]}>
                            <Building2 size={18} color="#64748B" />
                            <TextInput
                                style={styles.formInput}
                                placeholder="Street / Landmark / Area"
                                placeholderTextColor="#CBD5E1"
                                value={street}
                                onChangeText={setStreet}
                            />
                        </View>
                    </View>

                    {/* ── Step 3: Locality (optional if pincode was used) ─── */}
                    <View style={styles.stepCard}>
                        <View style={styles.stepHeader}>
                            <View style={[styles.stepBadge, selectedPlace && styles.stepBadgeDone]}>
                                {selectedPlace ? <Check size={14} color="#FFF" /> : <Text style={styles.stepNum}>3</Text>}
                            </View>
                            <Text style={styles.stepTitle}>Search Locality</Text>
                            <Text style={styles.stepOptional}>Optional if pincode entered</Text>
                        </View>
                        <View style={styles.searchBar}>
                            <Search size={18} color="#64748B" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="e.g. Bandra West, Sector 21"
                                placeholderTextColor="#CBD5E1"
                                value={searchQuery}
                                onChangeText={(txt) => { setSearchQuery(txt); if (!/^\d+$/.test(txt)) setSelectedPlace(null); }}
                            />
                            {searching && searchQuery.length > 2 && !/^\d+$/.test(searchQuery) && <ActivityIndicator size="small" color="#3B86FF" />}
                        </View>

                        {results.length > 0 && (
                            <View style={styles.resultsCard}>
                                {results.map((item, idx) => (
                                    <Pressable key={item.id || idx} style={styles.resultItem} onPress={() => handleSelectPlace(item)}>
                                        <MapPin size={16} color="#64748B" style={{ marginRight: 10 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.resultName}>{item.name}</Text>
                                            <Text style={styles.resultAddress} numberOfLines={1}>{item.display_name}</Text>
                                        </View>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* ── Step 4: Label ────────────────────── */}
                    <View style={styles.stepCard}>
                        <View style={styles.stepHeader}>
                            <View style={[styles.stepBadge, styles.stepBadgeDone]}>
                                <Check size={14} color="#FFF" />
                            </View>
                            <Text style={styles.stepTitle}>Save As</Text>
                        </View>
                        <View style={styles.labelGrid}>
                            {LABELS.map((item) => {
                                const Icon = item.icon;
                                const active = selectedLabel === item.id;
                                return (
                                    <Pressable
                                        key={item.id}
                                        onPress={() => setSelectedLabel(item.id)}
                                        style={[styles.labelBtn, active && { backgroundColor: item.color, borderColor: item.color }]}
                                    >
                                        <Icon size={18} color={active ? '#FFF' : item.color} />
                                        <Text style={[styles.labelBtnTxt, active && { color: '#FFF' }]}>{item.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    <Pressable
                        style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                        onPress={handleSave}
                        disabled={!canSave}
                    >
                        {saving ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.saveBtnText}>{isEditing ? 'Update Address' : 'Save Address'}</Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
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
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backBtn: { padding: 8, marginLeft: -8 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginLeft: 8 },
    content: { padding: 20, paddingBottom: 30 },

    // Step Cards
    stepCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
    },
    stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    stepBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    stepBadgeDone: { backgroundColor: '#3B86FF' },
    stepNum: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    stepTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
    stepOptional: { fontSize: 11, color: '#94A3B8', marginLeft: 8, fontWeight: '500' },

    // Inputs
    inputGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        height: 52,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
    },
    inputGroupActive: { borderColor: '#3B86FF', backgroundColor: '#F0F7FF' },
    formInput: { flex: 1, fontSize: 15, color: '#1E293B', fontWeight: '500', marginLeft: 10 },

    // Location Preview
    locationPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: '#F0F7FF',
        borderRadius: 10,
    },
    locationPreviewText: { flex: 1, fontSize: 13, color: '#3B86FF', fontWeight: '600', marginLeft: 8 },

    // Search
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        paddingHorizontal: 14,
        height: 52,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    searchInput: { flex: 1, fontSize: 15, color: '#1E293B', fontWeight: '500', marginLeft: 10 },
    resultsCard: {
        backgroundColor: '#FFF',
        borderRadius: 14,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    resultName: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
    resultAddress: { fontSize: 12, color: '#64748B', marginTop: 1 },

    // Labels
    labelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    labelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#FFF',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
    },
    labelBtnTxt: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: '#64748B' },

    // Footer
    footer: { padding: 20, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    saveBtn: {
        height: 56,
        backgroundColor: '#3B86FF',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#3B86FF',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    saveBtnDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0 },
    saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
});
