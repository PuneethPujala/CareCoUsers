const mongoose = require('mongoose');

const CitySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        state: {
            type: String,
            required: true,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Prevent duplicate city+state combos
CitySchema.index({ name: 1, state: 1 }, { unique: true });
CitySchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model('City', CitySchema);
