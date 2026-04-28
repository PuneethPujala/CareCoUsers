import React, { useState, useMemo } from 'react';
import {
    View, Text, Pressable, ActivityIndicator, TextInput,
} from 'react-native';
import { MapPin, Navigation, CheckCircle2, Search, X, ShieldCheck } from 'lucide-react-native';
import { useFormContext } from 'react-hook-form';
import { styles, FONT, C } from './SignupStyles';

const Step2Locality = ({
    detectingLocation, handleDetectLocation,
    loadingCities, availableCities,
    locationAddress,
    signupLoading, handleStep2Continue,
    onCitySelect,
}) => {
    const { formState: { errors }, watch } = useFormContext();
    const selectedCity = watch('city');

    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    const filteredCities = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return availableCities.slice(0, 6);
        return availableCities.filter(c =>
            c.name.toLowerCase().includes(q) || c.state?.toLowerCase().includes(q)
        ).slice(0, 6);
    }, [availableCities, searchQuery]);

    return (
        <View>
            {/* Pill badge */}
            <View style={styles.pillBadge}>
                <View style={styles.pillDot} />
                <Text style={styles.pillBadgeText}>Your location</Text>
            </View>

            {/* Title */}
            <Text style={styles.stepTitleLine1}>Where are</Text>
            <Text style={styles.stepTitleLine2}>you located?</Text>

            {/* Auto-detect button */}
            <Pressable
                style={[styles.locationPrimaryBtn, detectingLocation && { opacity: 0.7 }]}
                onPress={handleDetectLocation}
                disabled={detectingLocation}
            >
                {detectingLocation ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                    <MapPin size={20} color="#FFFFFF" strokeWidth={2.5} />
                )}
                <Text style={styles.locationPrimaryBtnText}>
                    {detectingLocation ? 'Detecting location...' : 'Use my current location'}
                </Text>
            </Pressable>

            {/* Location success toast */}
            {locationAddress ? (
                <View style={styles.locationSuccessToast}>
                    <CheckCircle2 size={18} color={C.success} />
                    <Text style={styles.locationSuccessText}>{locationAddress}</Text>
                    <Pressable onPress={() => {
                        onCitySelect({ name: '', state: '' });
                        setSearchQuery('');
                        setShowSearch(false);
                    }} hitSlop={10}>
                        <X size={16} color={C.success} />
                    </Pressable>
                </View>
            ) : null}

            {/* Divider */}
            <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or select manually</Text>
                <View style={styles.dividerLine} />
            </View>

            {/* City search toggle */}
            {!showSearch ? (
                <Pressable
                    style={[styles.locationSecondaryBtn, {
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: C.surface, borderRadius: 14,
                        borderWidth: 1.5, borderColor: C.border, height: 52,
                        paddingHorizontal: 16, justifyContent: 'center', gap: 10,
                    }]}
                    onPress={() => setShowSearch(true)}
                    disabled={loadingCities || detectingLocation}
                >
                    <Search size={18} color={C.primary} />
                    <Text style={[styles.locationSecondaryBtnText, { color: C.primary }]}>
                        {loadingCities ? 'Loading cities...' : selectedCity ? `Selected: ${selectedCity}` : 'Search & select city'}
                    </Text>
                    {loadingCities && <ActivityIndicator size="small" color={C.muted} />}
                </Pressable>
            ) : (
                <View>
                    {/* Search input */}
                    <View style={[styles.citySearchWrap, { marginBottom: 10 }]}>
                        <Search size={18} color={C.muted} />
                        <TextInput
                            style={[styles.citySearchInput]}
                            placeholder="Search cities..."
                            placeholderTextColor={C.muted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                        />
                        {searchQuery.length > 0 ? (
                            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                                <X size={16} color={C.muted} />
                            </Pressable>
                        ) : (
                            <Pressable onPress={() => setShowSearch(false)} hitSlop={10}>
                                <X size={16} color={C.muted} />
                            </Pressable>
                        )}
                    </View>

                    {/* City list (max 6, no nested scroll) */}
                    {loadingCities ? (
                        <ActivityIndicator size="small" color={C.primary} style={{ marginVertical: 20 }} />
                    ) : filteredCities.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MapPin size={28} color={C.border} />
                            <Text style={styles.emptyTitle}>No cities found</Text>
                            <Text style={styles.emptyDesc}>Try a different search term</Text>
                        </View>
                    ) : filteredCities.map((city) => {
                        const isActive = selectedCity === city.name;
                        return (
                            <Pressable
                                key={city.id || city._id || city.name}
                                style={[styles.cityRow, isActive && styles.cityRowActive]}
                                onPress={() => {
                                    onCitySelect(city);
                                    setShowSearch(false);
                                    setSearchQuery('');
                                }}
                            >
                                <View style={[
                                    { width: 36, height: 36, borderRadius: 10, backgroundColor: isActive ? C.primary : C.bg, alignItems: 'center', justifyContent: 'center' }
                                ]}>
                                    <MapPin size={16} color={isActive ? '#FFFFFF' : C.muted} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[styles.cityName, isActive && { color: C.primary }]}>
                                        {city.name}
                                    </Text>
                                    {city.state ? (
                                        <Text style={[styles.cityState]}>{city.state}</Text>
                                    ) : null}
                                </View>
                                <View style={[styles.radioOutline, isActive && styles.radioActive]}>
                                    {isActive && <View style={styles.radioDot} />}
                                </View>
                            </Pressable>
                        );
                    })}

                    {filteredCities.length === 6 && (
                        <Text style={{ fontSize: 12, ...FONT.medium, color: C.muted, textAlign: 'center', marginTop: 8 }}>
                            Type to search for more cities
                        </Text>
                    )}
                </View>
            )}

            {/* Error */}
            {(errors.city || errors.location) ? (
                <Text style={styles.locationErrorText}>
                    {errors.city?.message || errors.location?.message}
                </Text>
            ) : null}

            {/* Privacy note */}
            <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                marginTop: 20, paddingHorizontal: 4,
            }}>
                <ShieldCheck size={15} color={C.muted} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, ...FONT.medium, color: C.muted, flex: 1, lineHeight: 18 }}>
                    Your location is only used to match you with care services in your area.
                </Text>
            </View>

            {/* Continue button — only shows when city is selected */}
            {locationAddress ? (
                <Pressable
                    style={[styles.primaryBtnEnhanced, { marginTop: 24 }, signupLoading && { opacity: 0.5 }]}
                    onPress={handleStep2Continue}
                    disabled={signupLoading}
                >
                    <View style={styles.primaryBtnGradientEnhanced}>
                        {signupLoading ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 10 }}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>Saving...</Text>
                            </View>
                        ) : (
                            <Text style={[styles.primaryBtnText, { flex: 1, textAlign: 'center' }]}>
                                Continue to Plans
                            </Text>
                        )}
                    </View>
                </Pressable>
            ) : null}
        </View>
    );
};

export default React.memo(Step2Locality);
