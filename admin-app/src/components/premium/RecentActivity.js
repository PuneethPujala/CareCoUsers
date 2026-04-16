// admin-app/src/components/premium/RecentActivity.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Theme } from '../../theme/theme';

export default function RecentActivity({ data = [] }) {
  const navigation = useNavigation();
  const activities = (data && data.length > 0) ? data.slice(0, 3) : [];

  const getIcon = (action) => {
    if (action.includes('created')) return 'plus-circle';
    if (action.includes('updated')) return 'edit-2';
    if (action.includes('deleted')) return 'trash-2';
    if (action.includes('login')) return 'unlock';
    return 'activity';
  };

  const getColor = (severity) => {
    switch (severity) {
      case 'warning': return '#EF4444';
      case 'info': return '#3B82F6';
      case 'success': return '#10B981';
      default: return '#6366F1';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, Theme.typography.common]}>System Activity</Text>
        <TouchableOpacity activeOpacity={0.7} style={styles.liveLogsBtn} onPress={() => navigation.navigate('Activity')}>
            <Text style={[styles.viewAll, Theme.typography.common]}>View All</Text>
            <Feather name="chevron-right" size={14} color="#6366F1" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.listContainer}>
        {activities.length === 0 ? (
            <View style={styles.emptyState}>
                <Feather name="inbox" size={32} color="#94A3B8" />
                <Text style={[styles.emptyText, Theme.typography.common]}>No recent events recorded</Text>
            </View>
        ) : (
            activities.map((activity, index) => {
                const icon = getIcon(activity.text.toLowerCase());
                const color = getColor(activity.severity);
                
                return (
                    <View key={activity.id || index} style={styles.activityCard}>
                        <View style={[styles.iconBadge, { backgroundColor: color + '10' }]}>
                            <Feather name={icon} size={20} color={color} />
                        </View>
                        
                        <View style={styles.activityContent}>
                            <Text style={[styles.activityAction, Theme.typography.common]} numberOfLines={1}>
                                {activity.text}
                            </Text>
                            <Text style={[styles.activityTime, Theme.typography.common]}>
                                {activity.time || '10m ago'}
                            </Text>
                        </View>
                        
                        {index < activities.length - 1 && (
                            <View style={styles.connectingLine} />
                        )}
                    </View>
                );
            })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Theme.shadows.card,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  liveLogsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewAll: { fontSize: 13, fontWeight: '700', color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.5 },
  listContainer: { gap: 0 },
  activityCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, position: 'relative' },
  iconBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16, zIndex: 2 },
  activityContent: { flex: 1 },
  activityAction: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 2, letterSpacing: -0.2 },
  activityTime: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  connectingLine: { position: 'absolute', left: 21, top: 50, width: 2, height: 26, backgroundColor: '#F1F5F9', zIndex: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  emptyText: { color: '#94A3B8', fontSize: 15, fontWeight: '600' }
});
