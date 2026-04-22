/**
 * mockModels.js
 * Fake Mongoose documents for use in Jest tests.
 * All mocks match the actual schema field names and include
 * .save(), .equals(), and .toJSON() where the routes use them.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fake ObjectId-like object.
 * .equals() does a loose string comparison so plain string IDs work in tests.
 */
function fakeId(val) {
    return {
        toString: () => String(val),
        equals:   (other) => String(val) === String(other?._id ?? other),
        toJSON:   () => String(val),
        _bsontype: 'ObjectId',
    };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

/**
 * Fake Patient document.
 * Matches Patient.js schema field names (snake_case).
 */
function mockPatient(overrides = {}) {
    const rawId = overrides._id || 'test-patient-id';
    const id    = fakeId(rawId);

    return {
        _id:                id,
        supabase_uid:       overrides.supabase_uid       || `sup-uid-pat-${rawId}`,
        profile_id:         overrides.profile_id         || null,
        role:               overrides.role               || 'patient',
        name:               overrides.name               || 'Test Patient',
        email:              overrides.email              || 'patient@careco.in',
        phone:              overrides.phone              || '+919999999999',
        city:               overrides.city               || 'Hyderabad',
        organization_id:    fakeId(overrides.organization_id    || 'test-org-id'),
        assigned_caller_id: overrides.assigned_caller_id
                                ? fakeId(overrides.assigned_caller_id)
                                : null,
        assigned_manager_id: overrides.assigned_manager_id
                                ? fakeId(overrides.assigned_manager_id)
                                : null,
        is_active:          overrides.is_active          !== undefined ? overrides.is_active  : true,
        paid:               overrides.paid               !== undefined ? overrides.paid        : 1,
        profile_complete:   overrides.profile_complete   !== undefined ? overrides.profile_complete : true,
        risk_level:         overrides.risk_level         || 'low',
        conditions:         overrides.conditions         || [],
        medications:        overrides.medications        || [],
        medical_history:    overrides.medical_history    || [],
        allergies:          overrides.allergies          || [],
        trusted_contacts:   overrides.trusted_contacts   || [],
        care_instructions:  overrides.care_instructions  || '',
        notes:              overrides.notes              || '',
        subscription:       overrides.subscription       || { status: 'active', plan: 'basic' },
        deactivated_at:     overrides.deactivated_at     || null,
        deactivated_reason: overrides.deactivated_reason || null,
        expireAt:           overrides.expireAt           || null,
        // ── Auth & Security fields ────────────────────
        emailVerified:       overrides.emailVerified       !== undefined ? overrides.emailVerified : true,
        lastLoginAt:         overrides.lastLoginAt         || null,
        failedLoginAttempts: overrides.failedLoginAttempts !== undefined ? overrides.failedLoginAttempts : 0,
        accountLockedUntil:  overrides.accountLockedUntil  || null,
        isLocked:            overrides.isLocked            !== undefined ? overrides.isLocked : false,
        // Mongoose instance methods used by routes
        resetFailedLogin:     jest.fn().mockResolvedValue(true),
        incrementFailedLogin: jest.fn().mockResolvedValue(true),
        save:   jest.fn().mockResolvedValue(true),
        toJSON: function () {
            const { save, toJSON, resetFailedLogin, incrementFailedLogin, ...rest } = this;
            return rest;
        },
        // Allow spread overrides last so tests can override anything
        ...overrides,
        // Re-apply fakeId fields that overrides might have stomped with plain strings
        _id:                id,
        organization_id:    fakeId(overrides.organization_id    || 'test-org-id'),
        assigned_caller_id: overrides.assigned_caller_id
                                ? fakeId(overrides.assigned_caller_id)
                                : null,
    };
}

/**
 * Fake Organization document.
 * Matches Organization.js schema — nested counts/limits, canAdd() method.
 */
function mockOrganization(overrides = {}) {
    const rawId = overrides._id || 'test-org-id';
    const id    = fakeId(rawId);

    const counts = {
        patients: 0,
        callers:  0,
        managers: 0,
        ...(overrides.counts || {}),
    };

    const limits = {
        max_patients: 500,
        max_callers:  50,
        max_managers: 10,
        ...(overrides.limits || {}),
    };

    return {
        _id:              id,
        name:             overrides.name             || 'Test Org',
        city:             overrides.city             || 'Hyderabad',
        email:            overrides.email            || 'admin@testorg.in',
        phone:            overrides.phone            || '+919999999999',
        isActive:         overrides.isActive         !== undefined ? overrides.isActive : true,
        subscriptionPlan: overrides.subscriptionPlan || 'basic',
        counts,
        limits,
        settings:         overrides.settings         || {},
        // canAdd mirrors Organization.js instance method
        canAdd(role) {
            const countKey = role === 'care_manager' ? 'managers' : `${role}s`;
            const limitKey = role === 'care_manager' ? 'max_managers'
                           : role === 'caller'       ? 'max_callers'
                           :                           'max_patients';
            return (this.counts[countKey] || 0) < (this.limits[limitKey] || 999);
        },
        save:   jest.fn().mockResolvedValue(true),
        toJSON: function () {
            const { save, toJSON, canAdd, ...rest } = this;
            return rest;
        },
        ...overrides,
        _id: id,
    };
}

/**
 * Fake Profile document (staff — org_admin, care_manager, caller).
 * Matches Profile.js schema (camelCase).
 */
function mockProfile(overrides = {}) {
    const rawId = overrides._id || 'test-profile-id';
    const id    = fakeId(rawId);

    return {
        _id:            id,
        supabaseUid:    overrides.supabaseUid    || `sup-uid-${rawId}`,
        email:          overrides.email          || 'staff@careco.in',
        fullName:       overrides.fullName       || 'Test Staff',
        role:           overrides.role           || 'care_manager',
        organizationId: overrides.organizationId
                            ? fakeId(overrides.organizationId)
                            : fakeId('test-org-id'),
        phone:          overrides.phone          || null,
        isActive:       overrides.isActive       !== undefined ? overrides.isActive : true,
        emailVerified:  overrides.emailVerified  !== undefined ? overrides.emailVerified : true,
        mustChangePassword: overrides.mustChangePassword || false,
        failedLoginAttempts: 0,
        isLocked:       false,
        passwordHistory: overrides.passwordHistory || [],
        // Mongoose instance methods used by middleware/routes
        resetFailedLogin:    jest.fn().mockResolvedValue(true),
        incrementFailedLogin: jest.fn().mockResolvedValue(true),
        save:             jest.fn().mockResolvedValue(true),
        toJSON: function () {
            const { save, toJSON, resetFailedLogin, ...rest } = this;
            return rest;
        },
        ...overrides,
        _id:            id,
    };
}

/**
 * Fake Caller document.
 */
function mockCaller(overrides = {}) {
    const rawId = overrides._id || 'test-caller-id';
    const id    = fakeId(rawId);

    return {
        _id:             id,
        supabase_uid:    overrides.supabase_uid    || `sup-uid-call-${rawId}`,
        name:            overrides.name            || 'Test Caller',
        email:           overrides.email           || 'caller@careco.in',
        employee_id:     overrides.employee_id     || 'CC-1234',
        city:            overrides.city            || 'Hyderabad',
        organization_id: fakeId(overrides.organization_id || 'test-org-id'),
        patient_ids:     overrides.patient_ids     || [],
        is_active:       overrides.is_active       !== undefined ? overrides.is_active : true,
        save:            jest.fn().mockResolvedValue(true),
        ...overrides,
        _id:             id,
        organization_id: fakeId(overrides.organization_id || 'test-org-id'),
    };
}

/**
 * Fake MedicineLog document.
 */
function mockMedicineLog(overrides = {}) {
    const rawId = overrides._id || 'test-medicine-log-id';
    return {
        _id:        fakeId(rawId),
        patient_id: fakeId(overrides.patient_id || 'test-patient-id'),
        caller_id:  fakeId(overrides.caller_id  || 'test-caller-id'),
        date:       overrides.date || new Date(),
        medicines:  overrides.medicines || [
            { medicine_name: 'Aspirin',   scheduled_time: '08:00', status: 'unknown', taken_at: null },
            { medicine_name: 'Metformin', scheduled_time: '20:00', status: 'unknown', taken_at: null },
        ],
        adherence_pct: overrides.adherence_pct || 0,
        save: jest.fn().mockResolvedValue(true),
        ...overrides,
    };
}

/**
 * Fake AuditLog document.
 */
function mockAuditLog(overrides = {}) {
    return {
        _id:            fakeId(overrides._id || 'test-audit-log-id'),
        supabaseUid:    overrides.supabaseUid    || 'test-user-id',
        action:         overrides.action         || 'login',
        resourceType:   overrides.resourceType   || 'profile',
        resourceId:     overrides.resourceId     || null,
        ipAddress:      overrides.ipAddress      || '127.0.0.1',
        userAgent:      overrides.userAgent      || 'test-agent',
        outcome:        overrides.outcome        || 'success',
        details:        overrides.details        || {},
        createdAt:      overrides.createdAt      || new Date(),
        save: jest.fn().mockResolvedValue(true),
        ...overrides,
    };
}

module.exports = {
    mockPatient,
    mockOrganization,
    mockProfile,
    mockCaller,
    mockMedicineLog,
    mockAuditLog,
};