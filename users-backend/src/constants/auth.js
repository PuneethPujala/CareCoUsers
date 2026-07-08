module.exports = {
  ROLE_LABELS: {
    super_admin: 'Super Admin',
    org_admin: 'Org Admin',
    care_manager: 'Care Manager',
    caller: 'Caller',
    patient: 'Patient',
  },
  CREATION_HIERARCHY: {
    super_admin: ['org_admin', 'care_manager', 'caller'],
    org_admin: ['care_manager', 'caller'],
    care_manager: ['caller'],
  },
};
