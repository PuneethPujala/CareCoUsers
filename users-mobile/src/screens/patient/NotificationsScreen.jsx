import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, ActivityIndicator, Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { X, Pill, Heart, Calendar, AlertCircle, MessageSquare, BellOff, PhoneMissed } from 'lucide-react-native';
import { apiService } from '../../lib/api';

// ─── Skeleton Loader ──────────────────────────────────────────
const SkeletonItem = ({ width, height, borderRadius = 8, style }) => {
    const anim = useRef(new Animated.Value(0.3)).current;
    React.useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true })
            ])
        ).start();
    }, [anim]);
    return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />;
};

const C = {
  primary: '#6366F1',
  dark: '#0F172A',
  mid: '#334155',
  muted: '#94A3B8',
  light: '#CBD5E1',
  border: '#F1F5F9',
  danger: '#F43F5E',
  success: '#22C55E',
  warning: '#F59E0B',
  info: '#3B82F6',
  pageBg: '#FFFFFF',
};

const FONT = {
  regular: { fontFamily: 'Inter_400Regular' },
  medium: { fontFamily: 'Inter_500Medium' },
  semibold: { fontFamily: 'Inter_600SemiBold' },
  bold: { fontFamily: 'Inter_700Bold' },
  heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export default function NotificationsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('Alerts');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const lastFetchRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const fetchContext = async (force = false) => {
        const now = Date.now();
        if (!force && now - lastFetchRef.current < 60000 && notifications.length > 0) {
            setLoading(false);
            return;
        }

        try {
          const [pRes, medsRes, notifRes, callsRes] = await Promise.all([
            apiService.patients.getMe(),
            apiService.medicines.getToday(),
            apiService.patients.getNotifications(),
            apiService.patients.getMyCalls({ limit: 5 }),
          ]);

          const patient = pRes.data.patient;
          const medicines = medsRes.data.log?.medicines || [];
          const backendNotifs = notifRes.data.notifications || [];
          const recentCalls = callsRes.data.calls || [];

          // Fetch vitals
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);
          
          const vRes = await apiService.patients.getVitals({ 
              start_date: todayStart.toISOString(), 
              end_date: todayEnd.toISOString() 
          });
          const todayVitals = vRes.data.vitals;

          if (!isActive) return;

          const newNotifs = [];
          let nId = 1;

          // 1. Persistent Backend Notifications
          backendNotifs.forEach(b => {
             const createdDate = new Date(b.created_at);
             const isToday = new Date().toDateString() === createdDate.toDateString();
             const timeStr = isToday ? 'Today' : createdDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

             let safeTarget = b.target_screen;
             if (safeTarget === 'HomeScreen') safeTarget = 'PatientHome';
             if (safeTarget === 'MedicationsScreen') safeTarget = 'Medications';

             newNotifs.push({
                  id: b._id,
                  isBackend: true,
                  isRead: b.is_read,
                  group: 'Messages & Updates',
                  name: b.title,
                  action: b.message,
                  time: timeStr,
                  Icon: b.type === 'account' ? AlertCircle : MessageSquare,
                  color: b.is_read ? C.muted : C.primary,
                  bg: b.is_read ? C.border : '#EEF2FF',
                  target: safeTarget || 'PatientHome',
                  actionTxt: b.is_read ? 'Viewed' : 'Mark Read'
             });
          });

          // 2. Vitals Contextual Alert
          if (!todayVitals || todayVitals.length === 0) {
            newNotifs.push({
              id: `transient-${nId++}`,
              group: 'Today\'s Activity',
              name: 'Action Required',
              action: 'Please log your vitals (Heart rate, BP) for today to keep your health record updated.',
              time: 'Now',
              Icon: Heart,
              color: C.danger,
              bg: '#FFE4E6',
              target: 'PatientHome',
              actionTxt: 'Log Now'
            });
          }

          // 3. Temporal Medications Alert
          const now = new Date();
          const prefs = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };

          medicines.forEach(m => {
            if (!m.taken) {
               const timeKey = m.scheduled_time || 'morning';
               const timePref = prefs[timeKey] || (timeKey === 'morning' ? '09:00' : timeKey === 'afternoon' ? '14:00' : '20:00');
               const [h, min] = timePref.split(':').map(Number);
               
               const medTime = new Date();
               medTime.setHours(h, min, 0, 0);
               
               // How many hours until this medicine needs to be taken?
               const diffHours = (medTime - now) / (1000 * 60 * 60);

               // Alert if it's already overdue, or coming up within the next 2 hours
               if (diffHours <= 2) {
                 const timeLabel = diffHours < 0 ? 'Overdue' : 'Soon';
                 const capitalizedSlot = timeKey.charAt(0).toUpperCase() + timeKey.slice(1);

                 newNotifs.push({
                    id: `transient-${nId++}`,
                    group: 'Today\'s Activity',
                    name: `${capitalizedSlot} Medication`,
                    action: `It's time to take your ${m.medicine_name}. (${timePref})`,
                    time: timeLabel,
                    Icon: Pill,
                    color: C.info,
                    bg: '#DBEAFE',
                    target: 'Medications',
                    actionTxt: 'View'
                 });
               }
            }
          });

          // 4. Missed Calls Alert
          const todaysCalls = recentCalls.filter(c => new Date(c.call_date) >= todayStart);
          const missedCalls = todaysCalls.filter(c => c.status === 'missed');
          if (missedCalls.length > 0) {
              newNotifs.push({
                  id: `transient-${nId++}`,
                  group: 'Today\'s Activity',
                  name: 'Missed Call',
                  action: `Your caregiver tried to reach you today. Please return their call.`,
                  time: 'Missed',
                  Icon: PhoneMissed,
                  color: C.danger,
                  bg: '#FFE4E6',
                  target: 'MyCaller',
                  actionTxt: 'Callback'
              });
          }

          // 5. Appointments Contextual Alert (Close by: <= 3 days)
          const upcoming = (patient.appointments || []).filter(a => a.status === 'upcoming');
          upcoming.forEach(a => {
             const daysUntil = Math.ceil((new Date(a.date) - new Date()) / (1000 * 60 * 60 * 24));
             if (daysUntil >= 0 && daysUntil <= 7) {
               newNotifs.push({
                  id: `transient-${nId++}`,
                  group: 'Upcoming',
                  name: 'Upcoming Appointment',
                  action: `Prepare for your scheduled visit with ${a.doctor_name} on ${new Date(a.date).toLocaleDateString('en-GB')}.`,
                  time: daysUntil === 0 ? 'Today' : `${daysUntil}d`,
                  Icon: Calendar,
                  color: '#8B5CF6',
                  bg: '#EDE9FE',
                  target: 'PatientHome',
                  actionTxt: 'View'
               });
             }
          });

          // 6. Subscription Contextual Alert
          if (patient.subscription?.expires_at) {
             const daysLeft = Math.ceil((new Date(patient.subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
             if (daysLeft >= 0 && daysLeft <= 7) {
                newNotifs.push({
                  id: `transient-${nId++}`,
                  group: 'System Alerts',
                  name: 'Account Notice',
                  action: `Your premium subscription expires in ${daysLeft} days.`,
                  time: 'Soon',
                  Icon: AlertCircle,
                  color: C.warning,
                  bg: '#FEF3C7',
                  target: 'PatientHome',
                  actionTxt: 'Renew'
                });
             }
          }

          setNotifications(newNotifs);
          lastFetchRef.current = Date.now();
        } catch (err) {
          console.warn('Failed to fetch notifications context:', err.message);
        } finally {
          if (isActive) setLoading(false);
        }
      };

      if (loading && notifications.length === 0) setLoading(true);
      fetchContext();

      return () => { isActive = false; };
    }, [notifications])
  );

  const handleActionPress = async (item) => {
    // If it's a persistent backend notification that hasn't been read
    if (item.isBackend && !item.isRead) {
      try {
        await apiService.patients.markNotificationRead(item.id);
        // Optimistically update local UI state
        setNotifications(prev => prev.map(n => 
          n.id === item.id 
            ? { ...n, isRead: true, color: C.muted, bg: C.border, actionTxt: 'Viewed' } 
            : n
        ));
      } catch (err) {
        console.warn('Failed to mark read', err.message);
      }
    } else {
      // Dynamic alerts just route you - need to route via PatientTabs because we are in a Modal over the Tabs
      navigation.navigate('PatientTabs', { screen: item.target });
    }
  };

  const groups = ['Today\'s Activity', 'Messages & Updates', 'Upcoming', 'System Alerts'];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Updates</Text>
        <Pressable style={s.searchBtn} onPress={() => navigation.goBack()}>
          <X size={22} color={C.dark} strokeWidth={2.5} />
        </Pressable>
      </View>

      <View style={s.tabsWrap}>
        <View style={s.tabsBg}>
          <Pressable style={[s.tab, activeTab === 'Alerts' && s.tabActive]} onPress={() => setActiveTab('Alerts')}>
            <Text style={[s.tabText, activeTab === 'Alerts' && s.tabTextActive]}>All Activity</Text>
          </Pressable>
          <Pressable style={[s.tab, activeTab === 'Inbox' && s.tabActive]} onPress={() => setActiveTab('Inbox')}>
            <Text style={[s.tabText, activeTab === 'Inbox' && s.tabTextActive]}>Unread Only</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {loading ? (
           <View style={{ marginTop: 12 }}>
               {[1, 2, 3, 4, 5].map(i => (
                   <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                       <SkeletonItem width={44} height={44} borderRadius={22} style={{ marginRight: 12 }} />
                       <View style={{ flex: 1 }}>
                           <SkeletonItem width="80%" height={16} borderRadius={8} style={{ marginBottom: 8 }} />
                           <SkeletonItem width="40%" height={12} borderRadius={6} />
                       </View>
                   </View>
               ))}
           </View>
        ) : notifications.length === 0 || (activeTab === 'Inbox' && notifications.filter(n => n.isBackend && !n.isRead).length === 0) ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyArtWrap}>
              <Heart size={40} color={C.light} style={{position:'absolute', top: -10, left: -20, transform: [{rotate: '-15deg'}]}} strokeWidth={1.5} />
              <MessageSquare size={32} color={C.light} style={{position:'absolute', bottom: 10, right: -20, transform: [{rotate: '10deg'}]}} strokeWidth={1.5} />
              <BellOff size={80} color={C.dark} strokeWidth={1.5} />
            </View>
            <Text style={s.emptyTitle}>You're all caught up!</Text>
            <Text style={s.emptyBody}>You have no pending alerts or unread messages at this time.</Text>
          </View>
        ) : (
          groups.map((group) => {
            const items = notifications.filter((n) => n.group === group);
            if (!items.length) return null;
            // Additional filter for Unread tab
            if (activeTab === 'Inbox' && !items.find(n => n.isBackend && !n.isRead)) return null;

            return (
              <View key={group} style={s.groupSection}>
                <Text style={s.groupHeader}>{group.toUpperCase()}</Text>
                {items.map((item) => {
                  // Hide read backend items in "Inbox" (Unread Only)
                  if (activeTab === 'Inbox' && item.isRead) return null;

                  return (
                    <View key={item.id} style={s.card}>
                      <View style={s.avatarWrap}>
                        <View style={[s.iconAvatar, { backgroundColor: item.bg, borderColor: item.bg }]}>
                            <item.Icon size={20} color={item.color} strokeWidth={2.5} />
                        </View>
                      </View>

                      <View style={s.txtWrap}>
                        <Text style={s.mainTxt}>
                          <Text style={s.boldTxt}>{item.name}</Text> • {item.action}
                        </Text>
                      </View>

                      <View style={s.rightSide}>
                        <Text style={s.timeTxt}>{item.time}</Text>
                        <Pressable 
                          style={[s.viewBtn, { backgroundColor: item.bg }]} 
                          onPress={() => handleActionPress(item)}
                        >
                          <Text style={[s.viewBtnTxt, { color: item.color }]}>{item.actionTxt}</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.pageBg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: C.pageBg,
  },
  headerTitle: { fontSize: 32, fontWeight: '800', color: C.dark, letterSpacing: -1 },
  searchBtn: { 
    width: 44, height: 44, borderRadius: 22, 
    borderWidth: 1.5, borderColor: C.border, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },

  tabsWrap: { paddingHorizontal: 28, marginBottom: 28 },
  tabsBg: {
    flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 100, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 100 },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, ...FONT.semibold, color: C.muted },
  tabTextActive: { color: C.dark, ...FONT.bold },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 28, paddingBottom: 60, minHeight: '100%' },
  
  groupSection: { marginBottom: 32 },
  groupHeader: { fontSize: 13, ...FONT.heavy, color: C.muted, marginBottom: 16, letterSpacing: 1.5 },

  card: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  
  avatarWrap: { marginRight: 14 },
  iconAvatar: { 
    width: 44, height: 44, borderRadius: 22, 
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },

  txtWrap: { flex: 1, marginRight: 12, marginTop: 2 },
  mainTxt: { fontSize: 14, ...FONT.medium, color: C.mid, lineHeight: 20 },
  boldTxt: { ...FONT.bold, color: C.dark },

  rightSide: { alignItems: 'center', paddingLeft: 8, marginTop: 2 },
  timeTxt: { fontSize: 11, ...FONT.bold, color: C.muted, marginBottom: 6 },
  viewBtn: { 
    paddingHorizontal: 12, paddingVertical: 6, 
    borderRadius: 8,
  },
  viewBtnTxt: { fontSize: 11, ...FONT.heavy },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: 40 },
  emptyArtWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  emptyTitle: { fontSize: 18, ...FONT.heavy, color: C.dark, marginBottom: 8 },
  emptyBody: { fontSize: 14, ...FONT.medium, color: C.muted, textAlign: 'center', lineHeight: 22 },
});
