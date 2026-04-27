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
export const step1Schema = z.object({
    fullName: z
        .string()
        .trim()
        .min(2, 'Name must be at least 2 characters')
        .max(50, 'Name is too long'),
    email: z
        .string()
        .trim()
        .email('Please enter a valid email address')
        .toLowerCase(),
    phoneNumber: z
        .string()
        .length(10, 'Phone number must be exactly 10 digits')
        .regex(/^\d+$/, 'Phone number must contain only digits'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must include an uppercase letter')
        .regex(/[a-z]/, 'Must include a lowercase letter')
        .regex(/[0-9]/, 'Must include a number'),
    confirmPassword: z.string(),
    // Included so the shared resolver doesn't reject it as an unknown key
    selectedPlanId: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

/**
 * Step 2: Locality
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
        fullName: step1Schema.shape.fullName,
        email: step1Schema.shape.email,
        phoneNumber: step1Schema.shape.phoneNumber,
        password: step1Schema.shape.password,
        confirmPassword: step1Schema.shape.confirmPassword,
        selectedPlanId: step3Schema.shape.selectedPlanId,
        city: step2Schema.shape.city,
        age: step5Schema.shape.age,
        gender: step5Schema.shape.gender,
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });