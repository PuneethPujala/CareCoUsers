import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from 'react-native';
import { ChevronLeft, PhoneIncoming, AlertTriangle, Clock, Calendar } from 'lucide-react-native';
import TabScreenTransition from '../../components/ui/TabScreenTransition';
import { apiService } from '../../lib/api';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  primary: '#6366F1',
  pageBg: '#F8FAFC',
  success: '#10B981',
  successBg: '#D1FAE5',
  danger: '#F43F5E',
  dangerBg: '#FFE4E6',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  cardBg: '#FFFFFF',
};

const STATUS_CONFIG = {
  completed:   { color: C.success, bg: C.successBg,  Icon: PhoneIncoming, label: 'Completed' },
  missed:      { color: C.danger,  bg: C.dangerBg,   Icon: AlertTriangle, label: 'Missed' },
  attempted:   { color: C.warning, bg: C.warningBg,  Icon: Clock,         label: 'Attempted' },
  refused:     { color: C.danger,  bg: C.dangerBg,   Icon: AlertTriangle, label: 'Refused' },
  rescheduled: { color: C.warning, bg: C.warningBg,  Icon: Calendar,      label: 'Rescheduled' },
};

const formatDuration = (seconds) => {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};

export default function CallHistoryScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await apiService.patients.getMyCalls();
      setCalls(res.data.calls || []);
    } catch (err) {
      console.warn('Failed to load call history:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renderItem = ({ item }) => {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.completed;
    const Icon = cfg.Icon;
    const duration = formatDuration(item.call_duration_seconds);
    
    // The backend populates caller_id with name
    const callerName = item.caller_id?.name || 'Care Team';

    return (
      <View style={styles.callRow}>
        <View style={[styles.callIconBox, { backgroundColor: cfg.bg }]}>
          <Icon size={18} color={cfg.color} strokeWidth={2} />
        </View>
        <View style={styles.callBody}>
          <Text style={styles.callDate}>{formatDate(item.call_date || item.created_at)}</Text>
          <Text style={styles.callerName}>Called by: {callerName}</Text>
          <Text style={styles.callNote} numberOfLines={2}>
            {item.ai_summary || t('caller.routine_checkin', { defaultValue: 'Routine check-in' })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {duration && <Text style={styles.callDuration}>{duration}</Text>}
        </View>
      </View>
    );
  };

  return (
    <TabScreenTransition>
      <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('caller.call_history', { defaultValue: 'Call History' })}</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('caller.no_calls', { defaultValue: 'No recent calls found.' })}</Text>
            </View>
          }
        />
      )}
    </View>
    </TabScreenTransition>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.pageBg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.pageBg,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9'
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  loaderCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, gap: 12 },
  
  callRow: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 16,
    backgroundColor: C.cardBg, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  callIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  callBody: { flex: 1, marginRight: 12 },
  callDate: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  callerName: { fontSize: 13, fontWeight: '600', color: '#6366F1', marginBottom: 4 },
  callNote: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  callDuration: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  emptyState: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 15 }
});
