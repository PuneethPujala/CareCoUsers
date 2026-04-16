import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';
import { apiService } from '../../lib/api';

const getNotifIcon = (type) => {
    switch(type) {
        case 'call_overdue': return '🚨';
        case 'medication_alert': return '💊';
        case 'escalation_alert': return '⚠️';
        case 'patient_reassigned': return '🔄';
        case 'weekly_summary': return '📊';
        case 'low_adherence_alert': return '📉';
        case 'system_announcement': return '🆕';
        default: return '🔔';
    }
};

const isToday = (dateString) => {
    if (!dateString) return false;
    const today = new Date();
    const date = new Date(dateString);
    return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
};

const formatTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function NotificationsScreen({ navigation }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchNotifications = useCallback(async (isRefresh = false) => {
        try {
            if (!isRefresh) setLoading(true);
            const res = await apiService.notifications.getAll({ limit: 50 });
            setNotifications(res.data?.data || []);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchNotifications(true);
    };

    const handleMarkRead = async (id, isCurrentlyRead) => {
        if (isCurrentlyRead) return; // already read

        // Optimistic UI update
        setNotifications(prev => prev.map(n => n._id === id || n.id === id ? { ...n, isRead: true } : n));

        try {
            await apiService.notifications.markRead(id);
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
            // Revert on failure
            fetchNotifications(false);
        }
    };

    const handleMarkAllRead = async () => {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        try {
            await apiService.notifications.markAllRead();
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    // Grouping
    const todayNotifs = notifications.filter(n => isToday(n.createdAt));
    const earlierNotifs = notifications.filter(n => !isToday(n.createdAt));

    const renderGroup = (title, items) => (
        <View style={{ marginBottom: 16 }}>
            <Text style={s.groupTitle}>{title}</Text>
            <PremiumCard style={{ padding: 0 }}>
                {items.map((n, i) => {
                    const id = n._id || n.id;
                    const read = n.isRead || n.read;
                    return (
                        <React.Fragment key={id}>
                            {i > 0 && <View style={s.divider} />}
                            <TouchableOpacity style={[s.notifRow, !read && s.notifUnread]} onPress={() => handleMarkRead(id, read)} activeOpacity={0.7}>
                                <View style={[s.notifIcon, !read && s.notifIconUnread]}>
                                    <Text style={{ fontSize: 20 }}>{getNotifIcon(n.type)}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.notifTitle, !read && s.notifTitleBold]}>{n.title}</Text>
                                    <Text style={s.notifBody} numberOfLines={2}>{n.body}</Text>
                                    <Text style={s.notifTime}>{isToday(n.createdAt) ? formatTime(n.createdAt) : `${formatDate(n.createdAt)}, ${formatTime(n.createdAt)}`}</Text>
                                </View>
                                {!read && <View style={s.unreadDot} />}
                            </TouchableOpacity>
                        </React.Fragment>
                    );
                })}
            </PremiumCard>
        </View>
    );

    return (
        <View style={s.container}>
            <GradientHeader 
                title="Notifications" 
                onBack={() => navigation.goBack()} 
                rightAction={
                    notifications.some(n => !n.isRead) ? (
                        <TouchableOpacity 
                            style={{ 
                                width: 40, height: 40, 
                                borderRadius: 20, 
                                backgroundColor: 'rgba(255,255,255,0.7)', 
                                justifyContent: 'center', 
                                alignItems: 'center' 
                            }} 
                            onPress={handleMarkAllRead}
                        >
                            <Text style={{ fontSize: 18, color: Colors.primary }}>✓✓</Text>
                        </TouchableOpacity>
                    ) : null
                }
            />

            <ScrollView 
                style={s.body} 
                contentContainerStyle={{ paddingBottom: 32 }} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
            >
                {loading && !refreshing ? (
                    <View style={{ marginTop: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text style={{ color: Colors.textMuted, marginTop: 12 }}>Loading notifications...</Text>
                    </View>
                ) : notifications.length === 0 ? (
                    <View style={{ marginTop: 60, alignItems: 'center' }}>
                        <Text style={{ fontSize: 40, marginBottom: 16 }}>📭</Text>
                        <Text style={{ ...Typography.bodyLarge, color: Colors.textSecondary }}>No notifications yet</Text>
                    </View>
                ) : (
                    <View>
                        {todayNotifs.length > 0 && renderGroup('Today', todayNotifs)}
                        {earlierNotifs.length > 0 && renderGroup('Earlier', earlierNotifs)}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    body: { flex: 1, paddingHorizontal: Spacing.md },
    groupTitle: { ...Typography.captionBold, color: Colors.textMuted, marginTop: Spacing.lg, marginBottom: Spacing.md, paddingHorizontal: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
    divider: { height: 1, backgroundColor: Colors.borderLight },
    notifRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
    notifUnread: { backgroundColor: Colors.surfaceAlt },
    notifIcon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
    notifIconUnread: { backgroundColor: Colors.infoLight },
    notifTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, fontSize: 14 },
    notifTitleBold: { fontWeight: '700' },
    notifBody: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
    notifTime: { ...Typography.tiny, color: Colors.textMuted, marginTop: Spacing.xs },
    unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginTop: 6 },
});
