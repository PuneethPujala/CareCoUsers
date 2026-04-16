const mongoose = require('mongoose');

const LineItemSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
    },
    type: {
        type: String,
        enum: ['subscription', 'per_patient', 'per_caretaker', 'overage', 'setup', 'addon', 'discount', 'credit', 'other'],
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
    },
    unitPrice: {
        type: Number,
        required: true,
        description: 'Price in cents (to avoid floating point issues)',
    },
    total: {
        type: Number,
        required: true,
        description: 'Pre-calculated total in cents',
    },
}, { _id: true });

const InvoiceSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
            index: true,
        },

        // ── Invoice identification ───────────────────────────────────
        invoiceNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            description: 'Auto-generated unique invoice number (e.g., INV-2024-00001)',
        },

        // ── Billing period ───────────────────────────────────────────
        billingPeriod: {
            startDate: { type: Date, required: true },
            endDate: { type: Date, required: true },
        },

        // ── Line items ───────────────────────────────────────────────
        lineItems: [LineItemSchema],

        // ── Totals (all in cents) ────────────────────────────────────
        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },
        taxRate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        taxAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        discount: {
            type: Number,
            default: 0,
            min: 0,
        },
        discountDescription: {
            type: String,
            trim: true,
            maxlength: 200,
        },
        total: {
            type: Number,
            required: true,
            min: 0,
            description: 'Final total in cents',
        },
        currency: {
            type: String,
            default: 'USD',
            uppercase: true,
            maxlength: 3,
        },

        // ── Status ───────────────────────────────────────────────────
        status: {
            type: String,
            enum: ['draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded', 'partially_paid'],
            default: 'draft',
            index: true,
        },

        // ── Payment info ─────────────────────────────────────────────
        dueDate: {
            type: Date,
            required: true,
            index: true,
        },
        paidAt: {
            type: Date,
        },
        paidAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        paymentMethod: {
            type: String,
            enum: ['card', 'bank_transfer', 'check', 'wire', 'other'],
        },

        // ── Stripe integration ───────────────────────────────────────
        stripeInvoiceId: {
            type: String,
            trim: true,
        },
        stripePaymentIntentId: {
            type: String,
            trim: true,
        },

        // ── Notes & metadata ─────────────────────────────────────────
        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
        },
        internalNotes: {
            type: String,
            trim: true,
            maxlength: 2000,
        },

        // ── Audit ────────────────────────────────────────────────────
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Profile',
        },
        approvedAt: {
            type: Date,
        },

        // ── Reminders ────────────────────────────────────────────────
        remindersSent: {
            type: Number,
            default: 0,
        },
        lastReminderAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ── Indexes ────────────────────────────────────────────────────
InvoiceSchema.index({ organizationId: 1, status: 1 });
InvoiceSchema.index({ dueDate: 1, status: 1 });
InvoiceSchema.index({ 'billingPeriod.startDate': 1, 'billingPeriod.endDate': 1 });
InvoiceSchema.index({ stripeInvoiceId: 1 });

// ── Virtuals ───────────────────────────────────────────────────
InvoiceSchema.virtual('isOverdue').get(function () {
    return this.status !== 'paid' && this.status !== 'cancelled' && this.dueDate < new Date();
});

InvoiceSchema.virtual('balanceDue').get(function () {
    return Math.max(0, this.total - this.paidAmount);
});

InvoiceSchema.virtual('totalFormatted').get(function () {
    return `$${(this.total / 100).toFixed(2)}`;
});

// ── Pre-save ───────────────────────────────────────────────────
InvoiceSchema.pre('save', function (next) {
    // Recalculate totals from line items
    if (this.isModified('lineItems') || this.isNew) {
        this.subtotal = this.lineItems.reduce((sum, item) => sum + item.total, 0);
        this.taxAmount = Math.round(this.subtotal * (this.taxRate / 100));
        this.total = this.subtotal + this.taxAmount - this.discount;
    }

    // Auto-mark as overdue
    if (this.status === 'pending' && this.dueDate < new Date()) {
        this.status = 'overdue';
    }

    next();
});

// ── Pre-save: Auto-generate invoice number ─────────────────────
InvoiceSchema.pre('save', async function (next) {
    if (this.isNew && !this.invoiceNumber) {
        const year = new Date().getFullYear();
        const count = await mongoose.model('Invoice').countDocuments({
            invoiceNumber: { $regex: `^INV-${year}-` },
        });
        this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

// ── Statics ────────────────────────────────────────────────────
InvoiceSchema.statics.findByOrganization = function (organizationId, filter = {}) {
    return this.find({ organizationId, ...filter })
        .sort({ createdAt: -1 });
};

InvoiceSchema.statics.findOverdue = function () {
    return this.find({
        status: { $in: ['pending', 'overdue'] },
        dueDate: { $lt: new Date() },
    })
        .populate('organizationId', 'name email')
        .sort({ dueDate: 1 });
};

InvoiceSchema.statics.getRevenueStats = async function (daysBack = 365) {
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    return this.aggregate([
        {
            $match: {
                status: 'paid',
                paidAt: { $gte: startDate },
            },
        },
        {
            $group: {
                _id: {
                    year: { $year: '$paidAt' },
                    month: { $month: '$paidAt' },
                },
                totalRevenue: { $sum: '$total' },
                invoiceCount: { $sum: 1 },
            },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
};

// ── Instance methods ───────────────────────────────────────────
InvoiceSchema.methods.markAsPaid = function (paymentMethod, stripePaymentIntentId = null) {
    this.status = 'paid';
    this.paidAt = new Date();
    this.paidAmount = this.total;
    this.paymentMethod = paymentMethod;
    if (stripePaymentIntentId) this.stripePaymentIntentId = stripePaymentIntentId;
    return this.save();
};

InvoiceSchema.methods.cancel = function (reason = '') {
    this.status = 'cancelled';
    if (reason) this.internalNotes = `Cancelled: ${reason}`;
    return this.save();
};

InvoiceSchema.methods.refund = function () {
    this.status = 'refunded';
    this.paidAmount = 0;
    return this.save();
};

module.exports = mongoose.model('Invoice', InvoiceSchema);
