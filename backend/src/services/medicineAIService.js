/**
 * medicineAIService.js — Uses Groq LLM to classify medicines by risk tier
 * and provide safety information for callers.
 *
 * Risk Tiers:
 *   safe       — Common OTC drugs (Paracetamol, antacids, vitamins)
 *   caution    — Drugs with notable side effects or requiring awareness (antibiotics, NSAIDs)
 *   restricted — Prescription-only, controlled, or high-risk drugs (opioids, blood thinners, steroids)
 */

const MedicineCache = require('../models/MedicineCache');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a pharmaceutical safety classifier for a healthcare call center.

When given a medicine name, respond with ONLY a valid JSON object (no markdown, no explanation) with these fields:

{
  "riskTier": "safe" | "caution" | "restricted",
  "genericName": "generic/chemical name",
  "summary": "1-2 sentence description of what this medicine does",
  "sideEffects": ["side effect 1", "side effect 2"],
  "warnings": ["warning 1", "warning 2"],
  "interactions": ["drug interaction 1", "drug interaction 2"],
  "commonUses": ["use 1", "use 2"]
}

Classification rules:
- "safe": Over-the-counter medicines freely available without prescription. Examples: Paracetamol, Dolo 650, Crocin, antacids (Gelusil, Digene), multivitamins, Cetirizine, ORS, Vicks.
- "caution": Medicines that are commonly used but have notable side effects or need doctor awareness. Examples: Antibiotics (Azithromycin, Amoxicillin), NSAIDs (Ibuprofen, Diclofenac), Metformin, anti-allergy drugs.
- "restricted": Prescription-only, controlled substances, or high-risk drugs that should NEVER be casually reminded by a caller. Examples: Opioids (Tramadol, Codeine), blood thinners (Warfarin), steroids (Prednisolone), insulin, psychiatric drugs (Alprazolam), chemotherapy drugs.

Respond ONLY with the JSON. No other text.`;

/**
 * Look up medicine info — checks cache first, calls Groq if not cached.
 * @param {string} medicineName
 * @returns {Promise<object>} { riskTier, genericName, aiSummary, sideEffects, warnings, interactions }
 */
async function lookupMedicine(medicineName) {
    console.log(`[MedicineAI] lookupMedicine invoked for: "${medicineName}"`);
    console.log(`[MedicineAI] Current API Key:`, process.env.GROQ_API_KEY ? 'SET' : 'NOT SET');
    
    if (!medicineName || typeof medicineName !== 'string') {
        console.log(`[MedicineAI] Invalid medicineName provided`);
        return getDefaultResult(medicineName);
    }

    const nameKey = medicineName.trim().toLowerCase();

    // 1. Check cache
    try {
        const cached = await MedicineCache.findOne({ nameKey });
        if (cached) {
            console.log(`[MedicineAI] Cache hit: "${medicineName}" → ${cached.riskTier}`);
            return {
                riskTier: cached.riskTier,
                genericName: cached.genericName,
                aiSummary: cached.aiSummary,
                sideEffects: cached.sideEffects || [],
                warnings: cached.warnings || [],
                interactions: cached.interactions || [],
                commonUses: cached.commonUses || [],
                fromCache: true,
            };
        }
    } catch (err) {
        console.warn('[MedicineAI] Cache lookup failed:', err.message);
    }

    // 2. Call Groq API
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.warn('[MedicineAI] No GROQ_API_KEY set, returning default caution');
        return getDefaultResult(medicineName);
    }

    try {
        console.log(`[MedicineAI] Calling Groq for: "${medicineName}"`);

        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Classify this medicine: "${medicineName}"` },
                ],
                temperature: 0.1,
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[MedicineAI] Groq API error ${response.status}:`, errText);
            return getDefaultResult(medicineName);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();

        if (!content) {
            console.warn('[MedicineAI] Empty response from Groq');
            return getDefaultResult(medicineName);
        }

        // Parse JSON response (strip markdown code blocks if present)
        let parsed;
        try {
            const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsed = JSON.parse(jsonStr);
        } catch (parseErr) {
            console.error('[MedicineAI] Failed to parse Groq response:', content);
            return getDefaultResult(medicineName);
        }

        // Validate risk tier
        const validTiers = ['safe', 'caution', 'restricted'];
        const riskTier = validTiers.includes(parsed.riskTier) ? parsed.riskTier : 'caution';

        const result = {
            riskTier,
            genericName: parsed.genericName || '',
            aiSummary: parsed.summary || '',
            sideEffects: Array.isArray(parsed.sideEffects) ? parsed.sideEffects : [],
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
            interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
            commonUses: Array.isArray(parsed.commonUses) ? parsed.commonUses : [],
            fromCache: false,
        };

        console.log(`[MedicineAI] Result: "${medicineName}" → ${riskTier}`);

        // 3. Cache the result
        try {
            await MedicineCache.findOneAndUpdate(
                { nameKey },
                {
                    nameKey,
                    originalName: medicineName,
                    riskTier: result.riskTier,
                    genericName: result.genericName,
                    aiSummary: result.aiSummary,
                    sideEffects: result.sideEffects,
                    warnings: result.warnings,
                    interactions: result.interactions,
                    commonUses: result.commonUses,
                },
                { upsert: true, new: true }
            );
        } catch (cacheErr) {
            console.warn('[MedicineAI] Failed to cache result:', cacheErr.message);
        }

        return result;

    } catch (err) {
        console.error('[MedicineAI] Groq request failed:', err.message);
        return getDefaultResult(medicineName);
    }
}

/**
 * Default fallback when AI is unavailable — always returns 'caution'.
 */
function getDefaultResult(medicineName) {
    return {
        riskTier: 'caution',
        genericName: '',
        aiSummary: 'Could not verify this medicine. Please check with a doctor before reminding.',
        sideEffects: [],
        warnings: ['AI verification unavailable — treat with caution'],
        interactions: [],
        commonUses: [],
        fromCache: false,
    };
}

module.exports = { lookupMedicine };
