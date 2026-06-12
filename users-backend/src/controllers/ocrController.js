const axios = require('axios');
const AuditLog = require('../models/AuditLog');

/**
 * Hybrid Extraction Pipeline:
 * 1. Image Cleanup (Optional/Future: Sharp processing)
 * 2. Google Vision API (Raw OCR Text)
 * 3. Groq (llama-3.3-70b-versatile) Structuring & Confidence Scoring
 */
async function extractPrescription(req, res) {
    try {
        const { imageBase64 } = req.body;
        
        if (!imageBase64) {
            return res.status(400).json({ success: false, error: 'No image base64 provided' });
        }

        let rawText = '';

        // Phase 1: Google Vision API for robust handwriting OCR
        const googleVisionKey = process.env.GOOGLE_VISION_API_KEY;
        if (!googleVisionKey) {
            console.error('Google Vision API key missing.');
            return res.status(500).json({ success: false, error: 'OCR Service temporarily unavailable.' });
        }

        try {
            const gvResponse = await axios.post(`https://vision.googleapis.com/v1/images:annotate?key=${googleVisionKey}`, {
                requests: [{
                    image: { content: imageBase64 },
                    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
                }]
            });
            rawText = gvResponse.data.responses?.[0]?.fullTextAnnotation?.text || '';
        } catch (gvErr) {
            console.error('Google Vision OCR failed:', gvErr.message);
            return res.status(500).json({ success: false, error: 'Failed to read prescription text. Please enter manually.' });
        }

        if (!rawText.trim()) {
            return res.status(400).json({ success: false, error: 'Could not detect any text on this prescription.' });
        }

        // Phase 2: Hybrid Structuring (Groq LLM)
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) {
            console.error('Groq API key missing.');
            return res.status(500).json({ success: false, error: 'Extraction Service temporarily unavailable.' });
        }

        const messages = [
            {
                role: 'system',
                content: `You are a medical data extraction assistant. I will provide raw OCR text from a handwritten Indian prescription. 
                Your job is to structure this into a strict JSON array of medications.
                Extract: name, dosage, frequency, duration. 
                Also provide a 'confidence' score (0.0 to 1.0) indicating how clear and certain the extraction is.
                Return ONLY valid JSON in this format: 
                { "medications": [ { "name": "...", "dosage": "...", "frequency": "...", "duration": "...", "confidence": 0.95 } ] }`
            },
            {
                role: 'user',
                content: `Here is the raw OCR text:\n\n${rawText}`
            }
        ];

        const llmResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.1 // Low temperature for deterministic structuring
        }, {
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
            }
        });

        const jsonString = llmResponse.data.choices[0].message.content;
        let parsedJson = JSON.parse(jsonString);

        // Phase 3: Validation Layer before returning to UI
        if (parsedJson && Array.isArray(parsedJson.medications)) {
            parsedJson.medications = parsedJson.medications.map(med => ({
                id: Math.random().toString(36).substring(7), // Generate temporary ID for UI rendering
                name: med.name || 'Unknown',
                dosage: med.dosage || '',
                frequency: med.frequency || '',
                duration: med.duration || '',
                confidence: typeof med.confidence === 'number' ? med.confidence : 0.5
            }));
        } else {
            parsedJson = { medications: [] };
        }

        // Log OCR success to AuditLog
        try {
            await AuditLog.createLog({
                supabaseUid: req.profile?.supabaseUid || req.user?.id || 'system',
                action: 'ocr_extraction_success',
                resourceType: 'system',
                outcome: 'success',
                details: { count: parsedJson.medications.length }
            });
        } catch (auditError) {
            console.error('Failed to log OCR success:', auditError.message);
        }

        return res.json({
            success: true,
            data: parsedJson
        });

    } catch (error) {
        console.error('OCR Extraction Error:', error.message);
        if (error.response?.data) console.error(JSON.stringify(error.response.data));

        // Log OCR failure to AuditLog
        try {
            await AuditLog.createLog({
                supabaseUid: req.profile?.supabaseUid || req.user?.id || 'system',
                action: 'ocr_extraction_failed',
                resourceType: 'system',
                outcome: 'failure',
                details: { error: error.message }
            });
        } catch (auditError) {
            console.error('Failed to log OCR failure:', auditError.message);
        }

        return res.status(500).json({ success: false, error: 'Failed to process prescription image.' });
    }
}

module.exports = {
    extractPrescription
};
