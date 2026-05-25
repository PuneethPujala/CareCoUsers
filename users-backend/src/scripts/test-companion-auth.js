/**
 * test-companion-auth.js
 * Integration test to verify:
 *   1. Auto-resolving dynamic login for companion profiles.
 *   2. Global email uniqueness checks.
 *   3. Google OAuth auto-linking for companion profiles.
 *   4. OAUTH_LINK_CONFLICT overwrite guards.
 *   5. NO_PASSWORD_SET check for pure OAuth-only accounts.
 *
 * Usage:
 *   node src/scripts/test-companion-auth.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Profile = require('../models/Profile');
const Companion = require('../models/Companion');
const CompanionAccess = require('../models/CompanionAccess');
const authService = require('../services/authService');
const passwordService = require('../services/passwordService');

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MONGODB_URI is not set.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  const testEmail = `test_companion_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const testUid = `sb_${Date.now()}`;
  let companionProfile = null;
  let oauthOnlyProfile = null;

  try {
    console.log('--- TEST 1: Registering Companion Profile ---');
    // Pre-create the Companion Profile in dedicated Companion collection
    const salt = await require('bcryptjs').genSalt(10);
    const passwordHash = await require('bcryptjs').hash(testPassword, salt);
    companionProfile = await Companion.create({
      supabaseUid: `cmp_${Date.now()}`,
      email: testEmail,
      fullName: 'Test Companion',
      passwordHash,
      role: 'companion',
      isActive: true,
      emailVerified: true,
    });
    console.log(`✅ Companion created with email: ${testEmail}\n`);

    console.log('--- TEST 2: Email/Password Login Dynamic Resolution ---');
    // Try logging in with the unified email/password login endpoint (simulating mobile client)
    const loginRes = await authService.login({ email: testEmail, password: testPassword, role: 'patient' }, { ip: '127.0.0.1', headers: {} });
    
    if (loginRes.profile && loginRes.profile.role === 'companion') {
      console.log('✅ Success! Login correctly resolved to "companion" role automatically.\n');
    } else {
      throw new Error(`Failed: Resolved to incorrect profile role: ${loginRes.profile?.role}`);
    }

    console.log('--- TEST 3: Google OAuth Registration Linking Flow ---');
    // Simulate a Google login where the frontend submits to /register (as Google always returns isNewUser: true)
    const oauthRes = await authService.registerPatient({
      email: testEmail,
      fullName: 'Test Companion OAuth Link',
      supabaseUid: testUid,
    }, { ip: '127.0.0.1', headers: {} });

    if (oauthRes.profile && oauthRes.profile.role === 'companion') {
      console.log('✅ Success! OAuth register successfully linked to existing Companion instead of creating a Patient.\n');
    } else {
      throw new Error(`Failed: OAuth registration resolved to incorrect role or failed linking.`);
    }

    // Verify no Patient record was mistakenly created
    const duplicatePatient = await Patient.findOne({ email: testEmail });
    if (duplicatePatient) {
      throw new Error('Failed: Duplicate Patient record was mistakenly created for a Companion email.');
    }
    console.log('✅ Success! Double-check confirmed no duplicate Patient record exists.\n');

    console.log('--- TEST 4: Supabase Uid Overwrite Guard ---');
    try {
      await authService.registerPatient({
        email: testEmail,
        fullName: 'Imposter OAuth Attempt',
        supabaseUid: 'imposter_uid_123',
      }, { ip: '127.0.0.1', headers: {} });
      throw new Error('Failed: Allowed overwriting an already linked Supabase Uid!');
    } catch (err) {
      if (err.code === 'OAUTH_LINK_CONFLICT') {
        console.log('✅ Success! Prevented link hijacking with OAUTH_LINK_CONFLICT guard.\n');
      } else {
        throw err;
      }
    }

    console.log('--- TEST 5: NO_PASSWORD_SET for Google-only users ---');
    // Create a Google-only companion who has no password set in dedicated collection
    const oauthOnlyEmail = `oauth_only_${Date.now()}@example.com`;
    oauthOnlyProfile = await Companion.create({
      supabaseUid: `sb_oauth_${Date.now()}`,
      email: oauthOnlyEmail,
      fullName: 'OAuth Companion',
      role: 'companion',
      isActive: true,
      emailVerified: true,
    });

    try {
      await authService.login({ email: oauthOnlyEmail, password: 'AnyPassword1!', role: 'patient' }, { ip: '127.0.0.1', headers: {} });
      throw new Error('Failed: Allowed password login on password-less account.');
    } catch (err) {
      if (err.code === 'NO_PASSWORD_SET') {
        console.log('✅ Success! Returned clean NO_PASSWORD_SET code without crashing.\n');
      } else {
        throw err;
      }
    }

  } catch (error) {
    console.error('❌ Integration Test FAILED:', error);
    process.exit(1);
  } finally {
    console.log('Cleaning up test documents...');
    if (companionProfile) {
      await Companion.findByIdAndDelete(companionProfile._id);
      await Profile.findByIdAndDelete(companionProfile._id);
    }
    if (oauthOnlyProfile) {
      await Companion.findByIdAndDelete(oauthOnlyProfile._id);
      await Profile.findByIdAndDelete(oauthOnlyProfile._id);
    }
    await mongoose.disconnect();
    console.log('Database connection closed. Run finished.');
  }
}

run();
