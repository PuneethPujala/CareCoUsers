import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Vibration, Dimensions, SafeAreaView, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, X, Snowflake, Trophy, Calendar as CalendarIcon } from 'lucide-react-native';
import usePatientStore from '../../store/usePatientStore';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isToday, startOfWeek, endOfWeek, isSameMonth } from 'date-fns';

const { width } = Dimensions.get('window');

// Theme logic based on streak level
const getThemeColors = (streak) => {
    if (streak >= 14) return ['#2E1065', '#5B21B6', '#8B5CF6']; // Epic Purple
    if (streak >= 3) return ['#450A0A', '#991B1B', '#EF4444']; // Fire Red
    return ['#0F172A', '#1E3A8A', '#3B82F6']; // Starter Blue
};

const StreakDetailsScreen = ({ navigation }) => {
    const patient = usePatientStore((s) => s.patient);
    const gamification = patient?.gamification || { current_streak: 0, longest_streak: 0, available_freezes: 0, history_dates: [] };
    
    // Animations
    const floatAnim = useRef(new Animated.Value(0)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.5)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Intro pop
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true })
        ]).start();

        // Continuous floating
        Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, { toValue: -15, duration: 1500, useNativeDriver: true }),
                Animated.timing(floatAnim, { toValue: 0, duration: 1500, useNativeDriver: true })
            ])
        ).start();

        // Continuous flickering
        Animated.loop(
            Animated.sequence([
                Animated.timing(rotateAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
                Animated.timing(rotateAnim, { toValue: -1, duration: 240, useNativeDriver: true }),
                Animated.timing(rotateAnim, { toValue: 0, duration: 120, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const colors = getThemeColors(gamification.current_streak);

    const handleHapticPress = () => {
        Vibration.vibrate(50);
        navigation.goBack();
    };

    // Calendar generation
    const calendarDays = useMemo(() => {
        const today = new Date();
        const start = startOfWeek(startOfMonth(today));
        const end = endOfWeek(endOfMonth(today));
        return eachDayOfInterval({ start, end });
    }, []);

    const historySet = useMemo(() => {
        return new Set((gamification.history_dates || []).map(d => d.slice(0,10)));
    }, [gamification.history_dates]);

    const renderCalendarDay = (date, idx) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const isStreakDay = historySet.has(dateStr);
        const today = isToday(date);
        const thisMonth = isSameMonth(date, new Date());
        
        let bg = 'rgba(255,255,255,0.05)';
        let border = 'transparent';
        let shadowOpacity = 0;
        if (isStreakDay) {
            bg = '#F97316'; // Dynamic Gamified Orange Orb
            border = '#FED7AA'; // Highlighted rim
            shadowOpacity = 0.6; // Heavy pop shadow
        }
        if (today && !isStreakDay) {
            border = 'rgba(255,255,255,0.5)';
        }

        return (
            <View key={idx} style={[styles.dayCell, { backgroundColor: bg, borderColor: border, opacity: thisMonth ? 1 : 0.3, shadowOpacity }]}>
                {isStreakDay ? (
                    <Flame size={18} color="#FFFFFF" fill="#FFFFFF" />
                ) : (
                    <Text style={styles.dayText}>{format(date, 'd')}</Text>
                )}
            </View>
        );
    };

    return (
        <LinearGradient colors={colors} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <Pressable onPress={handleHapticPress} style={styles.closeBtn}>
                        <X color="#FFF" size={24} />
                    </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    {/* Hero Section */}
                    <View style={styles.heroWrap}>
                        <Animated.View style={{
                            transform: [
                                { translateY: floatAnim },
                                { scale: scaleAnim },
                                { rotate: rotateAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-3deg', '0deg', '3deg'] }) }
                            ]
                        }}>
                            <View style={styles.flameContainer}>
                                <Flame size={140} color="#FDBA74" fill="#EA580C" />
                                <View style={styles.streakNumberWrap}>
                                    <Text style={styles.streakNumber}>{gamification.current_streak}</Text>
                                </View>
                            </View>
                        </Animated.View>
                        <Animated.Text style={[styles.heroTitle, { opacity: fadeAnim }]}>Day Streak!</Animated.Text>
                        <Animated.Text style={[styles.heroSub, { opacity: fadeAnim }]}>
                            {gamification.current_streak > 0 
                                ? "You're on fire. Keep logging vitals and medications to maintain your momentum." 
                                : "Check off today's medication or log a vital to spark your streak!"}
                        </Animated.Text>
                    </View>

                    {/* Stats Row */}
                    <Animated.View style={[styles.statsRow, { opacity: fadeAnim }]}>
                        <View style={styles.glassCard}>
                            <View style={[styles.iconBox, { backgroundColor: 'rgba(250, 204, 21, 0.2)' }]}>
                                <Trophy size={20} color="#FDE047" />
                            </View>
                            <Text style={styles.statLabel}>Historical Best</Text>
                            <Text style={styles.statValue}>{gamification.longest_streak} Days</Text>
                        </View>
                        <View style={styles.glassCard}>
                            <View style={[styles.iconBox, { backgroundColor: 'rgba(56, 189, 248, 0.2)' }]}>
                                <Snowflake size={20} color="#7DD3FC" />
                            </View>
                            <Text style={styles.statLabel}>Streak Freezes</Text>
                            <Text style={styles.statValue}>{gamification.available_freezes} Left</Text>
                        </View>
                    </Animated.View>

                    {/* Interactive Calendar */}
                    <Animated.View style={[styles.calendarCard, { opacity: fadeAnim }]}>
                        <View style={styles.calendarHeader}>
                            <CalendarIcon color="#FFFFFF" size={20} />
                            <Text style={styles.calendarTitle}>{format(new Date(), 'MMMM')} Activity</Text>
                        </View>
                        
                        <View style={styles.weekDaysRow}>
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                <Text key={`wd-${i}`} style={styles.weekDayTxt}>{day}</Text>
                            ))}
                        </View>

                        <View style={styles.calendarGrid}>
                            {calendarDays.map((d, i) => renderCalendarDay(d, i))}
                        </View>
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: 20,
        alignItems: 'flex-end',
    },
    closeBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroWrap: {
        alignItems: 'center',
        marginTop: 20,
    },
    flameContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    streakNumberWrap: {
        position: 'absolute',
        top: '40%',
        alignItems: 'center',
        justifyContent: 'center',
        ...StyleSheet.absoluteFillObject
    },
    streakNumber: {
        color: '#FFFFFF',
        fontSize: 48,
        fontWeight: '900',
        transform: [{ translateY: 20 }], // offset downward to center in the flame body
        textShadowColor: 'rgba(234, 88, 12, 0.8)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
    },
    heroTitle: {
        color: '#FFFFFF',
        fontSize: 36,
        fontWeight: '800',
        marginTop: -10,
        letterSpacing: -1,
    },
    heroSub: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 16,
        textAlign: 'center',
        marginHorizontal: 32,
        marginTop: 12,
        lineHeight: 24,
    },
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        marginTop: 40,
        gap: 16,
    },
    glassCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 24,
        padding: 20,
        alignItems: 'center',
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    statLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '500',
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '800',
        marginTop: 4,
    },
    calendarCard: {
        marginHorizontal: 20,
        marginTop: 24,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 24,
        padding: 20,
    },
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
    },
    calendarTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
    },
    weekDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    weekDayTxt: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '700',
        width: 32,
        textAlign: 'center',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 8,
    },
    dayCell: {
        width: `${100 / 7 - 3}%`,
        aspectRatio: 1,
        borderRadius: 50, // Perfectly circular Orbs!
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        shadowColor: '#EA580C',
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 6,
        elevation: 8,
    },
    dayText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontWeight: '600',
    }
});

export default StreakDetailsScreen;
