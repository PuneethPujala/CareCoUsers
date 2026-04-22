import React from 'react';
import { View, Text, StyleSheet, FlatList, Platform } from 'react-native';
import { Activity, AlertOctagon, PhoneMissed, MessageSquare } from 'lucide-react-native';
import { colors } from '../../theme';

const FEED = []; // TODO: Wire to API once backend endpoint is ready

export default function ActivityFeedScreen() {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Activity Feed</Text>
            </View>

            {FEED.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <View style={styles.emptyIconBox}>
                        <Activity size={36} color={colors.primary} strokeWidth={1.5} />
                    </View>
                    <Text style={styles.emptyTitle}>No Activity Yet</Text>
                    <Text style={styles.emptyBody}>
                        Missed medications, call alerts, and escalations will appear here as they happen.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={FEED}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => {
                        const { Icon } = item;
                        return (
                            <View style={styles.card}>
                                <View style={[styles.cardAccent, { backgroundColor: item.color }]} />
                                <View style={styles.cardInner}>
                                    <View style={[styles.iconBox, { backgroundColor: item.color + '15' }]}>
                                        <Icon size={18} color={item.color} />
                                    </View>
                                    <View style={styles.cardContent}>
                                        <Text style={styles.titleTxt} numberOfLines={1}>{item.title}</Text>
                                        <Text style={styles.patientTxt} numberOfLines={1}>{item.patient}</Text>
                                        <Text style={styles.bodyTxt} numberOfLines={2}>{item.desc}</Text>
                                        <Text style={styles.timeTxt}>{item.time}</Text>
                                    </View>
                                </View>
                            </View>
                        );
                    }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F7FB' },
    header: {
        backgroundColor: colors.primary,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16, paddingHorizontal: 20,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

    listContent: { padding: 16, paddingBottom: 40 },
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, overflow: 'hidden',
        borderWidth: 1, borderColor: '#E2E8F0',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1,
    },
    cardAccent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
    cardInner: { flexDirection: 'row', padding: 16, paddingLeft: 20 },
    iconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    cardContent: { flex: 1 },
    titleTxt: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
    patientTxt: { fontSize: 13, fontWeight: '600', color: colors.accent, marginTop: 4 },
    bodyTxt: { fontSize: 13, color: '#4A5568', marginTop: 4, lineHeight: 18 },
    timeTxt: { fontSize: 11, color: '#94A3B8', marginTop: 6, fontWeight: '500' },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    emptyIconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
    emptyBody: { fontSize: 14, fontWeight: '500', color: '#94A3B8', textAlign: 'center', lineHeight: 22 },
});
