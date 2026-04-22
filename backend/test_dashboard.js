const mongoose = require('mongoose');
const Organization = require('./src/models/Organization');
const Profile = require('./src/models/Profile');
const Invoice = require('./src/models/Invoice');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const months = 12;
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);
        
        console.log("Testing Revenue Analytics Aggregations...");

        const revenueByMonth = await Invoice.aggregate([
            {
                $match: {
                    status: 'paid',
                    paidAt: { $gte: startDate },
                },
            },
            { $lookup: { from: 'organizations', localField: 'organizationId', foreignField: '_id', as: 'org' } },
            { $unwind: '$org' },
            { $match: { 'org.isActive': true } },
            {
                $group: {
                    _id: {
                        year: { $year: '$paidAt' },
                        month: { $month: '$paidAt' },
                    },
                    revenue: { $sum: '$total' },
                    count: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);
        console.log("Passed Monthly");

        const revenueByPlan = await Invoice.aggregate([
            {
                $match: {
                    status: 'paid',
                    paidAt: { $gte: startDate },
                },
            },
            {
                $lookup: {
                    from: 'organizations',
                    localField: 'organizationId',
                    foreignField: '_id',
                    as: 'org',
                },
            },
            { $unwind: '$org' },
            { $match: { 'org.isActive': true } },
            {
                $group: {
                    _id: '$org.subscriptionPlan',
                    revenue: { $sum: '$total' },
                    orgCount: { $addToSet: '$organizationId' },
                },
            },
            {
                $project: {
                    plan: '$_id',
                    revenue: 1,
                    orgCount: { $size: '$orgCount' },
                },
            },
        ]);
        console.log("Passed Plan");

        const outstanding = await Invoice.aggregate([
            {
                $match: {
                    status: { $in: ['pending', 'overdue'] },
                },
            },
            { $lookup: { from: 'organizations', localField: 'organizationId', foreignField: '_id', as: 'org' } },
            { $unwind: '$org' },
            { $match: { 'org.isActive': true } },
            {
                $group: {
                    _id: '$status',
                    total: { $sum: '$total' },
                    count: { $sum: 1 },
                },
            },
        ]);
        console.log("Passed Outstanding");
        
        process.exit(0);
    } catch (e) {
        console.error("DB Error ->", e);
        process.exit(1);
    }
}
run();
