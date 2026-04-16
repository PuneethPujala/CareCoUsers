const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');

/**
 * ═══════════════════════════════════════════════════════════════
 * WEBSOCKET HANDLERS — Socket.io real-time event system
 *
 * Room Hierarchy:
 *   org_{orgId}           → All users in an organization
 *   role_{orgId}_{role}   → Role-specific within org (e.g., role_abc_care_manager)
 *   user_{profileId}      → Direct-to-user channel
 *   platform              → Super admins only (system-wide alerts)
 *
 * Events Emitted:
 *   new_escalation        → Care manager / org admin
 *   call_status_change    → Call queue viewers in real-time
 *   patient_assigned      → Both old and new caretaker
 *   system_alert          → Platform-wide critical alerts
 *   notification          → Direct to recipient
 *   adherence_update      → Patient adherence rate changed
 *   dashboard_refresh     → Signals dashboard data is stale
 * ═══════════════════════════════════════════════════════════════
 */

// Supabase client for JWT verification
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// In-memory map: supabaseUid → socket.id (for targeted events)
const connectedUsers = new Map();  // profileId → Set<socketId>

let ioInstance = null;

// ═══════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════

/**
 * Initializes Socket.io on the given HTTP server.
 * Call once during server startup.
 *
 * @param {http.Server} server
 * @returns {SocketIO.Server}
 */
function initializeWebSocket(server) {
    const { Server } = require('socket.io');

    const io = new Server(server, {
        cors: {
            origin: '*',  // In production: restrict to your app domain
            methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
    });

    ioInstance = io;

    // ── Authentication middleware ───────────────────────────────
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;

            if (!token) {
                return next(new Error('Authentication required — provide JWT in auth.token'));
            }

            // Verify JWT via Supabase
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (error || !user) {
                return next(new Error('Invalid or expired token'));
            }

            // Fetch MongoDB profile
            const profile = await Profile.findOne({
                supabaseUid: user.id,
                isActive: true,
            }).populate('organizationId', 'name').lean();

            if (!profile) {
                return next(new Error('Profile not found or deactivated'));
            }

            // Attach to socket for use in handlers
            socket.profile = profile;
            socket.userId = profile._id.toString();

            next();
        } catch (err) {
            console.error('WebSocket auth error:', err.message);
            next(new Error('Authentication failed'));
        }
    });

    // ── Connection handler ─────────────────────────────────────
    io.on('connection', (socket) => {
        const { profile } = socket;
        const profileId = profile._id.toString();
        const orgId = profile.organizationId?._id?.toString() || profile.organizationId?.toString();

        console.log(`🔌 WS connected: ${profile.fullName} (${profile.role}) [${socket.id}]`);

        // ── Join rooms based on role ─────────────────────────────
        // Personal room
        socket.join(`user_${profileId}`);

        // Organization room
        if (orgId) {
            socket.join(`org_${orgId}`);
            socket.join(`role_${orgId}_${profile.role}`);
        }

        // Super admin platform room
        if (profile.role === 'super_admin') {
            socket.join('platform');
        }

        // Track connected user
        if (!connectedUsers.has(profileId)) {
            connectedUsers.set(profileId, new Set());
        }
        connectedUsers.get(profileId).add(socket.id);

        // ── Client-initiated events ──────────────────────────────

        // Subscribe to a specific patient's updates
        socket.on('subscribe_patient', (patientId) => {
            socket.join(`patient_${patientId}`);
        });

        // Unsubscribe from patient updates
        socket.on('unsubscribe_patient', (patientId) => {
            socket.leave(`patient_${patientId}`);
        });

        // Manual room join (for dashboards that need cross-org data)
        socket.on('subscribe_room', (room) => {
            // Only super_admin can join arbitrary rooms
            if (profile.role === 'super_admin') {
                socket.join(room);
            }
        });

        // Typing indicator for messaging
        socket.on('typing', (data) => {
            if (data.recipientId) {
                io.to(`user_${data.recipientId}`).emit('typing', {
                    userId: profileId,
                    name: profile.fullName,
                    isTyping: data.isTyping,
                });
            }
        });

        // ── Disconnect ───────────────────────────────────────────
        socket.on('disconnect', (reason) => {
            console.log(`🔌 WS disconnected: ${profile.fullName} (${reason})`);

            const userSockets = connectedUsers.get(profileId);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    connectedUsers.delete(profileId);
                }
            }
        });

        // Send confirmation to client
        socket.emit('connected', {
            userId: profileId,
            role: profile.role,
            organizationId: orgId,
            rooms: Array.from(socket.rooms),
        });
    });

    console.log('📡 WebSocket server initialized');
    return io;
}

// ═══════════════════════════════════════════════════════════════
// EVENT EMITTERS — called from routes and services
// ═══════════════════════════════════════════════════════════════

/**
 * 1. NEW ESCALATION
 * Notifies the assigned care manager and org admins instantly.
 */
function emitNewEscalation(escalation) {
    if (!ioInstance) return;

    const orgId = escalation.organizationId?.toString();
    const payload = {
        event: 'new_escalation',
        data: {
            id: escalation._id,
            type: escalation.type,
            priority: escalation.priority,
            status: escalation.status,
            message: escalation.message,
            patientId: escalation.patientId,
            patientName: escalation.patientId?.fullName || null,
            caretakerId: escalation.caretakerId,
            slaDeadline: escalation.slaDeadline,
            createdAt: escalation.createdAt,
        },
        timestamp: new Date(),
    };

    // Direct to assigned manager
    if (escalation.assignedTo) {
        ioInstance.to(`user_${escalation.assignedTo.toString()}`).emit('new_escalation', payload);
    }

    // All care managers and org admins in the org
    if (orgId) {
        ioInstance.to(`role_${orgId}_care_manager`).emit('new_escalation', payload);
        ioInstance.to(`role_${orgId}_org_admin`).emit('new_escalation', payload);
    }

    // Critical alerts go to super admins too
    if (escalation.priority === 'critical') {
        ioInstance.to('platform').emit('system_alert', {
            event: 'critical_escalation',
            data: payload.data,
            timestamp: new Date(),
        });
    }
}

/**
 * 2. CALL STATUS CHANGE
 * Updates call queues in real-time for managers and the assigned caretaker.
 */
function emitCallStatusChange(callLog) {
    if (!ioInstance) return;

    const orgId = callLog.organizationId?.toString();
    const payload = {
        event: 'call_status_change',
        data: {
            id: callLog._id,
            patientId: callLog.patientId,
            caretakerId: callLog.caretakerId,
            status: callLog.status,
            outcome: callLog.outcome,
            scheduledTime: callLog.scheduledTime,
            duration: callLog.duration,
            medicationConfirmations: callLog.medicationConfirmations?.length
                ? {
                    total: callLog.medicationConfirmations.length,
                    confirmed: callLog.medicationConfirmations.filter(m => m.confirmed).length,
                }
                : null,
        },
        timestamp: new Date(),
    };

    // Direct to the caretaker on this call
    if (callLog.caretakerId) {
        ioInstance.to(`user_${callLog.caretakerId.toString()}`).emit('call_status_change', payload);
    }

    // Care managers + org admins in the org
    if (orgId) {
        ioInstance.to(`role_${orgId}_care_manager`).emit('call_status_change', payload);
        ioInstance.to(`role_${orgId}_org_admin`).emit('call_status_change', payload);
    }

    // Patient-specific room (for patient detail views)
    if (callLog.patientId) {
        ioInstance.to(`patient_${callLog.patientId.toString()}`).emit('call_status_change', payload);
    }

    // Signal dashboard refresh
    if (orgId) {
        ioInstance.to(`org_${orgId}`).emit('dashboard_refresh', {
            event: 'call_status_change',
            timestamp: new Date(),
        });
    }
}

/**
 * 3. PATIENT ASSIGNED / REASSIGNED
 * Notifies both old and new caretaker, plus the care manager.
 */
function emitPatientAssigned({ patientId, patientName, newCaretakerId, oldCaretakerId, assignedBy, organizationId }) {
    if (!ioInstance) return;

    const orgId = organizationId?.toString();

    // Notify new caretaker
    if (newCaretakerId) {
        ioInstance.to(`user_${newCaretakerId.toString()}`).emit('patient_assigned', {
            event: 'patient_assigned',
            data: {
                patientId,
                patientName,
                action: 'assigned_to_you',
                assignedBy,
            },
            timestamp: new Date(),
        });
    }

    // Notify old caretaker
    if (oldCaretakerId) {
        ioInstance.to(`user_${oldCaretakerId.toString()}`).emit('patient_assigned', {
            event: 'patient_assigned',
            data: {
                patientId,
                patientName,
                action: 'removed_from_you',
                assignedBy,
            },
            timestamp: new Date(),
        });
    }

    // Signal org-wide dashboard refresh
    if (orgId) {
        ioInstance.to(`role_${orgId}_care_manager`).emit('dashboard_refresh', {
            event: 'patient_reassignment',
            timestamp: new Date(),
        });
        ioInstance.to(`role_${orgId}_org_admin`).emit('dashboard_refresh', {
            event: 'patient_reassignment',
            timestamp: new Date(),
        });
    }
}

/**
 * 4. SYSTEM ALERT
 * Critical platform-wide notification to super admins.
 */
function emitSystemAlert({ title, message, severity, data }) {
    if (!ioInstance) return;

    ioInstance.to('platform').emit('system_alert', {
        event: 'system_alert',
        data: {
            title,
            message,
            severity: severity || 'warning',  // 'info' | 'warning' | 'critical'
            ...data,
        },
        timestamp: new Date(),
    });
}

/**
 * 5. NOTIFICATION
 * Direct notification delivery to a specific user.
 */
function emitNotification(userId, notification) {
    if (!ioInstance) return;

    ioInstance.to(`user_${userId.toString()}`).emit('notification', {
        event: 'notification',
        data: {
            id: notification._id,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            priority: notification.priority,
            data: notification.data,
            createdAt: notification.createdAt,
        },
        timestamp: new Date(),
    });
}

/**
 * 6. ADHERENCE UPDATE
 * Notifies patient detail views and dashboards of adherence changes.
 */
function emitAdherenceUpdate({ patientId, patientName, adherenceRate, currentStreak, organizationId }) {
    if (!ioInstance) return;

    const payload = {
        event: 'adherence_update',
        data: { patientId, patientName, adherenceRate, currentStreak },
        timestamp: new Date(),
    };

    // Anyone viewing this patient
    ioInstance.to(`patient_${patientId.toString()}`).emit('adherence_update', payload);

    // Org dashboards
    if (organizationId) {
        const orgId = organizationId.toString();
        ioInstance.to(`role_${orgId}_care_manager`).emit('adherence_update', payload);
        ioInstance.to(`role_${orgId}_org_admin`).emit('adherence_update', payload);
    }
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

/** Check if a user is currently connected */
function isUserOnline(profileId) {
    return connectedUsers.has(profileId.toString());
}

/** Get count of connected users */
function getOnlineCount() {
    return connectedUsers.size;
}

/** Get the Socket.io instance (for advanced use) */
function getIO() {
    return ioInstance;
}

module.exports = {
    initializeWebSocket,

    // Event emitters
    emitNewEscalation,
    emitCallStatusChange,
    emitPatientAssigned,
    emitSystemAlert,
    emitNotification,
    emitAdherenceUpdate,

    // Utilities
    isUserOnline,
    getOnlineCount,
    getIO,
};
