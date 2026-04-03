const AuditLog = require('../models/AuditLog');

/**
 * Log an audit event
 * @param {string} supabaseUid - User's Supabase UID
 * @param {string} action - Action performed
 * @param {string} resourceType - Type of resource (optional)
 * @param {ObjectId} resourceId - Resource ID (optional)
 * @param {Object} req - Express request object (optional)
 * @param {Object} additionalData - Additional data to log (optional)
 * @returns {Object} Created audit log entry
 */
const logEvent = async (
  supabaseUid,
  action,
  resourceType = null,
  resourceId = null,
  req = null,
  additionalData = {}
) => {
  try {
    const logData = {
      supabaseUid,
      action,
      resourceType,
      resourceId,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      ...additionalData
    };

    // Add request-specific data if available
    if (req) {
      logData.sessionId = req.session?.id;
      logData.deviceId = req.headers?.['x-device-id'];

      // Extract geographic information if available
      if (req.headers['x-geo-country']) {
        logData.location = {
          country: req.headers['x-geo-country'],
          region: req.headers['x-geo-region'],
          city: req.headers['x-geo-city'],
          latitude: req.headers['x-geo-latitude'] ? parseFloat(req.headers['x-geo-latitude']) : undefined,
          longitude: req.headers['x-geo-longitude'] ? parseFloat(req.headers['x-geo-longitude']) : undefined
        };
      }
    }

    return await AuditLog.createLog(logData);
  } catch (error) {
    console.warn('Failed to create audit log:', error?.message);
    // Don't throw error to avoid breaking main flow
    return null;
  }
};

/**
 * Log a security event
 * @param {string} supabaseUid - User's Supabase UID
 * @param {string} securityType - Type of security event
 * @param {string} severity - Severity level (low, medium, high, critical)
 * @param {string} description - Description of the security event
 * @param {Object} req - Express request object (optional)
 * @param {Object} additionalData - Additional data to log (optional)
 * @returns {Object} Created audit log entry
 */
const logSecurityEvent = async (
  supabaseUid,
  securityType,
  severity,
  description,
  req = null,
  additionalData = {}
) => {
  try {
    const logData = {
      supabaseUid,
      action: 'security_event',
      resourceType: 'system',
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      securityFlags: [{
        type: securityType,
        severity,
        description,
        detectedAt: new Date()
      }],
      ...additionalData
    };

    // Add request-specific data if available
    if (req) {
      logData.sessionId = req.session?.id;
      logData.deviceId = req.headers?.['x-device-id'];
    }

    return await AuditLog.createLog(logData);
  } catch (error) {
    console.warn('Failed to create security log:', error?.message);
    return null;
  }
};

/**
 * Log a data access event
 * @param {string} supabaseUid - User's Supabase UID
 * @param {string} resourceType - Type of resource accessed
 * @param {ObjectId} resourceId - Resource ID accessed
 * @param {string} action - Action performed (view, export, etc.)
 * @param {Object} req - Express request object (optional)
 * @param {Object} additionalData - Additional data to log
 * @returns {Object} Created audit log entry
 */
const logDataAccess = async (
  supabaseUid,
  resourceType,
  resourceId,
  action = 'view',
  req = null,
  additionalData = {}
) => {
  try {
    const logData = {
      supabaseUid,
      action: `${resourceType}_${action}`,
      resourceType,
      resourceId,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      outcome: 'success',
      ...additionalData
    };

    // Add request-specific data if available
    if (req) {
      logData.sessionId = req.session?.id;
      logData.deviceId = req.headers?.['x-device-id'];

      // Add response time if available
      if (req.startTime) {
        logData.responseTime = Date.now() - req.startTime;
      }
    }

    return await AuditLog.createLog(logData);
  } catch (error) {
    console.warn('Failed to create data access log:', error?.message);
    return null;
  }
};

/**
 * Log a compliance event
 * @param {string} supabaseUid - User's Supabase UID
 * @param {string} complianceType - Type of compliance event
 * @param {string} description - Description of the compliance event
 * @param {Object} req - Express request object (optional)
 * @param {Object} additionalData - Additional data to log
 * @returns {Object} Created audit log entry
 */
const logComplianceEvent = async (
  supabaseUid,
  complianceType,
  description,
  req = null,
  additionalData = {}
) => {
  try {
    const logData = {
      supabaseUid,
      action: 'compliance_event',
      resourceType: 'system',
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      dataClassification: 'confidential',
      details: {
        complianceType,
        description,
        ...additionalData
      }
    };

    // Add request-specific data if available
    if (req) {
      logData.sessionId = req.session?.id;
      logData.deviceId = req.headers?.['x-device-id'];
    }

    return await AuditLog.createLog(logData);
  } catch (error) {
    console.warn('Failed to create compliance log:', error?.message);
    return null;
  }
};

/**
 * Get user activity summary
 * @param {string} supabaseUid - User's Supabase UID
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Array} Activity summary data
 */
const getUserActivitySummary = async (supabaseUid, days = 30) => {
  try {
    return await AuditLog.getUserActivitySummary(supabaseUid, days);
  } catch (error) {
    console.warn('Failed to get user activity summary:', error?.message);
    return [];
  }
};

/**
 * Get security incidents
 * @param {Object} filters - Filters to apply
 * @param {number} limit - Maximum number of results (default: 50)
 * @returns {Array} Security incidents
 */
const getSecurityIncidents = async (filters = {}, limit = 50) => {
  try {
    return await AuditLog.findSecurityIncidents({ ...filters, limit });
  } catch (error) {
    console.warn('Failed to get security incidents:', error?.message);
    return [];
  }
};

/**
 * Get audit logs for a user
 * @param {string} supabaseUid - User's Supabase UID
 * @param {Object} options - Query options
 * @returns {Array} Audit logs
 */
const getUserAuditLogs = async (supabaseUid, options = {}) => {
  try {
    return await AuditLog.findByUser(supabaseUid, options);
  } catch (error) {
    console.warn('Failed to get user audit logs:', error?.message);
    return [];
  }
};

/**
 * Get audit logs for a resource
 * @param {string} resourceType - Type of resource
 * @param {ObjectId} resourceId - Resource ID
 * @param {Object} options - Query options
 * @returns {Array} Audit logs
 */
const getResourceAuditLogs = async (resourceType, resourceId, options = {}) => {
  try {
    const { limit = 100, startDate, endDate, action } = options;

    const query = { resourceType, resourceId };
    if (action) query.action = action;
    if (startDate) query.createdAt = { $gte: startDate };
    if (endDate) query.createdAt = { ...query.createdAt, $lte: endDate };

    return await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({
        path: 'supabaseUid',
        select: 'fullName email role'
      });
  } catch (error) {
    console.warn('Failed to get resource audit logs:', error?.message);
    return [];
  }
};

/**
 * Middleware to automatically log API access
 * @param {string} resourceType - Type of resource
 * @param {string} action - Action being performed
 * @returns {Function} Express middleware
 */
const autoLogAccess = (resourceType, action) => {
  return async (req, res, next) => {
    // Store start time for response time calculation
    req.startTime = Date.now();

    // Continue with the request
    const originalSend = res.send;

    res.send = function (data) {
      // Log the access after response is sent
      setImmediate(async () => {
        if (req.profile && res.statusCode >= 200 && res.statusCode < 300) {
          await logDataAccess(
            req.profile.supabaseUid,
            resourceType,
            req.params.id || req.body.id || null,
            action,
            req,
            {
              statusCode: res.statusCode,
              responseTime: Date.now() - req.startTime
            }
          );
        }
      });

      originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Check for suspicious patterns and log if found
 * @param {Object} req - Express request object
 * @param {Object} profile - User profile
 * @returns {Promise<void>}
 */
const checkSuspiciousPatterns = async (req, profile) => {
  try {
    const suspiciousPatterns = [];

    // Check for unusual access time
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      suspiciousPatterns.push({
        type: 'unusual_time',
        severity: 'medium',
        description: `Access at unusual hour: ${hour}:00`
      });
    }

    // Check for unusual location (if location data available)
    if (req.headers['x-geo-country'] && profile.metadata?.lastKnownLocation) {
      const lastLocation = profile.metadata.lastKnownLocation;
      const currentLocation = {
        country: req.headers['x-geo-country'],
        region: req.headers['x-geo-region'],
        city: req.headers['x-geo-city']
      };

      if (lastLocation.country !== currentLocation.country) {
        suspiciousPatterns.push({
          type: 'suspicious_location',
          severity: 'high',
          description: `Access from different country: ${lastLocation.country} -> ${currentLocation.country}`
        });
      }
    }

    // Check for rapid successive requests
    if (profile.metadata?.lastRequestTime) {
      const timeSinceLastRequest = Date.now() - profile.metadata.lastRequestTime;
      if (timeSinceLastRequest < 1000) { // Less than 1 second
        suspiciousPatterns.push({
          type: 'rapid_requests',
          severity: 'medium',
          description: 'Rapid successive requests detected'
        });
      }
    }

    // Update last request time
    profile.metadata.lastRequestTime = Date.now();
    if (req.headers['x-geo-country']) {
      profile.metadata.lastKnownLocation = {
        country: req.headers['x-geo-country'],
        region: req.headers['x-geo-region'],
        city: req.headers['x-geo-city']
      };
    }
    await profile.save();

    // Log suspicious patterns if found
    if (suspiciousPatterns.length > 0) {
      for (const pattern of suspiciousPatterns) {
        await logSecurityEvent(
          profile.supabaseUid,
          pattern.type,
          pattern.severity,
          pattern.description,
          req
        );
      }
    }
  } catch (error) {
    console.warn('Error checking suspicious patterns:', error?.message);
  }
};

module.exports = {
  logEvent,
  logSecurityEvent,
  logDataAccess,
  logComplianceEvent,
  getUserActivitySummary,
  getSecurityIncidents,
  getUserAuditLogs,
  getResourceAuditLogs,
  autoLogAccess,
  checkSuspiciousPatterns
};
