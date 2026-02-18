import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../theme/colors';
import GradientHeader from '../../components/common/GradientHeader';
import PremiumCard from '../../components/common/PremiumCard';

const NOTIFICATIONS = [
    { id: 1, title: 'Call completed', body: 'Your call with Robert Williams was completed successfully.', time: '5 min ago', read: false, icon: '📞' },
    { id: 2, title: 'Missed call alert', body: 'Margaret Chen was unavailable for her scheduled call.', time: '15 min ago', read: false, icon: '⚠️' },
    { id: 3, title: 'New assignment', body: 'James Wilson has been assigned to your patient list.', time: '1 hour ago', read: false, icon: '👤' },
    { id: 4, title: 'Adherence update', body: 'Team adherence rate increased to 88% this week.', time: '3 hours ago', read: true, icon: '📊' },
    { id: 5, title: 'Schedule reminder', body: 'You have 3 calls scheduled for tomorrow.', time: 'Yesterday', read: true, icon: '🔔' },
    { id: 6, title: 'System update', body: 'CareConnect has been updated to v1.1 with new features.', time: '2 days ago', read: true, icon: '🆕' },
];

export default function NotificationsScreen({ navigation }) {
    const [notifications, setNotifications] = useState(NOTIFICATIONS);
const markRead = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

    const today = notifications.filter(n => !n.time.includes('Yesterday') && !n.time.includes('days'));
    const earlier = notifications.filter(n => n.time.includes('Yesterday') || n.time.includes('days'));

    const renderGroup = (title, items) => (
        <View>
            <Text style={s.groupTitle}>{title}</Text>
            <PremiumCard style={{ padding: 0 }}>
                {items.map((n, i) => (
                    <React.Fragment key={n.id}>
                        {i > 0 && <View style={s.divider} />}
                        <TouchableOpacity style={[s.notifRow, !n.read && s.notifUnread]} onPress={() => markRead(n.id)} activeOpacity={0.7}>
                            <View style={[s.notifIcon, !n.read && s.notifIconUnread]}>
                                <Text style={{ fontSize: 20 }}>{n.icon}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[s.notifTitle, !n.read && s.notifTitleBold]}>{n.title}</Text>
                                <Text style={s.notifBody} numberOfLines={2}>{n.body}</Text>
                                <Text style={s.notifTime}>{n.time}</Text>
                            </View>
                            {!n.read && <View style={s.unreadDot} />}
                        </TouchableOpacity>
                    </React.Fragment>
                ))}
            </PremiumCard>
        </View>
    );

    return (
        <View style={s.container}>
            <GradientHeader title="Notifications" onBack={() => navigation.goBack()} />

            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                <View>
                    {today.length > 0 && renderGroup('Today', today)}
                    {earlier.length > 0 && renderGroup('Earlier', earlier)}
                </View>
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
