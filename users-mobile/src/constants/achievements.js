export const ACHIEVEMENTS = [
    // Bronze Tier
    {
        key: 'first_dose',
        title: 'First Dose Explorer',
        tier: 'bronze',
        category: 'doses',
        description: 'Log your very first medication dose',
        iconName: 'Pill',
        target: 1,
    },
    {
        key: 'first_vital',
        title: 'Vitals Explorer',
        tier: 'bronze',
        category: 'doses',
        description: 'Log your first vital reading',
        iconName: 'Activity',
        target: 1,
    },
    {
        key: 'first_perfect_day',
        title: 'Adherence Explorer',
        tier: 'bronze',
        category: 'perfect_days',
        description: 'Complete all scheduled medication doses in a single day',
        iconName: 'Star',
        target: 1,
    },
    {
        key: 'mood_check_in',
        title: 'Mindful Start',
        tier: 'bronze',
        category: 'wellbeing',
        description: 'Log your mood for the very first time',
        iconName: 'Smile',
        target: 1,
    },
    
    // Silver Tier
    {
        key: '3_day_consistent',
        title: 'Consistency Hero',
        tier: 'silver',
        category: 'streaks',
        description: 'Maintain an 80%+ medication log rate for 3 consecutive days',
        iconName: 'Zap',
        target: 3,
    },
    {
        key: 'never_missed_morning',
        title: 'Morning Guardian',
        tier: 'silver',
        category: 'routine',
        description: 'Take morning medications on time for 3 days',
        iconName: 'Sunrise',
        target: 3,
    },
    {
        key: 'weekly_90',
        title: 'Weekly Adherence Champion',
        tier: 'silver',
        category: 'routine',
        description: 'Maintain 90%+ medication adherence for a full week',
        iconName: 'Target',
        target: 90,
        isPercentage: true,
    },
    {
        key: 'streak_7',
        title: 'Consistency Champion',
        tier: 'silver',
        category: 'streaks',
        description: 'Log your vitals or medications for 7 consecutive days',
        iconName: 'Flame',
        target: 7,
    },
    {
        key: 'bp_stabilized',
        title: 'Vitals Guardian',
        tier: 'silver',
        category: 'routine',
        description: 'Maintain stable blood pressure logs for 14 days',
        iconName: 'HeartPulse',
        target: 14,
    },
    {
        key: 'profile_complete',
        title: 'Health Profile Champion',
        tier: 'silver',
        category: 'routine',
        description: 'Fill in 100% of your health profile information',
        iconName: 'CheckCircle2',
        target: 100,
        isPercentage: true,
    },
    {
        key: 'hydration_hero',
        title: 'Hydration Champion',
        tier: 'silver',
        category: 'wellbeing',
        description: 'Log your hydration levels on 5 different days',
        iconName: 'Droplet',
        target: 5,
    },
    {
        key: 'mindful_week',
        title: 'Mindful Champion',
        tier: 'silver',
        category: 'wellbeing',
        description: 'Log your mood for 7 days',
        iconName: 'Brain',
        target: 7,
    },
 
    // Gold Tier
    {
        key: '7_perfect_days',
        title: 'Perfect Week Champion',
        tier: 'gold',
        category: 'perfect_days',
        description: 'Log 7 perfect days of 100% medication adherence',
        iconName: 'Award',
        target: 7,
    },
    {
        key: 'night_owl',
        title: 'Night Guardian',
        tier: 'gold',
        category: 'routine',
        description: 'Log all evening and night doses on time for 5 days',
        iconName: 'Moon',
        target: 5,
    },
    {
        key: 'vitals_tracker',
        title: 'Vitals Champion',
        tier: 'gold',
        category: 'doses',
        description: 'Log your health vitals on 10 or more days',
        iconName: 'HeartPulse',
        target: 10,
    },
    {
        key: 'streak_14',
        title: 'Two-Week Consistency Hero',
        tier: 'gold',
        category: 'streaks',
        description: 'Maintain an 80%+ logging rate for 14 consecutive days',
        iconName: 'Flame',
        target: 14,
    },
    {
        key: 'monthly_consistent',
        title: 'Consistency Legend',
        tier: 'gold',
        category: 'streaks',
        description: 'Maintain 80%+ consistency for a full month',
        iconName: 'Trophy',
        target: 80,
        isPercentage: true,
    },
    {
        key: 'adherence_30d_90',
        title: 'Medication Guardian',
        tier: 'gold',
        category: 'routine',
        description: 'Maintain 90%+ medication adherence over 30 days',
        iconName: 'ShieldCheck',
        target: 90,
        isPercentage: true,
    },
    {
        key: 'score_plus_20',
        title: 'Recovery Champion',
        tier: 'gold',
        category: 'routine',
        description: 'Improve your overall health score by 20+ points',
        iconName: 'TrendingUp',
        target: 20,
    },
    {
        key: '100_doses',
        title: 'Century Champion',
        tier: 'gold',
        category: 'doses',
        description: 'Successfully log a total of 100 medication doses',
        iconName: 'Medal',
        target: 100,
    },
    {
        key: 'positivity_streak',
        title: 'Positivity Hero',
        tier: 'gold',
        category: 'wellbeing',
        description: "Report a 'good' or 'great' mood for 3 consecutive days",
        iconName: 'Sparkles',
        target: 3,
    },
    {
        key: 'comprehensive_care',
        title: 'Comprehensive Care Hero',
        tier: 'gold',
        category: 'wellbeing',
        description: 'Log heart rate, blood pressure, and oxygen saturation on the same day',
        iconName: 'Stethoscope',
        target: 1,
    },
 
    // Legendary Tier
    {
        key: 'streak_30',
        title: 'Consistency Master',
        tier: 'legendary',
        category: 'streaks',
        description: 'Log your medications or vitals for 30 consecutive days',
        iconName: 'Crown',
        target: 30,
    },
    {
        key: '30_perfect_days',
        title: 'Adherence Master',
        tier: 'legendary',
        category: 'perfect_days',
        description: 'Record 30 days of perfect 100% medication adherence',
        iconName: 'Crown',
        target: 30,
    }
];
 
export const TIER_CONFIG = {
    bronze: {
        color: '#B25E29',
        gradient: ['#B25E29', '#E08A4E', '#8C4315'], // rich metallic copper-bronze
        label: 'Bronze',
        bgColor: '#FFF7ED',
    },
    silver: {
        color: '#64748B',
        gradient: ['#7E8B9B', '#E2E8F0', '#5E6B7C'], // sleek polished chrome-silver
        label: 'Silver',
        bgColor: '#F8FAFC',
    },
    gold: {
        color: '#D97706',
        gradient: ['#D97706', '#FBBF24', '#F59E0B', '#B45309'], // premium warm multi-stop gold
        label: 'Gold',
        bgColor: '#FEF3C7',
    },
    legendary: {
        color: '#7C3AED',
        gradient: ['#4F46E5', '#7C3AED', '#A855F7'], // toned down cosmic purple (not too gamey)
        label: 'Legendary',
        bgColor: '#F5F3FF',
    }
};
 
export const CATEGORY_CONFIG = {
    perfect_days: {
        title: 'Perfect Days Progression',
        description: 'Complete all scheduled medication doses',
        iconName: 'Star',
        accent: ['#3B82F6', '#60A5FA'], // Blue
        layout: 'timeline',
    },
    streaks: {
        title: 'Consistency & Streaks',
        description: 'Maintain logs over consecutive days',
        iconName: 'Flame',
        accent: ['#059669', '#34D399'], // Emerald
        layout: 'grid',
    },
    doses: {
        title: 'Logging Volume',
        description: 'Total medication and vitals entries logged',
        iconName: 'Pill',
        accent: ['#0891B2', '#22D3EE'], // Cyan
        layout: 'grid',
    },
    routine: {
        title: 'Routine & Adherence',
        description: 'Time-of-day accuracy and compliance rates',
        iconName: 'Clock',
        accent: ['#4F46E5', '#818CF8'], // Indigo
        layout: 'grid',
    },
    wellbeing: {
        title: 'Holistic Wellbeing',
        description: 'Mood, hydration, and overall health tracking',
        iconName: 'Activity',
        accent: ['#7C3AED', '#A78BFA'], // Purple/Violet
        layout: 'grid',
    },
};
