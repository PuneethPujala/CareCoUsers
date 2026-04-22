export const COUNTRY_CODES = [
    { code: '+91', flag: '🇮🇳', name: 'India', maxDigits: 10 },
    { code: '+1', flag: '🇺🇸', name: 'USA / Canada', maxDigits: 10 },
    { code: '+44', flag: '🇬🇧', name: 'United Kingdom', maxDigits: 11 },
    { code: '+971', flag: '🇦🇪', name: 'UAE', maxDigits: 9 },
    { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia', maxDigits: 9 },
    { code: '+65', flag: '🇸🇬', name: 'Singapore', maxDigits: 8 },
    { code: '+61', flag: '🇦🇺', name: 'Australia', maxDigits: 9 },
    { code: '+49', flag: '🇩🇪', name: 'Germany', maxDigits: 11 },
    { code: '+33', flag: '🇫🇷', name: 'France', maxDigits: 9 },
    { code: '+81', flag: '🇯🇵', name: 'Japan', maxDigits: 10 },
    { code: '+86', flag: '🇨🇳', name: 'China', maxDigits: 11 },
    { code: '+82', flag: '🇰🇷', name: 'South Korea', maxDigits: 10 },
    { code: '+60', flag: '🇲🇾', name: 'Malaysia', maxDigits: 10 },
    { code: '+977', flag: '🇳🇵', name: 'Nepal', maxDigits: 10 },
    { code: '+94', flag: '🇱🇰', name: 'Sri Lanka', maxDigits: 9 },
    { code: '+880', flag: '🇧🇩', name: 'Bangladesh', maxDigits: 10 },
];

export const parsePhoneWithCode = (fullPhone) => {
    if (!fullPhone) return { code: '+91', number: '' };
    for (const cc of COUNTRY_CODES) {
        if (fullPhone.startsWith(cc.code)) {
            return { code: cc.code, number: fullPhone.slice(cc.code.length).trim() };
        }
    }
    // If no prefix matched, assume raw digits
    return { code: '+91', number: fullPhone.replace(/[^0-9]/g, '') };
};

export const validatePhone = (digits, countryCode) => {
    const cc = COUNTRY_CODES.find(c => c.code === countryCode);
    const cleanDigits = digits.replace(/[^0-9]/g, '');
    if (!cleanDigits) return 'Please enter a phone number.';
    if (cc && cleanDigits.length !== cc.maxDigits) return `Phone number must be ${cc.maxDigits} digits for ${cc.name}.`;
    if (countryCode === '+91' && !/^[6-9]/.test(cleanDigits)) return 'Indian numbers must start with 6, 7, 8, or 9.';
    return null;
};
