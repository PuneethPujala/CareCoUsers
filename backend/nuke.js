require('dotenv').config();
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRESERVED_EMAIL = 'prakashraj.badugula@gmail.com';

async function nuke() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connected to MongoDB');

    // 1. NUKE SUPABASE
    console.log('🔥 Initiating Supabase Nuke...');
    let page = 1;
    let keepGoing = true;
    let sbDeleted = 0;

    while (keepGoing) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error('Failed to list Supabase users:', error);
        break;
      }
      const users = data.users || [];
      if (users.length === 0) {
        keepGoing = false;
        break;
      }

      for (let u of users) {
        if (u.email && u.email.toLowerCase() === PRESERVED_EMAIL.toLowerCase()) {
          console.log(`🛡️  Preserving Supabase Master Account: ${u.email}`);
          continue;
        }
        await supabase.auth.admin.deleteUser(u.id);
        sbDeleted++;
      }
      
      if (users.length < 1000) keepGoing = false;
      page++;
    }
    console.log(`✅ Supabase Nuke Complete. Obliterated ${sbDeleted} cloud identities.`);

    // 2. NUKE MONGODB CORE
    console.log('🔥 Initiating MongoDB Nuke...');
    const collections = await mongoose.connection.db.collections();
    
    for (let collection of collections) {
      const colName = collection.collectionName;

      // DO NOT DELETE SCHEMAS OR ROLE PERMISSIONS OR SYSTEM INDEXES
      if (colName === 'system.indexes' || colName === 'rolepermissions') {
         continue; 
      }
      
      if (colName === 'profiles') {
        const res = await collection.deleteMany({ 
           $or: [
             { email: { $exists: false } },
             { email: { $ne: PRESERVED_EMAIL } }
           ]
        });
        console.log(`🗑️ Wiped ${res.deletedCount} from profiles`);
      } else {
        const res = await collection.deleteMany({});
        console.log(`🗑️ Wiped ${res.deletedCount} from ${colName}`);
      }
    }

    console.log('\n✅ SYSTEM RESET COMPLETE. App is now completely blank.');
    process.exit(0);
  } catch (error) {
    console.error('Error during nuke:', error);
    process.exit(1);
  }
}

nuke();
