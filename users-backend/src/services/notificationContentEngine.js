/**
 * notificationContentEngine.js
 * 
 * Provides deterministic, empathetic smart templates for the AI Health Companion 
 * without requiring live LLM dynamic generation.
 */

const TEMPLATES = {
    // 🌅 Morning Nudges (08:00 - 10:00)
    morning_nudge: {
        default: [
            "Good morning {{name}}! 🌅 Ready to tackle today? Don't forget your morning routine.",
            "Hey {{name}}, a fresh day is here! Let's start with a big glass of water. 💧"
        ],
        diabetic: [
            "Good morning {{name}}! 🌅 Remember to log your fasting sugar levels before breakfast.",
            "Morning {{name}}! Let's start the day with a healthy, balanced breakfast. 🥗",
            "Hey {{name}}, ready for today? Make sure your morning meds are sorted. 💊"
        ],
        hypertensive: [
            "Good morning {{name}}! 🌅 A calm start makes for a great day. Don't forget your morning meds.",
            "Hey {{name}}! Start the day with a stress-free morning routine. Deep breaths! 🧘‍♂️"
        ]
    },

    // 🍎 Mid-morning (10:00 - 12:00)
    energy_dip: {
        default: [
            "Hey {{name}}... energy dip time 👀 grab a healthy snack?",
            "It's been a few hours since breakfast... how about some fruit? 🍎",
            "Mid-morning stretching time! Stand up for 2 minutes and stretch, {{name}}. 🧘"
        ],
        diabetic: [
            "Hey {{name}}... energy dip time 👀 grab a handful of almonds?",
            "It's been 3 hours since breakfast... how about a sugar-free snack? 🥜",
            "Remember to keep steady energy levels today, {{name}}. Have some nuts? 🌰"
        ]
    },

    // 🍽 Afternoon (12:00 - 14:00)
    lunch_nudge: {
        default: [
            "Let's not delay lunch today 👀 time to eat, {{name}}!",
            "Hey {{name}}, refuel time! Make sure you get a balanced lunch. 🥗",
            "Don't skip lunch, {{name}}! Taking a real break boosts your afternoon energy. ⚡"
        ]
    },

    // 🌤 Evening (16:00 - 19:00)
    weather_walk: {
        default: [
            "Weather's nice outside... how about a quick 10 min walk, {{name}}? 🌤",
            "Hey {{name}}, stretch those legs! A short evening stroll does wonders. 🚶‍♀️",
            "Wrap up your day with a light walk, {{name}}. You've earned a break! 🌇"
        ]
    },

    // 🧘 Night (19:00 - 21:00)
    wind_down: {
        default: [
            "Wind down with 2 minutes of deep breathing, {{name}}? 🧘",
            "It's getting late, {{name}}. Time to start disconnecting from screens. 📵",
            "Prepare for tomorrow to save yourself time in the morning! Sleep well, {{name}}. 🌙"
        ]
    },

    // 🚨 Streaks and Recovery
    streak_milestone: {
        default: [
            "{{name}}, you're on a {{streak}}-day healthy streak 🔥 keep it up!",
            "Amazing consistency, {{name}}! {{streak}} days strong! 💪",
            "You are crushing it, {{name}}. A {{streak}}-day streak is impressive! 🌟"
        ]
    },
    streak_recovery: {
        default: [
            "Missed yesterday... but today is a fresh start, {{name}}. Let's reset! 🔄",
            "Hey {{name}}, setbacks happen. What matters is starting again today. 🌱",
            "Don't worry about yesterday, {{name}}. Focus on the next good decision today! ✨"
        ]
    }
};

/**
 * Randomly pick an item from an array
 */
function pickRandom(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Replace placeholders like {{name}} or {{streak}} in the template
 */
function interpolate(template, variables) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] !== undefined ? variables[key] : match;
    });
}

/**
 * Identify the condition profile of the patient based on risk/history
 */
function getConditionProfile(patient) {
    // If patient model has medical_history or vitals tracking pointing to diabetes:
    const history = (patient.medical_history || []).join(' ').toLowerCase();
    if (history.includes('diabet') || patient.risk_level === 'high_sugar') return 'diabetic';
    if (history.includes('hypertens') || history.includes('blood pressure')) return 'hypertensive';
    return 'default';
}

/**
 * Generate a smart contextual nudge message
 * 
 * @param {string} trigger - e.g. 'morning_nudge', 'energy_dip'
 * @param {object} patient - Patient document
 * @param {object} customVars - Additional variables e.g. { streak: 3 }
 * @returns {string} - The exact personalized text
 */
function generateMessage(trigger, patient, customVars = {}) {
    const triggerData = TEMPLATES[trigger];
    if (!triggerData) return '';

    const condition = getConditionProfile(patient);
    // Fallback to default if the specific condition isn't defined for this trigger
    const options = triggerData[condition] || triggerData.default || [];
    
    if (!options.length) return '';

    const rawTemplate = pickRandom(options);
    
    const variables = {
        name: patient.name ? patient.name.split(' ')[0] : 'there', // First name
        ...customVars
    };

    return interpolate(rawTemplate, variables);
}

module.exports = {
    generateMessage,
    TEMPLATES
};
