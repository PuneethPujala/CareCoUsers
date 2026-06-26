/**
 * Escapes special regex characters in a string to prevent ReDoS attacks.
 * Use this before injecting user input into MongoDB $regex queries.
 *
 * @param {string} str - The raw user input string
 * @returns {string} Escaped string safe for use in $regex
 */
function escapeRegex(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
