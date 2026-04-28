/**
 * AlertManager — Global alert state manager
 *
 * Provides a drop-in replacement for React Native's Alert.alert()
 * that renders a premium custom modal instead of the native OS dialog.
 *
 * Usage:
 *   import AlertManager from '../utils/AlertManager';
 *   AlertManager.alert('Title', 'Message', [{ text: 'OK' }]);
 */

let _alertRef = null;

const AlertManager = {
  setRef(ref) {
    _alertRef = ref;
  },

  /**
   * Show a custom alert — same signature as Alert.alert()
   * @param {string} title
   * @param {string} [message]
   * @param {Array<{text: string, onPress?: Function, style?: string}>} [buttons]
   * @param {Object} [options] - { type: 'success' | 'error' | 'warning' | 'info' }
   */
  alert(title, message, buttons, options) {
    if (_alertRef) {
      _alertRef.show(title, message, buttons, options);
    } else {
      // Fallback to native if CustomAlert hasn't mounted yet
      const { Alert } = require('react-native');
      Alert.alert(title, message, buttons);
    }
  },
};

export default AlertManager;
