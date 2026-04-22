/**
 * validateObjectId.js — SEC-FIX-17
 *
 * Middleware to validate that route params containing MongoDB ObjectIds
 * are well-formed. Prevents NoSQL injection via malformed ID strings.
 */

const mongoose = require('mongoose');

function validateObjectId(...paramNames) {
    return (req, res, next) => {
        for (const param of paramNames) {
            const value = req.params[param];
            if (value && !mongoose.Types.ObjectId.isValid(value)) {
                return res.status(400).json({
                    error: 'Invalid resource identifier',
                    code: 'INVALID_ID',
                });
            }
        }
        next();
    };
}

module.exports = { validateObjectId };
