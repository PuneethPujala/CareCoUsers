import { z } from 'zod';

/**
 * Step 1: Profile Creation
 *
 * FIX: phoneNumber max capped at 10 (form enforces maxLength={10} and prefixes +91 separately)
 * FIX: age/gender removed — they live in step5Schema, not here
 * FIX: selectedPlanId included with default so the shared useForm defaultValues
 *      resolver doesn't flag it as an unexpected key
 * FIX: Removed .intersection() on the combined schema — Zod .refine() does not
 *      compose safely through z.intersection(). Combined schema uses z.object merge instead.
 */
export const step1BaseSchema = z.object({
    fullName: z
        .string()
        .trim()
        .min(2, 'Name must be at least 2 characters')
        .max(50, 'Name is too long')
        .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes'),
    email: z
        .string()
        .trim()
        .email('Please enter a valid email address')
        .toLowerCase(),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must include an uppercase letter')
        .regex(/[a-z]/, 'Must include a lowercase letter')
        .regex(/[0-9]/, 'Must include a number'),
    confirmPassword: z.string(),
    // Included so the shared resolver doesn't reject it as an unknown key
    selectedPlanId: z.string().optional(),
    termsAccepted: z.boolean().refine((val) => val === true, {
        message: 'You must accept the Terms & Conditions and Privacy Policy',
    }),
});

export const step1Schema = step1BaseSchema.refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

/**
 * Step 2: Phone collection (Google sign-up users who skipped Step 1)
 */
export const stepPhoneSchema = z.object({
    phoneNumber: z
        .string()
        .length(10, 'Phone number must be exactly 10 digits')
        .regex(/^\d+$/, 'Phone number must contain only digits'),
});

/**
 * Step 3: Locality
 */
export const step2Schema = z.object({
    city: z.string().trim().min(1, 'Please select your city'),
});

/**
 * Step 3: Membership
 * Selection-driven — minimal validation, just ensures a plan is picked.
 */
export const step3Schema = z.object({
    selectedPlanId: z.string().min(1, 'Please select a plan'),
});

/**
 * Step 5: Final Details
 *
 * FIX: Added numeric bounds — age must be between 1 and 120.
 * FIX: Used z.enum for gender to match the UI options exactly.
 */
export const step5Schema = z.object({
    age: z
        .string()
        .regex(/^\d+$/, 'Age must be a number')
        .refine((val) => {
            const n = parseInt(val, 10);
            return n >= 1 && n <= 120;
        }, 'Please enter a valid age between 1 and 120'),
    gender: z.enum(['Male', 'Female', 'Other'], {
        errorMap: () => ({ message: 'Please select your gender' }),
    }),
    language: z.enum(['en_IN', 'hi_IN', 'te_IN', 'ta_IN', 'kn_IN', 'mr_IN'], {
        errorMap: () => ({ message: 'Please select your preferred language' }),
    }).optional(),
});

/**
 * Combined schema for full-form validation (e.g. server-side).
 *
 * FIX: Cannot use z.intersection() on a schema that has .refine() — the
 * refinement is stripped silently. Use a single z.object() merge instead,
 * and re-declare the confirmPassword refinement at the top level.
 */
export const signupSchema = z
    .object({
        fullName: step1BaseSchema.shape.fullName,
        email: step1BaseSchema.shape.email,
        password: step1BaseSchema.shape.password,
        confirmPassword: step1BaseSchema.shape.confirmPassword,
        phoneNumber: stepPhoneSchema.shape.phoneNumber,
        selectedPlanId: step3Schema.shape.selectedPlanId,
        city: step2Schema.shape.city,
        age: step5Schema.shape.age,
        gender: step5Schema.shape.gender,
        language: step5Schema.shape.language,
        termsAccepted: step1BaseSchema.shape.termsAccepted,
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });