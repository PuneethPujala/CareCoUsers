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

describe('locationUtils', () => {
    test.each(testCases)('normalizeCity: "$input" -> "$expected"', ({ input, expected }) => {
        expect(normalizeCity(input)).toBe(expected);
    });
});
