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

/**
 * WidgetBridge — Premium Android Home Screen Widget Interface
 *
 * Sends structured JSON data to the native Android AppWidgetProvider
 * via SharedPreferences for a rich, Duolingo/Weather-style widget.
 */
const WidgetBridge = {
  /**
   * Send raw JSON string to the native widget module
   * @param {string} jsonString - Stringified JSON payload
   */
  setMedicineData(jsonString) {
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
   * Build structured payload from medicine array and push to widget
   * @param {Array} medicines - Array of medicine objects from the store
   */
  updateMedicineWidget(medicines) {
    if (Platform.OS !== 'android' || !WidgetModule) return;

    // ── Greeting ──
    const h = new Date().getHours();
    const greeting = h < 12 ? 'Good Morning ☀️' : h < 17 ? 'Good Afternoon 🌤️' : 'Good Evening 🌙';

    if (!medicines || medicines.length === 0) {
      const payload = JSON.stringify({
        taken: 0,
        total: 0,
        adherence: 0,
        nextMed: '',
        nextTime: '',
        greeting,
        allDone: false,
      });
      this.setMedicineData(payload);
      return;
    }

    const taken = medicines.filter(m => m.taken).length;
    const total = medicines.length;
    const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;
    const allDone = taken === total && total > 0;

    // ── Find next pending med ──
    let nextMed = '';
    let nextTime = '';

    if (!allDone) {
      const pending = medicines.filter(m => !m.taken);
      if (pending.length > 0) {
        const next = pending[0];
        nextMed = next.name + (next.dosage ? ' ' + next.dosage : '');

        const slotLabel = TIME_LABELS[next.type] || next.type || '';
        const timeStr = next.time || DEFAULT_TIMES[next.type] || '';
        nextTime = timeStr ? `${slotLabel} • ${timeStr}` : slotLabel;
      }
    }

    const payload = JSON.stringify({
      taken,
      total,
      adherence,
      nextMed,
      nextTime,
      greeting,
      allDone,
    });

    this.setMedicineData(payload);
  },
};

export default WidgetBridge;
