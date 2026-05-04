import { NativeModules, Platform } from 'react-native';

const { WidgetModule } = NativeModules;

const TIME_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
  as_needed: 'As Needed',
};

const DEFAULT_TIMES = {
  morning: '9:00 AM',
  afternoon: '2:00 PM',
  evening: '6:00 PM',
  night: '9:00 PM',
  as_needed: '',
};

const HEALTH_TIPS = [
  '💧 Stay hydrated! Drinking 8 glasses of water daily helps manage blood pressure.',
  '🚶 A 30-minute walk daily can reduce heart disease risk by 35%.',
  '😴 Quality sleep (7-9 hrs) helps regulate blood sugar and blood pressure.',
  '🍎 Eating 5 servings of fruits and vegetables daily boosts immunity.',
  '🧘 Practice deep breathing for 5 minutes to reduce stress hormones.',
  '💊 Set reminders for your medications — consistency matters!',
  '🫁 Deep breathing exercises improve oxygen saturation levels.',
  '☀️ Get 15 minutes of sunlight daily for natural vitamin D.',
  '🧂 Reducing salt intake by 1 teaspoon can lower BP by 5-6 mmHg.',
  '🫀 Regular heart rate monitoring helps detect irregularities early.',
  '🥗 A Mediterranean diet is linked to 25% lower heart disease risk.',
  '💪 Strength training twice a week improves bone density and metabolism.',
  '🧠 Social interaction reduces cognitive decline risk by 70%.',
  '🍵 Green tea contains antioxidants that support heart health.',
  '😊 Laughing for 15 minutes a day improves blood vessel function.',
];

/**
 * WidgetBridge — Premium Android Home Screen Widget Interface
 *
 * Sends structured JSON data to 5 native Android AppWidgetProviders
 * via SharedPreferences for rich, adaptive home screen widgets.
 *
 * Payload structure:
 * {
 *   medicine: { taken, total, adherence, nextMed, nextTime, allDone, slots },
 *   vitals: { heart_rate, bp, oxygen, hydration, logged },
 *   ai: { label, trend },
 *   streak: { count, premiumDays },
 *   careTeam: { callerName, callerPhone, nextAppointment },
 *   tip: "...",
 *   greeting: "..."
 * }
 */
const WidgetBridge = {
  /**
   * Send raw JSON string to the native widget module
   * @param {string} jsonString - Stringified JSON payload
   */
  setWidgetData(jsonString) {
    if (Platform.OS !== 'android' || !WidgetModule) return;
    try {
      WidgetModule.setWidgetData(jsonString);
    } catch (error) {
      console.error('[WidgetBridge] Failed to update widget:', error);
    }
  },

  /**
   * Clear widget data (call on sign-out)
   */
  clearWidget() {
    if (Platform.OS !== 'android' || !WidgetModule) return;
    try {
      WidgetModule.clearWidgetData();
    } catch (error) {
      console.error('[WidgetBridge] Failed to clear widget:', error);
    }
  },

  /**
   * Legacy method — still works, calls updateAllWidgets internally
   * @param {Array} medicines - Array of medicine objects from the store
   */
  updateMedicineWidget(medicines) {
    this.updateAllWidgets({ meds: medicines });
  },

  /**
   * Update all 5 widgets with full dashboard data.
   * @param {Object} data - Dashboard data object
   * @param {Array}  data.meds - Medications array
   * @param {Object} data.vitals - Vitals object (heart_rate, blood_pressure, oxygen_saturation, hydration)
   * @param {Object} data.aiPrediction - AI prediction { health_label, predictions }
   * @param {Object} data.adherenceDetails - { streak }
   * @param {Object} data.patient - Patient object (subscription, etc.)
   * @param {Object} data.caller - Caller object (name, phone)
   * @param {Array}  data.vitalsHistory - Array of vitals history entries
   */
  updateAllWidgets(data = {}) {
    if (Platform.OS !== 'android' || !WidgetModule) return;

    const {
      meds = [],
      vitals = null,
      aiPrediction = null,
      adherenceDetails = null,
      patient = null,
      caller = null,
      vitalsHistory = [],
    } = data;

    // ── Greeting ──
    const h = new Date().getHours();
    const greeting = h < 12 ? 'Good Morning ☀️' : h < 17 ? 'Good Afternoon 🌤️' : 'Good Evening 🌙';

    // ── Medicine data ──
    const taken = meds.filter(m => m.taken).length;
    const total = meds.length;
    const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;
    const allDone = taken === total && total > 0;

    // Next pending med
    let nextMed = '';
    let nextTime = '';
    if (!allDone && meds.length > 0) {
      const pending = meds.filter(m => !m.taken);
      if (pending.length > 0) {
        const next = pending[0];
        nextMed = next.name + (next.dosage ? ' ' + next.dosage : '');
        const slotLabel = TIME_LABELS[next.type] || next.type || '';
        const timeStr = next.time || DEFAULT_TIMES[next.type] || '';
        nextTime = timeStr ? `${slotLabel} • ${timeStr}` : slotLabel;
      }
    }

    // Slots breakdown
    const slots = {};
    for (const m of meds) {
      const slot = m.type || 'as_needed';
      if (!slots[slot]) slots[slot] = [];
      slots[slot].push({ name: m.name, taken: !!m.taken });
    }

    // ── Vitals data ──
    const vitalsPayload = {
      heart_rate: vitals?.heart_rate != null ? String(vitals.heart_rate) : '—',
      bp: vitals?.blood_pressure?.systolic
        ? `${vitals.blood_pressure.systolic}/${vitals.blood_pressure.diastolic}`
        : '—',
      oxygen: vitals?.oxygen_saturation != null ? String(vitals.oxygen_saturation) : '—',
      hydration: vitals?.hydration != null ? String(vitals.hydration) : '—',
      logged: !!(vitals?.heart_rate || vitals?.blood_pressure?.systolic),
    };

    // ── AI data ──
    const aiPayload = {
      label: aiPrediction?.health_label || '—',
      trend: vitalsHistory.slice(-7).map(v => v.heart_rate != null ? String(v.heart_rate) : '—'),
    };

    // ── Streak data ──
    let premiumDays = 0;
    if (patient?.subscription?.expires_at) {
      const diff = new Date(patient.subscription.expires_at) - new Date();
      premiumDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    const streakPayload = {
      count: adherenceDetails?.streak || 0,
      premiumDays,
    };

    // ── Care Team data ──
    const careTeamPayload = {
      callerName: caller?.name || '',
      callerPhone: caller?.phone || '',
      nextAppointment: '', // Future feature — appointment scheduling
    };

    // ── Daily tip ──
    const tipIndex = Math.floor(Date.now() / 86400000) % HEALTH_TIPS.length;
    const tip = HEALTH_TIPS[tipIndex];

    // ── Build full payload ──
    const payload = JSON.stringify({
      medicine: { taken, total, adherence, nextMed, nextTime, allDone, greeting, slots },
      vitals: vitalsPayload,
      ai: aiPayload,
      streak: streakPayload,
      careTeam: careTeamPayload,
      tip,
      greeting,
    });

    this.setWidgetData(payload);
  },
};

export default WidgetBridge;
