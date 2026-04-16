import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { X, Phone, Mail, MapPin, Calendar, Clock, Users, Award } from 'lucide-react-native';
import { apiService } from '../../lib/api';

export default function CallerProfileScreen({ navigation, route }) {
    const { callerId } = route.params || {};
    const [caller, setCaller] = useState(null);
    const [callerHistory, setCallerHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [callerRes, historyRes] = await Promise.all([
                    apiService.callers.getPatientProfile(callerId),
                    apiService.patients.getMyCalls({ caller_id: callerId }),
                ]);
                setCaller(callerRes.data.caller);
                setCallerHistory(historyRes.data.calls || []);
            } catch (err) {
                console.warn('Failed to load caller profile:', err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [callerId]);

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const isYesterday = d.toDateString() === new Date(now - 86400000).toDateString();
        const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        if (isToday) return `Today, ${time}`;
        if (isYesterday) return `Yesterday, ${time}`;
        return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const formatDuration = (seconds) => {
        if (!seconds || seconds === 0) return null;
        return `${Math.floor(seconds / 60)} min`;
    };

    const makeCall = () => {
        if (caller?.phone) {
            // For now, just open phone dialer
            // In future, this could log the call in backend
            navigation.navigate('MyCaller');
        }
    };

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#2563EB" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <X size={20} color="#64748B" strokeWidth={2} />
                </Pressable>
                <Text style={styles.headerTitle}>Caller Profile</Text>
            </View>

            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                {caller ? (
                    <>
                        {/* Profile Card */}
                        <View style={styles.profileCard}>
                            {/* Avatar */}
                            <View style={styles.avatarSection}>
                                <View style={styles.avatarLarge}>
                                    <Text style={styles.avatarLargeText}>{caller.name?.charAt(0)}</Text>
                                </View>
                                <View style={styles.onlineIndicator} />
                            </View>

                            {/* Info */}
                            <View style={styles.infoSection}>
                                <Text style={styles.callerName}>{caller.name}</Text>
                                <Text style={styles.callerId}>ID: {caller.employee_id}</Text>
                                <Text style={styles.callerTitle}>{caller.specialization || 'Senior Care Companion'}</Text>
                                <Text style={styles.experience}>{caller.experience_years} years experience</Text>
                                
                                <View style={styles.statsRow}>
                                    <View style={styles.statItem}>
                                        <Users size={20} color="#2563EB" />
                                        <Text style={styles.statValue}>{caller.languages_spoken?.length || 1}</Text>
                                        <Text style={styles.statLabel}>Languages</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Calendar size={20} color="#2563EB" />
                                        <Text style={styles.statValue}>{caller.total_calls || 0}</Text>
                                        <Text style={styles.statLabel}>Total Calls</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Award size={20} color="#2563EB" />
                                        <Text style={styles.statValue}>{caller.rating || '4.8'}</Text>
                                        <Text style={styles.statLabel}>Rating</Text>
                                    </View>
                                </View>

                                <View style={styles.contactRow}>
                                    <View style={styles.contactItem}>
                                        <Phone size={16} color="#64748B" />
                                        <Text style={styles.contactText}>{caller.phone}</Text>
                                    </View>
                                    <View style={styles.contactItem}>
                                        <Mail size={16} color="#64748B" />
                                        <Text style={styles.contactText}>{caller.email}</Text>
                                    </View>
                                </View>

                                <View style={styles.bioSection}>
                                    <Text style={styles.bioLabel}>About</Text>
                                    <Text style={styles.bioText}>{caller.bio || 'Dedicated healthcare professional providing compassionate care and support to patients.'}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Action Button */}
                        <View style={styles.actionSection}>
                            <Pressable style={styles.callBtn} onPress={makeCall}>
                                <Phone size={18} color="#FFFFFF" strokeWidth={2} />
                                <Text style={styles.callBtnText}>Call Now</Text>
                            </Pressable>
                        </View>

                        {/* Call History */}
                        <View style={styles.historySection}>
                            <Text style={styles.sectionTitle}>Call History</Text>
                            {callerHistory.map((call, index) => (
                                <View key={call._id} style={styles.historyItem}>
                                    <View style={styles.historyHeader}>
                                        <Text style={styles.historyDate}>{formatDate(call.call_date)}</Text>
                                        <Text style={styles.historyDuration}>{formatDuration(call.call_duration_seconds)}</Text>
                                    </View>
                                    <Text style={styles.historyNote}>{call.ai_summary || 'Routine check-in call.'}</Text>
                                </View>
                            ))}
                            {callerHistory.length === 0 && (
                                <Text style={styles.emptyText}>No call history available.</Text>
                            )}
                        </View>
                    </>
                ) : (
                    <Text style={styles.errorText}>Caller not found.</Text>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },

    // Body
    body: {
        flex: 1,
        paddingHorizontal: 20,
    },

    // Profile Card
    profileCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        marginBottom: 20,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },

    // Avatar Section
    avatarSection: {
        alignItems: 'center',
        marginBottom: 20,
    },
    avatarLarge: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    avatarLargeText: {
        fontSize: 32,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#22C55E',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },

    // Info Section
    infoSection: {
        marginBottom: 24,
    },
    callerName: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1E293B',
        textAlign: 'center',
        marginBottom: 8,
    },
    callerId: {
        fontSize: 16,
        fontWeight: '600',
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 4,
    },
    callerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#2563EB',
        textAlign: 'center',
        marginBottom: 16,
    },
    experience: {
        fontSize: 16,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 20,
    },

    // Stats Row
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#2563EB',
        marginTop: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },

    // Contact Row
    contactRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
    },
    contactItem: {
        alignItems: 'center',
    },
    contactText: {
        fontSize: 14,
        color: '#64748B',
        marginTop: 4,
    },

    // Bio Section
    bioSection: {
        marginBottom: 20,
    },
    bioLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E293B',
        marginBottom: 8,
    },
    bioText: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 20,
    },

    // Action Button
    actionSection: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    callBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        borderRadius: 25,
        paddingVertical: 16,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    callBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
        marginLeft: 8,
    },

    // History Section
    historySection: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 16,
    },
    historyItem: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 3,
        borderLeftColor: '#2563EB',
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    historyDate: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E293B',
    },
    historyDuration: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2563EB',
    },
    historyNote: {
        fontSize: 14,
        color: '#64748B',
        lineHeight: 18,
    },

    // Empty/Error States
    emptyText: {
        fontSize: 16,
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 20,
    },
    errorText: {
        fontSize: 16,
        color: '#EF4444',
        textAlign: 'center',
        marginTop: 40,
    },
});
