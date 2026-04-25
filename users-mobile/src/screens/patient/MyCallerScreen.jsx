import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform, RefreshControl,
  Pressable, ActivityIndicator, Linking, Animated,
  Modal, TouchableOpacity, TouchableWithoutFeedback, Alert, TextInput, Keyboard, KeyboardAvoidingView, FlatList,
} from 'react-native';
import PremiumFormModal from '../../components/ui/PremiumFormModal';
import {
  Phone, PhoneIncoming, AlertTriangle, ShieldCheck,
  Flag, Clock, Globe, Calendar, ChevronRight, ChevronDown, X, Users, Heart,
  Plus, Edit2, Bell, Trash2
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme';
import { apiService } from '../../lib/api';
import { COUNTRY_CODES, parsePhoneWithCode, validatePhone } from '../../utils/phoneUtils';

const C = {
  primary: '#6366F1',     // Indigo
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
  danger: '#F43F5E',      // Rose
  dangerBg: '#FFE4E6',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  accent: '#06B6D4',      // Cyan
};

const STATUS_CONFIG = {
  completed: { color: C.success, bg: C.successBg, Icon: PhoneIncoming, label: 'Completed' },
  missed: { color: C.danger, bg: C.dangerBg, Icon: AlertTriangle, label: 'Missed' },
  attempted: { color: C.warning, bg: C.warningBg, Icon: Clock, label: 'Attempted' },
  refused: { color: C.danger, bg: C.dangerBg, Icon: AlertTriangle, label: 'Refused' },
  rescheduled: { color: C.warning, bg: C.warningBg, Icon: Calendar, label: 'Rescheduled' },
};

const AVATAR_COLORS = [
  { bg: '#EEF2FF', text: '#4338CA' }, // Indigo
  { bg: '#FFE4E6', text: '#E11D48' }, // Rose
  { bg: '#ECFCCB', text: '#4D7C0F' }, // Lime
  { bg: '#FEF3C7', text: '#B45309' }, // Amber
  { bg: '#E0F2FE', text: '#0369A1' }, // Sky
];

export default function MyCallerScreen({ navigation }) {
  const [patient, setPatient] = useState(null);
  const [caller, setCaller] = useState(null);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [flagging, setFlagging] = useState(false);
  const [flagIssueModalVisible, setFlagIssueModalVisible] = useState(false);
  const [flagDescription, setFlagDescription] = useState('');

  const [contacts, setContacts] = useState([]);
  const [contactModal, setContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', phoneCode: '+91', relation: '', email: '' });
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [countryCodeModal, setCountryCodeModal] = useState(false);
  const contactModalAnim = useRef(new Animated.Value(0)).current;

  const staggerAnims = useRef([...Array(20)].map(() => new Animated.Value(0))).current;
  const modalAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  const runAnimations = useCallback(() => {
    staggerAnims.forEach(a => a.setValue(0));
    Animated.parallel([
      Animated.spring(cardAnim, { toValue: 1, friction: 7, tension: 40, useNativeDriver: true }),
      Animated.stagger(55,
        staggerAnims.map(a =>
          Animated.spring(a, { toValue: 1, friction: 8, tension: 42, useNativeDriver: true }),
        ),
      ),
    ]).start();
  }, [staggerAnims, cardAnim]);

  const openModal = (profile) => {
    setSelectedProfile(profile);
    setModal(true);
    Animated.parallel([
      Animated.spring(modalAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
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
      Alert.alert('Issue Flagged', 'Your issue has been reported to the care team.');
    } catch (err) {
      Alert.alert('Error', 'Failed to flag issue. Please try again.');
      console.warn('Flag issue error:', err.message);
    } finally {
      setFlagging(false);
    }
  };

  const [manager, setManager] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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
    (async () => {
      await loadData();
      setLoading(false);
    })();
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
      setContactForm({ name: contact.name, phone: parsed.number, phoneCode: parsed.code, relation: contact.relation || '', email: contact.email || '' });
    } else {
      setEditingContact(null);
      setContactForm({ name: '', phone: '', phoneCode: '+91', relation: '', email: '' });
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
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setContactModal(false);
      setEditingContact(null);
    });
  };

  const saveContact = async () => {
    if (!contactForm.name?.trim()) {
      Alert.alert('Required', 'Please enter the contact\'s name.');
      return;
    }

    const phoneErr = validatePhone(contactForm.phone, contactForm.phoneCode);
    if (phoneErr) {
      Alert.alert('Invalid Phone', phoneErr);
      return;
    }

    if (contactForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    const fullPhone = `${contactForm.phoneCode}${contactForm.phone.replace(/[^0-9]/g, '')}`;

    // Duplicate check
    if (!editingContact) {
      const isDup = contacts.some(c => c.phone.replace(/[^0-9]/g, '') === fullPhone.replace(/[^0-9]/g, ''));
      if (isDup) {
        Alert.alert('Duplicate', 'A contact with this phone number already exists.');
        return;
      }
    }

    setIsSavingContact(true);
    try {
      const payload = {
        name: contactForm.name.trim(),
        phone: fullPhone,
        relation: contactForm.relation?.trim() || '',
        email: contactForm.email?.trim() || '',
        is_primary: false,
        can_view_data: false,
        permissions: [],
      };
      let res;
      if (editingContact) {
        res = await apiService.patients.updateTrustedContact(editingContact._id, payload);
      } else {
        res = await apiService.patients.addTrustedContact(payload);
      }
      setContacts(res.data.trusted_contacts);
      closeContactModal();
    } catch (err) {
      console.warn('Save contact error:', err.message);
      Alert.alert('Error', 'Failed to save contact.');
    } finally {
      setIsSavingContact(false);
    }
  };

  const confirmRemoveContact = (id) => {
    const performToggle = async () => {
      try {
        const res = await apiService.patients.deleteTrustedContact(id);
        setContacts(res.data.trusted_contacts);
      } catch (err) {
        console.warn('Remove contact error:', err.message);
        Alert.alert('Error', 'Failed to remove contact.');
      }
    };

    if (Platform.OS === 'web') {
      // Direct confirm for web to bypass any RN Alert polyfill issues
      if (window.confirm('Are you sure you want to remove this trusted contact?')) {
        performToggle();
      }
    } else {
      Alert.alert('Remove Contact', 'Are you sure you want to remove this trusted contact?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: performToggle }
      ]);
    }
  };

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

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  if (patient?.subscription?.plan === 'free') {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <View style={s.upgradeIconWrap}>
          <ShieldCheck size={32} color="#6366F1" />
        </View>
        <Text style={s.upgradeTitle}>Premium Feature</Text>
        <Text style={s.upgradeBody}>
          A dedicated care team caller is included in the Basic Plan. Upgrade on the Home screen to
          get matched with a caller from your city.
        </Text>
      </View>
    );
  }


  return (
    <LinearGradient colors={['#F8FAFC', '#EEF2FF']} style={s.container}>
      {/* ── Premium Gradient Header ── */}
      <View style={[s.headerWrap, { zIndex: 10, elevation: 10 }]}>
        <Animated.View style={[s.minimalHeader, { opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
          <View style={s.mainHeaderRow}>
            <View style={s.headerLeft}>
              <Text style={s.headerLabel}>SUPPORT</Text>
              <Text style={s.headerTitle}>Care Team</Text>
            </View>
            <View style={s.headerRight}>
              <TouchableOpacity
                style={s.headerRightBtn}
                onPress={() => navigation.navigate('Notifications')}
              >
                <Bell size={20} color={C.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        {/* CALLERS SECTION */}
        <View style={[s.section, { marginTop: -40 }]}>
          <Text style={s.sectionHeader}>YOUR CALLER</Text>
          {caller ? (
            <Animated.View style={{ opacity: staggerAnims[0], transform: [{ translateY: staggerAnims[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
              <Pressable onPress={() => openModal(caller)} style={({ pressed }) => [s.callerCard, pressed && s.callerCardPressed]}>
                {/* Avatar + name row */}
                <View style={s.profileRow}>
                  <View style={s.avatarWrap}>
                    <LinearGradient colors={['#4338CA', '#312E81']} style={s.avatar}>
                      <Text style={s.avatarLetter}>{caller.name?.charAt(0)}</Text>
                    </LinearGradient>
                    <View style={s.onlineDot} />
                  </View>
                  <View style={s.profileInfo}>
                    <Text style={s.callerName} numberOfLines={1}>{caller.name}</Text>
                    <View style={s.metaRow}>
                      <Text style={s.idChipText}>ID: {caller.employee_id}</Text>
                      <View style={s.dotDivider} />
                      <View style={s.onlinePill}>
                        <View style={s.onlinePillDot} />
                        <Text style={s.onlinePillText}>Online</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.chevronWrap}>
                    <ChevronRight size={20} color={C.light} strokeWidth={2.5} />
                  </View>
                </View>

                {/* Action buttons */}
                <View style={s.actionRow}>
                  <Pressable
                    style={({ pressed }) => [s.btnCall, pressed && s.btnCallPressed]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      caller?.phone && Linking.openURL(`tel:${caller.phone}`);
                    }}
                  >
                    <Phone size={16} color="#FFF" strokeWidth={2.5} />
                    <Text style={s.btnCallText}>Call Now</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.btnFlag, pressed && s.btnFlagPressed]}
                    onPress={(e) => { e.stopPropagation?.(); setFlagIssueModalVisible(true); }}
                  >
                    <Flag size={16} color={C.danger} strokeWidth={2.2} />
                    <Text style={s.btnFlagText}>Flag Issue</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Animated.View>
          ) : (
            <View style={s.pendingCard}>
              <View style={s.pendingIconWrap}>
                <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={s.pendingIconCircle}>
                  <PhoneIncoming size={28} color={C.primary} strokeWidth={1.5} />
                </LinearGradient>
              </View>
              <Text style={s.pendingTitle}>Caregiver Being Assigned</Text>
              <Text style={s.pendingBody}>
                Your care manager has been notified and is assigning a dedicated caregiver for you. You'll receive a notification once they're ready!
              </Text>
              {manager && (
                <Pressable
                  style={({ pressed }) => [s.pendingContactBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => manager.phone && Linking.openURL(`tel:${manager.phone}`)}
                >
                  <Phone size={16} color="#FFF" strokeWidth={2.5} />
                  <Text style={s.pendingContactBtnText}>Contact Your Manager</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* MANAGER SECTION */}
        <Animated.View style={{ opacity: staggerAnims[1], transform: [{ translateY: staggerAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionHeaderBase}>MANAGER</Text>
            </View>
            {manager ? (
              <Pressable onPress={() => openModal({ ...manager, isManager: true })} style={({ pressed }) => [s.callerCard, pressed && s.callerCardPressed]}>
                <View style={s.profileRow}>
                  <View style={s.avatarWrap}>
                    <LinearGradient colors={['#64748B', '#334155']} style={s.avatar}>
                      <Text style={s.avatarLetter}>{manager.fullName?.charAt(0) || 'M'}</Text>
                    </LinearGradient>
                  </View>
                  <View style={s.profileInfo}>
                    <Text style={s.callerName} numberOfLines={1}>{manager.fullName || 'Manager'}</Text>
                    <View style={s.metaRow}>
                      <Text style={s.idChipText}>Manager</Text>
                      <View style={s.dotDivider} />
                      <View style={s.onlinePill}>
                        <View style={s.onlinePillDot} />
                        <Text style={s.onlinePillText}>Available</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={s.actionRow}>
                  <Pressable
                    style={({ pressed }) => [s.btnCall, { backgroundColor: '#334155' }, pressed && s.btnCallPressed]}
                    onPress={() => manager.phone && Linking.openURL(`tel:${manager.phone}`)}
                  >
                    <Phone size={16} color="#FFF" strokeWidth={2.5} />
                    <Text style={s.btnCallText}>Contact Manager</Text>
                  </Pressable>
                </View>
              </Pressable>
            ) : (
              <LinearGradient colors={['#F8FAFC', '#F1F5F9']} style={s.emptyCardPremium}>
                <View style={s.emptyIconWrapPremium}>
                  <ShieldCheck size={32} color={C.primary} strokeWidth={1.5} />
                </View>
                <Text style={s.emptyTitle}>No Manager Assigned</Text>
                <Text style={s.emptyBody}>A manager will be assigned if additional support is required.</Text>
              </LinearGradient>
            )}
          </View>
        </Animated.View>

        {/* TRUSTED CONTACTS SECTION */}
        <Animated.View style={{ opacity: staggerAnims[2], transform: [{ translateY: staggerAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionHeaderBase}>TRUSTED CONTACTS</Text>
              <Pressable style={s.addBtnText} onPress={() => openContactModal()}>
                <Plus size={14} color={C.primary} strokeWidth={2.5} />
                <Text style={s.addBtnLabel}>Add</Text>
              </Pressable>
            </View>

            {contacts.length === 0 ? (
              <LinearGradient colors={['#F8FAFC', '#F1F5F9']} style={s.emptyCardPremium}>
                <View style={s.emptyIconWrapPremium}>
                  <Users size={32} color={C.primary} strokeWidth={1.5} />
                </View>
                <Text style={s.emptyTitle}>No Contacts Added</Text>
                <Text style={s.emptyBody}>Add trusted family members or friends for emergencies.</Text>
              </LinearGradient>
            ) : (
              contacts.map((contact, idx) => {
                const colorTheme = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                return (
                  <View key={contact._id} style={s.contactCard}>
                    <View style={[s.contactAvatar, { backgroundColor: colorTheme.bg }]}>
                      <Text style={[s.contactAvatarTxt, { color: colorTheme.text }]}>{contact.name.charAt(0)}</Text>
                    </View>
                    <View style={s.contactInfo}>
                      <Text style={s.contactName} numberOfLines={1}>{contact.name}</Text>
                      <Text style={s.contactSub} numberOfLines={1}>{contact.relation ? `${contact.relation} • ` : ''}{contact.phone}</Text>
                    </View>
                    <View style={s.contactActions}>
                      <Pressable style={s.iconActionBtn} onPress={() => openContactModal(contact)}>
                        <Edit2 size={16} color={C.light} />
                      </Pressable>
                      <Pressable style={s.iconActionBtn} onPress={() => confirmRemoveContact(contact._id)}>
                        <X size={18} color={C.danger} />
                      </Pressable>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        {(() => {
          const isManager = selectedProfile?.isManager;
          const profileName = isManager ? (selectedProfile.fullName || 'Manager') : (selectedProfile?.name || 'Care Team');
          const profileIdText = isManager ? 'Role: Care Manager' : `Support ID: ${selectedProfile?.employee_id || 'N/A'}`;
          const profileGradient = isManager ? ['#64748B', '#334155'] : ['#4338CA', '#312E81'];
          const profileExp = selectedProfile?.experience_years || 0;
          const profileLang = (selectedProfile?.languages_spoken?.length || 0) > 0 ? selectedProfile.languages_spoken[0] : 'English';
          const profilePhone = selectedProfile?.phone;

          return (
            <>
        <TouchableWithoutFeedback onPress={closeModal}>
          <Animated.View style={[s.backdrop, { opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        <View style={s.modalWrapper}>
          {/* Floating Close Button */}
          <Animated.View style={[
            s.floatingCloseWrap,
            {
              opacity: modalAnim,
              transform: [{
                translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }),
              }],
            }
          ]}>
            <TouchableOpacity onPress={closeModal} style={s.floatingCloseBtn}>
              <X size={20} color="#0F172A" strokeWidth={3} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[
            s.modalSheet,
            {
              transform: [{
                translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [800, 0] }),
              }],
            },
          ]}>
            {/* Modal handle */}
            <View style={s.modalHandleWrap}>
              <View style={s.modalHandle} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalBody}>
              {/* Profile Header */}
              <View style={s.modalHeaderRow}>
                <View style={s.modalProfileInfo}>
                  <Text style={s.modalCallerName} numberOfLines={1}>{profileName}</Text>
                  <Text style={s.modalIdText}>{profileIdText}</Text>
                </View>
                <View style={s.avatarWrapLg}>
                  <LinearGradient colors={profileGradient} style={s.avatarLg}>
                    <Text style={s.avatarLetterLg}>{profileName.charAt(0)}</Text>
                  </LinearGradient>
                  <View style={s.onlineDotLg} />
                </View>
              </View>

              {/* Action buttons (Modal) */}
              <View style={s.modalActionRow}>
                <Pressable
                  style={({ pressed }) => [s.btnCallLg, { backgroundColor: isManager ? '#334155' : '#4338CA' }, pressed && s.btnCallPressedLg]}
                  onPress={() => profilePhone && Linking.openURL(`tel:${profilePhone}`)}
                >
                  <Phone size={18} color="#FFF" strokeWidth={2.5} />
                  <Text style={s.btnCallTextLg}>Call Now</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.iconBtn, pressed && s.iconBtnPressed]}
                  onPress={() => setFlagIssueModalVisible(true)}
                >
                  <Flag size={20} color={C.danger} strokeWidth={2.5} />
                </Pressable>
              </View>

              {/* Bento Box Stats */}
              <View style={s.bentoGrid}>
                <View style={[s.bentoBox, { backgroundColor: '#F8FAFC' }]}>
                  <View style={[s.bentoIcon, { backgroundColor: '#F1F5F9' }]}>
                    <Clock size={16} color="#475569" strokeWidth={2.5} />
                  </View>
                  <Text style={s.bentoVal}>{profileExp} yrs</Text>
                  <Text style={s.bentoLbl}>Experience</Text>
                </View>
                <View style={[s.bentoBox, { backgroundColor: '#F8FAFC' }]}>
                  <View style={[s.bentoIcon, { backgroundColor: '#F1F5F9' }]}>
                    <Globe size={16} color="#475569" strokeWidth={2.5} />
                  </View>
                  <Text style={s.bentoVal} numberOfLines={1}>
                    {profileLang}
                  </Text>
                  <Text style={s.bentoLbl}>Primary Lang</Text>
                </View>
                <View style={[s.bentoBox, { backgroundColor: '#F8FAFC' }]}>
                  <View style={[s.bentoIcon, { backgroundColor: '#F1F5F9' }]}>
                    <ShieldCheck size={16} color="#475569" strokeWidth={2.5} />
                  </View>
                  <Text style={s.bentoVal}>Certified</Text>
                  <Text style={s.bentoLbl}>Status</Text>
                </View>
              </View>

              {/* Call History (Only for Caller) */}
              {!isManager && (
                <>
                  <View style={s.sectionHead}>
                    <Text style={s.sectionTitle}>Recent Calls</Text>
                    <Pressable style={s.seeAllWrap}><Text style={s.seeAllText}>See all</Text></Pressable>
                  </View>

                  {calls.length === 0 ? (
                    <View style={s.emptyHistoryWrap}>
                      <Text style={s.emptyBody}>No calls recorded yet.</Text>
                    </View>
                  ) : (
                    calls.map((call) => {
                      const cfg = STATUS_CONFIG[call.status] || STATUS_CONFIG.completed;
                      const Icon = cfg.Icon;
                      const duration = formatDuration(call.call_duration_seconds);
                      return (
                        <View key={call._id} style={s.historyBentoCard}>
                          <View style={[s.historyIconBg, { backgroundColor: cfg.bg }]}>
                            <Icon size={20} color={cfg.color} strokeWidth={2} />
                          </View>
                          <View style={s.historyBody}>
                            <Text style={s.historyDate}>
                              {new Date(call.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </Text>
                            <Text style={s.historyNote} numberOfLines={1}>{call.notes || 'Routine check-in'}</Text>
                          </View>
                          <View style={[s.badgeBox, { backgroundColor: cfg.bg }]}>
                            <Text style={[s.badgeText, { color: cfg.color }]}>{duration}</Text>
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

      {/* ── Contact Form Modal ── */}
      <PremiumFormModal
        visible={contactModal}
        title={editingContact ? 'Edit Contact' : 'New Contact'}
        onClose={closeContactModal}
        onSave={saveContact}
        saveText={editingContact ? 'Update Contact' : 'Add Contact'}
        saving={isSavingContact}
        headerRight={
          editingContact && (
            <Pressable onPress={() => confirmRemoveContact(editingContact._id)} style={{ padding: 8 }}>
              <Trash2 size={20} color={C.danger} />
            </Pressable>
          )
        }
      >
        {/* Name */}
        <View style={s.formGroup}>
          <Text style={s.formLabel}>Full Name *</Text>
          <TextInput
            style={s.formInput}
            placeholder="e.g. Ramesh Kumar"
            placeholderTextColor="#94A3B8"
            value={contactForm.name}
            onChangeText={(t) => setContactForm({ ...contactForm, name: t })}
            returnKeyType="next"
          />
        </View>

        {/* Phone */}
        <View style={s.formGroup}>
          <Text style={s.formLabel}>Phone Number *</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 14,
                backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', height: 48,
              }}
              onPress={() => setCountryCodeModal(true)}
            >
              <Text style={{ fontSize: 16 }}>{COUNTRY_CODES.find(c => c.code === contactForm.phoneCode)?.flag}</Text>
              <Text style={{ fontSize: 15, color: '#334155', fontWeight: '500' }}>{contactForm.phoneCode}</Text>
              <ChevronDown size={14} color="#94A3B8" />
            </Pressable>
            <TextInput
              style={[s.formInput, { flex: 1, marginTop: 0 }]}
              placeholder="98765 43210"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={contactForm.phone}
              onChangeText={(t) => setContactForm({ ...contactForm, phone: t.replace(/[^0-9]/g, '') })}
              maxLength={COUNTRY_CODES.find(c => c.code === contactForm.phoneCode)?.maxDigits || 12}
              returnKeyType="next"
            />
          </View>
        </View>

        {/* Relationship — Chip Selector */}
        <View style={s.formGroup}>
          <Text style={s.formLabel}>Relationship</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['Son', 'Daughter', 'Spouse', 'Sibling', 'Friend', 'Neighbour', 'Other'].map(opt => {
              const isActive = contactForm.relation === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setContactForm({ ...contactForm, relation: opt })}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
                    backgroundColor: isActive ? C.primary : '#F1F5F9',
                    borderWidth: 1, borderColor: isActive ? C.primary : '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#FFF' : C.mid }}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Email */}
        <View style={s.formGroup}>
          <Text style={s.formLabel}>Email (Optional)</Text>
          <TextInput
            style={s.formInput}
            placeholder="email@example.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            value={contactForm.email}
            onChangeText={(t) => setContactForm({ ...contactForm, email: t })}
            returnKeyType="done"
          />
        </View>
      </PremiumFormModal>

      {/* Flag Issue Modal */}
      <PremiumFormModal
        visible={flagIssueModalVisible}
        title="Flag an Issue"
        onClose={() => setFlagIssueModalVisible(false)}
        onSave={submitFlagIssue}
        saveText="Submit Report"
        saving={flagging}
      >
        <View style={s.formGroup}>
          <Text style={s.formLabel}>What went wrong?</Text>
          <TextInput
            style={[s.formInput, { height: 120, paddingTop: 16 }]}
            placeholder="Please describe the issue with your caller..."
            placeholderTextColor="#94A3B8"
            multiline
            textAlignVertical="top"
            value={flagDescription}
            onChangeText={setFlagDescription}
          />
        </View>
        <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 12, lineHeight: 20 }}>
          Your care manager will review this report and take appropriate action. All reports are strictly confidential.
        </Text>
      </PremiumFormModal>

      {/* Country Code Picker Modal */}
      <Modal visible={countryCodeModal} transparent animationType="slide" onRequestClose={() => setCountryCodeModal(false)}>
        <Pressable style={s.backdrop} onPress={() => setCountryCodeModal(false)}>
          <View style={s.modalWrapper}>
            <Pressable style={s.contactFormSheet} onPress={(e) => e.stopPropagation()}>
              <View style={[s.modalHeaderRow, { padding: 24, paddingBottom: 12 }]}>
                <Text style={s.sectionTitle}>Select Country Code</Text>
                <Pressable onPress={() => setCountryCodeModal(false)} style={s.modalCloseBtn}>
                  <X size={20} color={C.mid} />
                </Pressable>
              </View>
              <FlatList
                data={COUNTRY_CODES}
                keyExtractor={item => item.code}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}
                    onPress={() => {
                      setContactForm({ ...contactForm, phoneCode: item.code });
                      setCountryCodeModal(false);
                    }}
                  >
                    <Text style={{ fontSize: 24, marginRight: 12 }}>{item.flag}</Text>
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: '#0F172A' }}>{item.name}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#64748B' }}>{item.code}</Text>
                  </Pressable>
                )}
              />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const FONT = {
  regular: { fontFamily: 'Inter_400Regular' },
  medium: { fontFamily: 'Inter_500Medium' },
  semibold: { fontFamily: 'Inter_600SemiBold' },
  bold: { fontFamily: 'Inter_700Bold' },
  heavy: { fontFamily: 'Inter_800ExtraBold' },
  black: { fontFamily: 'Inter_900Black' },
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' }, // New light page bg for premium look

  // ── Header (Premium Gradient Design) ──
  headerWrap: { zIndex: 10 },
  minimalHeader: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: 'transparent' },
  mainHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flex: 1 },
  headerLabel: { fontSize: 13, fontWeight: '800', color: C.primary, letterSpacing: 1.5, marginBottom: 4 },
  headerTitle: { fontSize: 32, fontWeight: '800', color: C.dark, letterSpacing: -1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRightBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
  },

  // ── Body ──
  body: { flex: 1 },
  section: { marginBottom: 24, width: '100%' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  sectionHeader: { fontSize: 13, ...FONT.bold, color: '#94A3B8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, marginLeft: 4 },
  sectionHeaderBase: { fontSize: 13, ...FONT.bold, color: '#94A3B8', letterSpacing: 1.5, textTransform: 'uppercase' },
  addBtnText: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  addBtnLabel: { fontSize: 12, ...FONT.bold, color: '#3B82F6' },
  bodyContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },

  // ── Contact Card ──
  contactCard: {
    backgroundColor: C.cardBg, borderRadius: 20, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 4,
  },
  contactAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  contactAvatarTxt: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '600', color: C.dark, marginBottom: 4 },
  contactSub: { fontSize: 13, fontWeight: '500', color: C.muted },
  contactActions: { flexDirection: 'row', gap: 6 },
  iconActionBtn: { padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },

  // ── Caller Card ──
  callerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginBottom: 16,
    padding: 20,
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05, shadowRadius: 16, elevation: 5,
  },
  callerCardPressed: { opacity: 0.96, transform: [{ scale: 0.98 }] },

  profileRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrap: { position: 'relative', marginRight: 18 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#10B981', borderWidth: 3, borderColor: '#FFFFFF',
  },
  profileInfo: { flex: 1 },
  callerName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  idChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  dotDivider: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginHorizontal: 8 },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlinePillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  onlinePillText: { fontSize: 13, fontWeight: '600', color: '#10B981' },
  chevronWrap: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center', marginLeft: 10,
  },

  // ── Action buttons ──
  actionRow: {
    flexDirection: 'row', gap: 12,
  },
  btnCall: {
    flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16,
    height: 48, backgroundColor: '#4338CA',
  },
  btnCallPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  btnCallText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  btnFlag: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 16, height: 48, backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  btnFlagPressed: { backgroundColor: '#F1F5F9' },
  btnFlagText: { fontSize: 13, fontWeight: '600', color: '#475569' },

  // ── Empty / Upgrade state ──
  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyCard: { backgroundColor: C.cardBg, borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: C.border, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 4 },
  emptyCardPremium: { backgroundColor: C.cardBg, borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.pageBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyIconWrapPremium: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.dark, marginBottom: 8 },
  emptyBody: { fontSize: 14, fontWeight: '500', color: C.muted, textAlign: 'center', lineHeight: 22 },

  // Pending caller assignment card
  pendingCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E0E7FF', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  pendingIconWrap: { marginBottom: 20 },
  pendingIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  pendingTitle: { fontSize: 20, fontWeight: '800', color: C.dark, marginBottom: 8, textAlign: 'center' },
  pendingBody: { fontSize: 14, fontWeight: '500', color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  pendingContactBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6366F1', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  pendingContactBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  upgradeIconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  upgradeTitle: { fontSize: 20, fontWeight: '700', color: C.dark, marginBottom: 12 },
  upgradeBody: { fontSize: 15, fontWeight: '500', color: C.muted, textAlign: 'center', lineHeight: 24 },

  // ── Modal ──
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  modalWrapper: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'flex-end',
  },

  // Floating Close Button
  floatingCloseWrap: {
    alignItems: 'flex-end',
    paddingRight: 24,
    marginBottom: 16,
  },
  floatingCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
  },

  modalSheet: {
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    height: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 30, elevation: 20,
  },
  contactFormSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '92%',
    marginTop: 60,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 16,
  },
  modalHandleWrap: { width: '100%', alignItems: 'center', paddingVertical: 14 },
  modalHandle: { width: 48, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1' },

  modalBody: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 60 },

  // ── Modal Profile Area ──
  modalHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalProfileInfo: { flex: 1, paddingRight: 16 },
  modalCallerName: { fontSize: 28, ...FONT.heavy, color: '#0F172A', marginBottom: 6, letterSpacing: -0.5 },
  modalIdText: { fontSize: 14, ...FONT.medium, color: '#64748B' },

  avatarWrapLg: { position: 'relative' },
  avatarLg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avatarLetterLg: { fontSize: 32, ...FONT.bold, color: '#FFF' },
  onlineDotLg: {
    position: 'absolute', bottom: 4, right: 4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#10B981', borderWidth: 3, borderColor: '#F9FAFB',
  },

  // ── Modal Actions ──
  modalActionRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  btnCallLg: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderRadius: 100, height: 64, backgroundColor: '#4338CA',
    shadowColor: '#4338CA', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8,
  },
  btnCallPressedLg: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  btnCallTextLg: { fontSize: 17, ...FONT.bold, color: '#FFF' },
  iconBtn: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#F1F5F9',
  },
  iconBtnPressed: { backgroundColor: '#FEF2F2', transform: [{ scale: 0.95 }] },

  // ── Bento Box Stats ──
  bentoGrid: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  bentoBox: {
    flex: 1, borderRadius: 28, padding: 20, alignItems: 'center',
    backgroundColor: '#FFF',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 4,
  },
  bentoIcon: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  bentoVal: { fontSize: 18, ...FONT.heavy, color: '#0F172A', marginBottom: 6 },
  bentoLbl: { fontSize: 12, ...FONT.semibold, color: '#64748B' },

  // ── Section Header ──
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 18, ...FONT.heavy, color: '#0F172A', letterSpacing: -0.3 },
  seeAllWrap: { padding: 4 },
  seeAllText: { fontSize: 14, ...FONT.semibold, color: '#3B82F6' },

  // ── Call History Bento ──
  historyBentoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 24,
    padding: 16, marginBottom: 12,
    shadowColor: '#1A202C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03, shadowRadius: 12, elevation: 2,
  },
  historyIconBg: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  historyBody: { flex: 1, paddingRight: 10 },
  historyDate: { fontSize: 14, ...FONT.bold, color: '#0F172A', marginBottom: 4 },
  historyNote: { fontSize: 13, ...FONT.medium, color: '#64748B' },

  badgeBox: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeText: { fontSize: 12, ...FONT.bold },

  emptyHistoryWrap: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 32, alignItems: 'center',
  },

  modalCloseBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center'
  },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, ...FONT.bold, color: '#475569', marginBottom: 6 },
  formInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#0F172A', ...FONT.medium,
  },
});
