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
const AIChatLog = require('../models/AIChatLog');
const { performance } = require('perf_hooks');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:8b';
const EMBED_MODEL = 'nomic-embed-text';
const SIMILARITY_THRESHOLD = 0.75; // Strict threshold to prevent hallucination

function getFallbackReason(error) {
    if (!error) return 'unknown';
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return 'timeout';
    }
    if (error.response) {
        if (error.response.status === 429) {
            return 'rate_limit';
        }
        if (error.response.status >= 500) {
            return 'provider_unavailable';
        }
        return `status_${error.response.status}`;
    }
    if (error.request) {
        return 'network_error';
    }
    return error.message || 'unknown';
}

const EMERGENCY_RULESET_V1 = [
    'chest pain', 'chest tightness', 'shortness of breath', 'difficulty breathing',
    'severe bleeding', 'suicidal thoughts', 'stroke symptoms', 'face drooping',
    'slurred speech', 'fainting', 'passed out', 'numbness', 'paralysis'
];

/**
 * Detect emergency symptoms based on keywords
 */
function detectEmergency(query) {
    if (!query) return false;
    const lowerQuery = query.toLowerCase();
    return EMERGENCY_RULESET_V1.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Localized emergency messaging
 */
function getEmergencyMessage(targetLanguage) {
    const lang = (targetLanguage || 'en').toLowerCase();
    if (lang.startsWith('es')) {
        return "He detectado síntomas que pueden requerir atención médica urgente. Por favor, llame inmediatamente a los servicios de emergencia (como el 911 o 112) o diríjase a la sala de emergencias más cercana. No espere una respuesta.";
    }
    if (lang.startsWith('hi')) {
        return "मैंने ऐसे लक्षणों का पता लगाया है जिनके लिए तत्काल चिकित्सा सहायता की आवश्यकता हो सकती है। कृपया तुरंत आपातकालीन सेवाओं (जैसे 911 या 112) को कॉल करें या निकटतम आपातकालीन कक्ष में जाएं। प्रतिक्रिया की प्रतीक्षा न करें।";
    }
    return "I have detected symptoms that may require urgent medical attention. Please immediately call emergency services (like 911 or 112) or go to the nearest emergency room. Do not wait for a response.";
}

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
    const retrievalStart = performance.now();
    
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
    let similaritySum = 0;
    let matchedCount = 0;
    if (results.distances && results.distances[0]) {
        for (let i = 0; i < results.distances[0].length; i++) {
            const similarity = 1 - results.distances[0][i];
            if (similarity >= SIMILARITY_THRESHOLD) {
                matchedGuidelines.push(results.documents[0][i]);
                similaritySum += similarity;
                matchedCount++;
                console.log(`[PoC] Matched Chunk: ${results.metadatas[0][i].title} (Score: ${similarity.toFixed(2)})`);
            } else {
                console.log(`[PoC] Discarded Chunk: ${results.metadatas[0][i].title} (Score: ${similarity.toFixed(2)} - Below Threshold)`);
            }
        }
    }
    const retrievalLatency = Math.round(performance.now() - retrievalStart);
    const similarityAvg = matchedCount > 0 ? (similaritySum / matchedCount) : 0;

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

CRITICAL PERSONA & SAFETY RULES:
1. NEVER diagnose a disease, suggest specific conditions, or say "you definitely have X".
2. NEVER instruct a patient to change, stop, or adjust their medication dosage.
3. NEVER recommend prescription drugs.
4. NEVER discourage emergency care or interpret medical scans/images clinically.
5. NEVER claim certainty. Use uncertainty language when data is not fully clear or verified. Force phrases like "I cannot determine...", "This may require evaluation by your doctor...", "Please consult your doctor...".
6. No guilt framing — ever. If a patient misses a dose, do not say "You missed your dose." Instead, focus on the next step (e.g., "Your next dose is at [Time] — want a reminder set?").
7. Lead with the human, not the data. Always prioritize human well-being (e.g., "Your BP reading looks good") before citing raw data.
8. Uncertainty is honest, not alarming. Never use words like "WARNING" or "abnormal". Say "This looks a little elevated — worth mentioning to your doctor."
9. Short by default, detailed on request. Your first response must be a calm, concise summary (2-4 sentences max). Do not over-explain.
10. Never simulate urgency that isn't real. Do not say "Act now" or "Don't forget" unless genuinely time-sensitive.
11. Acknowledge quietly and move forward. Do not over-celebrate wins.
12. Be streak-aware but not streak-obsessed. If the patient has a streak going, you may warmly reference it once (e.g., "You're on day 7 — nice rhythm.") but never guilt-trip about broken streaks. If streak is 0, ignore it entirely.
13. Know today's schedule. Use today_status from PATIENT_LIVE_DATA to understand which specific medications the patient has taken or missed TODAY. Reference med names naturally when relevant (e.g., "Looks like your morning Metformin is already done — just Atorvastatin left tonight.").
14. Understand Care Team Context. Check 'care_team' and 'latest_interaction' in PATIENT_LIVE_DATA. If 'care_team' is null, do NOT hallucinate a coordinator; you can simply say they haven't been assigned one yet. If it exists, naturally reference the coordinator's name when suggesting follow-ups (e.g. "I can flag this for Prakash"). If 'latest_interaction' exists, you may reference their last call (e.g. "I see you just spoke with Prakash yesterday").

You must ONLY use the provided [PATIENT_LIVE_DATA] and [MEDICAL_GUIDELINES] to answer the user's question. 
If the answer is not contained within these two sources, decline calmly and suggest consulting their care team. Do NOT guess or hallucinate${languageInstruction}

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

    return { 
        systemPrompt: SYSTEM_PROMPT, 
        messages, 
        matchedGuidelines, 
        retrievalLatency, 
        matchedCount, 
        similarityAvg 
    };
}

/**
 * Streams an Ollama or Groq chat completion to an Express SSE response.
 * Emits structured events: meta, chunk, suggestions, done, error.
 */
async function streamPoCResponse(patientId, userQuery, targetLanguage, res, transcribedText = null) {
    const requestStart = performance.now();
    const sendEvent = (type, payload) => {
        try {
            res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
        } catch (e) {
            // ignore if response already closed
        }
    };

    // 1. Emergency Escalation Interceptor (bypasses LLM query entirely)
    const isEmergency = detectEmergency(userQuery);
    if (isEmergency) {
        const emergencyMsg = getEmergencyMessage(targetLanguage);
        if (transcribedText) {
            sendEvent('meta', { transcribedText });
        }
        sendEvent('chunk', { text: emergencyMsg });
        sendEvent('suggestions', { items: ["Call 911", "Call 112"] });
        sendEvent('done', {});

        try {
            await AIChatLog.create({
                patient_id: patientId,
                prompt: userQuery,
                retrieved_chunks: [],
                response: emergencyMsg,
                emergency_escalation_triggered: true,
                emergency_ruleset: 'EMERGENCY_RULESET_V1',
                translated_language: targetLanguage || 'en',
                provider: 'esc-emergency',
                model: 'none',
                llm_latency_ms: 0,
                retrieval_latency_ms: 0,
                end_to_end_latency_ms: Math.round(performance.now() - requestStart),
                streaming_first_token_ms: 0,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                retrieved_chunks_count: 0,
                retrieval_similarity_avg: 0
            });
        } catch (logErr) {
            console.error('[PoC] Emergency chat log error:', logErr.message);
        }
        return;
    }

    let matchedGuidelines = [];
    let retrievalLatency = 0;
    let retrievedChunksCount = 0;
    let retrievalSimilarityAvg = 0;

    let isFallback = false;
    let fallbackReason = null;
    let providerUsed = 'groq';
    let modelUsed = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let llmStart = 0;
    let llmLatency = 0;
    let firstTokenLatency = 0;
    let fullText = '';
    let cleanedResponse = '';
    let suggestions = [];

    const abortController = new AbortController();
    res.on('close', () => {
        console.log('[PoC Stream] Client close connection detected. Aborting active calls.');
        abortController.abort();
    });

    try {
        if (transcribedText) {
            sendEvent('meta', { transcribedText });
        }

        const context = await buildRAGContext(patientId, userQuery, targetLanguage);
        const { messages } = context;
        matchedGuidelines = context.matchedGuidelines || [];
        retrievalLatency = context.retrievalLatency || 0;
        retrievedChunksCount = context.matchedCount || 0;
        retrievalSimilarityAvg = context.similarityAvg || 0;

        llmStart = performance.now();
        const groqKey = process.env.GROQ_API_KEY;

        if (!groqKey) {
            throw new Error('GROQ_API_KEY is not configured');
        }

        console.log(`[PoC] Querying Groq API (${modelUsed})...`);
        const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: modelUsed,
            messages: messages,
            stream: true,
            stream_options: { include_usage: true }
        }, {
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
            },
            responseType: 'stream',
            timeout: 15000,
            signal: abortController.signal
        });

        await new Promise((resolve, reject) => {
            let buffer = '';
            const onAbort = () => {
                reject(new Error('Request aborted'));
            };
            if (abortController.signal.aborted) {
                return onAbort();
            }
            abortController.signal.addEventListener('abort', onAbort);

            groqResponse.data.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;
                    if (trimmedLine === 'data: [DONE]') continue;
                    if (trimmedLine.startsWith('data: ')) {
                        const jsonStr = trimmedLine.substring(6).trim();
                        if (!jsonStr) continue;
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const token = parsed.choices?.[0]?.delta?.content || '';
                            if (token) {
                                if (!firstTokenLatency) {
                                    firstTokenLatency = Math.round(performance.now() - requestStart);
                                }
                                fullText += token;
                                const suggestionStart = fullText.indexOf('\n>>');
                                if (suggestionStart === -1) {
                                    sendEvent('chunk', { text: token });
                                }
                            }
                            if (parsed.usage) {
                                promptTokens = parsed.usage.prompt_tokens;
                                completionTokens = parsed.usage.completion_tokens;
                                totalTokens = parsed.usage.total_tokens;
                            }
                        } catch (e) {
                            // ignore parse errors for split chunk parts
                        }
                    }
                }
            });

            groqResponse.data.on('end', () => {
                abortController.signal.removeEventListener('abort', onAbort);
                resolve();
            });

            groqResponse.data.on('error', (err) => {
                abortController.signal.removeEventListener('abort', onAbort);
                reject(err);
            });
        });

        llmLatency = Math.round(performance.now() - llmStart);

    } catch (err) {
        if (abortController.signal.aborted) {
            console.log('[PoC Stream] Aborted request. Skip fallback.');
            return;
        }
        isFallback = true;
        fallbackReason = getFallbackReason(err);
        providerUsed = 'ollama';
        modelUsed = OLLAMA_MODEL;
        console.warn(`[PoC] Groq failed (Reason: ${fallbackReason}). Falling back to local Ollama...`);

        try {
            const context = await buildRAGContext(patientId, userQuery, targetLanguage);
            const { messages } = context;
            matchedGuidelines = context.matchedGuidelines || [];
            retrievalLatency = context.retrievalLatency || 0;
            retrievedChunksCount = context.matchedCount || 0;
            retrievalSimilarityAvg = context.similarityAvg || 0;

            llmStart = performance.now();
            const ollamaResponse = await axios.post(`${OLLAMA_URL}/api/chat`, {
                model: OLLAMA_MODEL,
                messages: messages,
                stream: true
            }, {
                responseType: 'stream',
                timeout: 30000,
                signal: abortController.signal
            });

            fullText = '';
            firstTokenLatency = 0;

            await new Promise((resolve, reject) => {
                let buffer = '';
                const onAbort = () => {
                    reject(new Error('Request aborted'));
                };
                if (abortController.signal.aborted) {
                    return onAbort();
                }
                abortController.signal.addEventListener('abort', onAbort);

                ollamaResponse.data.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const parsed = JSON.parse(line);
                            const token = parsed.message?.content || '';
                            if (token) {
                                if (!firstTokenLatency) {
                                    firstTokenLatency = Math.round(performance.now() - requestStart);
                                }
                                fullText += token;
                                const suggestionStart = fullText.indexOf('\n>>');
                                if (suggestionStart === -1) {
                                    sendEvent('chunk', { text: token });
                                }
                            }
                            if (parsed.done) {
                                resolve();
                            }
                        } catch (e) {
                            // partial json
                        }
                    }
                });

                ollamaResponse.data.on('end', () => {
                    abortController.signal.removeEventListener('abort', onAbort);
                    resolve();
                });

                ollamaResponse.data.on('error', (err) => {
                    abortController.signal.removeEventListener('abort', onAbort);
                    reject(err);
                });
            });

            llmLatency = Math.round(performance.now() - llmStart);
            promptTokens = Math.ceil(userQuery.length / 4);
            completionTokens = Math.ceil(fullText.length / 4);
            totalTokens = promptTokens + completionTokens;

        } catch (ollamaErr) {
            if (abortController.signal.aborted) {
                console.log('[PoC Stream] Aborted request during fallback.');
                return;
            }
            console.error('[PoC] Ollama fallback failed:', ollamaErr.message);
            const fallbackMessage = "I'm having a little trouble connecting to my charts right now. Could you try asking me again in a moment?";
            sendEvent('chunk', { text: fallbackMessage });
            sendEvent('suggestions', { items: ["Try again", "Call Care Coordinator"] });
            sendEvent('done', {});

            try {
                await AIChatLog.create({
                    patient_id: patientId,
                    prompt: userQuery,
                    retrieved_chunks: matchedGuidelines,
                    response: fallbackMessage,
                    emergency_escalation_triggered: false,
                    translated_language: targetLanguage || 'en',
                    provider: 'ollama',
                    model: OLLAMA_MODEL,
                    is_fallback: true,
                    fallback_reason: `${fallbackReason}_then_${getFallbackReason(ollamaErr)}`,
                    llm_latency_ms: 0,
                    retrieval_latency_ms: retrievalLatency,
                    end_to_end_latency_ms: Math.round(performance.now() - requestStart),
                    streaming_first_token_ms: 0,
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                    retrieved_chunks_count: retrievedChunksCount,
                    retrieval_similarity_avg: retrievalSimilarityAvg
                });
            } catch (logErr) {
                console.error('[PoC] Chat log error on total failure:', logErr.message);
            }
            return;
        }
    }

    const lines = fullText.split('\n');
    for (const line of lines) {
        if (line.trim().startsWith('>>')) {
            suggestions.push(line.trim().replace(/^>>\s*/, ''));
        } else {
            cleanedResponse += line + '\n';
        }
    }
    cleanedResponse = cleanedResponse.trim();
    suggestions = suggestions.slice(0, 3);

    if (suggestions.length > 0) {
        sendEvent('suggestions', { items: suggestions });
    }
    sendEvent('done', {});

    try {
        await AIChatLog.create({
            patient_id: patientId,
            prompt: userQuery,
            retrieved_chunks: matchedGuidelines,
            response: cleanedResponse || fullText,
            emergency_escalation_triggered: false,
            translated_language: targetLanguage || 'en',
            provider: providerUsed,
            model: modelUsed,
            is_fallback: isFallback,
            fallback_reason: fallbackReason,
            llm_latency_ms: llmLatency,
            retrieval_latency_ms: retrievalLatency,
            end_to_end_latency_ms: Math.round(performance.now() - requestStart),
            streaming_first_token_ms: firstTokenLatency,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            retrieved_chunks_count: retrievedChunksCount,
            retrieval_similarity_avg: retrievalSimilarityAvg
        });
    } catch (logErr) {
        console.error('[PoC] Successful chat log error:', logErr.message);
    }
}

/**
 * Non-streaming fallback (kept for backwards compatibility / testing).
 */
async function generatePoCResponse(patientId, userQuery, targetLanguage) {
    const requestStart = performance.now();

    const isEmergency = detectEmergency(userQuery);
    if (isEmergency) {
        const emergencyMsg = getEmergencyMessage(targetLanguage);
        try {
            await AIChatLog.create({
                patient_id: patientId,
                prompt: userQuery,
                retrieved_chunks: [],
                response: emergencyMsg,
                emergency_escalation_triggered: true,
                emergency_ruleset: 'EMERGENCY_RULESET_V1',
                translated_language: targetLanguage || 'en',
                provider: 'esc-emergency',
                model: 'none',
                llm_latency_ms: 0,
                retrieval_latency_ms: 0,
                end_to_end_latency_ms: Math.round(performance.now() - requestStart),
                streaming_first_token_ms: 0,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                retrieved_chunks_count: 0,
                retrieval_similarity_avg: 0
            });
        } catch (logErr) {
            console.error('[PoC] Emergency chat log error:', logErr.message);
        }
        return {
            success: true,
            model: 'esc-emergency',
            response: emergencyMsg,
            suggestions: ["Call 911", "Call 112"],
            contextTokensEstimate: 0
        };
    }

    let matchedGuidelines = [];
    let retrievalLatency = 0;
    let retrievedChunksCount = 0;
    let retrievalSimilarityAvg = 0;

    let isFallback = false;
    let fallbackReason = null;
    let providerUsed = 'groq';
    let modelUsed = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let llmStart = 0;
    let llmLatency = 0;
    let reply = '';
    let suggestions = [];

    try {
        const context = await buildRAGContext(patientId, userQuery, targetLanguage);
        const { messages } = context;
        matchedGuidelines = context.matchedGuidelines || [];
        retrievalLatency = context.retrievalLatency || 0;
        retrievedChunksCount = context.matchedCount || 0;
        retrievalSimilarityAvg = context.similarityAvg || 0;

        llmStart = performance.now();
        const groqKey = process.env.GROQ_API_KEY;

        if (!groqKey) {
            throw new Error('GROQ_API_KEY is not configured');
        }

        console.log(`[PoC] Executing query against Groq (${modelUsed})...`);
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: modelUsed,
            messages: messages,
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        reply = response.data.choices[0].message?.content || '';
        promptTokens = response.data.usage?.prompt_tokens || 0;
        completionTokens = response.data.usage?.completion_tokens || 0;
        totalTokens = response.data.usage?.total_tokens || 0;
        llmLatency = Math.round(performance.now() - llmStart);

    } catch (err) {
        isFallback = true;
        fallbackReason = getFallbackReason(err);
        providerUsed = 'ollama';
        modelUsed = OLLAMA_MODEL;
        console.warn(`[PoC] Groq failed (Reason: ${fallbackReason}). Falling back to local Ollama...`);

        try {
            const context = await buildRAGContext(patientId, userQuery, targetLanguage);
            const { messages } = context;
            matchedGuidelines = context.matchedGuidelines || [];
            retrievalLatency = context.retrievalLatency || 0;
            retrievedChunksCount = context.matchedCount || 0;
            retrievalSimilarityAvg = context.similarityAvg || 0;

            llmStart = performance.now();
            const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
                model: OLLAMA_MODEL,
                messages: messages,
                stream: false
            }, { timeout: 30000 });

            reply = response.data.message?.content || '';
            llmLatency = Math.round(performance.now() - llmStart);

            promptTokens = Math.ceil(userQuery.length / 4);
            completionTokens = Math.ceil(reply.length / 4);
            totalTokens = promptTokens + completionTokens;

        } catch (ollamaErr) {
            console.error('[PoC] Ollama fallback failed:', ollamaErr.message);
            const fallbackMessage = "I'm having a little trouble connecting to my charts right now. Could you try asking me again in a moment?";

            try {
                await AIChatLog.create({
                    patient_id: patientId,
                    prompt: userQuery,
                    retrieved_chunks: matchedGuidelines,
                    response: fallbackMessage,
                    emergency_escalation_triggered: false,
                    translated_language: targetLanguage || 'en',
                    provider: 'ollama',
                    model: OLLAMA_MODEL,
                    is_fallback: true,
                    fallback_reason: `${fallbackReason}_then_${getFallbackReason(ollamaErr)}`,
                    llm_latency_ms: 0,
                    retrieval_latency_ms: retrievalLatency,
                    end_to_end_latency_ms: Math.round(performance.now() - requestStart),
                    streaming_first_token_ms: 0,
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                    retrieved_chunks_count: retrievedChunksCount,
                    retrieval_similarity_avg: retrievalSimilarityAvg
                });
            } catch (logErr) {
                console.error('[PoC] Chat log error on total failure:', logErr.message);
            }

            return {
                success: false,
                error: ollamaErr.message,
                response: fallbackMessage,
                suggestions: ["Try again", "Call Care Coordinator"]
            };
        }
    }

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

    try {
        await AIChatLog.create({
            patient_id: patientId,
            prompt: userQuery,
            retrieved_chunks: matchedGuidelines,
            response: reply,
            emergency_escalation_triggered: false,
            translated_language: targetLanguage || 'en',
            provider: providerUsed,
            model: modelUsed,
            is_fallback: isFallback,
            fallback_reason: fallbackReason,
            llm_latency_ms: llmLatency,
            retrieval_latency_ms: retrievalLatency,
            end_to_end_latency_ms: Math.round(performance.now() - requestStart),
            streaming_first_token_ms: 0,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            retrieved_chunks_count: retrievedChunksCount,
            retrieval_similarity_avg: retrievalSimilarityAvg
        });
    } catch (logErr) {
        console.error('[PoC] Successful chat log error:', logErr.message);
    }

    return {
        success: true,
        model: modelUsed,
        response: reply,
        suggestions,
        contextTokensEstimate: totalTokens
    };
}

module.exports = { generatePoCResponse, streamPoCResponse };
