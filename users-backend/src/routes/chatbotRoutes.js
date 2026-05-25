const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const { generatePoCResponse, streamPoCResponse } = require('../services/aiChatbotPoC');
const { authenticate } = require('../middleware/authenticate'); 

const PYTHON_API = process.env.PYTHON_API || 'http://localhost:8000';

// Configure Multer for in-memory storage and strict filtering
const upload = multer({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/webm', 'audio/x-m4a', 'audio/aac'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Only audio files are allowed.`));
        }
    },
    storage: multer.memoryStorage()
});

// Helper to standardize errors
function buildErrorResponse(stage, errorMsg) {
    return {
        success: false,
        stage: stage,
        error: errorMsg
    };
}

/**
 * POST /api/chatbot/chat
 * SSE Streaming endpoint.
 * Accepts multipart/form-data.
 * - If `audio` is provided, proxies it to Python for transcription, then streams RAG.
 * - If `query` text is provided, streams RAG directly.
 * 
 * SSE Event Types:
 *   { type: "meta",        transcribedText: "..." }     — STT result (audio only)
 *   { type: "chunk",       text: "..." }                 — Token-by-token AI response
 *   { type: "suggestions", items: ["...", "...", "..."] } — Follow-up suggestion chips
 *   { type: "done" }                                      — Stream complete
 *   { type: "error",       message: "..." }               — Error during stream
 */
router.post('/chat', authenticate, upload.single('audio'), async (req, res) => {
    try {
        const { targetLanguage, query, patientId: bodyPatientId } = req.body;
        
        // Securely resolve patient context
        let patientId = req.auth?.userId;
        
        if (!patientId) {
            return res.status(401).json(buildErrorResponse('validation', 'User is not fully authenticated or profile is missing.'));
        }

        // Caregivers / Companions route patient lookup
        if (req.auth?.userType === 'Companion') {
            let resolvedPatientId = bodyPatientId;
            if (!resolvedPatientId) {
                const CompanionAccess = require('../models/CompanionAccess');
                const access = await CompanionAccess.findOne({ companion_id: req.auth.userId, is_active: true, status: 'accepted' });
                if (access) {
                    resolvedPatientId = access.patient_id;
                }
            }
            if (!resolvedPatientId) {
                return res.status(400).json(buildErrorResponse('validation', 'No linked patient found for this companion circle.'));
            }
            patientId = resolvedPatientId;
        }

        let extractedQuery = query;
        let transcribedText = null;

        // 1. Audio Proxy Phase (STT) — runs BEFORE we open the SSE stream
        if (req.file) {
            console.log(`[ChatbotRoute] Received audio file: ${req.file.originalname} (${req.file.mimetype})`);
            
            try {
                const internalForm = new FormData();
                internalForm.append('audio_file', req.file.buffer, {
                    filename: req.file.originalname || 'voice_note.m4a',
                    contentType: req.file.mimetype
                });

                console.log(`[ChatbotRoute] Proxying audio to Python STT Service...`);
                const sttResponse = await axios.post(`${PYTHON_API}/analyze-audio`, internalForm, {
                    headers: { ...internalForm.getHeaders() },
                    timeout: 30000 // 30 second timeout for Whisper
                });

                if (sttResponse.data && sttResponse.data.success && sttResponse.data.text) {
                    extractedQuery = sttResponse.data.text;
                    transcribedText = extractedQuery;
                    console.log(`[ChatbotRoute] STT Success: "${extractedQuery}"`);
                } else {
                    return res.status(500).json(buildErrorResponse('transcription', 'Transcription failed or returned empty.'));
                }
            } catch (sttError) {
                console.error(`[ChatbotRoute] STT Proxy Error:`, sttError.message);
                return res.status(500).json(buildErrorResponse('transcription', 'Could not understand audio or STT service is down.'));
            }
        }

        // 2. Validate query
        if (!extractedQuery) {
            return res.status(400).json(buildErrorResponse('validation', 'Neither audio nor text query was provided.'));
        }

        console.log(`[ChatbotRoute] Streaming RAG pipeline for query: "${extractedQuery}"`);

        // 3. Set SSE headers and begin streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering if behind proxy
        res.flushHeaders();

        // Handle client disconnect (abort / cancellation)
        let clientDisconnected = false;
        req.on('close', () => {
            clientDisconnected = true;
            console.log('[ChatbotRoute] Client disconnected, aborting stream.');
        });

        // 4. Stream the response
        await streamPoCResponse(patientId, extractedQuery, targetLanguage, res, transcribedText);

        // 5. Close the SSE stream
        if (!clientDisconnected) {
            res.end();
        }

    } catch (error) {
        console.error('Chatbot API Error:', error);
        // If headers haven't been sent yet, send a normal JSON error
        if (!res.headersSent) {
            res.status(500).json(buildErrorResponse('server', 'Internal server error during chat processing.'));
        } else {
            // Headers already sent (SSE mode), emit error event
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal server error.' })}\n\n`);
                res.end();
            } catch (e) {
                // Response already closed, ignore
            }
        }
    }
});

module.exports = router;
