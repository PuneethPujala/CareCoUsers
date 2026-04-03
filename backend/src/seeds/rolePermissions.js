const RolePermission = require('../models/RolePermission');

const permissions = [
  // Super Admin - Full platform access
  { role: 'super_admin', resource: '*', action: '*', description: 'Full platform access' },

  // Org Admin permissions
  { role: 'org_admin', resource: 'organization', action: 'read', description: 'View organization details' },
  { role: 'org_admin', resource: 'organization', action: 'update', description: 'Update organization settings' },
  { role: 'org_admin', resource: 'care_managers', action: 'create', description: 'Create care managers' },
  { role: 'org_admin', resource: 'care_managers', action: 'read', description: 'View care managers' },
  { role: 'org_admin', resource: 'care_managers', action: 'update', description: 'Update care managers' },
  { role: 'org_admin', resource: 'care_managers', action: 'delete', description: 'Delete care managers' },
  { role: 'org_admin', resource: 'caretakers', action: 'create', description: 'Create caretakers' },
  { role: 'org_admin', resource: 'caretakers', action: 'read', description: 'View caretakers' },
  { role: 'org_admin', resource: 'caretakers', action: 'update', description: 'Update caretakers' },
  { role: 'org_admin', resource: 'caretakers', action: 'delete', description: 'Delete caretakers' },
  { role: 'org_admin', resource: 'patients', action: 'create', description: 'Create patients' },
  { role: 'org_admin', resource: 'patients', action: 'read', description: 'View patients' },
  { role: 'org_admin', resource: 'patients', action: 'update', description: 'Update patients' },
  { role: 'org_admin', resource: 'patients', action: 'delete', description: 'Delete patients' },
  { role: 'org_admin', resource: 'patient_mentors', action: 'create', description: 'Create patient mentors' },
  { role: 'org_admin', resource: 'patient_mentors', action: 'read', description: 'View patient mentors' },
  { role: 'org_admin', resource: 'patient_mentors', action: 'update', description: 'Update patient mentors' },
  { role: 'org_admin', resource: 'patient_mentors', action: 'delete', description: 'Delete patient mentors' },
  { role: 'org_admin', resource: 'profile', action: 'read', description: 'View profiles' },
  { role: 'org_admin', resource: 'profile', action: 'update', description: 'Update profiles' },
  { role: 'org_admin', resource: 'medications', action: 'read', description: 'View medications' },
  { role: 'org_admin', resource: 'medications', action: 'update', description: 'Update medications' },
  { role: 'org_admin', resource: 'call_logs', action: 'read', description: 'View call logs' },
  { role: 'org_admin', resource: 'reports', action: 'read', description: 'View reports' },
  { role: 'org_admin', resource: 'billing', action: 'read', description: 'View billing information' },
  { role: 'org_admin', resource: 'organizations', action: 'read', description: 'View organizations' },
  { role: 'org_admin', resource: 'organizations', action: 'update', description: 'Update organizations' },

  // Care Manager permissions
  { role: 'care_manager', resource: 'caretakers', action: 'create', description: 'Create caretakers' },
  { role: 'care_manager', resource: 'caretakers', action: 'read', description: 'View caretakers' },
  { role: 'care_manager', resource: 'caretakers', action: 'update', description: 'Update caretakers' },
  { role: 'care_manager', resource: 'caretakers', action: 'delete', description: 'Delete caretakers' },
  { role: 'care_manager', resource: 'patients', action: 'create', description: 'Create patients' },
  { role: 'care_manager', resource: 'patients', action: 'read', description: 'View patients' },
  { role: 'care_manager', resource: 'patients', action: 'update', description: 'Update patients' },
  { role: 'care_manager', resource: 'patients', action: 'assign', description: 'Assign patients to caretakers' },
  { role: 'care_manager', resource: 'patients', action: 'authorize', description: 'Authorize mentors for patients' },
  { role: 'care_manager', resource: 'patients', action: 'revoke', description: 'Revoke mentor authorizations' },
  { role: 'care_manager', resource: 'patient_mentors', action: 'read', description: 'View patient mentors' },
  { role: 'care_manager', resource: 'mentors', action: 'read', description: 'View mentors' },
  { role: 'care_manager', resource: 'mentors', action: 'update', description: 'Update mentor permissions' },
  { role: 'care_manager', resource: 'medications', action: 'read', description: 'View medications' },
  { role: 'care_manager', resource: 'medications', action: 'update', description: 'Update medications' },
  { role: 'care_manager', resource: 'call_logs', action: 'read', description: 'View call logs' },
  { role: 'care_manager', resource: 'call_logs', action: 'create', description: 'Create call logs' },
  { role: 'care_manager', resource: 'reports', action: 'read', description: 'View reports' },
  { role: 'care_manager', resource: 'organizations', action: 'read', description: 'View organization details' },
  { role: 'care_manager', resource: 'profile', action: 'read', description: 'View profiles' },
  { role: 'care_manager', resource: 'profile', action: 'update', description: 'Update profiles' },

  // Caretaker permissions
  { role: 'caretaker', resource: 'patients', action: 'read', description: 'View assigned patients' },
  { role: 'caretaker', resource: 'medications', action: 'read', description: 'View patient medications' },
  { role: 'caretaker', resource: 'call_logs', action: 'create', description: 'Create call logs' },
  { role: 'caretaker', resource: 'call_logs', action: 'read', description: 'View call logs' },
  { role: 'caretaker', resource: 'escalations', action: 'create', description: 'Create escalations' },
  { role: 'caretaker', resource: 'profile', action: 'read', description: 'View own profile' },
  { role: 'caretaker', resource: 'profile', action: 'update', description: 'Update own profile' },
  { role: 'caretaker', resource: 'caretakers', action: 'read', description: 'View own caretaker info' },
  { role: 'caretaker', resource: 'caretakers', action: 'update', description: 'Update own caretaker info' },

  // Patient Mentor permissions
  { role: 'patient_mentor', resource: 'patients', action: 'read', description: 'View authorized patients' },
  { role: 'patient_mentor', resource: 'medications', action: 'read', description: 'View patient medications' },
  { role: 'patient_mentor', resource: 'medications', action: 'create', description: 'Add medications for patients' },
  { role: 'patient_mentor', resource: 'medications', action: 'update', description: 'Update patient medications' },
  { role: 'patient_mentor', resource: 'call_logs', action: 'read', description: 'View patient call logs' },
  { role: 'patient_mentor', resource: 'health_journal', action: 'create', description: 'Create health journal entries' },
  { role: 'patient_mentor', resource: 'health_journal', action: 'read', description: 'View health journal entries' },
  { role: 'patient_mentor', resource: 'profile', action: 'read', description: 'View own profile' },
  { role: 'patient_mentor', resource: 'profile', action: 'update', description: 'Update own profile' },
  { role: 'patient_mentor', resource: 'mentors', action: 'read', description: 'View own mentor info' },
  { role: 'patient_mentor', resource: 'mentors', action: 'update', description: 'Update own mentor info' },

  // Patient permissions
  { role: 'patient', resource: 'patients', action: 'read', description: 'View own patient information' },
  { role: 'patient', resource: 'medications', action: 'read', description: 'View own medications' },
  { role: 'patient', resource: 'call_logs', action: 'read', description: 'View own call logs' },
  { role: 'patient', resource: 'mentors', action: 'authorize', description: 'Authorize mentors' },
  { role: 'patient', resource: 'mentors', action: 'revoke', description: 'Revoke mentor authorizations' },
  { role: 'patient', resource: 'profile', action: 'read', description: 'View own profile' },
  { role: 'patient', resource: 'profile', action: 'update', description: 'Update own profile' },
  { role: 'patient', resource: 'health_journal', action: 'create', description: 'Create health journal entries' },
  { role: 'patient', resource: 'health_journal', action: 'read', description: 'View health journal entries' }
];

const seedPermissions = async () => {
  try {
    console.log('🌱 Seeding role permissions...');

    // Clear existing permissions (optional - comment out if you want to preserve existing)
    await RolePermission.deleteMany({});
    console.log('🗑️ Cleared existing permissions');

    // Insert permissions
    await RolePermission.insertMany(permissions, { ordered: false });
    console.log(`✅ Successfully seeded ${permissions.length} role permissions`);

    // Log summary by role
    const roleSummary = await RolePermission.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          permissions: {
            $push: {
              resource: '$resource',
              action: '$action'
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    console.log('\n📊 Permission Summary by Role:');
    roleSummary.forEach(role => {
      console.log(`  ${role._id}: ${role.count} permissions`);
    });

    console.log('\n🎉 Role permissions seeding completed!');

  } catch (error) {
    console.error('❌ Error seeding role permissions:', error);
    
    // Handle duplicate key errors (if not clearing existing)
    if (error.code === 11000) {
      console.log('⚠️ Some permissions already exist (duplicate key error)');
      console.log('💡 Consider clearing existing permissions first or updating individually');
    }
    
    throw error;
  }
};

// Additional helper function to add/update specific permissions
const addOrUpdatePermission = async (role, resource, action, description = '') => {
  try {
    const permission = await RolePermission.findOneAndUpdate(
      { role, resource, action },
      { role, resource, action, description, isActive: true },
      { upsert: true, new: true }
    );
    
    console.log(`✅ Permission added/updated: ${role} - ${resource}:${action}`);
    return permission;
  } catch (error) {
    console.error(`❌ Error adding/updating permission:`, error);
    throw error;
  }
};

// Helper function to remove permissions
const removePermission = async (role, resource, action) => {
  try {
    const result = await RolePermission.deleteOne({ role, resource, action });
    
    if (result.deletedCount > 0) {
      console.log(`🗑️ Permission removed: ${role} - ${resource}:${action}`);
    } else {
      console.log(`⚠️ Permission not found: ${role} - ${resource}:${action}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error removing permission:`, error);
    throw error;
  }
};

// Helper function to check if permission exists
const checkPermission = async (role, resource, action) => {
  try {
    const permission = await RolePermission.findOne({ role, resource, action, isActive: true });
    return !!permission;
  } catch (error) {
    console.error(`❌ Error checking permission:`, error);
    return false;
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  const mongoose = require('mongoose');
  require('dotenv').config();

  // Connect to MongoDB
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('🔗 Connected to MongoDB');
      return seedPermissions();
    })
    .then(() => {
      console.log('🎯 Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = {
  seedPermissions,
  addOrUpdatePermission,
  removePermission,
  checkPermission,
  permissions
};
