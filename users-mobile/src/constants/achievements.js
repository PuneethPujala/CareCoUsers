export const ACHIEVEMENTS = [
    // Bronze Tier
    {
        key: 'first_dose',
        title: 'First Dose',
        tier: 'bronze',
        category: 'doses',
        description: 'Log your very first medication dose',
        iconName: 'Pill',
        target: 1,
    },
    {
        key: 'first_vital',
        title: 'First Vital Logged',
        tier: 'bronze',
        category: 'doses',
        description: 'Log your first vital reading',
        iconName: 'Activity',
        target: 1,
    },
    {
        key: 'first_perfect_day',
        title: 'Perfect Day',
        tier: 'bronze',
        category: 'perfect_days',
        description: 'Complete all scheduled medication doses in a single day',
        iconName: 'Star',
        target: 1,
    },
    
    // Silver Tier
    {
        key: '3_day_consistent',
        title: 'Hat Trick',
        tier: 'silver',
        category: 'streaks',
        description: 'Maintain an 80%+ medication log rate for 3 consecutive days',
        iconName: 'Zap',
        target: 3,
    },
    {
        key: 'never_missed_morning',
        title: 'Early Bird',
        tier: 'silver',
        category: 'routine',
        description: 'Take morning medications on time for 3 days',
        iconName: 'Sunrise',
        target: 3,
    },
    {
        key: 'weekly_90',
        title: 'Weekly Star',
        tier: 'silver',
        category: 'routine',
        description: 'Maintain 90%+ medication adherence for a full week',
        iconName: 'Target',
        target: 90,
        isPercentage: true,
    },
    {
        key: 'streak_7',
        title: '7-Day Streak',
        tier: 'silver',
        category: 'streaks',
        description: 'Log your vitals or medications for 7 consecutive days',
        iconName: 'Flame',
        target: 7,
    },
    {
        key: 'bp_stabilized',
        title: 'BP Stabilized',
        tier: 'silver',
        category: 'routine',
        description: 'Maintain stable blood pressure logs for 14 days',
        iconName: 'HeartPulse',
        target: 14,
    },
    {
        key: 'profile_complete',
        title: 'Profile Complete',
        tier: 'silver',
        category: 'routine',
        description: 'Fill in 100% of your health profile information',
        iconName: 'CheckCircle2',
        target: 100,
        isPercentage: true,
    },

    // Gold Tier
    {
        key: '7_perfect_days',
        title: 'Perfect Week',
        tier: 'gold',
        category: 'perfect_days',
        description: 'Log 7 perfect days of 100% medication adherence',
        iconName: 'Award',
        target: 7,
    },
    {
        key: 'night_owl',
        title: 'Night Owl',
        tier: 'gold',
        category: 'routine',
        description: 'Log all evening and night doses on time for 5 days',
        iconName: 'Moon',
        target: 5,
    },
    {
        key: 'vitals_tracker',
        title: 'Vitals Pro',
        tier: 'gold',
        category: 'doses',
        description: 'Log your health vitals on 10 or more days',
        iconName: 'HeartPulse',
        target: 10,
    },
    {
        key: 'streak_14',
        title: 'Two-Week Warrior',
        tier: 'gold',
        category: 'streaks',
        description: 'Maintain an 80%+ logging rate for 14 consecutive days',
        iconName: 'Flame',
        target: 14,
    },
    {
        key: 'monthly_consistent',
        title: 'Monthly Legend',
        tier: 'gold',
        category: 'streaks',
        description: 'Maintain 80%+ consistency for a full month',
        iconName: 'Trophy',
        target: 80,
        isPercentage: true,
    },
    {
        key: 'adherence_30d_90',
        title: 'Compliance Champ',
        tier: 'gold',
        category: 'routine',
        description: 'Maintain 90%+ medication adherence over 30 days',
        iconName: 'ShieldCheck',
        target: 90,
        isPercentage: true,
    },
    {
        key: 'score_plus_20',
        title: 'Major Improvement',
        tier: 'gold',
        category: 'routine',
        description: 'Improve your overall health score by 20+ points',
        iconName: 'TrendingUp',
        target: 20,
    },
    {
        key: '100_doses',
        title: 'Century Club',
        tier: 'gold',
        category: 'doses',
        description: 'Successfully log a total of 100 medication doses',
        iconName: 'Medal',
        target: 100,
    },

    // Legendary Tier
    {
        key: 'streak_30',
        title: '30-Day Streak',
        tier: 'legendary',
        category: 'streaks',
        description: 'Log your medications or vitals for 30 consecutive days',
        iconName: 'Crown',
        target: 30,
    },
    {
        key: '30_perfect_days',
        title: 'Unstoppable',
        tier: 'legendary',
        category: 'perfect_days',
        description: 'Record 30 days of perfect 100% medication adherence',
        iconName: 'Crown',
        target: 30,
    }
];

export const TIER_CONFIG = {
    bronze: {
        color: '#CD7F32',
        gradient: ['#F59E0B', '#CD7F32'], // vibrant amber-bronze
        label: 'Bronze',
        bgColor: '#FFFBEB',
    },
    silver: {
        color: '#C0C0C0',
        gradient: ['#CBD5E1', '#94A3B8'], // sleek silver-slate
        label: 'Silver',
        bgColor: '#F1F5F9',
    },
    gold: {
        color: '#FFD700',
        gradient: ['#FBBF24', '#D97706'], // premium warm gold
        label: 'Gold',
        bgColor: '#FEF3C7',
    },
    legendary: {
        color: '#8B5CF6',
        gradient: ['#6D28D9', '#9333EA'], // deep magical purple
        label: 'Legendary',
        bgColor: '#F5F3FF',
    }
};

export const CATEGORY_CONFIG = {
    perfect_days: {
        title: 'Perfect Days Progression',
        description: 'Complete all scheduled medication doses',
        emoji: '🌟',
    },
    streaks: {
        title: 'Consistency & Streaks',
        description: 'Maintain logs over consecutive days',
        emoji: '🔥',
    },
    doses: {
        title: 'Logging Volume',
        description: 'Total medication and vitals entries logged',
        emoji: '💊',
    },
    routine: {
        title: 'Routine & Adherence',
        description: 'Time-of-day accuracy and compliance rates',
        emoji: '⏰',
    },
};
