const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

let supabaseCache = null;
const getSupabase = () => {
  if (!supabaseCache && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseCache = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseCache;
};

const safeSupabaseDelete = async (uid) => {
  if (!uid) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.auth.admin.deleteUser(uid);
    if (error && !error.message.includes('User not found')) {
      console.error(`[Mongoose Hook] Supabase sync deletion failed for uid ${uid}:`, error.message);
    }
  } catch (err) {
    console.error(`[Mongoose Hook] Supabase sync caught exception for uid ${uid}:`, err.message);
  }
};

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  organization_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  caller_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
  care_manager_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
  assigned_manager_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date },
  profile_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
  supabase_uid: String,
  subscription: { type: Object }
}, { 
  strict: false,
  collection: 'patients',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

PatientSchema.virtual('fullName').get(function() { return this.name; });
PatientSchema.virtual('isActive').get(function() { return this.is_active; });
PatientSchema.virtual('organizationId').get(function() { return this.organization_id; });
PatientSchema.virtual('callerId').get(function() { return this.caller_id; });
PatientSchema.virtual('careManagerId').get(function() { return this.care_manager_id; });

// ── Supabase Synchronization Hooks ─────────────────────────────
PatientSchema.pre('findOneAndDelete', async function(next) {
  try {
    const docToUpdate = await this.model.findOne(this.getFilter());
    if (docToUpdate && docToUpdate.supabase_uid) {
      await safeSupabaseDelete(docToUpdate.supabase_uid);
    }
  } catch (err) {
    console.error('[Patient Hook] Error inside findOneAndDelete:', err.message);
  }
  next();
});

PatientSchema.pre('deleteOne', { document: false, query: true }, async function(next) {
  try {
    const docToUpdate = await this.model.findOne(this.getFilter());
    if (docToUpdate && docToUpdate.supabase_uid) {
      await safeSupabaseDelete(docToUpdate.supabase_uid);
    }
  } catch (err) {
    console.error('[Patient Hook] Error inside deleteOne query:', err.message);
  }
  next();
});

PatientSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    if (this.supabase_uid) {
      await safeSupabaseDelete(this.supabase_uid);
    }
  } catch (err) {
    console.error('[Patient Hook] Error inside deleteOne document:', err.message);
  }
  next();
});

PatientSchema.pre('deleteMany', async function(next) {
  try {
    const docs = await this.model.find(this.getFilter());
    for (const doc of docs) {
      if (doc.supabase_uid) {
        await safeSupabaseDelete(doc.supabase_uid);
      }
    }
  } catch (err) {
    console.error('[Patient Hook] Error inside deleteMany:', err.message);
  }
  next();
});


module.exports = mongoose.model('Patient', PatientSchema);
