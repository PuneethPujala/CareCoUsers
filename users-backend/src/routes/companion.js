const express = require('express');
const router = express.Router();
const { authenticateSession } = require('../middleware/authenticate');
const Patient = require('../models/Patient');
const Profile = require('../models/Profile');
const authService = require('../services/authService');
const logger = require('../utils/logger');
const tokenService = require('../services/tokenService');
const { logEvent } = require('../services/auditService');

/**
 * POST /api/companion/join
 * Join as a family companion using an invite code.
 */
router.post('/join', async (req, res) => {
    try {
        const { invite_code, email, password, fullName, phone } = req.body;
        
        if (!invite_code || !email || !password || !fullName) {
            return res.status(400).json({ error: 'Invite code, email, password, and full name are required.' });
        }

        // 1. Find patient by invite code
        const patient = await Patient.findOne({
            invite_code: invite_code.toUpperCase(),
            invite_code_expires_at: { $gt: new Date() }
        }).select('+invite_code');

        if (!patient) {
            return res.status(400).json({ error: 'Invalid or expired invite code.' });
        }

        // 2. Create the Companion Profile
        const emailNorm = email.toLowerCase().trim();
        
        // Check if profile exists
        let profile = await Profile.findOne({ email: emailNorm });
        if (profile) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        const supabaseUid = `cmp_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
        
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        profile = await Profile.create({
            supabaseUid,
            email: emailNorm,
            passwordHash,
            fullName,
            phone,
            role: 'companion',
            emailVerified: true // Assume verified if they have the code, or require OTP later
        });

        // 3. Link Profile to Patient
        patient.companions.push({ profile_id: profile._id });
        
        // Add to trusted_contacts for backward compatibility in notifications
        patient.trusted_contacts.push({
            name: fullName,
            phone: phone || 'N/A',
            relation: 'Family',
            email: emailNorm,
            can_view_data: true,
            is_primary: false,
            is_emergency: false,
            permissions: ['read_only']
        });

        // 4. Invalidate the invite code (Single Use)
        patient.invite_code = undefined;
        patient.invite_code_expires_at = undefined;
        await patient.save();

        // 5. Issue Auth Session
        const tokens = await tokenService.issueTokenPair(
            {
                userId: profile._id,
                userType: 'Profile',
                subject: supabaseUid,
                role: 'companion',
                email: profile.email,
                emailVerified: true,
            },
            req
        );

        await logEvent(supabaseUid, 'companion_joined', 'profile', profile._id, req, { patientId: patient._id });

        res.status(201).json({
            message: 'Joined successfully as a family companion.',
            session: {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_in: tokens.expires_in,
                expires_at: tokens.expires_at,
                user: { id: supabaseUid, email: profile.email },
            },
            profile: {
                id: profile._id,
                email: profile.email,
                fullName: profile.fullName,
                role: profile.role,
            }
        });

    } catch (err) {
        logger.error('Companion join error', { error: err.message });
        res.status(500).json({ error: 'Failed to join as companion.' });
    }
});

/**
 * GET /api/companion/patient-status
 * Read-only dashboard for companion to view patient stats.
 */
router.get('/patient-status', authenticateSession, async (req, res) => {
    try {
        if (req.profile.role !== 'companion') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        // Find patient linked to this companion
        const patient = await Patient.findOne({ 'companions.profile_id': req.profile._id });
        
        if (!patient) {
            return res.status(404).json({ error: 'Linked patient not found or access revoked.' });
        }

        // Gather read-only data
        const MedicineLog = require('../models/MedicineLog');
        const VitalLog = require('../models/VitalLog');
        const Alert = require('../models/Alert');
        
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const [logs, latestVital, recentAlerts] = await Promise.all([
            MedicineLog.find({ patient_id: patient._id, date: { $gte: weekAgo } }).lean(),
            VitalLog.findOne({ patient_id: patient._id }).sort({ recorded_at: -1 }).lean(),
            Alert.find({ patient_id: patient._id, status: 'open', type: 'medication_missed' }).sort({ created_at: -1 }).limit(3).lean()
        ]);

        let adherenceRate = null;
        if (logs.length > 0) {
            let totalMeds = 0;
            let takenMeds = 0;
            for (const log of logs) {
                const active = (log.medicines || []).filter(m => m.is_active !== false);
                totalMeds += active.length;
                takenMeds += active.filter(m => m.taken).length;
            }
            if (totalMeds > 0) {
                adherenceRate = Math.round((takenMeds / totalMeds) * 100);
            }
        }

        // Log the activity
        await logEvent(req.user.id, 'companion_viewed_dashboard', 'profile', req.profile._id, req, { patientId: patient._id });

        res.json({
            patient: {
                name: patient.name,
                avatar_url: patient.avatar_url,
                health_score: patient.healthScoreCache,
                adherence_rate: adherenceRate,
                current_streak: patient.gamification?.current_streak || 0,
            },
            latest_vital: latestVital,
            recent_alerts: recentAlerts
        });

    } catch (err) {
        logger.error('Companion patient status error', { error: err.message, profileId: req.user?.id });
        res.status(500).json({ error: 'Failed to load patient status.' });
    }
});

/**
 * POST /api/companion/alerts/:id/acknowledge
 * Acknowledge an alert to dismiss it from the dashboard.
 */
router.post('/alerts/:id/acknowledge', authenticateSession, async (req, res) => {
    try {
        if (req.profile.role !== 'companion') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const Alert = require('../models/Alert');
        
        await Alert.updateOne(
            { _id: req.params.id },
            { $set: { status: 'acknowledged', acknowledged_by: req.profile._id, acknowledged_at: new Date() } }
        );

        await logEvent(req.user.id, 'companion_acknowledged_alert', 'profile', req.profile._id, req, { alertId: req.params.id });

        res.json({ success: true });
    } catch (err) {
        logger.error('Companion acknowledge alert error', { error: err.message });
        res.status(500).json({ error: 'Failed to acknowledge alert.' });
    }
});

module.exports = router;
