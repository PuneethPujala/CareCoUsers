require('dotenv').config();
const { connectRedis, invalidatePattern } = require('./src/config/redis');

async function clear() {
    const client = connectRedis();
    if (client) {
        try {
            await invalidatePattern('dashboard:org:*');
            console.log('✅ Dashboard org cache explicitly flushed.');
        } catch(e) {
            console.error(e);
        } finally {
            setTimeout(() => process.exit(0), 1000);
        }
    } else {
        console.log('No Redis configured.');
        process.exit(0);
    }
}
clear();
