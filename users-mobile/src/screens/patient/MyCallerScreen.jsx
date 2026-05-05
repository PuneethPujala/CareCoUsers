import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform, RefreshControl,
  Pressable, ActivityIndicator, Linking, Animated,
  Modal, TouchableOpacity, TouchableWithoutFeedback, TextInput, Keyboard, KeyboardAvoidingView, FlatList, Switch
} from 'react-native';
import SmartInput from '../../components/ui/SmartInput';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import {
  Phone, PhoneIncoming, AlertTriangle, ShieldCheck,
  Flag, Clock, Globe, Calendar, ChevronRight, ChevronDown, X, Users, Heart,
  Plus, Edit2, Bell, Trash2, Star, Activity, MessageCircle, UserCheck,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, layout } from '../../theme';
import { apiService } from '../../lib/api';
import { COUNTRY_CODES, parsePhoneWithCode, validatePhone } from '../../utils/phoneUtils';
import { useTranslation } from 'react-i18next';
import AlertManager from '../../utils/AlertManager';

// ── Skeleton ────────────────────────────────────────────────────────────────
const SkeletonItem = ({ width, height, borderRadius = 8, style }) => {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return <Animated.View style={[{ width, height, borderRadius, backgroundColor: '#E2E8F0', opacity: anim }, style]} />;
};

// ── Theme ───────────────────────────────────────────────────────────────────
const C = {
  primary: '#6366F1',
  primaryDark: '#4338CA',
  primarySoft: '#EEF2FF',
  cardBg: '#FFFFFF',
  pageBg: '#F8FAFC',
  dark: '#0F172A',
  mid: '#334155',
  muted: '#94A3B8',
  light: '#CBD5E1',
  border: '#F1F5F9',
  borderMid: '#E2E8F0',
  success: '#10B981',
  successBg: '#D1FAE5',
  danger: '#F43F5E',
  dangerBg: '#FFE4E6',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  accent: '#06B6D4',
};

const CONTACT_PALETTE = [
  '#6366F1', '#10B981', '#F59E0B', '#06B6D4', '#8B5CF6', '#EC4899',
];

const STATUS_CONFIG = {
  completed:   { color: C.success, bg: C.successBg,  Icon: PhoneIncoming, label: 'Completed' },
  missed:      { color: C.danger,  bg: C.dangerBg,   Icon: AlertTriangle, label: 'Missed' },
  attempted:   { color: C.warning, bg: C.warningBg,  Icon: Clock,         label: 'Attempted' },
  refused:     { color: C.danger,  bg: C.dangerBg,   Icon: AlertTriangle, label: 'Refused' },
  rescheduled: { color: C.warning, bg: C.warningBg,  Icon: Calendar,      label: 'Rescheduled' },
};

// ── Main Component ──────────────────────────────────────────────────────────
export default function MyCallerScreen({ navigation }) {
  const { t } = useTranslation();
  const [patient,  setPatient]  = useState(null);
  const [caller,   setCaller]   = useState(null);
  const [calls,    setCalls]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modalVisible,       setModal]                = useState(false);
  const [selectedProfile,    setSelectedProfile]      = useState(null);
  const [flagging,           setFlagging]             = useState(false);
  const [flagIssueModalVisible, setFlagIssueModalVisible] = useState(false);
  const [flagDescription,    setFlagDescription]      = useState('');
  const [contacts,           setContacts]             = useState([]);
  const [contactModal,       setContactModal]         = useState(false);
  const [editingContact,     setEditingContact]       = useState(null);
  const [contactForm,        setContactForm]          = useState({ name: '', phone: '', phoneCode: '+91', relation: '', email: '' });
  const [isSavingContact,    setIsSavingContact]      = useState(false);
  const [deleteConfirm,      setDeleteConfirm]        = useState({ visible: false, id: null, name: '' });
  const [isDeleting,         setIsDeleting]           = useState(false);
  const [countryCodeModal,   setCountryCodeModal]     = useState(false);
  const [manager,            setManager]              = useState(null);
  const [refreshing,         setRefreshing]           = useState(false);

  const contactModalAnim = useRef(new Animated.Value(0)).current;
  const staggerAnims     = useRef([...Array(20)].map(() => new Animated.Value(0))).current;
  const modalAnim        = useRef(new Animated.Value(0)).current;
  const backdropAnim     = useRef(new Animated.Value(0)).current;
  const cardAnim         = useRef(new Animated.Value(0)).current;

  const runAnimations = useCallback(() => {
    staggerAnims.forEach(a => a.setValue(0));
    Animated.parallel([
      Animated.spring(cardAnim,  { toValue: 1, friction: 7,  tension: 40, useNativeDriver: true }),
      Animated.stagger(55, staggerAnims.map(a =>
        Animated.spring(a, { toValue: 1, friction: 8, tension: 42, useNativeDriver: true })
      )),
    ]).start();
  }, [staggerAnims, cardAnim]);

  const openModal = (profile) => {
    setSelectedProfile(profile);
    setModal(true);
    Animated.parallel([
      Animated.spring(modalAnim,  { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalAnim,    { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setModal(false));
  };

  const submitFlagIssue = async () => {
    if (flagging) return;
    setFlagging(true);
    try {
      await apiService.patients.flagIssue({
        type: 'general',
        description: flagDescription.trim() || 'Patient flagged an issue with their caller.',
      });
      setFlagIssueModalVisible(false);
      setFlagDescription('');
      AlertManager.alert(
        t('caller.issue_flagged', { defaultValue: 'Issue Flagged' }),
        t('caller.issue_reported', { defaultValue: 'Your issue has been reported to the care team.' })
      );
    } catch (err) {
      AlertManager.alert(
        t('common.error',   { defaultValue: 'Error' }),
        t('caller.flag_failed', { defaultValue: 'Failed to flag issue. Please try again.' })
      );
    } finally {
      setFlagging(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const pRes = await apiService.patients.getMe();
      const p = pRes.data.patient;
      setPatient(p);
      if (p?.subscription?.plan !== 'free') {
        const [callerRes, callsRes] = await Promise.all([
          apiService.patients.getMyCaller(),
          apiService.patients.getMyCalls(),
        ]);
        setCaller(callerRes.data.caller);
        setCalls(callsRes.data.calls || []);
        setContacts(p?.trusted_contacts || []);
        setManager(callerRes.data.manager || p?.assigned_manager_id || null);
        runAnimations();
      }
    } catch (err) {
      console.warn('Failed to load caller data:', err.message);
    }
  }, [runAnimations]);

  useEffect(() => {
    (async () => { await loadData(); setLoading(false); })();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const openContactModal = (contact = null) => {
    if (contact) {
      setEditingContact(contact);
      const parsed = parsePhoneWithCode(contact.phone);
      setContactForm({ name: contact.name, phone: parsed.number, phoneCode: parsed.code, relation: contact.relation || '', email: contact.email || '', is_emergency: !!contact.is_emergency, can_view_data: !!contact.can_view_data });
    } else {
      setEditingContact(null);
      setContactForm({ name: '', phone: '', phoneCode: '+91', relation: '', email: '', is_emergency: false, can_view_data: false });
    }
    setContactModal(true);
    Animated.parallel([
      Animated.spring(contactModalAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const closeContactModal = () => {
    Animated.parallel([
      Animated.timing(contactModalAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim,     { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => { setContactModal(false); setEditingContact(null); });
  };

  const saveContact = async () => {
    if (!contactForm.name?.trim()) {
      AlertManager.alert(t('common.required', { defaultValue: 'Required' }), t('caller.enter_contact_name', { defaultValue: "Please enter the contact's name." }));
      return;
    }
    const phoneErr = validatePhone(contactForm.phone, contactForm.phoneCode);
    if (phoneErr) { AlertManager.alert(t('common.invalid_phone', { defaultValue: 'Invalid Phone' }), phoneErr); return; }
    if (contactForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email.trim())) {
      AlertManager.alert(t('common.invalid_email', { defaultValue: 'Invalid Email' }), t('caller.enter_valid_email', { defaultValue: 'Please enter a valid email address.' }));
      return;
    }
    const fullPhone = `${contactForm.phoneCode}${contactForm.phone.replace(/[^0-9]/g, '')}`;
    if (!editingContact) {
      const isDup = contacts.some(c => c.phone.replace(/[^0-9]/g, '') === fullPhone.replace(/[^0-9]/g, ''));
      if (isDup) { AlertManager.alert(t('common.duplicate', { defaultValue: 'Duplicate' }), t('caller.duplicate_phone', { defaultValue: 'A contact with this phone number already exists.' })); return; }
    }
    setIsSavingContact(true);
    try {
      const payload = {
        name: contactForm.name.trim(), phone: fullPhone,
        relation: contactForm.relation?.trim() || '', email: contactForm.email?.trim() || '',
        is_emergency: !!contactForm.is_emergency, is_primary: !!contactForm.is_emergency,
        can_view_data: !!contactForm.can_view_data, permissions: [],
      };
      const res = editingContact
        ? await apiService.patients.updateTrustedContact(editingContact._id, payload)
        : await apiService.patients.addTrustedContact(payload);
      setContacts(res.data.trusted_contacts);
      closeContactModal();
    } catch (err) {
      AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('caller.failed_save_contact', { defaultValue: 'Failed to save contact.' }));
    } finally {
      setIsSavingContact(false);
    }
  };

  const confirmRemoveContact = (id) => {
    const contact = contacts.find(c => c._id === id);
    setDeleteConfirm({ visible: true, id, name: contact?.name || t('caller.this_contact', { defaultValue: 'this contact' }) });
  };

  const executeRemoveContact = async () => {
    setIsDeleting(true);
    try {
      const res = await apiService.patients.deleteTrustedContact(deleteConfirm.id);
      setContacts(res.data.trusted_contacts);
      setDeleteConfirm({ visible: false, id: null, name: '' });
      if (contactModal) closeContactModal();
    } catch (err) {
      AlertManager.alert(t('common.error', { defaultValue: 'Error' }), t('caller.failed_remove_contact', { defaultValue: 'Failed to remove contact.' }));
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr) => {
    const d   = new Date(dateStr);
    const now = new Date();
    const isToday     = d.toDateString() === now.toDateString();
    const isYesterday = d.toDateString() === new Date(now - 86400000).toDateString();
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (isToday)     return `${t('common.today',     { defaultValue: 'Today' })}, ${time}`;
    if (isYesterday) return `${t('common.yesterday', { defaultValue: 'Yesterday' })}, ${time}`;
    return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return null;
    return `${Math.floor(seconds / 60)}m`;
  };

  const anim = (i) => ({
    opacity: staggerAnims[i],
    transform: [{ translateY: staggerAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
  });

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.container, { padding: 20, paddingTop: Platform.OS === 'android' ? 60 : 44 }]}>
        <SkeletonItem width={140} height={28} borderRadius={12} style={{ marginBottom: 24 }} />
        <SkeletonItem width="100%" height={200} borderRadius={28} style={{ marginBottom: 20 }} />
        <SkeletonItem width={120} height={14} borderRadius={7} style={{ marginBottom: 14 }} />
        <SkeletonItem width="100%" height={76} borderRadius={20} style={{ marginBottom: 10 }} />
        <SkeletonItem width="100%" height={76} borderRadius={20} />
      </View>
    );
  }

  // ── Free plan gate ───────────────────────────────────────────────────────
  if (patient?.subscription?.plan === 'free') {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <View>
            <Text style={s.headerLabel}>{t('caller.support', { defaultValue: 'SUPPORT' })}</Text>
            <Text style={s.headerTitle}>{t('caller.care_team', { defaultValue: 'Care Team' })}</Text>
          </View>
        </View>
        <View style={s.gatewrap}>
          <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={s.gateIcon}>
            <ShieldCheck size={36} color={C.primary} strokeWidth={1.5} />
          </LinearGradient>
          <Text style={s.gateTitle}>{t('common.premium_feature', { defaultValue: 'Premium Feature' })}</Text>
          <Text style={s.gateBody}>{t('caller.premium_desc', { defaultValue: 'A dedicated care team caller is included in the Basic Plan. Upgrade on the Home screen to get matched with a caller from your city.' })}</Text>
        </View>
      </View>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const callerExp  = caller?.experience_years || 0;
  const callerLang = caller?.languages_spoken?.[0] || 'English';

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Animated.View style={[s.header, anim(0)]}>
        <View>
          <Text style={s.headerLabel}>{t('caller.support', { defaultValue: 'SUPPORT' })}</Text>
          <Text style={s.headerTitle}>{t('caller.care_team', { defaultValue: 'Care Team' })}</Text>
        </View>
        <Pressable style={s.bellBtn} onPress={() => navigation.navigate('Notifications')}>
          <Bell size={20} color={C.primary} strokeWidth={2.5} />
        </Pressable>
      </Animated.View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} />}
      >

        {/* ── YOUR CALLER HERO CARD ──────────────────────────────────── */}
        <Animated.View style={anim(1)}>
          <Text style={s.sectionLabel}>{t('caller.your_caller', { defaultValue: 'YOUR CALLER' })}</Text>

          {caller ? (
            <Pressable onPress={() => openModal(caller)} style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1 }]}>
              <LinearGradient colors={['#3730A3', '#4F46E5', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroCard}>
                {/* Top strip */}
                <View style={s.heroTopRow}>
                  <View style={s.verifiedBadge}>
                    <ShieldCheck size={11} color="#A5B4FC" strokeWidth={2.5} />
                    <Text style={s.verifiedBadgeText}>Verified Caller</Text>
                  </View>
                  <Pressable
                    style={s.flagChip}
                    onPress={(e) => { e.stopPropagation?.(); setFlagIssueModalVisible(true); }}
                    hitSlop={10}
                  >
                    <Flag size={13} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
                    <Text style={s.flagChipText}>{t('caller.flag_issue', { defaultValue: 'Flag Issue' })}</Text>
                  </Pressable>
                </View>

                {/* Profile row */}
                <View style={s.heroBody}>
                  {/* Avatar */}
                  <View style={s.heroAvatarWrap}>
                    <View style={s.heroAvatarRing}>
                      <LinearGradient colors={['#818CF8', '#C7D2FE']} style={s.heroAvatar}>
                        <Text style={s.heroAvatarLetter}>{caller.name?.charAt(0)}</Text>
                      </LinearGradient>
                    </View>
                    <View style={s.heroOnlineDot} />
                  </View>

                  {/* Info */}
                  <View style={s.heroInfo}>
                    <Text style={s.heroName} numberOfLines={1}>{caller.name}</Text>
                    <Text style={s.heroId}>ID: {caller.employee_id}</Text>

                    {/* Mini stats chips */}
                    <View style={s.heroChips}>
                      <View style={s.heroChip}>
                        <Clock size={10} color="#A5B4FC" strokeWidth={2.5} />
                        <Text style={s.heroChipText}>{callerExp}y exp</Text>
                      </View>
                      <View style={s.heroChipDot} />
                      <View style={s.heroChip}>
                        <Globe size={10} color="#A5B4FC" strokeWidth={2.5} />
                        <Text style={s.heroChipText}>{callerLang}</Text>
                      </View>
                      <View style={s.heroChipDot} />
                      <View style={s.heroChip}>
                        <Star size={10} color="#FCD34D" strokeWidth={2.5} fill="#FCD34D" />
                        <Text style={s.heroChipText}>Certified</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Divider */}
                <View style={s.heroDivider} />

                {/* Stats row */}
                <View style={s.heroStatsRow}>
                  <View style={s.heroStat}>
                    <Text style={s.heroStatVal}>{calls.length}</Text>
                    <Text style={s.heroStatLabel}>Total Calls</Text>
                  </View>
                  <View style={s.heroStatSep} />
                  <View style={s.heroStat}>
                    <Text style={s.heroStatVal}>
                      {calls.length > 0 ? `${Math.round(calls.reduce((a, c) => a + (c.call_duration_seconds || 0), 0) / calls.length / 60)}m` : '—'}
                    </Text>
                    <Text style={s.heroStatLabel}>Avg Duration</Text>
                  </View>
                  <View style={s.heroStatSep} />
                  <View style={s.heroStat}>
                    <Text style={s.heroStatVal}>
                      {calls.length > 0 ? `${Math.round((calls.filter(c => c.status === 'completed').length / calls.length) * 100)}%` : '—'}
                    </Text>
                    <Text style={s.heroStatLabel}>Answered</Text>
                  </View>
                </View>

                {/* Call button */}
                <Pressable
                  style={({ pressed }) => [s.heroCallBtn, pressed && { opacity: 0.9 }]}
                  onPress={(e) => { e.stopPropagation?.(); caller?.phone && Linking.openURL(`tel:${caller.phone}`); }}
                >
                  <Phone size={17} color={C.primaryDark} strokeWidth={2.5} />
                  <Text style={s.heroCallBtnText}>{t('common.call_now', { defaultValue: 'Call Now' })}</Text>
                </Pressable>
              </LinearGradient>
            </Pressable>
          ) : (
            /* Pending state */
            <View style={s.pendingCard}>
              <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={s.pendingIconCircle}>
                <PhoneIncoming size={30} color={C.primary} strokeWidth={1.5} />
              </LinearGradient>
              <Text style={s.pendingTitle}>{t('caller.caregiver_being_assigned', { defaultValue: 'Caregiver Being Assigned' })}</Text>
              <Text style={s.pendingBody}>{t('caller.pending_assignment_desc', { defaultValue: "Your care manager has been notified and is assigning a dedicated caregiver for you. You'll receive a notification once they're ready!" })}</Text>
              {manager && (
                <Pressable style={s.pendingCallBtn} onPress={() => manager.phone && Linking.openURL(`tel:${manager.phone}`)}>
                  <Phone size={15} color="#FFF" strokeWidth={2.5} />
                  <Text style={s.pendingCallBtnText}>{t('caller.contact_your_manager', { defaultValue: 'Contact Your Manager' })}</Text>
                </Pressable>
              )}
            </View>
          )}
        </Animated.View>

        {/* ── CARE MANAGER ──────────────────────────────────────────────── */}
        <Animated.View style={anim(2)}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionLabel}>{t('caller.manager', { defaultValue: 'CARE MANAGER' })}</Text>
          </View>

          {manager ? (
            <Pressable onPress={() => openModal({ ...manager, isManager: true })} style={({ pressed }) => [s.managerCard, pressed && { opacity: 0.97 }]}>
              <View style={s.managerLeft}>
                <LinearGradient colors={['#475569', '#334155']} style={s.managerAvatar}>
                  <Text style={s.managerAvatarText}>{manager.fullName?.charAt(0) || 'M'}</Text>
                </LinearGradient>
                <View style={s.managerInfo}>
                  <Text style={s.managerName}>{manager.fullName || t('caller.manager_default', { defaultValue: 'Manager' })}</Text>
                  <View style={s.managerRoleRow}>
                    <ShieldCheck size={11} color={C.success} strokeWidth={2.5} />
                    <Text style={s.managerRoleText}>{t('caller.role_manager', { defaultValue: 'Care Manager' })}</Text>
                    <View style={s.dotSep} />
                    <View style={s.availablePill}>
                      <View style={s.availableDot} />
                      <Text style={s.availableText}>{t('caller.available', { defaultValue: 'Available' })}</Text>
                    </View>
                  </View>
                </View>
              </View>
              <Pressable
                style={s.managerCallBtn}
                onPress={(e) => { e.stopPropagation?.(); manager.phone && Linking.openURL(`tel:${manager.phone}`); }}
              >
                <Phone size={16} color={C.primary} strokeWidth={2.5} />
              </Pressable>
            </Pressable>
          ) : (
            <View style={s.emptyCard}>
              <View style={s.emptyIconBox}>
                <Users size={24} color={C.muted} strokeWidth={1.5} />
              </View>
              <View style={s.emptyTextBlock}>
                <Text style={s.emptyTitle}>{t('caller.no_manager_assigned', { defaultValue: 'No Manager Assigned' })}</Text>
                <Text style={s.emptyBody}>{t('caller.no_manager_desc', { defaultValue: 'A manager will be assigned if additional support is required.' })}</Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* ── TRUSTED CONTACTS ───────────────────────────────────────── */}
        <Animated.View style={anim(3)}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionLabel}>{t('caller.care_team_contacts', { defaultValue: 'TRUSTED CONTACTS' })}</Text>
            <Pressable style={s.addBtn} onPress={() => openContactModal()}>
              <Plus size={15} color="#FFF" strokeWidth={2.5} />
            </Pressable>
          </View>

          {contacts.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIconBox}>
                <Heart size={24} color={C.muted} strokeWidth={1.5} />
              </View>
              <View style={s.emptyTextBlock}>
                <Text style={s.emptyTitle}>{t('caller.no_contacts_added', { defaultValue: 'No Contacts Added' })}</Text>
                <Text style={s.emptyBody}>{t('caller.add_trusted_desc', { defaultValue: 'Add trusted family members or friends for emergencies.' })}</Text>
              </View>
            </View>
          ) : (
            contacts.map((contact, idx) => {
              const accentColor = contact.is_emergency ? C.danger : CONTACT_PALETTE[idx % CONTACT_PALETTE.length];
              const avatarBg    = contact.is_emergency ? C.dangerBg : `${accentColor}18`;
              return (
                <View key={contact._id} style={s.contactCard}>
                  <View style={[s.contactAccent, { backgroundColor: accentColor }]} />
                  <View style={[s.contactAvatar, { backgroundColor: avatarBg }]}>
                    <Text style={[s.contactAvatarTxt, { color: accentColor }]}>{contact.name.charAt(0)}</Text>
                  </View>
                  <View style={s.contactInfo}>
                    <View style={s.contactNameRow}>
                      <Text style={s.contactName} numberOfLines={1}>{contact.name}</Text>
                      {contact.is_emergency && (
                        <View style={s.sosPill}>
                          <Text style={s.sosTxt}>SOS</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.contactSub} numberOfLines={1}>
                      {contact.relation || 'Contact'} · {contact.phone}
                    </Text>
                  </View>
                  <View style={s.contactActions}>
                    <Pressable
                      style={s.contactActionBtn}
                      onPress={() => contact.phone && Linking.openURL(`tel:${contact.phone}`)}
                    >
                      <Phone size={15} color={C.primary} strokeWidth={2.5} />
                    </Pressable>
                    <Pressable style={s.contactActionBtn} onPress={() => openContactModal(contact)}>
                      <Edit2 size={15} color={C.mid} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </Animated.View>

        {/* ── RECENT CALLS (on main screen) ──────────────────────────── */}
        {calls.length > 0 && (
          <Animated.View style={anim(4)}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionLabel}>{t('caller.recent_calls', { defaultValue: 'RECENT CALLS' })}</Text>
              {caller && (
                <Pressable onPress={() => openModal(caller)}>
                  <Text style={s.seeAllText}>{t('common.see_all', { defaultValue: 'See all' })}</Text>
                </Pressable>
              )}
            </View>
            <View style={s.callsCard}>
              {calls.slice(0, 4).map((call, idx) => {
                const cfg      = STATUS_CONFIG[call.status] || STATUS_CONFIG.completed;
                const Icon     = cfg.Icon;
                const duration = formatDuration(call.call_duration_seconds);
                const isLast   = idx === Math.min(calls.length, 4) - 1;
                return (
                  <View key={call._id} style={[s.callRow, !isLast && s.callRowDivider]}>
                    <View style={[s.callIconBox, { backgroundColor: cfg.bg }]}>
                      <Icon size={16} color={cfg.color} strokeWidth={2} />
                    </View>
                    <View style={s.callBody}>
                      <Text style={s.callDate}>{formatDate(call.call_date || call.created_at)}</Text>
                      <Text style={s.callNote} numberOfLines={1}>{call.ai_summary || t('caller.routine_checkin', { defaultValue: 'Routine check-in' })}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      {duration && <Text style={s.callDuration}>{duration}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}

      </ScrollView>

      {/* ════════════════  CALLER / MANAGER DETAIL MODAL  ════════════════ */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal}>
        {(() => {
          const isManager    = selectedProfile?.isManager;
          const profileName  = isManager
            ? (selectedProfile.fullName || t('caller.manager_default', { defaultValue: 'Manager' }))
            : (selectedProfile?.name   || t('caller.care_team',       { defaultValue: 'Care Team' }));
          const profileIdText  = isManager
            ? t('caller.role_manager', { defaultValue: 'Role: Care Manager' })
            : `${t('caller.support_id', { defaultValue: 'Support ID:' })} ${selectedProfile?.employee_id || 'N/A'}`;
          const gradientColors = isManager ? ['#374151', '#1F2937'] : ['#3730A3', '#4F46E5'];
          const profileExp     = selectedProfile?.experience_years || 0;
          const profileLang    = selectedProfile?.languages_spoken?.[0] || 'English';
          const profilePhone   = selectedProfile?.phone;

          return (
            <>
              <TouchableWithoutFeedback onPress={closeModal}>
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,23,42,0.55)', opacity: backdropAnim }]} />
              </TouchableWithoutFeedback>

              <View style={s.sheetWrapper}>
                {/* Floating close */}
                <Animated.View style={[s.floatingClose, { opacity: modalAnim, transform: [{ translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }] }]}>
                  <TouchableOpacity onPress={closeModal} style={s.floatingCloseBtn}>
                    <X size={20} color={C.dark} strokeWidth={3} />
                  </TouchableOpacity>
                </Animated.View>

                <Animated.View style={[s.sheet, { transform: [{ translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [900, 0] }) }] }]}>
                  {/* Handle */}
                  <View style={s.sheetHandle}><View style={s.sheetHandleBar} /></View>

                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetBody}>

                    {/* Hero gradient header */}
                    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sheetHero}>
                      <View style={s.sheetHeroInner}>
                        <View style={s.sheetAvatarWrap}>
                          <LinearGradient colors={isManager ? ['#6B7280', '#9CA3AF'] : ['#818CF8', '#C7D2FE']} style={s.sheetAvatar}>
                            <Text style={s.sheetAvatarLetter}>{profileName.charAt(0)}</Text>
                          </LinearGradient>
                          <View style={s.sheetOnlineDot} />
                        </View>
                        <View style={s.sheetHeroInfo}>
                          <Text style={s.sheetName} numberOfLines={1}>{profileName}</Text>
                          <Text style={s.sheetIdText}>{profileIdText}</Text>
                          <View style={s.sheetBadge}>
                            <Star size={10} color="#FCD34D" fill="#FCD34D" strokeWidth={2} />
                            <Text style={s.sheetBadgeText}>Certified Professional</Text>
                          </View>
                        </View>
                      </View>
                    </LinearGradient>

                    {/* Quick stats bar */}
                    <View style={s.sheetStatsBar}>
                      <View style={s.sheetStat}>
                        <Clock size={14} color={C.primary} strokeWidth={2.5} />
                        <Text style={s.sheetStatVal}>{profileExp}y</Text>
                        <Text style={s.sheetStatLabel}>{t('caller.experience', { defaultValue: 'Experience' })}</Text>
                      </View>
                      <View style={s.sheetStatSep} />
                      <View style={s.sheetStat}>
                        <Globe size={14} color={C.primary} strokeWidth={2.5} />
                        <Text style={s.sheetStatVal} numberOfLines={1}>{profileLang}</Text>
                        <Text style={s.sheetStatLabel}>{t('caller.primary_lang', { defaultValue: 'Language' })}</Text>
                      </View>
                      <View style={s.sheetStatSep} />
                      <View style={s.sheetStat}>
                        <ShieldCheck size={14} color={C.success} strokeWidth={2.5} />
                        <Text style={s.sheetStatVal}>{t('caller.certified', { defaultValue: 'Active' })}</Text>
                        <Text style={s.sheetStatLabel}>{t('common.status', { defaultValue: 'Status' })}</Text>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={s.sheetActions}>
                      <Pressable
                        style={({ pressed }) => [s.sheetCallBtn, { backgroundColor: isManager ? '#1F2937' : C.primaryDark }, pressed && { opacity: 0.88 }]}
                        onPress={() => profilePhone && Linking.openURL(`tel:${profilePhone}`)}
                      >
                        <Phone size={18} color="#FFF" strokeWidth={2.5} />
                        <Text style={s.sheetCallBtnText}>{t('common.call_now', { defaultValue: 'Call Now' })}</Text>
                      </Pressable>
                      {!isManager && (
                        <Pressable
                          style={({ pressed }) => [s.sheetFlagBtn, pressed && { backgroundColor: C.dangerBg }]}
                          onPress={() => { closeModal(); setTimeout(() => setFlagIssueModalVisible(true), 300); }}
                        >
                          <Flag size={18} color={C.danger} strokeWidth={2.2} />
                          <Text style={s.sheetFlagBtnText}>{t('caller.flag_issue', { defaultValue: 'Flag Issue' })}</Text>
                        </Pressable>
                      )}
                    </View>

                    {/* Call history */}
                    {!isManager && (
                      <>
                        <View style={s.sheetSectionRow}>
                          <Text style={s.sheetSectionTitle}>{t('caller.recent_calls', { defaultValue: 'Recent Calls' })}</Text>
                          <Text style={s.sheetCallCount}>{calls.length} total</Text>
                        </View>

                        {calls.length === 0 ? (
                          <View style={s.sheetEmptyCard}>
                            <PhoneIncoming size={28} color={C.light} strokeWidth={1.5} />
                            <Text style={s.sheetEmptyText}>{t('caller.no_calls_recorded', { defaultValue: 'No calls recorded yet.' })}</Text>
                          </View>
                        ) : (
                          calls.map((call, idx) => {
                            const cfg      = STATUS_CONFIG[call.status] || STATUS_CONFIG.completed;
                            const Icon     = cfg.Icon;
                            const duration = formatDuration(call.call_duration_seconds);
                            return (
                              <View key={call._id} style={[s.sheetCallRow, idx === calls.length - 1 && { borderBottomWidth: 0 }]}>
                                <View style={[s.sheetCallIcon, { backgroundColor: cfg.bg }]}>
                                  <Icon size={16} color={cfg.color} strokeWidth={2} />
                                </View>
                                <View style={s.sheetCallBody}>
                                  <Text style={s.sheetCallDate}>
                                    {new Date(call.call_date || call.created_at).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </Text>
                                  <Text style={s.sheetCallNote} numberOfLines={1}>{call.ai_summary || t('caller.routine_checkin', { defaultValue: 'Routine check-in' })}</Text>
                                </View>
                                <View style={s.sheetCallRight}>
                                  <View style={[s.sheetCallBadge, { backgroundColor: cfg.bg }]}>
                                    <Text style={[s.sheetCallBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                                  </View>
                                  {duration && <Text style={s.sheetCallDuration}>{duration}</Text>}
                                </View>
                              </View>
                            );
                          })
                        )}
                      </>
                    )}
                  </ScrollView>
                </Animated.View>
              </View>
            </>
          );
        })()}
      </Modal>

      {/* ── Contact Form Modal ─────────────────────────────────────────── */}
      <PremiumFormModal
        visible={contactModal}
        title={editingContact ? t('caller.edit_contact', { defaultValue: 'Edit Contact' }) : t('caller.new_contact', { defaultValue: 'New Contact' })}
        onClose={closeContactModal}
        onSave={saveContact}
        saveText={editingContact ? t('caller.update_contact', { defaultValue: 'Update Contact' }) : t('caller.add_contact', { defaultValue: 'Add Contact' })}
        saving={isSavingContact}
        headerRight={
          editingContact && (
            <Pressable onPress={() => confirmRemoveContact(editingContact._id)} style={{ padding: 8 }}>
              <Trash2 size={20} color={C.danger} />
            </Pressable>
          )
        }
      >
        <SmartInput
          label={t('caller.full_name', { defaultValue: 'Full Name *' })}
          placeholder={t('caller.name_placeholder', { defaultValue: 'e.g. Ramesh Kumar' })}
          value={contactForm.name}
          onChangeText={(v) => setContactForm({ ...contactForm, name: v })}
          returnKeyType="next"
        />

        <Text style={s.formLabel}>{t('caller.phone_number', { defaultValue: 'Phone Number *' })}</Text>
        <View style={s.phoneRow}>
          <Pressable style={s.codeBtn} onPress={() => setCountryCodeModal(true)}>
            <Text style={s.codeBtnFlag}>{COUNTRY_CODES.find(c => c.code === contactForm.phoneCode)?.flag}</Text>
            <Text style={s.codeBtnText}>{contactForm.phoneCode}</Text>
            <ChevronDown size={13} color={C.muted} />
          </Pressable>
          <SmartInput
            keyboardType="phone-pad"
            placeholder="98765 43210"
            value={contactForm.phone}
            onChangeText={(v) => setContactForm({ ...contactForm, phone: v.replace(/[^0-9]/g, '') })}
            maxLength={COUNTRY_CODES.find(c => c.code === contactForm.phoneCode)?.maxDigits || 12}
            style={{ flex: 1 }}
          />
        </View>

        <Text style={s.formLabel}>{t('caller.relationship', { defaultValue: 'Relationship' })}</Text>
        <View style={s.chipRow}>
          {['Son', 'Daughter', 'Spouse', 'Sibling', 'Friend', 'Neighbour', 'Other'].map(opt => {
            const active = contactForm.relation === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setContactForm({ ...contactForm, relation: opt })}
                style={[s.chip, active && s.chipActive]}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        <SmartInput
          label={t('caller.email_optional', { defaultValue: 'Email (Optional)' })}
          placeholder={t('caller.email_placeholder', { defaultValue: 'email@example.com' })}
          keyboardType="email-address"
          autoCapitalize="none"
          value={contactForm.email}
          onChangeText={(v) => setContactForm({ ...contactForm, email: v })}
        />

        <View style={s.emergencyToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.emergencyToggleTitle}>{t('caller.emergency_contact', { defaultValue: 'Emergency Contact' })}</Text>
            <Text style={s.emergencyToggleSub}>{t('caller.emergency_desc', { defaultValue: 'Primary person for emergencies' })}</Text>
          </View>
          <Switch
            value={contactForm.is_emergency}
            onValueChange={(v) => setContactForm({ ...contactForm, is_emergency: v })}
            trackColor={{ false: C.borderMid, true: C.danger }}
            thumbColor="#FFF"
          />
        </View>
      </PremiumFormModal>

      {/* ── Flag Issue Modal ───────────────────────────────────────────── */}
      <PremiumFormModal
        visible={flagIssueModalVisible}
        title={t('caller.flag_issue_title', { defaultValue: 'Flag an Issue' })}
        onClose={() => setFlagIssueModalVisible(false)}
        onSave={submitFlagIssue}
        saveText={t('caller.submit_report', { defaultValue: 'Submit Report' })}
        saving={flagging}
      >
        <SmartInput
          label={t('caller.what_went_wrong', { defaultValue: 'What went wrong?' })}
          variant="multiline"
          multiline
          placeholder={t('caller.describe_issue', { defaultValue: 'Please describe the issue with your caller...' })}
          value={flagDescription}
          onChangeText={setFlagDescription}
        />
        <Text style={s.disclaimer}>{t('caller.issue_disclaimer', { defaultValue: 'Your care manager will review this report and take appropriate action. All reports are strictly confidential.' })}</Text>
      </PremiumFormModal>

      {/* ── Country Code Picker ────────────────────────────────────────── */}
      <Modal visible={countryCodeModal} transparent animationType="slide" onRequestClose={() => setCountryCodeModal(false)}>
        <Pressable style={s.ccOverlay} onPress={() => setCountryCodeModal(false)}>
          <Pressable style={s.ccSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.ccHeader}>
              <Text style={s.ccTitle}>{t('caller.select_country_code', { defaultValue: 'Select Country Code' })}</Text>
              <Pressable onPress={() => setCountryCodeModal(false)} style={s.ccClose}>
                <X size={20} color={C.mid} />
              </Pressable>
            </View>
            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={item => item.code}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              renderItem={({ item }) => (
                <Pressable
                  style={s.ccRow}
                  onPress={() => { setContactForm({ ...contactForm, phoneCode: item.code }); setCountryCodeModal(false); }}
                >
                  <Text style={s.ccFlag}>{item.flag}</Text>
                  <Text style={s.ccName}>{item.name}</Text>
                  <Text style={s.ccCode}>{item.code}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Delete Confirmation ────────────────────────────────────────── */}
      <Modal visible={deleteConfirm.visible} transparent animationType="fade" onRequestClose={() => setDeleteConfirm({ visible: false, id: null, name: '' })}>
        <Pressable
          style={s.delOverlay}
          onPress={() => !isDeleting && setDeleteConfirm({ visible: false, id: null, name: '' })}
        >
          <Pressable style={s.delCard} onPress={e => e.stopPropagation()}>
            <View style={s.delIconBox}>
              <Trash2 size={26} color={C.danger} />
            </View>
            <Text style={s.delTitle}>{t('caller.remove_contact', { defaultValue: 'Remove Contact' })}</Text>
            <Text style={s.delBody}>
              {t('caller.remove_confirm_1', { defaultValue: 'Are you sure you want to remove ' })}
              <Text style={{ fontWeight: '700', color: C.dark }}>{deleteConfirm.name}</Text>
              {t('caller.remove_confirm_2', { defaultValue: ' from your trusted contacts?' })}
            </Text>
            <View style={s.delBtnRow}>
              <Pressable
                style={s.delCancelBtn}
                onPress={() => setDeleteConfirm({ visible: false, id: null, name: '' })}
                disabled={isDeleting}
              >
                <Text style={s.delCancelText}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
              </Pressable>
              <Pressable style={[s.delConfirmBtn, isDeleting && { opacity: 0.7 }]} onPress={executeRemoveContact} disabled={isDeleting}>
                {isDeleting
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={s.delConfirmText}>{t('common.remove', { defaultValue: 'Remove' })}</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.pageBg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 16,
    backgroundColor: C.pageBg,
  },
  headerLabel: { fontSize: 13, fontWeight: '800', color: C.primary, letterSpacing: 1.5, marginBottom: 4 },
  headerTitle: { fontSize: 32, fontWeight: '800', color: C.dark, letterSpacing: -1 },
  bellBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: layout.TAB_BAR_CLEARANCE },

  // Section labels
  sectionLabel: {
    fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 1.5,
    marginBottom: 12, marginTop: 8, marginLeft: 2,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  seeAllText: { fontSize: 13, fontWeight: '700', color: C.primary },

  addBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },

  // ── Hero card (caller) ──────────────────────────────────────────────────
  heroCard: { borderRadius: 28, overflow: 'hidden', marginBottom: 24, padding: 22 },

  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  verifiedBadgeText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  flagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  flagChipText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },

  heroBody: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 16 },
  heroAvatarWrap: { position: 'relative' },
  heroAvatarRing: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatar: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  heroAvatarLetter: { fontSize: 28, fontWeight: '800', color: C.primaryDark },
  heroOnlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#10B981', borderWidth: 3, borderColor: '#4F46E5',
  },

  heroInfo: { flex: 1 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#FFF', letterSpacing: -0.5, marginBottom: 4 },
  heroId:   { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginBottom: 10 },
  heroChips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroChipText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  heroChipDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.3)' },

  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 16 },

  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 18, fontWeight: '800', color: '#FFF', marginBottom: 2 },
  heroStatLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  heroStatSep: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' },

  heroCallBtn: {
    backgroundColor: '#FFF', borderRadius: 100, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  heroCallBtnText: { fontSize: 16, fontWeight: '800', color: C.primaryDark },

  // ── Pending state ───────────────────────────────────────────────────────
  pendingCard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 28, alignItems: 'center',
    marginBottom: 24, borderWidth: 1.5, borderColor: '#E0E7FF',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 16, elevation: 4,
  },
  pendingIconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  pendingTitle: { fontSize: 18, fontWeight: '800', color: C.dark, textAlign: 'center', marginBottom: 8 },
  pendingBody:  { fontSize: 14, fontWeight: '500', color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  pendingCallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 100,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  pendingCallBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // ── Manager card ────────────────────────────────────────────────────────
  managerCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 24,
    shadowColor: '#475569', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  managerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  managerAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  managerAvatarText: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  managerInfo: { flex: 1 },
  managerName: { fontSize: 16, fontWeight: '700', color: C.dark, marginBottom: 4 },
  managerRoleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  managerRoleText: { fontSize: 12, fontWeight: '600', color: C.muted },
  dotSep: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.light },
  availablePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  availableDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  availableText: { fontSize: 12, fontWeight: '600', color: C.success },
  managerCallBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center',
  },

  // ── Empty state card ────────────────────────────────────────────────────
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginBottom: 24,
    borderWidth: 1, borderColor: C.border,
  },
  emptyIconBox: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: C.pageBg,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTextBlock: { flex: 1 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.dark, marginBottom: 3 },
  emptyBody:  { fontSize: 13, fontWeight: '500', color: C.muted, lineHeight: 19 },

  // ── Contact cards ───────────────────────────────────────────────────────
  contactCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 18, marginBottom: 10,
    padding: 14, overflow: 'hidden',
    shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
  },
  contactAccent: { width: 4, height: '100%', position: 'absolute', left: 0, top: 0, borderTopLeftRadius: 18, borderBottomLeftRadius: 18 },
  contactAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 10, marginRight: 12 },
  contactAvatarTxt: { fontSize: 18, fontWeight: '800' },
  contactInfo: { flex: 1 },
  contactNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  contactName: { fontSize: 15, fontWeight: '700', color: C.dark },
  contactSub:  { fontSize: 12, fontWeight: '500', color: C.muted },
  sosPill:     { backgroundColor: C.dangerBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  sosTxt:      { fontSize: 9, fontWeight: '800', color: C.danger, letterSpacing: 0.5 },
  contactActions: { flexDirection: 'row', gap: 6 },
  contactActionBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: C.pageBg,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Recent calls section ────────────────────────────────────────────────
  callsCard: {
    backgroundColor: '#FFF', borderRadius: 20, marginBottom: 24,
    shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
    overflow: 'hidden',
  },
  callRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  callRowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  callIconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  callBody: { flex: 1 },
  callDate:     { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 2 },
  callNote:     { fontSize: 12, fontWeight: '500', color: C.muted },
  statusPill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  callDuration: { fontSize: 11, fontWeight: '600', color: C.muted, textAlign: 'right' },

  // ── Free plan gate ──────────────────────────────────────────────────────
  gatewrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  gateIcon:  { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  gateTitle: { fontSize: 20, fontWeight: '800', color: C.dark, marginBottom: 12, textAlign: 'center' },
  gateBody:  { fontSize: 15, fontWeight: '500', color: C.muted, textAlign: 'center', lineHeight: 24 },

  // ── Caller/Manager detail sheet ─────────────────────────────────────────
  sheetWrapper: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'flex-end' },

  floatingClose: { alignItems: 'flex-end', paddingRight: 24, marginBottom: 14 },
  floatingCloseBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 6,
  },

  sheet: {
    backgroundColor: C.pageBg, borderTopLeftRadius: 40, borderTopRightRadius: 40,
    height: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 30, elevation: 24,
  },
  sheetHandle:    { width: '100%', alignItems: 'center', paddingVertical: 14 },
  sheetHandleBar: { width: 44, height: 5, borderRadius: 3, backgroundColor: C.borderMid },
  sheetBody:      { paddingBottom: 60 },

  sheetHero: { marginHorizontal: 20, borderRadius: 24, padding: 20, marginBottom: 4 },
  sheetHeroInner: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  sheetAvatarWrap: { position: 'relative' },
  sheetAvatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  sheetAvatarLetter: { fontSize: 28, fontWeight: '800', color: C.primaryDark },
  sheetOnlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.success, borderWidth: 2.5, borderColor: '#4F46E5',
  },
  sheetHeroInfo: { flex: 1 },
  sheetName:    { fontSize: 22, fontWeight: '800', color: '#FFF', letterSpacing: -0.5, marginBottom: 4 },
  sheetIdText:  { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 8 },
  sheetBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  sheetBadgeText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },

  sheetStatsBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', marginHorizontal: 20, marginVertical: 16,
    borderRadius: 18, paddingVertical: 16,
    shadowColor: '#4361EE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
  },
  sheetStat:      { flex: 1, alignItems: 'center', gap: 4 },
  sheetStatVal:   { fontSize: 16, fontWeight: '800', color: C.dark },
  sheetStatLabel: { fontSize: 11, fontWeight: '600', color: C.muted },
  sheetStatSep:   { width: 1, height: 36, backgroundColor: C.border },

  sheetActions: { flexDirection: 'row', gap: 12, marginHorizontal: 20, marginBottom: 24 },
  sheetCallBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 100, height: 54,
    shadowColor: '#4338CA', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 6,
  },
  sheetCallBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  sheetFlagBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 20, height: 54, borderRadius: 100,
    backgroundColor: C.dangerBg, borderWidth: 1.5, borderColor: '#FECDD3',
  },
  sheetFlagBtnText: { fontSize: 14, fontWeight: '700', color: C.danger },

  sheetSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  sheetSectionTitle: { fontSize: 18, fontWeight: '800', color: C.dark },
  sheetCallCount:    { fontSize: 13, fontWeight: '600', color: C.muted },

  sheetCallRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 12,
  },
  sheetCallIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetCallBody: { flex: 1 },
  sheetCallDate:  { fontSize: 14, fontWeight: '700', color: C.dark, marginBottom: 2 },
  sheetCallNote:  { fontSize: 12, fontWeight: '500', color: C.muted },
  sheetCallRight: { alignItems: 'flex-end', gap: 4 },
  sheetCallBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sheetCallBadgeText: { fontSize: 11, fontWeight: '700' },
  sheetCallDuration:  { fontSize: 11, fontWeight: '600', color: C.muted },

  sheetEmptyCard: { alignItems: 'center', paddingVertical: 32, gap: 10, marginHorizontal: 20, backgroundColor: '#FFF', borderRadius: 20 },
  sheetEmptyText: { fontSize: 14, fontWeight: '500', color: C.muted },

  // ── Contact form ────────────────────────────────────────────────────────
  formLabel: { fontSize: 12, fontWeight: '700', color: C.mid, marginBottom: 8, marginTop: 16, letterSpacing: 0.3 },
  phoneRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: C.borderMid,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 13,
  },
  codeBtnFlag: { fontSize: 18 },
  codeBtnText: { fontSize: 14, fontWeight: '700', color: C.dark },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: C.borderMid },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: C.mid },
  chipTextActive: { color: '#FFF' },
  emergencyToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.borderMid,
    marginTop: 8,
  },
  emergencyToggleTitle: { fontSize: 15, fontWeight: '700', color: C.dark, marginBottom: 2 },
  emergencyToggleSub:   { fontSize: 12, fontWeight: '500', color: C.muted },
  disclaimer: { fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 19 },

  // ── Country code picker ─────────────────────────────────────────────────
  ccOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  ccSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    maxHeight: '72%', paddingBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 16,
  },
  ccHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingBottom: 14 },
  ccTitle:  { fontSize: 18, fontWeight: '800', color: C.dark },
  ccClose:  { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  ccRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  ccFlag:   { fontSize: 22, marginRight: 12 },
  ccName:   { flex: 1, fontSize: 15, fontWeight: '600', color: C.dark },
  ccCode:   { fontSize: 14, fontWeight: '700', color: C.mid },

  // ── Delete confirmation ─────────────────────────────────────────────────
  delOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  delCard: {
    backgroundColor: '#FFF', borderRadius: 28, padding: 28, width: '100%', maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.15, shadowRadius: 32, elevation: 16,
  },
  delIconBox: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  delTitle: { fontSize: 20, fontWeight: '800', color: C.dark, textAlign: 'center', marginBottom: 10 },
  delBody:  { fontSize: 15, color: C.mid,  textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  delBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  delCancelBtn:  { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: '#F1F5F9' },
  delCancelText: { fontSize: 15, fontWeight: '700', color: C.mid },
  delConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', backgroundColor: C.danger },
  delConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
