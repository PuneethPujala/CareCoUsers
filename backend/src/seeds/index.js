/**
 * ═══════════════════════════════════════════════════════════════
 * SEED SCRIPT — CareConnect Database Initialization
 *
 * Creates:
 *   1. Role permissions for all 6 roles
 *   2. First Super Admin account (via Supabase + MongoDB)
 *   3. Sample organization (optional, with --sample flag)
 *
 * Usage:
 *   node src/seeds/index.js                 # Seed roles + super admin
 *   node src/seeds/index.js --sample        # Also seed sample org
 *   node src/seeds/index.js --reset         # Clear and re-seed permissions
 *
 * Environment:
 *   Requires MONGODB_URI, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const connectDB = require('../config/database');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const RolePermission = require('../models/RolePermission');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const SEED_SAMPLE = args.includes('--sample');

// ═══════════════════════════════════════════════════════════════
// 1. ROLE PERMISSIONS
// ═══════════════════════════════════════════════════════════════

const ROLE_PERMISSIONS = [
  // ── Super Admin → full platform access ─────────────────────
  { role: 'super_admin', resource: '*', action: '*', description: 'Full platform access', priority: 100 },

  // ── Org Admin → full org access ────────────────────────────
  { role: 'org_admin', resource: 'organization', action: '*', description: 'Manage own organization' },
  { role: 'org_admin', resource: 'profiles', action: 'read', description: 'View all profiles in org' },
  { role: 'org_admin', resource: 'profiles', action: 'create', description: 'Create care managers' },
  { role: 'org_admin', resource: 'profiles', action: 'update', description: 'Update profiles in org' },
  { role: 'org_admin', resource: 'profiles', action: 'delete', description: 'Deactivate users' },
  { role: 'org_admin', resource: 'patients', action: 'read', description: 'View all patients in org' },
  { role: 'org_admin', resource: 'caretakers', action: 'read', description: 'View caretakers' },
  { role: 'org_admin', resource: 'call_logs', action: 'read', description: 'View calls in org' },
  { role: 'org_admin', resource: 'medications', action: 'read', description: 'View medications' },
  { role: 'org_admin', resource: 'escalations', action: 'read', description: 'View escalations' },
  { role: 'org_admin', resource: 'invoices', action: 'read', description: 'View billing' },
  { role: 'org_admin', resource: 'audit_logs', action: 'read', description: 'View audit logs' },
  { role: 'org_admin', resource: 'reports', action: 'read', description: 'View reports' },
  { role: 'org_admin', resource: 'analytics', action: 'read', description: 'View analytics' },

  // ── Care Manager → manage team and patients ────────────────
  { role: 'care_manager', resource: 'patients', action: 'read', description: 'View supervised patients' },
  { role: 'care_manager', resource: 'patients', action: 'assign', description: 'Assign patients to caretakers' },
  { role: 'care_manager', resource: 'patients', action: 'update', description: 'Update patient info' },
  { role: 'care_manager', resource: 'caretakers', action: 'read', description: 'View supervised caretakers' },
  { role: 'care_manager', resource: 'call_logs', action: 'read', description: 'View supervised calls' },
  { role: 'care_manager', resource: 'medications', action: '*', description: 'Full medication CRUD' },
  { role: 'care_manager', resource: 'escalations', action: 'read', description: 'View escalations' },
  { role: 'care_manager', resource: 'escalations', action: 'update', description: 'Resolve escalations' },
  { role: 'care_manager', resource: 'reports', action: 'read', description: 'View reports' },
  { role: 'care_manager', resource: 'analytics', action: 'read', description: 'View analytics' },
  { role: 'care_manager', resource: 'notifications', action: 'create', description: 'Send messages' },

  // ── Caretaker → daily operations ───────────────────────────
  { role: 'caretaker', resource: 'patients', action: 'read', description: 'View assigned patients' },
  { role: 'caretaker', resource: 'call_logs', action: 'create', description: 'Create call logs' },
  { role: 'caretaker', resource: 'call_logs', action: 'update', description: 'Update own call logs' },
  { role: 'caretaker', resource: 'call_logs', action: 'read', description: 'View own call logs' },
  { role: 'caretaker', resource: 'medications', action: 'read', description: 'View patient medications' },
  { role: 'caretaker', resource: 'escalations', action: 'create', description: 'Create escalations' },
  { role: 'caretaker', resource: 'escalations', action: 'read', description: 'View own escalations' },

  // ── Patient Mentor → limited view access ───────────────────
  { role: 'patient_mentor', resource: 'patients', action: 'read', description: 'View authorized patient' },
  { role: 'patient_mentor', resource: 'call_logs', action: 'read', description: 'View patient call logs' },
  { role: 'patient_mentor', resource: 'medications', action: 'read', description: 'View patient medications' },

  // ── Patient → self access ──────────────────────────────────
  { role: 'patient', resource: 'profiles', action: 'read', description: 'View own profile' },
  { role: 'patient', resource: 'medications', action: 'read', description: 'View own medications' },
  { role: 'patient', resource: 'call_logs', action: 'read', description: 'View own call history' },
];

async function seedPermissions() {
  console.log('\n📋 Seeding role permissions...');

  if (RESET) {
    await RolePermission.deleteMany({});
    console.log('   🗑️  Cleared existing permissions');
  }

  let created = 0;
  let skipped = 0;

  for (const perm of ROLE_PERMISSIONS) {
    try {
      await RolePermission.findOneAndUpdate(
        { role: perm.role, resource: perm.resource, action: perm.action },
        { $setOnInsert: perm },
        { upsert: true, new: true }
      );
      created++;
    } catch (err) {
      if (err.code === 11000) {
        skipped++;
      } else {
        console.error(`   ❌ Error seeding ${perm.role}/${perm.resource}/${perm.action}:`, err.message);
      }
    }
  }

  console.log(`   ✅ Permissions: ${created} processed, ${skipped} skipped (already existed)`);
}

// ═══════════════════════════════════════════════════════════════
// 2. SUPER ADMIN ACCOUNT
// ═══════════════════════════════════════════════════════════════

async function seedSuperAdmin() {
  console.log('\n👤 Seeding Super Admin...');

  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@careconnect.com';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'CareConnect@2025!';

  // Check if already exists
  const existing = await Profile.findOne({ email, role: 'super_admin' });
  if (existing) {
    console.log(`   ⚠️  Super Admin already exists: ${email}`);
    return existing;
  }

  // Create Supabase auth user
  let supabaseUser;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'super_admin', fullName: 'System Administrator' },
    });

    if (error) {
      if (error.message?.includes('already been registered')) {
        const { data: users } = await supabase.auth.admin.listUsers();
        supabaseUser = users?.users?.find(u => u.email === email);
        if (!supabaseUser) throw error;
        console.log('   ℹ️  Supabase user already exists, linking to MongoDB');
      } else {
        throw error;
      }
    } else {
      supabaseUser = data.user;
    }
  } catch (err) {
    console.error('   ❌ Supabase user creation failed:', err.message);
    console.log('   ℹ️  Creating MongoDB profile without Supabase (set supabaseUid manually later)');

    const profile = await Profile.create({
      supabaseUid: `pending_${Date.now()}`,
      email,
      fullName: 'System Administrator',
      role: 'super_admin',
      isActive: true,
    });

    console.log(`   ✅ Super Admin profile created (pending Supabase link): ${profile._id}`);
    return profile;
  }

  const profile = await Profile.create({
    supabaseUid: supabaseUser.id,
    email,
    fullName: 'System Administrator',
    role: 'super_admin',
    isActive: true,
  });

  console.log(`   ✅ Super Admin created: ${email} (ID: ${profile._id})`);
  return profile;
}

// ═══════════════════════════════════════════════════════════════
// 3. SAMPLE ORGANIZATION (optional, --sample flag)
// ═══════════════════════════════════════════════════════════════

async function seedSampleOrganization() {
  console.log('\n🏥 Seeding sample organization...');

  const existing = await Organization.findOne({ name: 'CareConnect Demo Clinic' });
  if (existing) {
    console.log('   ⚠️  Sample org already exists');
    return existing;
  }

  const org = await Organization.create({
    name: 'CareConnect Demo Clinic',
    type: 'clinic',
    contactEmail: 'demo@careconnect.com',
    contactPhone: '+1-555-0100',
    address: {
      street: '123 Health Ave',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94105',
      country: 'US',
    },
    subscription: {
      plan: 'professional',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      maxUsers: 50,
      maxPatients: 200,
    },
    settings: {
      callReminderMinutes: 10,
      adherenceAlertThreshold: 70,
      timezone: 'America/Los_Angeles',
      language: 'en',
    },
    isActive: true,
  });

  console.log(`   ✅ Sample org created: ${org.name} (ID: ${org._id})`);

  // Create a sample Org Admin for this org
  const orgAdminEmail = 'orgadmin@demo.careconnect.com';
  const existingAdmin = await Profile.findOne({ email: orgAdminEmail });
  if (!existingAdmin) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: orgAdminEmail,
        password: 'DemoAdmin@2025!',
        email_confirm: true,
        user_metadata: { role: 'org_admin', fullName: 'Demo Org Admin' },
      });

      if (!error && data?.user) {
        await Profile.create({
          supabaseUid: data.user.id,
          email: orgAdminEmail,
          fullName: 'Demo Org Admin',
          role: 'org_admin',
          organizationId: org._id,
          isActive: true,
        });
        console.log(`   ✅ Sample Org Admin created: ${orgAdminEmail}`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Sample Org Admin creation failed: ${err.message}`);
    }
  }

  return org;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('🌱 CareConnect Database Seed');
  console.log('═══════════════════════════════════════════');

  await connectDB();

  await seedPermissions();
  await seedSuperAdmin();

  if (SEED_SAMPLE) {
    await seedSampleOrganization();
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('✅ Seeding complete!');
  console.log('═══════════════════════════════════════════\n');

  await mongoose.connection.close();
  process.exit(0);
}

// Exports for programmatic use
module.exports = { seedPermissions, seedSuperAdmin, seedSampleOrganization };

// Run directly
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
}
