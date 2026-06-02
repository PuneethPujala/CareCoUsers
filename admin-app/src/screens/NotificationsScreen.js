import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useNotificationStore } from '../store/useNotificationStore';

export default function NotificationsScreen() {
    const navigation = useNavigation();
    const { notifications, unreadCount, markAllAsRead, clearAll } = useNotificationStore();

    const renderItem = ({ item }) => {
        const isHighUrgency = item.data?.urgency === 'high' || item.data?.urgency === 'critical';
        const dateStr = new Date(item.date).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });

        return (
            <View style={[styles.card, !item.read && styles.cardUnread]}>
                <View style={[styles.iconWrap, { backgroundColor: isHighUrgency ? '#FEE2E2' : '#EEF2FF' }]}>
                    <Feather name={isHighUrgency ? 'alert-circle' : 'bell'} size={18} color={isHighUrgency ? '#EF4444' : '#6366F1'} />
                </View>
                <View style={styles.content}>
                    <Text style={[styles.title, !item.read && styles.textUnread]}>{item.title}</Text>
                    <Text style={styles.body}>{item.body}</Text>
                    <Text style={styles.date}>{dateStr}</Text>
                </View>
                {!item.read && <View style={styles.unreadDot} />}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.root}>
            <StatusBar barStyle="dark-content" />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={20} color="#0F172A" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Notifications</Text>
                    {unreadCount > 0 && <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>}
                </View>
                <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
                    <Text style={styles.clearText}>Clear All</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyWrap}>
                        <Feather name="bell-off" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyTitle}>All caught up!</Text>
                        <Text style={styles.emptySub}>You have no new notifications.</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#FFF' },
    backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    headerSubtitle: { fontSize: 13, color: '#6366F1', fontWeight: '600', marginTop: 2 },
    clearBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F1F5F9', borderRadius: 8 },
    clearText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    listContent: { padding: 16, gap: 12 },
    card: { flexDirection: 'row', backgroundColor: '#FFF', padding: 16, borderRadius: 16, alignItems: 'flex-start' },
    cardUnread: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#EEF2FF' },
    iconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    content: { flex: 1 },
    title: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 4 },
    textUnread: { color: '#0F172A', fontWeight: '800' },
    body: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 8 },
    date: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366F1', marginTop: 6, marginLeft: 8 },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#475569', marginTop: 16, marginBottom: 8 },
    emptySub: { fontSize: 14, color: '#94A3B8' }
});
