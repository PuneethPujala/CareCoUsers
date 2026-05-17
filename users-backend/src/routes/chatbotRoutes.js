const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const { generatePoCResponse } = require('../services/aiChatbotPoC');
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
 * Accepts multipart/form-data.
 * - If `audio` is provided, proxies it to Python for transcription, then runs RAG.
 * - If `query` text is provided, runs RAG directly.
 */
router.post('/chat', authenticate, upload.single('audio'), async (req, res) => {
    try {
        const { targetLanguage, query } = req.body;
        
        // Use securely resolved MongoDB ID from the authentication token
        const patientId = req.auth?.userId;
        
        if (!patientId) {
            return res.status(401).json(buildErrorResponse('validation', 'User is not fully authenticated or profile is missing.'));
        }

        let extractedQuery = query;

        // 1. Audio Proxy Phase (STT)
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
                    console.log(`[ChatbotRoute] STT Success: "${extractedQuery}"`);
                } else {
                    return res.status(500).json(buildErrorResponse('transcription', 'Transcription failed or returned empty.'));
                }
            } catch (sttError) {
                console.error(`[ChatbotRoute] STT Proxy Error:`, sttError.message);
                return res.status(500).json(buildErrorResponse('transcription', 'Could not understand audio or STT service is down.'));
            }
        }

        // 2. RAG & Reasoning Phase
        if (!extractedQuery) {
            return res.status(400).json(buildErrorResponse('validation', 'Neither audio nor text query was provided.'));
        }

        console.log(`[ChatbotRoute] Running RAG pipeline for query: "${extractedQuery}"`);
        
        try {
            // Wait for Llama 3 Reasoning & Translation
            const result = await generatePoCResponse(patientId, extractedQuery, targetLanguage);
            
            if (!result.success) {
                return res.status(500).json(buildErrorResponse('reasoning', result.error || 'LLM inference failed.'));
            }

            // Return standardized success
            res.status(200).json({
                success: true,
                message: result.response,
                transcribedText: req.file ? extractedQuery : null, // Good for UI debugging
                contextTokensEstimate: result.contextTokensEstimate
            });

        } catch (ragError) {
            console.error(`[ChatbotRoute] RAG Error:`, ragError.message);
            return res.status(500).json(buildErrorResponse('reasoning', 'An error occurred during medical reasoning.'));
        }

    } catch (error) {
        console.error('Chatbot API Error:', error);
        res.status(500).json(buildErrorResponse('server', 'Internal server error during chat processing.'));
    }
});

module.exports = router;
