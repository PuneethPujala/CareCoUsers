/**
 * healthScoreService.js
 *
 * Computes a clinically-grounded health score (0–100) for a patient.
 * Inputs are derived from existing Patient document fields — no external calls needed.
 *
 * Architecture: called live from GET /me/profile; result also written to
 * patient.healthScoreCache + patient.healthScoreUpdatedAt for admin queries.
 *
 * Dimensions (total 100 pts):
 *   [30] Medication Adherence   — most predictive of outcomes
 *   [20] Lifestyle Habits        — smoking / alcohol / exercise, age-adjusted
 *   [15] Condition Burden        — active conditions / severity
 *   [15] Vital Signs Stability   — recent BP, HR, SpO2, BMI
 *   [10] Preventive Care         — GP, vaccinations, appointments, contacts
 *   [10] Functional Mobility     — heavily age-adjusted
 *
 * Age Brackets:
 *   young_adult  18–39  full mobility expected, higher exercise bar
 *   middle_aged  40–59  moderate exercise expected, BMI weighted
 *   senior       60–74  light activity sufficient, mobility aids neutral
 *   elderly      75+    any movement positive, adherence is king
 *
 * Score floors (minimum score regardless of inputs):
 *   young_adult  0
 *   middle_aged  0
 *   senior       20
 *   elderly      35   ← prevents demoralising frail patients
 */

"use strict";

/* ─── Age Helpers ──────────────────────────────────────────────────────────── */

/**
 * Derive age in years from a Date object (or null).
 * Uses the same formula as the Mongoose virtual on Patient model.
 */
function deriveAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const diff = Date.now() - new Date(dateOfBirth).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

/**
 * Return age bracket string from numeric age.
 * Falls back to 'middle_aged' if age is unknown — neither penalises nor rewards.
 */
function ageBracket(age) {
  if (age === null || age === undefined) return "middle_aged";
  if (age < 40) return "young_adult";
  if (age < 60) return "middle_aged";
  if (age < 75) return "senior";
  return "elderly";
}

const SCORE_FLOOR = {
  young_adult: 0,
  middle_aged: 0,
  senior: 20,
  elderly: 35,
};

/* ─── Dimension Scorers ────────────────────────────────────────────────────── */

/**
 * [30 pts] Medication Adherence
 * adherenceRate: 0–100 (percentage). May be null if no medications logged.
 * Elderly patients get a slight bonus floor: even 0% adherence → 8pts (they
 * may have complex regimens that are hard to track).
 */
function scoreAdherence(adherenceRate, bracket, patient) {
  const hasMeds =
    patient &&
    patient.medications &&
    patient.medications.some((m) => m.is_active !== false);

  if (!hasMeds) {
    // No medications prescribed: full credit (perfect compliance with empty care plan)
    return { pts: 30, bonus: 0, note: "no_meds_prescribed" };
  }

  if (adherenceRate === null || adherenceRate === undefined) {
    // Has meds but no logs: treat as 0% adherence (missed) since they didn't log prescribed meds
    return { pts: 3, bonus: 0, note: "no_logs" };
  }

  let pts;
  if (adherenceRate >= 95) pts = 30;
  else if (adherenceRate >= 85) pts = 25;
  else if (adherenceRate >= 70) pts = 18;
  else if (adherenceRate >= 50) pts = 10;
  else if (adherenceRate >= 30) pts = 6;
  else pts = 3;

  // Elderly floor: minimum 8pts so frail patients aren't devastated
  if (bracket === "elderly") pts = Math.max(pts, 8);

  const bonus = adherenceRate >= 90 ? 5 : 0;
  return { pts, bonus, note: `${Math.round(adherenceRate)}%` };
}

/**
 * [20 pts] Lifestyle Habits
 * Smoking, alcohol, and exercise — each age-adjusted.
 */
function scoreLifestyle(lifestyle, bracket) {
  if (!lifestyle) return { pts: 10, note: "no_data" }; // neutral

  let pts = 0;

  // Smoking (max 8)
  const smoking = lifestyle.smoking_status;
  if (smoking === "never") pts += 8;
  else if (smoking === "former") pts += 5;
  else if (smoking === "current") pts += 0;
  // else undefined → skip (no penalty for missing)

  // Alcohol (max 6)
  const alcohol = lifestyle.alcohol_use;
  if (alcohol === "none") pts += 6;
  else if (alcohol === "occasional") pts += 3;
  else if (alcohol === "heavy") pts += 0;

  // Exercise (max 6) — age-adjusted expectations
  const ex = lifestyle.exercise_frequency;
  const exerciseScore = (() => {
    if (!ex) return 0;
    if (bracket === "elderly") {
      // Any movement at all is commendable
      if (ex === "none") return 2;
      return 6; // light/moderate/active all equal → positively reinforcing
    }
    if (bracket === "senior") {
      if (ex === "none") return 1; // small credit — low bar
      if (ex === "light") return 6;
      return 6; // moderate/active also max
    }
    if (bracket === "middle_aged") {
      if (ex === "none") return 0;
      if (ex === "light") return 3;
      if (ex === "moderate") return 6;
      return 6; // active = same as moderate
    }
    // young_adult — higher bar
    if (ex === "none") return 0;
    if (ex === "light") return 2;
    if (ex === "moderate") return 4;
    return 6; // active
  })();
  pts += exerciseScore;

  return {
    pts: Math.min(20, pts),
    note: `${smoking || "?"}/${alcohol || "?"}/${ex || "?"}`,
  };
}

/**
 * [15 pts] Condition Burden
 * Active conditions penalise; managed/resolved do not.
 * Severe allergies add a small deduction.
 */
function scoreConditions(conditions, allergies) {
  let pts = 15;

  const activeConditions = (conditions || []).filter(
    (c) => c.status === "active",
  );
  const deduction = Math.min(activeConditions.length * 2, 10); // cap at -10
  pts -= deduction;

  const severeAllergies = (allergies || []).filter(
    (a) => a.severity === "severe",
  );
  pts -= Math.min(severeAllergies.length * 1, 3); // cap at -3

  return {
    pts: Math.max(0, pts),
    note: `${activeConditions.length} active conditions`,
  };
}

/**
 * [15 pts] Vital Signs Stability
 * Uses latest vitals (passed in). If no vitals: neutral 7pts.
 * BMI weight reduced for elderly bracket.
 */
function scoreVitals(latestVitals, lifestyle, bracket, patient) {
  const hasActiveConditions =
    patient &&
    patient.conditions &&
    patient.conditions.some((c) => c.status === "active");

  if (!latestVitals) {
    if (hasActiveConditions) {
      // Has active conditions but no vitals logged: penalise missing critical data
      return { pts: 2, note: "missing_critical_vitals" };
    }
    // Healthy user: full credit / neutral for vitals
    return { pts: 15, note: "no_conditions_no_vitals" };
  }

  let pts = 0;

  // Heart rate (3 pts) — age-adjusted normal range
  const hr = latestVitals.heart_rate;
  if (hr) {
    const hrOk =
      bracket === "elderly" ? hr >= 50 && hr <= 100 : hr >= 55 && hr <= 95;
    if (hrOk) pts += 3;
    else if (hr > 40 && hr < 130) pts += 1; // in range but not ideal
  }

  // Blood pressure (4 pts)
  const sys = latestVitals.blood_pressure?.systolic ?? latestVitals.systolic;
  const dia = latestVitals.blood_pressure?.diastolic ?? latestVitals.diastolic;
  if (sys && dia) {
    const bpNormal =
      bracket === "elderly"
        ? sys >= 110 && sys <= 150 && dia >= 60 && dia <= 90 // wider range for elderly
        : sys >= 90 && sys <= 130 && dia >= 60 && dia <= 85;
    if (bpNormal) pts += 4;
    else if (sys < 180 && dia < 110) pts += 1;
  }

  // SpO2 (4 pts)
  const spo2 = latestVitals.oxygen_saturation;
  if (spo2) {
    if (spo2 >= 95) pts += 4;
    else if (spo2 >= 90) pts += 2;
    else if (spo2 >= 85) pts += 1;
  }

  // BMI (4 pts — weight reduced for elderly since malnutrition risk > obesity)
  const h = lifestyle?.height_cm;
  const w = lifestyle?.weight_kg;
  if (h && w && h > 0) {
    const bmi = w / Math.pow(h / 100, 2);
    const bmiPts = (() => {
      if (bmi >= 18.5 && bmi < 25) return 4;
      if (bmi >= 25 && bmi < 30) return 2;
      if ((bmi >= 17 && bmi < 18.5) || (bmi >= 30 && bmi < 35)) return 1;
      return 0;
    })();
    // Elderly: BMI score halved — being slightly overweight may be protective
    pts += bracket === "elderly" ? Math.ceil(bmiPts / 2) : bmiPts;
  }

  return { pts: Math.min(15, pts), note: `hr=${hr ?? "?"} sys=${sys ?? "?"}` };
}

/**
 * [10 pts] Preventive Care
 * GP, vaccinations, upcoming appointments, emergency contact.
 */
function scorePreventiveCare(patient) {
  let pts = 0;
  if (patient.gp_name) pts += 3;
  if ((patient.vaccinations || []).length > 0) pts += 3;
  const upcomingAppt = (patient.appointments || []).find(
    (a) => a.status === "upcoming",
  );
  if (upcomingAppt) pts += 2;
  const hasEmergencyContact = (patient.trusted_contacts || []).some(
    (c) => c.is_emergency,
  );
  if (hasEmergencyContact) pts += 2;
  return { pts, note: `gp=${!!patient.gp_name}` };
}

/**
 * [10 pts] Functional Mobility — heavily age-adjusted.
 * A 78-year-old in a wheelchair is NOT failing.
 */
function scoreMobility(lifestyle, bracket) {
  const mobility = lifestyle?.mobility_level || "full";

  const table = {
    young_adult: { full: 10, limited: 5, wheelchair: 2, bedridden: 0 },
    middle_aged: { full: 10, limited: 6, wheelchair: 3, bedridden: 1 },
    senior: { full: 10, limited: 8, wheelchair: 6, bedridden: 3 },
    elderly: { full: 10, limited: 9, wheelchair: 8, bedridden: 6 },
  };

  const pts = (table[bracket] || table.middle_aged)[mobility] ?? 10;
  return { pts, note: mobility };
}

/* ─── Grade & Label ────────────────────────────────────────────────────────── */

function gradeFromScore(score) {
  if (score >= 85) return { grade: "A", label: "Excellent", color: "#10B981" };
  if (score >= 70)
    return { grade: "B", label: "Managing Well", color: "#3B82F6" };
  if (score >= 55) return { grade: "C", label: "Doing OK", color: "#F59E0B" };
  if (score >= 40)
    return { grade: "D", label: "Needs Attention", color: "#F97316" };
  return { grade: "E", label: "Care Required", color: "#EF4444" };
}

/* ─── Tip Generator ─────────────────────────────────────────────────────────
 * Produces ranked, age-aware, actionable improvement tips.
 * Tips are only surfaced when the dimension is actually weak (< 70% of max).
 * Max 6 tips returned, ranked by potential impact.
 */

function generateTips(
  patient,
  breakdown,
  bracket,
  adherenceRate,
  latestVitals,
) {
  const lifestyle = patient.lifestyle || {};
  const tips = [];

  /* helpers */
  const pct = (dim) =>
    breakdown[dim]
      ? Math.round((breakdown[dim].pts / breakdown[dim].max) * 100)
      : 100;
  const weak = (dim, threshold = 70) => pct(dim) < threshold;
  const push = (tip) => tips.push(tip);

  /* ── Adherence tips ──────────────────────────────────────────────────── */
  if (weak("adherence", 85) && adherenceRate !== null) {
    if (adherenceRate < 50) {
      push({
        category: "adherence",
        priority: 1,
        impact: "high",
        icon: "⏰",
        title: "Set a daily medication alarm",
        body: "Missing more than half your doses significantly increases health risks. Set a phone alarm for each medication — it only takes 30 seconds to set up.",
      });
      push({
        category: "adherence",
        priority: 1,
        impact: "high",
        icon: "📦",
        title: "Use a weekly pill organiser",
        body: "A pill organiser lets you see at a glance whether you've taken your morning or evening dose — no more guessing.",
      });
    } else if (adherenceRate < 80) {
      push({
        category: "adherence",
        priority: 1,
        impact: "high",
        icon: "🍽️",
        title: "Link meds to a meal",
        body: "Take your medications right as you sit down for breakfast or dinner. Pairing a habit with an existing routine makes it stick.",
      });
    } else {
      push({
        category: "adherence",
        priority: 2,
        impact: "medium",
        icon: "✅",
        title: "Almost there — keep the streak going",
        body: "You're taking most of your medications. A short reminder note on your fridge or phone lock screen can help you hit 100%.",
      });
    }
  }

  /* ── Lifestyle — smoking ─────────────────────────────────────────────── */
  if (lifestyle.smoking_status === "current") {
    push({
      category: "lifestyle",
      priority: 1,
      impact: "high",
      icon: "🚭",
      title: "Cut down gradually",
      body: "Even reducing by 2–3 cigarettes a day improves circulation within weeks. Try delaying your first cigarette by 30 minutes each morning.",
    });
  }

  /* ── Lifestyle — alcohol ─────────────────────────────────────────────── */
  if (lifestyle.alcohol_use === "heavy") {
    push({
      category: "lifestyle",
      priority: 1,
      impact: "high",
      icon: "🍵",
      title: "Replace the evening drink",
      body: "Swap your evening alcohol for warm chamomile tea or a nimbu paani. Within a week, many people sleep better and feel less bloated.",
    });
  } else if (lifestyle.alcohol_use === "occasional" && weak("lifestyle", 75)) {
    push({
      category: "lifestyle",
      priority: 3,
      impact: "low",
      icon: "💧",
      title: "Choose water-first evenings",
      body: "On weeknights, try starting with a full glass of water before any drink. You'll naturally drink less without feeling deprived.",
    });
  }

  /* ── Lifestyle — exercise (age-aware) ───────────────────────────────── */
  if (
    lifestyle.exercise_frequency === "none" ||
    lifestyle.exercise_frequency === "light"
  ) {
    if (bracket === "elderly") {
      push({
        category: "lifestyle",
        priority: 2,
        impact: "medium",
        icon: "🧘",
        title: "Gentle morning stretches",
        body: "5 minutes of gentle chair stretches every morning improves circulation, reduces stiffness, and helps start the day calmly. You can do them without even standing up.",
      });
    } else if (bracket === "senior") {
      push({
        category: "lifestyle",
        priority: 2,
        impact: "medium",
        icon: "🌅",
        title: "A 15-minute morning walk",
        body: "Walking in the morning before 9 AM (when it's cooler) boosts vitamin D, improves mood, and gently keeps your heart strong. Even around your building works.",
      });
    } else {
      push({
        category: "lifestyle",
        priority: 2,
        impact: "high",
        icon: "🏃",
        title: "Start with 20 minutes a day",
        body: "You don't need a gym. A brisk 20-minute walk — especially in the morning — reduces blood pressure, lifts mood, and adds years to your life.",
      });
      push({
        category: "lifestyle",
        priority: 3,
        impact: "medium",
        icon: "🚶",
        title: "Take the stairs, skip the lift",
        body: "Tiny bursts of activity throughout the day add up. Taking stairs just twice a day burns around 200 extra calories a week.",
      });
    }
  }

  /* ── Vitals — BMI ───────────────────────────────────────────────────── */
  const h = lifestyle.height_cm;
  const w = lifestyle.weight_kg;
  if (h && w && h > 0) {
    const bmi = w / Math.pow(h / 100, 2);
    if (bmi >= 28 && bracket !== "elderly") {
      push({
        category: "vitals",
        priority: 2,
        impact: "medium",
        icon: "🥗",
        title: "Eat less after 7 PM",
        body: "Late-night eating is stored as fat more readily. Try finishing your last full meal by 7:30 PM and switch to fruit or warm milk if hungry after.",
      });
      push({
        category: "vitals",
        priority: 2,
        impact: "medium",
        icon: "🍚",
        title: "Halve your rice portions",
        body: "Replacing half your rice with more dal, sabzi, or salad keeps you full longer and cuts around 150 calories per meal effortlessly.",
      });
    } else if (bmi < 18.5) {
      push({
        category: "vitals",
        priority: 2,
        impact: "medium",
        icon: "🥜",
        title: "Add healthy calorie-dense snacks",
        body: "Peanut butter, nuts, banana with milk, or dry fruits between meals are easy ways to gain healthy weight without feeling overly full.",
      });
    }
  }

  /* ── Vitals — no data ───────────────────────────────────────────────── */
  if (!latestVitals && weak("vitals")) {
    push({
      category: "vitals",
      priority: 3,
      impact: "medium",
      icon: "🩺",
      title: "Log your vitals regularly",
      body: "Tracking your blood pressure and heart rate weekly helps catch problems early. You can log them directly in the app — even from a home BP machine.",
    });
  }

  /* ── Preventive care ─────────────────────────────────────────────────── */
  if (weak("preventive", 60)) {
    if (!patient.gp_name) {
      push({
        category: "preventive",
        priority: 2,
        impact: "medium",
        icon: "👨‍⚕️",
        title: "Register with a GP",
        body: "Having a regular doctor who knows your history is one of the most powerful things you can do for long-term health. Add your GP's details in Health Profile.",
      });
    }
    if (!(patient.vaccinations || []).length) {
      push({
        category: "preventive",
        priority: 3,
        impact: "low",
        icon: "💉",
        title: "Stay up to date on vaccines",
        body: "Annual flu vaccines, and COVID boosters are recommended for adults. Log any vaccinations you've already had in your Health Profile.",
      });
    }
    if (!(patient.trusted_contacts || []).some((c) => c.is_emergency)) {
      push({
        category: "preventive",
        priority: 2,
        impact: "medium",
        icon: "📞",
        title: "Add an emergency contact",
        body: "In a medical emergency, seconds matter. Having a family member or friend set as your emergency contact ensures caregivers can reach the right person instantly.",
      });
    }
  }

  /* ── Conditions ──────────────────────────────────────────────────────── */
  const activeConditions = (patient.conditions || []).filter(
    (c) => c.status === "active",
  );
  if (activeConditions.length >= 2) {
    push({
      category: "conditions",
      priority: 2,
      impact: "medium",
      icon: "📓",
      title: "Keep a symptom journal",
      body: `You have ${activeConditions.length} active conditions. Noting symptoms, triggers, and how you feel daily helps your doctor spot patterns and adjust treatment more accurately.`,
    });
  }

  /* ── Universal positive tip (always shown if score is good) ─────────── */
  const allGood = tips.length === 0;
  if (allGood) {
    push({
      category: "general",
      priority: 3,
      impact: "low",
      icon: "⭐",
      title: "You're doing great — keep it up!",
      body: "Your health indicators are in great shape. Stay consistent with your medications and maintain your current healthy habits. Small daily choices make the biggest difference.",
    });
    push({
      category: "general",
      priority: 3,
      impact: "low",
      icon: "😴",
      title: "Prioritise 7–8 hours of sleep",
      body: "Good sleep is the foundation of everything else — it regulates blood pressure, mood, immunity, and appetite. Try a consistent bedtime, even on weekends.",
    });
  }

  /* Sort by priority (1 = highest), cap at 6 */
  return tips.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

/* ─── Main Export ──────────────────────────────────────────────────────────── */

/**
 * Compute health score from a Patient document + optional extra data.
 *
 * @param {Object} patient     - Patient Mongoose document (or plain object)
 * @param {number|null} adherenceRate - Weekly adherence %, 0–100 or null
 * @param {Object|null} latestVitals  - Latest VitalLog plain object or null
 * @returns {Object} health_score shape ready to embed in API response
 */
function computeHealthScore(patient, adherenceRate, latestVitals) {
  const age = patient.age ?? deriveAge(patient.date_of_birth);
  const bracket = ageBracket(age);
  const lifestyle = patient.lifestyle || {};

  const adherence = scoreAdherence(adherenceRate, bracket, patient);
  const lifestyle_ = scoreLifestyle(lifestyle, bracket);
  const conditions = scoreConditions(patient.conditions, patient.allergies);
  const vitals = scoreVitals(latestVitals, lifestyle, bracket, patient);
  const preventive = scorePreventiveCare(patient);
  const mobility = scoreMobility(lifestyle, bracket);

  const rawScore =
    adherence.pts +
    (adherence.bonus || 0) +
    lifestyle_.pts +
    conditions.pts +
    vitals.pts +
    preventive.pts +
    mobility.pts;

  const floor = SCORE_FLOOR[bracket];
  const score = Math.max(floor, Math.min(100, Math.round(rawScore)));
  const { grade, label, color } = gradeFromScore(score);

  const breakdown = {
    adherence: { pts: adherence.pts, max: 30, note: adherence.note },
    lifestyle: { pts: lifestyle_.pts, max: 20, note: lifestyle_.note },
    conditions: { pts: conditions.pts, max: 15, note: conditions.note },
    vitals: { pts: vitals.pts, max: 15, note: vitals.note },
    preventive: { pts: preventive.pts, max: 10, note: preventive.note },
    mobility: { pts: mobility.pts, max: 10, note: mobility.note },
  };

  const tips = generateTips(
    patient,
    breakdown,
    bracket,
    adherenceRate,
    latestVitals,
  );

  return {
    score,
    grade,
    label,
    color,
    bracket,
    age: age ?? null,
    breakdown,
    tips,
    last_computed: new Date().toISOString(),
  };
}

module.exports = { computeHealthScore, deriveAge, ageBracket, gradeFromScore };
