# CareMyMed Design Contract

This document defines the product philosophy, voice, and emotional targets for CareMyMed. It is the governing standard for every UI decision, piece of copy, AI interaction, and haptic response in the codebase. 

Every future PR must be reviewed against this contract. If a feature is technically perfect but emotionally cold, it fails.

---

## 1. The Core Promise
The app makes one implicit promise to every user: **"We are on your side."**

That promise lives or dies in micro-moments — the tone of a push notification, the copy on an empty state, the color of an error message, the pause before the AI responds. Each of those is either a trust deposit or a trust withdrawal.

## 2. The Voice: The Nurse Benchmark
Every message in the app — especially from the AI assistant — must pass a single test:
> *"Would a calm, experienced nurse with 15 years of experience say this?"*

Not a chatbot. Not a startup. A person who has seen difficult health situations and knows that the most powerful thing they can offer is competent, unhurried presence.

### Voice Rules:
- **Short by default, detailed on request**: The nurse does not deliver data dumps. 2-4 sentences max.
- **Lead with the human, not the data**: Prioritize human well-being before citing raw data.
- **Acknowledge quietly and move forward**: Do not over-celebrate wins.

## 3. The Touch: Haptic Grammar
Haptic intensity maps to **emotional weight**, not feature hierarchy. The app speaks a quiet language through the user's hand.

| Moment / Action | Haptic Pattern | Emotional Meaning |
|-----------------|----------------|-------------------|
| Pill logged | Single soft, light impact | A quiet "noted." Not a celebration, just acknowledgment. |
| Vital recorded | Single soft, light impact | Data received. You are seen. |
| All meds done | Soft double-tap, slight pause | Gentle, complete. Like a nod. |
| Caregiver connected | Soft double-tap | A human moment deserves slightly more presence. |
| Streak milestone (7, 30, 90) | Medium impact, single | Warmer than a log, quieter than a fanfare. |
| Error / Needs attention | Strong, sharp impact | The only time the app interrupts the user physically. |

## 4. The Posture: Copy & State Rules
Empty states and dashboards must communicate presence, not absence.

- **Empty States**: Never cold or transactional. (e.g., *"We're ready to track your vitals whenever you are. Start with whatever feels easiest."*)
- **The Morning/Evening Brief**: The app wakes up and winds down with the user. It evaluates yesterday's adherence quietly and contextually, requiring nothing from the user.
- **The Streak**: Reframed at zero as "Ready" or "Paused", never as a failure. (e.g., *"Today's a new start. Your streak begins with your next log."*)
- **Score & Wellness Framing**: Hides numerical scores and wellness estimates for brand-new users until their profile completion reaches at least **50%**. During this "Building Profile" stage, show actual profile completion percentages. Frame age-based estimations strictly as "Biological Wellness Estimates" rather than absolute clinical facts to preserve app credibility.
- **Null Safety in Care Plans**: If a user has no medications prescribed, report adherence as `null` rather than `0%` to prevent misrepresenting a blank care plan as missed doses. The 35-day Balance Board colors are based on the overall daily health score to represent whole health.

## 5. The Five Anti-Patterns
These are strict prohibitions. If you spot one of these in the codebase, remove it.

1. **Guilt Framing**: Never tell a user "You missed your dose." Instead, focus on the next step: *"Your next dose is at [Time] — want a reminder set?"*
2. **Simulated Urgency**: Never use words like "Act now" or "Don't forget" unless genuinely time-sensitive (like an insulin alert).
3. **Aggressive Gamification**: Do not punish broken streaks. A 0-day streak is a fresh start, not a penalty.
4. **Clinical Alarmism**: Uncertainty is honest, not alarming. Never use words like "WARNING", "Abnormal", or hard red colors for vitals unless medically critical. Use amber, and say: *"This looks a little elevated — worth mentioning to your doctor."*
5. **Transactional Copy**: System notifications, caregiver invites, and emails must never sound robotic. (e.g., Use *"Hi — [Name] has added you as a trusted contact..."* instead of *"User 10294 has invited you."*)

---

*Before committing UI or copy changes, ask: Does this make the user feel more in control of their health, or does it make them feel more engaged with our app? If it's the latter, redesign it.*
