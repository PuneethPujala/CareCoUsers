/**
 * aiChatbotPoC.js
 * 
 * Phase 1: RAG Orchestrator
 * Integrates ChromaDB vector retrieval with strict thresholds.
 */

const axios = require('axios');
const { ChromaClient } = require('chromadb');
const { buildPatientContext } = require('./aiContextService');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:8b';
const EMBED_MODEL = 'nomic-embed-text';
const SIMILARITY_THRESHOLD = 0.75; // Strict threshold to prevent hallucination

/**
 * Gets embeddings for the user query using Ollama
 */
async function getQueryEmbedding(query) {
    const response = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
        model: EMBED_MODEL,
        prompt: query
    });
    return response.data.embedding;
}

/**
 * Executes a chat completion against a local Ollama instance with ChromaDB RAG.
 * @param {string} patientId 
 * @param {string} userQuery 
 * @param {string} targetLanguage 
 */
async function generatePoCResponse(patientId, userQuery, targetLanguage) {
    try {
        console.log(`[PoC] Fetching context for patient ${patientId}...`);
        
        // 1. Fetch & Truncate Patient Context
        const patientContext = await buildPatientContext(patientId);
        
        if (!patientContext) {
            throw new Error('Patient context could not be built. Verify patient ID.');
        }

        console.log(`[PoC] Searching ChromaDB for guidelines...`);
        // 2. Semantic Search in ChromaDB
        const chroma = new ChromaClient({ path: process.env.CHROMA_URL || "http://localhost:8001" });
        const collection = await chroma.getCollection({ name: "medical_guidelines" });
        const queryEmbedding = await getQueryEmbedding(userQuery);

        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: 3
        });

        // 3. Apply Strict Thresholding (Cosine Distance to Similarity)
        // Chroma returns distance, where similarity = 1 - distance
        let matchedGuidelines = [];
        if (results.distances && results.distances[0]) {
            for (let i = 0; i < results.distances[0].length; i++) {
                const similarity = 1 - results.distances[0][i];
                if (similarity >= SIMILARITY_THRESHOLD) {
                    matchedGuidelines.push(results.documents[0][i]);
                    console.log(`[PoC] Matched Chunk: ${results.metadatas[0][i].title} (Score: ${similarity.toFixed(2)})`);
                } else {
                    console.log(`[PoC] Discarded Chunk: ${results.metadatas[0][i].title} (Score: ${similarity.toFixed(2)} - Below Threshold)`);
                }
            }
        }

        // 4. Fallback Guardrail (Relaxed)
        if (matchedGuidelines.length === 0) {
            console.log(`[PoC] No guidelines met the ${SIMILARITY_THRESHOLD} threshold. Relying purely on PATIENT_LIVE_DATA.`);
            matchedGuidelines.push("No specific medical guidelines retrieved from the knowledge base for this query.");
        }

        // 5. Build the Augmented System Prompt
        const SYSTEM_PROMPT = `You are CareMyMed AI, a helpful, empathetic, and professional medical assistant.
You must ONLY use the provided [PATIENT_LIVE_DATA] and [MEDICAL_GUIDELINES] to answer the user's question. 
If the answer is not contained within these two sources, you must decline to answer and tell them to consult their caretaker or doctor. Do NOT guess or hallucinate.
Keep your responses concise (2-4 sentences max). Be warm and conversational.

At the END of every response, always include exactly 3 short follow-up questions the patient might want to ask next. Format them on separate lines starting with ">>" like:
>> Follow-up question 1
>> Follow-up question 2  
>> Follow-up question 3

[MEDICAL_GUIDELINES]
${matchedGuidelines.join('\n\n')}

[PATIENT_LIVE_DATA]
${JSON.stringify(patientContext, null, 2)}
`;

        // 6. Assemble Messages Array
        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userQuery }
        ];

        console.log(`[PoC] Executing query against ${OLLAMA_MODEL}...`);
        
        // 7. Raw HTTP Call to Ollama for the Medical Response (In English)
        const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
            model: OLLAMA_MODEL,
            messages: messages,
            stream: false
        }, { timeout: 45000 }); // 45s timeout for reasoning

        let reply = response.data.message?.content || 'No response generated.';
        
        // 8. Translation Layer (skip if English or not set)
        const skipTranslation = !targetLanguage || targetLanguage.startsWith('en') || targetLanguage.toLowerCase() === 'english';
        if (!skipTranslation) {
            console.log(`[PoC] Translating response to ${targetLanguage} using Ollama...`);
            
            const translationPrompt = [
                { role: "system", content: `You are a medical translator. Translate the following English medical response into fluent, natural ${targetLanguage}. Maintain a professional and empathetic tone. Return ONLY the translated text, nothing else.` },
                { role: "user", content: reply }
            ];

            const translationResponse = await axios.post(`${OLLAMA_URL}/api/chat`, {
                model: OLLAMA_MODEL,
                messages: translationPrompt,
                stream: false
            }, { timeout: 45000 }); // 45s timeout for translation too

            reply = translationResponse.data.message?.content || reply;
        }

        // 8. Parse follow-up suggestions from the response
        let suggestions = [];
        const lines = reply.split('\n');
        const mainLines = [];
        for (const line of lines) {
            if (line.trim().startsWith('>>')) {
                suggestions.push(line.trim().replace(/^>>\s*/, ''));
            } else {
                mainLines.push(line);
            }
        }
        reply = mainLines.join('\n').trim();
        suggestions = suggestions.slice(0, 3); // Cap at 3

        return {
            success: true,
            model: OLLAMA_MODEL,
            response: reply,
            suggestions,
            contextTokensEstimate: Math.ceil(SYSTEM_PROMPT.length / 4)
        };

    } catch (error) {
        console.error('[PoC Error]:', error.response?.data || error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = { generatePoCResponse };
