import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en_IN from './locales/en_IN.json';
import hi_IN from './locales/hi_IN.json';
import te_IN from './locales/te_IN.json';
import ta_IN from './locales/ta_IN.json';
import kn_IN from './locales/kn_IN.json';
import mr_IN from './locales/mr_IN.json';

const resources = {
  en_IN: { translation: en_IN },
  hi_IN: { translation: hi_IN },
  te_IN: { translation: te_IN },
  ta_IN: { translation: ta_IN },
  kn_IN: { translation: kn_IN },
  mr_IN: { translation: mr_IN },
};

// Simple fallback logic to detect device language if available
const getDeviceLanguage = () => {
  try {
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const langCode = locales[0].languageCode;
      const supported = Object.keys(resources).find(key => key.startsWith(langCode));
      return supported || 'en_IN';
    }
  } catch (e) {
    // Ignore errors from localization module
  }
  return 'en_IN';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'en_IN',
    interpolation: {
      escapeValue: false, // React already safe from xss
    },
    compatibilityJSON: 'v3', // Required for React Native
  });

export default i18n;
