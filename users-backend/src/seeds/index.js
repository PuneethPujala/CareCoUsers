const mongoose = require('mongoose');
require('dotenv').config();

const { seedPermissions } = require('./rolePermissions');

// Import other seed functions as they are created
// const { seedOrganizations } = require('./organizations');
// const { seedUsers } = require('./users');

const runSeeds = async () => {
  try {
    console.log('🚀 Starting database seeding...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔗 Connected to MongoDB\n');

    // Run seed functions in order
    await seedPermissions();
    // await seedOrganizations();
    // await seedUsers();

    console.log('\n✅ All seeding completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run seeds if this file is executed directly
if (require.main === module) {
  runSeeds()
    .then(() => {
      console.log('🎉 Seeding process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding process failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runSeeds
};
