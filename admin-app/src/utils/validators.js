/**
 * Centralized Validation Rules for CareCo Admin App
 * These strictly enforce data integrity before any API calls are made.
 */

// Basic email validation (RFC 5322 compatible)
export const isValidEmail = (email) => {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
};

// Strict phone number validation (Allows optional + prefix and exactly 10-15 digits, ignoring spaces/dashes)
export const isValidPhone = (phone) => {
    if (!phone) return false;
    // Strip common separators
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    // Check if it matches optional + and 10 to 15 digits
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    return phoneRegex.test(cleaned);
};

// Name validation: Only alphabetical characters, spaces, and hyphens (no numbers or symbols)
export const isValidName = (name) => {
    if (!name || name.trim().length < 2) return false;
    const nameRegex = /^[A-Za-z\s\-]+$/;
    return nameRegex.test(name.trim());
};

// Password validation: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
export const isValidPassword = (password) => {
    if (!password) return false;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

// Numeric validation: Must be a positive integer/float (great for capacity/revenue/dosages)
export const isValidAmount = (amount) => {
    if (amount === undefined || amount === null || amount === '') return false;
    const num = Number(amount);
    return !isNaN(num) && num >= 0;
};
