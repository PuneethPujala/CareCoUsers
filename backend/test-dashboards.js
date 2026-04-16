const axios = require('axios');

async function testDashboards() {
    const baseURL = 'http://localhost:5000/api';
    console.log('--- Testing Dashboard Endpoints ---');

    // In a real scenario, we'd need a token. 
    // This script is to verify the existence and structure of the endpoints.
    // Assuming we can bypass auth for local manual test or use an existing profile.

    const endpoints = [
        '/dashboard/super-admin-stats',
        '/dashboard/org-admin-stats',
        '/dashboard/care-manager-stats'
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`Checking ${endpoint}...`);
            // We expect 401/403 if not authenticated, which confirms the route exists and is protected
            const response = await axios.get(`${baseURL}${endpoint}`);
            console.log(`Success: ${endpoint}`, response.data);
        } catch (error) {
            if (error.response) {
                console.log(`Response Status for ${endpoint}: ${error.response.status} (${error.response.data.error || 'Access Denied'})`);
            } else {
                console.log(`Error for ${endpoint}:`, error.message);
            }
        }
    }
}

testDashboards();
