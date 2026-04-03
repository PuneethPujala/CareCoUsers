const express = require('express');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Organization = require('../models/Organization');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { scopeFilter } = require('../middleware/scopeFilter');
const { logEvent, autoLogAccess } = require('../services/auditService');

const router = express.Router();

// ─────────────────────────────────────────────
// Role access helpers
// ─────────────────────────────────────────────

// Can this profile READ a given patient document?
function canReadPatient(profile, patient) {
    const { role } = profile;
    if (role === 'super_admin')  return true;
    if (role === 'org_admin' || role === 'care_manager') {
        return patient.organization_id?.equals(profile.organizationId);
    }
    if (role === 'caller') {
        // Callers can only see their own assigned patients
        return patient.assigned_caller_id?.equals(profile._id);
    }
    if (role === 'patient') {
        // Patients can only see themselves — handled in users/patients.js
        return false;
    }
    return false;
}

// ─────────────────────────────────────────────

/**
 * GET /api/patients
 * List patients — scoped by role
 */
router.get('/',
    authenticate,
    authorize('patients', 'read'),
    scopeFilter('patients'),
    autoLogAccess('patients', 'read'),
    async (req, res) => {
        try {
            const {
                page = 1,
                limit = 20,
                search,
                sortBy = 'created_at',
                sortOrder = 'desc',
                status = 'active',
                risk_level,
                assigned_caller_id,
            } = req.query;

            const query = {
                is_active: status === 'active',
                ...req.scopeFilter,
            };

            // care_manager and caller — scope to their org/assignments
            const { role } = req.profile;
            if (role === 'caller') {
                query.assigned_caller_id = req.profile._id;
            } else if (['org_admin', 'care_manager'].includes(role)) {
                query.organization_id = req.profile.organizationId;
            }

            if (risk_level)          query.risk_level          = risk_level;
            if (assigned_caller_id)  query.assigned_caller_id  = assigned_caller_id;

            if (search) {
                query.$or = [
                    { name:  { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } },
                    { city:  { $regex: search, $options: 'i' } },
                ];
            }

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const [patients, total] = await Promise.all([
                Patient.find(query)
                    .populate('organization_id',    'name city')
                    .populate('assigned_caller_id', 'fullName email phone')
                    .populate('assigned_manager_id','fullName email')
                    .sort(sort)
                    .limit(parseInt(limit))
                    .skip((parseInt(page) - 1) * parseInt(limit)),
                Patient.countDocuments(query),
            ]);

            res.json({
                patients,
                pagination: {
                    page:  parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });

        } catch (error) {
            console.error('Get patients error:', error);
            res.status(500).json({ error: 'Failed to get patients', details: error.message });
        }
    }
);

/**
 * GET /api/patients/:id
 * Get specific patient
 */
router.get('/:id',
    authenticate,
    authorize('patients', 'read'),
    autoLogAccess('patients', 'read'),
    async (req, res) => {
        try {
            const patient = await Patient.findById(req.params.id)
                .populate('organization_id',    'name city settings')
                .populate('assigned_caller_id', 'fullName email phone')
                .populate('assigned_manager_id','fullName email');

            if (!patient) {
                return res.status(404).json({ error: 'Patient not found' });
            }

            if (!canReadPatient(req.profile, patient)) {
                return res.status(403).json({ error: 'Access denied to this patient' });
            }

            res.json(patient);

        } catch (error) {
            console.error('Get patient error:', error);
            res.status(500).json({ error: 'Failed to get patient', details: error.message });
        }
    }
);

/**
 * POST /api/patients
 * Create patient — org_admin / care_manager / super_admin only
 * Note: patients normally self-register via the users app.
 * This endpoint is for admin-initiated creation.
 */
router.post('/',
    authenticate,
    requireRole('super_admin', 'org_admin', 'care_manager'),
    authorize('patients', 'create'),
    autoLogAccess('patients', 'create'),
    async (req, res) => {
        try {
            const {
                supabase_uid,
                email,
                name,
                phone,
                city,
                organization_id,
                date_of_birth,
                gender,
                address,
            } = req.body;

            if (!supabase_uid || !email || !name || !city) {
                return res.status(400).json({
                    error: 'Missing required fields: supabase_uid, email, name, city',
                });
            }

            // Non-super_admin always creates within their own org
            const targetOrgId = req.profile.role === 'super_admin'
                ? organization_id
                : req.profile.organizationId;

            if (!targetOrgId) {
                return res.status(400).json({ error: 'organization_id is required' });
            }

            // Check org capacity before creating
            const org = await Organization.findById(targetOrgId);
            if (!org) {
                return res.status(404).json({ error: 'Organization not found' });
            }
            if (!org.canAdd('patient')) {
                return res.status(400).json({ error: 'Organisation is at patient capacity or inactive' });
            }

            const patient = new Patient({
                supabase_uid,
                email,
                name,
                phone,
                city,
                organization_id: targetOrgId,
                date_of_birth,
                gender,
                address,
                profile_complete: false,
                paid: 0,
            });

            await patient.save();

            // Increment org patient counter
            await Organization.findByIdAndUpdate(targetOrgId, {
                $inc: { 'counts.patients': 1 },
            });

            await logEvent(
                req.profile.supabaseUid,
                'patient_created',
                'patient',
                patient._id,
                req,
                { patientEmail: email, organization_id: targetOrgId, city }
            );

            res.status(201).json({ message: 'Patient created successfully', patient });

        } catch (error) {
            console.error('Create patient error:', error);
            res.status(500).json({ error: 'Failed to create patient', details: error.message });
        }
    }
);

/**
 * PUT /api/patients/:id
 * Update patient
 * - super_admin / org_admin: can update all fields
 * - care_manager: can update risk_level, notes, care_instructions, assigned_caller_id
 * - caller: can update notes, care_instructions only
 */
router.put('/:id',
    authenticate,
    authorize('patients', 'update'),
    autoLogAccess('patients', 'update'),
    async (req, res) => {
        try {
            const { role } = req.profile;
            const patient = await Patient.findById(req.params.id);

            if (!patient) {
                return res.status(404).json({ error: 'Patient not found' });
            }

            if (!canReadPatient(req.profile, patient)) {
                return res.status(403).json({ error: 'Access denied to this patient' });
            }

            // Field permissions per role
            const fieldsByRole = {
                super_admin:   ['name', 'phone', 'avatar_url', 'city', 'address', 'date_of_birth',
                                'gender', 'risk_level', 'notes', 'care_instructions', 'is_active',
                                'assigned_caller_id', 'assigned_manager_id', 'conditions',
                                'medications', 'allergies', 'medical_history', 'trusted_contacts',
                                'gp_name', 'gp_phone', 'blood_type', 'mobility_level',
                                'preferred_call_times', 'call_frequency_days', 'timezone'],
                org_admin:     ['risk_level', 'notes', 'care_instructions', 'is_active',
                                'assigned_caller_id', 'assigned_manager_id', 'preferred_call_times',
                                'call_frequency_days', 'trusted_contacts'],
                care_manager:  ['risk_level', 'notes', 'care_instructions',
                                'assigned_caller_id', 'preferred_call_times', 'call_frequency_days'],
                caller:        ['notes', 'care_instructions'],
            };

            const allowed = fieldsByRole[role] || [];
            const updateData = {};
            allowed.forEach((field) => {
                if (req.body[field] !== undefined) updateData[field] = req.body[field];
            });

            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({ error: 'No valid fields to update for your role' });
            }

            const updatedPatient = await Patient.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: true }
            )
                .populate('organization_id',    'name city')
                .populate('assigned_caller_id', 'fullName email phone')
                .populate('assigned_manager_id','fullName email');

            await logEvent(
                req.profile.supabaseUid,
                'patient_updated',
                'patient',
                req.params.id,
                req,
                { updatedFields: Object.keys(updateData) }
            );

            res.json({ message: 'Patient updated successfully', patient: updatedPatient });

        } catch (error) {
            console.error('Update patient error:', error);
            res.status(500).json({ error: 'Failed to update patient', details: error.message });
        }
    }
);

/**
 * DELETE /api/patients/:id
 * Soft-delete patient — org_admin / super_admin only
 */
router.delete('/:id',
    authenticate,
    requireRole('super_admin', 'org_admin'),
    authorize('patients', 'delete'),
    autoLogAccess('patients', 'delete'),
    async (req, res) => {
        try {
            const patient = await Patient.findById(req.params.id);
            if (!patient) {
                return res.status(404).json({ error: 'Patient not found' });
            }

            if (!canReadPatient(req.profile, patient)) {
                return res.status(403).json({ error: 'Access denied to this patient' });
            }

            patient.is_active          = false;
            patient.deactivated_at     = new Date();
            patient.deactivated_reason = req.body.reason || 'Deactivated by admin';
            patient.expireAt           = undefined; // clear TTL so it's not auto-deleted
            await patient.save();

            // Decrement org patient counter
            await Organization.findByIdAndUpdate(patient.organization_id, {
                $inc: { 'counts.patients': -1 },
            });

            await logEvent(
                req.profile.supabaseUid,
                'patient_deactivated',
                'patient',
                req.params.id,
                req,
                { patientEmail: patient.email, reason: patient.deactivated_reason }
            );

            res.json({
                message: 'Patient deactivated successfully',
                patient: { id: patient._id, name: patient.name, is_active: patient.is_active },
            });

        } catch (error) {
            console.error('Delete patient error:', error);
            res.status(500).json({ error: 'Failed to deactivate patient', details: error.message });
        }
    }
);

/**
 * GET /api/patients/me/caller
 * Get current assigned caller for logged-in patient
 */
router.get('/me/caller',
    authenticate,
    requireRole('patient'),
    async (req, res) => {
        try {
            const patient = await Patient.findById(req.profile._id).populate('assigned_caller_id');
            if (!patient) {
                return res.status(404).json({ error: 'Patient not found' });
            }

            if (!patient.assigned_caller_id) {
                return res.status(404).json({ error: 'No caller assigned' });
            }

            // Get caller user details
            const User = require('../models/User');
            const caller = await User.findById(patient.assigned_caller_id);
            if (!caller) {
                return res.status(404).json({ error: 'Caller not found' });
            }

            // Format caller data for frontend
            const callerData = {
                _id: caller._id,
                name: caller.fullName || caller.name,
                employee_id: caller.employee_id || 'N/A',
                experience_years: caller.experience_years || 0,
                languages_spoken: caller.languages_spoken || ['English'],
                phone: caller.phone || '',
                avatar_url: caller.avatar_url || null,
            };

            res.json({ caller: callerData });

        } catch (error) {
            console.error('Get my caller error:', error);
            res.status(500).json({ error: 'Failed to get caller', details: error.message });
        }
    }
);

/**
 * GET /api/patients/me/calls
 * Get call history for logged-in patient
 */
router.get('/me/calls',
    authenticate,
    requireRole('patient'),
    async (req, res) => {
        try {
            const Call = require('../models/Call');
            const calls = await Call.find({ patient_id: req.profile._id })
                .sort({ call_date: -1 })
                .limit(20);

            res.json({ calls: calls || [] });

        } catch (error) {
            console.error('Get my calls error:', error);
            res.status(500).json({ error: 'Failed to get calls', details: error.message });
        }
    }
);



module.exports = router;