import { z } from 'zod';

/**
 * Step 1: Profile Creation
 */
export const step1Schema = z.object({
    fullName: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name is too long'),
    email: z.string().email('Please enter a valid email address'),
    phoneNumber: z.string()
        .min(10, 'Phone number must be at least 10 digits')
        .max(15, 'Phone number is too long')
        .regex(/^\d+$/, 'Phone number must contain only digits'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must include an uppercase letter')
        .regex(/[a-z]/, 'Must include a lowercase letter')
        .regex(/[0-9]/, 'Must include a number'),
    confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

/**
 * Step 2: Locality
 */
export const step2Schema = z.object({
    city: z.string().min(1, 'Please select your city'),
});

/**
 * Step 3: Membership (No validation needed as it uses selection)
 */
export const step3Schema = z.object({
    selectedPlanId: z.string().min(1, 'Please select a plan'),
});

/**
 * Step 5: Final Details
 */
export const step5Schema = z.object({
    age: z.string().min(1, 'Age is required').regex(/^\d+$/, 'Age must be a number'),
    gender: z.string().min(1, 'Please select your gender'),
});

/**
 * Combined Schema
 */
export const signupSchema = z.intersection(
    z.intersection(step1Schema, step2Schema),
    z.intersection(step3Schema, step5Schema)
);
