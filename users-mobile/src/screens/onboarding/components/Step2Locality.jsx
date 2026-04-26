import React from 'react';
import { View, Text, Pressable, Animated, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Navigation, CheckCircle2, ChevronRight } from 'lucide-react-native';
import { useFormContext } from 'react-hook-form';
import { styles } from './SignupStyles';

const Step2Locality = ({
    staggerAnims,
    detectingLocation, handleDetectLocation,
    loadingCities, setCityModalVisible,
    locationAddress,
    signupLoading, handleStep2Continue
}) => {
    const { formState: { errors } } = useFormContext();

    return (
        <View style={styles.centerStepEnhanced}>
            <Animated.View style={{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }], alignItems: 'center', width: '100%' }}>
                <Text style={styles.locationTitlePremium}>What's your location?</Text>
                <Text style={styles.locationSubtitlePremium}>We need your location to show you our serviceable hubs.</Text>
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[1], transform: [{ scale: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }], marginVertical: 30, width: '100%', height: 320, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={require('../../../../assets/isometric_city.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </Animated.View>

            <Animated.View style={{ opacity: staggerAnims[2], width: '100%', alignItems: 'center' }}>
                <Pressable style={[styles.locationPrimaryBtn, detectingLocation && { opacity: 0.7 }]} onPress={handleDetectLocation} disabled={detectingLocation}>
                    {detectingLocation
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : (<><MapPin size={20} color="#FFFFFF" strokeWidth={2.5} /><Text style={styles.locationPrimaryBtnText}>Use current location</Text></>)
                    }
                </Pressable>

                <Pressable
                    style={[styles.locationSecondaryBtn, (loadingCities || detectingLocation) && { opacity: 0.7 }]}
                    onPress={() => setCityModalVisible(true)}
                    disabled={loadingCities || detectingLocation}
                >
                    <Navigation size={18} color="#3B5BDB" style={{ marginRight: 8 }} />
                    <Text style={styles.locationSecondaryBtnText}>{loadingCities ? 'Loading cities...' : 'Select city manually'}</Text>
                </Pressable>

                {locationAddress ? (
                    <View style={styles.locationSuccessToast}>
                        <CheckCircle2 size={16} color="#22C55E" />
                        <Text style={styles.locationSuccessText}>{locationAddress}</Text>
                    </View>
                ) : null}

                {(errors.city || errors.location) ? (
                    <Text style={styles.locationErrorText}>{errors.city?.message || errors.location?.message}</Text>
                ) : null}
            </Animated.View>

            {locationAddress ? (
                <Animated.View style={{ opacity: staggerAnims[3], width: '100%', marginTop: 20 }}>
                    <Pressable style={[styles.primaryBtnEnhanced, signupLoading && { opacity: 0.5 }]} onPress={handleStep2Continue} disabled={signupLoading}>
                        <LinearGradient
                            colors={['#6366F1', '#4F46E5']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.primaryBtnGradientEnhanced}
                        >
                            {signupLoading
                                ? <ActivityIndicator size="small" color="#FFFFFF" />
                                : (<><Text style={styles.primaryBtnText}>Continue to Plans</Text><ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} /></>)
                            }
                        </LinearGradient>
                    </Pressable>
                </Animated.View>
            ) : null}
        </View>
    );
};

export default React.memo(Step2Locality);
