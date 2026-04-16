const { normalizeCity } = require('../../src/utils/locationUtils');

const testCases = [
    { input: 'Guntur', expected: 'Guntur' },
    { input: 'Guntur Municipal Corporation', expected: 'Guntur' },
    { input: 'guntur municipal corporation', expected: 'Guntur' },
    { input: 'GMC', expected: 'Guntur' },
    { input: ' guntur ', expected: 'Guntur' },
    { input: 'Hyderabad', expected: 'Hyderabad' },
    { input: 'Greater Hyderabad Municipal Corporation', expected: 'Hyderabad' },
    { input: 'GHMC', expected: 'Hyderabad' },
    { input: 'Bengaluru', expected: 'Bengaluru' },
    { input: 'Mumbai', expected: 'Mumbai' },
    { input: 'Delhi', expected: 'Delhi' },
    { input: 'New Delhi', expected: 'New Delhi' },
];

console.log('🧪 Running tests for normalizeCity...\n');

let passed = 0;
testCases.forEach(({ input, expected }, index) => {
    const result = normalizeCity(input);
    if (result === expected) {
        console.log(`✅ Test ${index + 1} passed: "${input}" -> "${result}"`);
        passed++;
    } else {
        console.error(`❌ Test ${index + 1} failed: "${input}" expected "${expected}", but got "${result}"`);
    }
});

console.log(`\n📊 Summary: ${passed}/${testCases.length} tests passed.`);

if (passed === testCases.length) {
    process.exit(0);
} else {
    process.exit(1);
}
