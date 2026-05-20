/**
 * aiChatbotPoC.js
 * 
 * Phase 1: RAG Orchestrator with SSE Streaming
 * Integrates ChromaDB vector retrieval with strict thresholds.
 * Streams Ollama responses token-by-token via structured SSE events.
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
 * Builds the system prompt by fetching patient context and running ChromaDB RAG.
 * Shared by both streaming and non-streaming paths.
 * @returns {{ systemPrompt: string, messages: Array }} 
 */
async function buildRAGContext(patientId, userQuery, targetLanguage) {
    console.log(`[PoC] Fetching context for patient ${patientId}...`);
    
    // 1. Fetch & Truncate Patient Context
    const patientContext = await buildPatientContext(patientId);
    
    if (!patientContext) {
        throw new Error('Patient context could not be built. Verify patient ID.');
    }

    console.log(`[PoC] Searching ChromaDB for guidelines...`);
    // 2. Semantic Search in ChromaDB
    const chroma = new ChromaClient({ path: process.env.CHROMA_URL || "http://localhost:8001" });
    // Provide a dummy embedding function since we pass embeddings manually to silence the warning
    const collection = await chroma.getCollection({ 
        name: "medical_guidelines",
        embeddingFunction: { generate: () => [] }
    });
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
    const languageInstruction = targetLanguage && !targetLanguage.toLowerCase().startsWith('en') 
        ? `\nCRITICAL: You MUST write your entire response, including follow-up questions, in ${targetLanguage}. Do not use English.` 
        : ``;

    const SYSTEM_PROMPT = `You are the CareMyMed Assistant. You are a calm, experienced nurse who has worked with chronically ill patients for fifteen years.
You are calm under pressure, never condescending, and deeply practical. 

CRITICAL PERSONA RULES:
1. No guilt framing — ever. If a patient misses a dose, do not say "You missed your dose." Instead, focus on the next step (e.g., "Your next dose is at [Time] — want a reminder set?").
2. Lead with the human, not the data. Always prioritize human well-being (e.g., "Your BP reading looks good") before citing raw data.
3. Uncertainty is honest, not alarming. Never use words like "WARNING" or "abnormal". Say "This looks a little elevated — worth mentioning to your doctor."
4. Short by default, detailed on request. Your first response must be a calm, concise summary (2-4 sentences max). Do not over-explain.
5. Never simulate urgency that isn't real. Do not say "Act now" or "Don't forget" unless genuinely time-sensitive.
6. Acknowledge quietly and move forward. Do not over-celebrate wins.
7. Be streak-aware but not streak-obsessed. If the patient has a streak going, you may warmly reference it once (e.g., "You're on day 7 — nice rhythm.") but never guilt-trip about broken streaks. If streak is 0, ignore it entirely.
8. Know today's schedule. Use today_status from PATIENT_LIVE_DATA to understand which specific medications the patient has taken or missed TODAY. Reference med names naturally when relevant (e.g., "Looks like your morning Metformin is already done — just Atorvastatin left tonight.").

You must ONLY use the provided [PATIENT_LIVE_DATA] and [MEDICAL_GUIDELINES] to answer the user's question. 
If the answer is not contained within these two sources, decline calmly and suggest consulting their care team. Do NOT guess or hallucinate.${languageInstruction}

At the END of every response, always include exactly 3 short follow-up questions the patient might want to ask next. Format them on separate lines starting with ">>" like:
>> Follow-up question 1
>> Follow-up question 2  
>> Follow-up question 3

[MEDICAL_GUIDELINES]
${matchedGuidelines.join('\n\n')}

[PATIENT_LIVE_DATA]
${JSON.stringify(patientContext, null, 2)}
`;

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userQuery }
    ];

    return { systemPrompt: SYSTEM_PROMPT, messages };
}

/**
 * Streams an Ollama chat completion to an Express SSE response.
 * Emits structured events: meta, chunk, suggestions, done, error.
 * 
 * @param {string} patientId 
 * @param {string} userQuery 
 * @param {string} targetLanguage 
 * @param {import('express').Response} res - Express response (SSE)
 * @param {string|null} transcribedText - If audio was transcribed, send as meta
 */
async function streamPoCResponse(patientId, userQuery, targetLanguage, res, transcribedText = null) {
    // Helper to write an SSE event
    const sendEvent = (type, payload) => {
        res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    };

    try {
        // Send transcription meta if available (before AI even starts)
        if (transcribedText) {
            sendEvent('meta', { transcribedText });
        }

        const { messages } = await buildRAGContext(patientId, userQuery, targetLanguage);

        console.log(`[PoC] Streaming query against ${OLLAMA_MODEL}...`);

        // Stream from Ollama
        const ollamaResponse = await axios.post(`${OLLAMA_URL}/api/chat`, {
            model: OLLAMA_MODEL,
            messages: messages,
            stream: true
        }, { 
            responseType: 'stream',
            timeout: 120000 
        });

        // Buffer the full response to parse suggestions at the end
        let fullText = '';

        await new Promise((resolve, reject) => {
            let buffer = '';

            ollamaResponse.data.on('data', (chunk) => {
                buffer += chunk.toString();

                // Ollama streams newline-delimited JSON objects
                const lines = buffer.split('\n');
                // Keep the last (possibly incomplete) line in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        const token = parsed.message?.content || '';

                        if (token) {
                            fullText += token;

                            // Only emit tokens that are NOT part of suggestion lines.
                            // We detect suggestion lines by checking if the current accumulated
                            // text has entered the ">>" section. Once we see the first ">>",
                            // we stop emitting chunks (suggestions are sent as structured event at end).
                            const suggestionStart = fullText.indexOf('\n>>');
                            if (suggestionStart === -1) {
                                // Still in main response — emit chunk
                                sendEvent('chunk', { text: token });
                            }
                            // else: token is part of suggestions, buffer silently
                        }

                        if (parsed.done) {
                            resolve();
                        }
                    } catch (parseErr) {
                        // Partial JSON, will be completed next chunk
                    }
                }
            });

            ollamaResponse.data.on('error', (err) => {
                reject(err);
            });

            ollamaResponse.data.on('end', () => {
                // Process any remaining buffer
                if (buffer.trim()) {
                    try {
                        const parsed = JSON.parse(buffer);
                        const token = parsed.message?.content || '';
                        if (token) {
                            fullText += token;
                            const suggestionStart = fullText.indexOf('\n>>');
                            if (suggestionStart === -1) {
                                sendEvent('chunk', { text: token });
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
                resolve();
            });
        });

        // Parse suggestions from the full buffered text
        const lines = fullText.split('\n');
        const suggestions = [];
        for (const line of lines) {
            if (line.trim().startsWith('>>')) {
                suggestions.push(line.trim().replace(/^>>\s*/, ''));
            }
        }
        if (suggestions.length > 0) {
            sendEvent('suggestions', { items: suggestions.slice(0, 3) });
        }

        // Send done event
        sendEvent('done', {});
        console.log(`[PoC] Stream completed. ${fullText.length} chars generated.`);

    } catch (error) {
        console.error('[PoC Stream Error]:', error.response?.data || error.message);
        
        // Emulate a graceful fallback message when Ollama times out or fails
        const fallbackMessage = "I'm having a little trouble connecting to my charts right now. Could you try asking me again in a moment?";
        sendEvent('chunk', { text: fallbackMessage });
        sendEvent('suggestions', { items: ["Try again", "Call Care Coordinator"] });
        sendEvent('done', {});
    }
}

/**
 * Non-streaming fallback (kept for backwards compatibility / testing).
 */
async function generatePoCResponse(patientId, userQuery, targetLanguage) {
    try {
        const { systemPrompt, messages } = await buildRAGContext(patientId, userQuery, targetLanguage);

        console.log(`[PoC] Executing query against ${OLLAMA_MODEL}...`);
        
        const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
            model: OLLAMA_MODEL,
            messages: messages,
            stream: false
        }, { timeout: 120000 });

        let reply = response.data.message?.content || 'No response generated.';

        // Parse follow-up suggestions from the response
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
        suggestions = suggestions.slice(0, 3);

        return {
            success: true,
            model: OLLAMA_MODEL,
            response: reply,
            suggestions,
            contextTokensEstimate: Math.ceil(systemPrompt.length / 4)
        };

    } catch (error) {
        console.error('[PoC Error]:', error.response?.data || error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = { generatePoCResponse, streamPoCResponse };
