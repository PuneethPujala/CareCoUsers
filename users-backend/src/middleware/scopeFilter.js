/**
 * scopeFilter middleware
 * Attaches a MongoDB query filter to req.scopeFilter based on
 * the authenticated user's role and the resource being accessed.
 *
 * Usage: scopeFilter('patients') | scopeFilter('profile') | scopeFilter('callers')
 *
 * Roles:
 *   super_admin  → no filter, sees everything
 *   org_admin    → scoped to their organisation
 *   care_manager → scoped to their organisation
 *   caller       → scoped to their assigned patients (patients only)
 *   patient      → scoped to their own record (users routes only)
 */
const scopeFilter = (resourceType) => {
    return async (req, res, next) => {
        try {
            const { role, _id: profileId, organizationId } = req.profile;

            switch (role) {

                case 'super_admin':
                    // No filter — sees all records across all orgs
                    req.scopeFilter = {};
                    break;

                case 'org_admin':
                case 'care_manager':
                    // Scoped to their organisation
                    // Patient collection uses snake_case, Profile uses camelCase
                    req.scopeFilter = resourceType === 'patients'
                        ? { organization_id: organizationId }
                        : { organizationId };
                    break;

                case 'caller':
                    if (resourceType === 'patients') {
                        // Callers only see their own 30 assigned patients
                        req.scopeFilter = { assigned_caller_id: profileId };
                    } else {
                        // For profile or anything else, callers only see themselves
                        req.scopeFilter = { _id: profileId };
                    }
                    break;

                case 'patient':
                    // Patients only access their own data via users/ routes
                    // Should not normally hit admin-facing routes
                    if (resourceType === 'patients') {
                        req.scopeFilter = { _id: profileId };
                    } else {
                        return res.status(403).json({ error: 'Access denied' });
                    }
                    break;

                default:
                    return res.status(403).json({ error: `Unknown role: ${role}` });
            }

            next();
        } catch (err) {
            console.error('Scope filter error:', err);
            return res.status(500).json({ error: 'Scope filter error' });
        }
    };
};

module.exports = { scopeFilter };