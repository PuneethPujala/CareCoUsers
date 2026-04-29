import { NativeModules, Platform } from 'react-native';

const { WidgetModule } = NativeModules;

/**
 * WidgetBridge — Interface for Android Home Screen Widgets
 * 
 * This bridge allows the React Native app to send data to the native
 * Android AppWidgetProvider via SharedPreferences.
 */
const WidgetBridge = {
  /**
   * Update the medicine widget with today's list
   * @param {string} medicineText - Formatted text to display in the widget
   */
  setMedicineData(medicineText) {
    if (Platform.OS !== 'android' || !WidgetModule) return;
    
    try {
      WidgetModule.setWidgetData(medicineText);
    } catch (error) {
      console.error('[WidgetBridge] Failed to update widget:', error);
    }
  },

  /**
   * Convenience method to format and send medicine list
   * @param {Array} medicines - Array of medicine objects
   */
  updateMedicineWidget(medicines) {
    if (!medicines || medicines.length === 0) {
      this.setMedicineData("No pending medicines for today! 🎉");
      return;
    }

    const pending = medicines.filter(m => !m.taken);
    
    if (pending.length === 0) {
      this.setMedicineData("All medicines taken! Great job. 🌟");
      return;
    }

    const listText = pending
      .map(m => `• ${m.name} (${m.time})`)
      .join('\n');
      
    this.setMedicineData(`Pending for today:\n${listText}`);
  }
};

export default WidgetBridge;
