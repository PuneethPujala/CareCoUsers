const mongoose = require('mongoose');

const MedicineLogSchema = new mongoose.Schema(
    {
        patient_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true,
            index: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        medicines: [
            {
                medicine_name: { type: String, required: true },
                scheduled_time: {
                    type: String,
                    enum: ['morning', 'afternoon', 'night'],
                    required: true,
                },
                taken: {
                    type: Boolean,
                    default: false,
                },
                taken_at: Date,
                marked_by: {
                    type: String,
                    enum: ['patient', 'caller', 'system'],
                    default: 'patient',
                },
                is_active: {
                    type: Boolean,
                    default: true,
                },
            },
        ],
    },
    {
        timestamps: { createdAt: 'created_at' },
    }
);

// Compound index for daily lookups
MedicineLogSchema.index({ patient_id: 1, date: -1 });

module.exports = mongoose.model('MedicineLog', MedicineLogSchema);
