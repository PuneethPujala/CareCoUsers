const Patient = require('../models/Patient');
const moment = require('moment-timezone'); // Using moment-timezone for safe local-day boundaries

/**
 * Validates and updates a patient's Care Streak safely.
 * @param {string} patientId - The MongoDB ObjectId of the patient
 * @returns {Promise<Object>} Updated gamification object
 */
exports.evaluateAndUpdateStreak = async (patientId) => {
    try {
        const patient = await Patient.findById(patientId);
        if (!patient) return null;

        // Initialize gamification object if it doesn't exist
        if (!patient.gamification) {
            patient.gamification = { current_streak: 0, longest_streak: 0, available_freezes: 2 };
        }

        const timezone = patient.timezone || 'Asia/Kolkata';
        const now = moment().tz(timezone);
        const today = now.startOf('day');

        let lastUpdateDate = null;
        if (patient.gamification.last_streak_update) {
            lastUpdateDate = moment(patient.gamification.last_streak_update).tz(timezone).startOf('day');
        }

        let streakChanged = false;

        // Condition A: First time action ever
        if (!lastUpdateDate) {
            patient.gamification.current_streak = 1;
            patient.gamification.longest_streak = 1;
            patient.gamification.last_streak_update = new Date();
            streakChanged = true;
        } 
        else {
            const daysDiff = today.diff(lastUpdateDate, 'days');

            // Condition B: Action already happened today (No impact)
            if (daysDiff === 0) {
                return patient.gamification; 
            }
            
            // Condition C: Action happened yesterday -> Clean Increment
            else if (daysDiff === 1) {
                patient.gamification.current_streak += 1;
                patient.gamification.last_streak_update = new Date();
                
                if (patient.gamification.current_streak > patient.gamification.longest_streak) {
                    patient.gamification.longest_streak = patient.gamification.current_streak;
                }
                streakChanged = true;
            }
            
            // Condition D: Action happened >= 2 days ago (Streak Missed)
            else if (daysDiff >= 2) {
                // Determine how many days were missed
                const daysMissed = daysDiff - 1;
                
                // Can we save the streak with freezes?
                if (patient.gamification.available_freezes >= daysMissed) {
                    // Consume freezes and increment streak!
                    patient.gamification.available_freezes -= daysMissed;
                    patient.gamification.current_streak += 1; // It incremented for today
                    patient.gamification.last_streak_update = new Date();
                    
                    if (patient.gamification.current_streak > patient.gamification.longest_streak) {
                        patient.gamification.longest_streak = patient.gamification.current_streak;
                    }
                } else {
                    // Streak Broken
                    patient.gamification.current_streak = 1; // Start over at 1 today
                    patient.gamification.last_streak_update = new Date();
                }
                streakChanged = true;
            }
        }

        // Only fire the save transaction if the mathematical state actually changed
        if (streakChanged) {
            await patient.save();
        }

        return patient.gamification;

    } catch (error) {
        console.error('Streak Service Error:', error);
        return null; // Fail silently so we don't break core app interactions
    }
};
