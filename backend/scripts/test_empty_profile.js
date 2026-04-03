require('dotenv').config({path: '.env'});
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function makeRequest(method, path, token, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: `/api/users/patients${path}`,
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        };
        
        if (body) {
            options.headers['Content-Type'] = 'application/json';
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch(e) { resolve({ status: res.statusCode, data }); }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    const timestamp = Date.now();
    const email = `test_empty_${timestamp}@example.com`;
    const password = 'Password123!';

    console.log(`1. Signing up fresh user: ${email}...`);
    const { data: authData, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: 'Test Empty Profile', role: 'patient' } }
    });

    if (signupError) return console.error('Signup Error:', signupError.message);
    const token = authData.session?.access_token;
    if (!token) return console.error('Failed to get session token after signup.');

    console.log('2. Hitting GET /me to auto-seed...');
    const resultMe = await makeRequest('GET', '/me', token);
    console.log('GET /me Status:', resultMe.status);
    
    // Subscribe the patient immediately
    console.log('3. Subscribing Patient (Triggering subscribeAndSeedDemoData)...');
    const resultSub = await makeRequest('POST', '/subscribe', token, { planId: 'basic' });
    console.log('POST /subscribe Status:', resultSub.status);

    console.log('4. Hitting GET /me/profile...');
    const resultProfile = await makeRequest('GET', '/me/profile', token);
    console.log('GET /me/profile Status:', resultProfile.status);
    
    if (resultProfile.status === 200) {
        const p = resultProfile.data;
        const containers = {
            conditions: p.conditions?.length,
            medical_history: p.medical_history?.length,
            allergies: p.allergies?.length,
            medications: p.medications?.length,
            vaccinations: p.vaccinations?.length,
            appointments: p.appointments?.length,
        };
        console.log('\n--- VERIFICATION OF CONTAINERS ---');
        console.table(containers);
        
        const isClean = Object.values(containers).every(v => v === 0);
        if (isClean) console.log('✅ ALL TESTS PASSED: Data containers are empty.');
        else console.log('❌ FAILED: Found dummy data in containers.');
    }

    process.exit(0);
}

run();
