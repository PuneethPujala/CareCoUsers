/**
 * Normalizes city names to a canonical version.
 * Handles variations like "Guntur Municipal Corporation" -> "Guntur".
 * 
 * @param {string} cityName - The city name to normalize.
 * @returns {string} The normalized city name.
 */
function normalizeCity(cityName) {
    if (!cityName) return cityName;

    let normalized = cityName.trim();

    // Map common variations to canonical names
    const exactMappings = {
        'Guntur Municipal Corporation': 'Guntur',
        'GMC': 'Guntur',
        'Greater Hyderabad Municipal Corporation': 'Hyderabad',
        'GHMC': 'Hyderabad',
        'Bruhat Bengaluru Mahanagara Palike': 'Bengaluru',
        'BBMP': 'Bengaluru',
    };

    // Check for exact mappings first (case-insensitive)
    const lowerNormalized = normalized.toLowerCase();
    for (const [key, value] of Object.entries(exactMappings)) {
        if (key.toLowerCase() === lowerNormalized) {
            return value;
        }
    }

    // Check for patterns (e.g., "Guntur Municipal Corporation")
    if (lowerNormalized.includes('guntur municipal')) {
        return 'Guntur';
    }
    if (lowerNormalized.includes('hyderabad municipal')) {
        return 'Hyderabad';
    }
    if (lowerNormalized.includes('bengaluru municipal') || lowerNormalized.includes('bangalore municipal')) {
        return 'Bengaluru';
    }

    // Default: Just capitalize the first letter of each word
    return normalized
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

module.exports = {
    normalizeCity,
};
