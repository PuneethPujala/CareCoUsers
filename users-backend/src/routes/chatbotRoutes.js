const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const { streamPoCResponse } = require('../services/aiChatbotPoC');
const { authenticate } = require('../middleware/authenticate');
const {
  aiChatRateLimiter,
  aiChatIpRateLimiter,
  aiChatPatientRateLimiter,
  aiChatSessionRateLimiter,
} = require('../middleware/rateLimiter');
const AuditLog = require('../models/AuditLog');
const emergencyConfig = require('../config/emergency_phrases.json');
const AIChatSession = require('../models/AIChatSession');


// Configure Multer for in-memory storage and strict filtering (audio + image attachments)
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedAudio = [
      'audio/m4a',
      'audio/mp4',
      'audio/mpeg',
      'audio/webm',
      'audio/x-m4a',
      'audio/aac',
      'audio/wav',
      'audio/x-wav',
      'audio/3gp',
      'audio/caf',
      'application/octet-stream',
    ];
    const allowedImages = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ];
    if (allowedAudio.includes(file.mimetype) || allowedImages.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type: ${file.mimetype}. Allowed: audio (m4a, mp3, aac) and images (jpeg, png, webp).`
        )
      );
    }
  },
  storage: multer.memoryStorage(),
});

// Helper to standardize errors
function buildErrorResponse(stage, errorMsg) {
  return {
    success: false,
    stage: stage,
    error: errorMsg,
  };
}

// Helper to resolve patient ID for a request
async function getPatientId(req, bodyPatientId) {
  if (req.auth?.userType === 'Patient') {
    return req.auth.userId;
  }
  if (req.auth?.userType === 'Companion') {
    let resolvedPatientId = bodyPatientId || req.query.patientId;
    if (!resolvedPatientId) {
      const CompanionAccess = require('../models/CompanionAccess');
      const access = await CompanionAccess.findOne({
        companion_id: req.auth.userId,
        is_active: true,
        status: 'accepted',
      });
      if (access) {
        resolvedPatientId = access.patient_id;
      }
    }
    return resolvedPatientId;
  }
  return null;
}

/**
 * GET /api/chatbot/sessions
 * List active sessions for the patient (sorted by updatedAt desc)
 */
router.get(
  '/sessions',
  authenticate,
  aiChatSessionRateLimiter,
  async (req, res) => {
    try {
      const patientId = await getPatientId(req);
      if (!patientId) {
        return res.status(400).json({ error: 'Patient context not found.' });
      }

      const sessions = await AIChatSession.find({
        patient_id: patientId,
        is_active: true,
      })
        .select('-messages')
        .sort({ updated_at: -1 });

      res.json(sessions);
    } catch (err) {
      console.error('[ChatbotRoutes] Get sessions error:', err);
      res.status(500).json({ error: 'Failed to fetch chat sessions.' });
    }
  }
);

/**
 * POST /api/chatbot/sessions
 * Create a new chat session (limit 10 concurrent active sessions)
 */
router.post(
  '/sessions',
  authenticate,
  aiChatSessionRateLimiter,
  async (req, res) => {
    try {
      const patientId = await getPatientId(req, req.body.patientId);
      if (!patientId) {
        return res.status(400).json({ error: 'Patient context not found.' });
      }

      const activeCount = await AIChatSession.countDocuments({
        patient_id: patientId,
        is_active: true,
      });
      if (activeCount >= 10) {
        return res.status(400).json({
          error:
            'Limit reached: You can have at most 10 active chats. Please delete some chats first.',
        });
      }

      const disclaimer = {
        role: 'assistant',
        text: 'CareMyMed AI provides educational guidance and assistance. It does not replace a licensed medical professional. For emergencies, contact emergency services or your healthcare provider immediately.',
        timestamp: new Date(),
      };

      const newSession = await AIChatSession.create({
        patient_id: patientId,
        title: 'New Chat',
        is_active: true,
        is_generating: false,
        message_count: 1,
        messages: [disclaimer],
      });

      res.status(201).json(newSession);
    } catch (err) {
      console.error('[ChatbotRoutes] Create session error:', err);
      res.status(500).json({ error: 'Failed to create chat session.' });
    }
  }
);

/**
 * GET /api/chatbot/sessions/:id
 * Get details of a single session
 */
router.get('/sessions/:id', authenticate, async (req, res) => {
  try {
    const patientId = await getPatientId(req);
    if (!patientId) {
      return res.status(400).json({ error: 'Patient context not found.' });
    }

    const session = await AIChatSession.findOne({
      _id: req.params.id,
      patient_id: patientId,
      is_active: true,
    });
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found.' });
    }

    res.json(session);
  } catch (err) {
    console.error('[ChatbotRoutes] Get session details error:', err);
    res.status(500).json({ error: 'Failed to fetch chat session details.' });
  }
});

/**
 * DELETE /api/chatbot/sessions/:id
 * Soft delete a chat session
 */
router.delete(
  '/sessions/:id',
  authenticate,
  aiChatSessionRateLimiter,
  async (req, res) => {
    try {
      const patientId = await getPatientId(req);
      if (!patientId) {
        return res.status(400).json({ error: 'Patient context not found.' });
      }

      const result = await AIChatSession.updateOne(
        { _id: req.params.id, patient_id: patientId, is_active: true },
        { $set: { is_active: false } }
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .json({ error: 'Chat session not found or already deleted.' });
      }

      res.json({
        success: true,
        message: 'Chat session deleted successfully.',
      });
    } catch (err) {
      console.error('[ChatbotRoutes] Delete session error:', err);
      res.status(500).json({ error: 'Failed to delete chat session.' });
    }
  }
);

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
router.post(
  '/chat',
  authenticate,
  aiChatRateLimiter,
  aiChatIpRateLimiter,
  aiChatPatientRateLimiter,
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]),
  async (req, res) => {
    let patientId = null;
    let sessionId = req.body.sessionId;

    try {
      const { targetLanguage, query, audioDuration, patientId: bodyPatientId } = req.body;

      // Securely resolve patient context
      patientId = await getPatientId(req, bodyPatientId);

      if (!patientId) {
        return res
          .status(401)
          .json(
            buildErrorResponse(
              'validation',
              'User is not fully authenticated or profile is missing.'
            )
          );
      }

      const audioFile = req.files?.audio?.[0] || (req.file?.fieldname === 'audio' ? req.file : null);
      const imageFile = req.files?.image?.[0] || (req.file?.fieldname === 'image' ? req.file : null);

      let extractedQuery = (query || '').trim();
      let transcribedText = null;

      // 1. Audio Processing Phase (Groq Whisper STT)
      if (audioFile) {
        console.log(
          `[ChatbotRoute] Processing audio file with Groq Whisper: ${audioFile.originalname} (${audioFile.mimetype}, ${audioFile.size || 0} bytes)`
        );

        if (process.env.GROQ_API_KEY) {
          try {
            const groqForm = new FormData();
            groqForm.append('file', audioFile.buffer, {
              filename: 'voice_note.m4a',
              contentType: 'audio/m4a',
            });
            groqForm.append('model', 'whisper-large-v3-turbo');

            const groqRes = await axios.post(
              'https://api.groq.com/openai/v1/audio/transcriptions',
              groqForm,
              {
                headers: {
                  ...groqForm.getHeaders(),
                  Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                },
                timeout: 25000,
              }
            );

            if (groqRes.data && groqRes.data.text) {
              transcribedText = groqRes.data.text.trim();
              console.log(`[ChatbotRoute] Groq Whisper STT Success: "${transcribedText}"`);
            }
          } catch (groqErr) {
            console.error(`[ChatbotRoute] Groq Whisper STT Error:`, groqErr.response?.data || groqErr.message);
          }
        }

        // Combine text query & audio transcription safely
        if (transcribedText) {
          if (extractedQuery) {
            extractedQuery = `${extractedQuery}\n[Voice Note Transcribed: "${transcribedText}"]`;
          } else {
            extractedQuery = transcribedText;
          }
        } else if (!extractedQuery) {
          return res
            .status(500)
            .json(
              buildErrorResponse(
                'transcription',
                'Could not understand audio or STT service is down. Please try again or type your message.'
              )
            );
        }
      }

      // 2. Vision AI / Image Attachment Phase
      if (imageFile) {
        console.log(
          `[ChatbotRoute] Received image attachment: ${imageFile.originalname} (${imageFile.mimetype}, ${imageFile.size} bytes)`
        );

        let visionContextText = `[ATTACHED IMAGE]: ${imageFile.originalname}`;
        let visionProcessed = false;
        let visionError = null;

        const googleVisionKey = process.env.GOOGLE_VISION_API_KEY;
        const groqApiKey = process.env.GROQ_API_KEY;
        const groqVisionModel = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';

        if (imageFile.buffer) {
          const base64Content = imageFile.buffer.toString('base64');
          const mimeType = imageFile.mimetype || 'image/jpeg';

          // Try 1: Google Vision API (if key available)
          if (googleVisionKey) {
            try {
              const gvResponse = await axios.post(
                `https://vision.googleapis.com/v1/images:annotate?key=${googleVisionKey}`,
                {
                  requests: [
                    {
                      image: { content: base64Content },
                      features: [
                        { type: 'DOCUMENT_TEXT_DETECTION' },
                        { type: 'TEXT_DETECTION' }
                      ],
                    },
                  ],
                },
                { timeout: 8000 }
              );
              const extractedRaw =
                gvResponse.data.responses?.[0]?.fullTextAnnotation?.text ||
                gvResponse.data.responses?.[0]?.textAnnotations?.[0]?.description ||
                '';
              if (extractedRaw.trim()) {
                visionContextText = `[EXTRACTED TEXT FROM IMAGE]:\n${extractedRaw.trim()}`;
                visionProcessed = true;
              }
            } catch (ocrErr) {
              visionError = ocrErr;
              console.warn('[ChatbotRoute] Google Vision OCR warning:', ocrErr.message);
            }
          }

          // Try 2: Groq Vision API (with multi-model fallback chain)
          if (!visionProcessed && groqApiKey) {
            const visionCandidates = Array.from(
              new Set([
                groqVisionModel,
                'llama-3.2-11b-vision-preview',
                'llama-3.2-90b-vision-preview',
                'qwen/qwen3.6-27b',
              ])
            );

            for (const modelCandidate of visionCandidates) {
              if (visionProcessed) break;
              try {
                const groqVisionRes = await axios.post(
                  'https://api.groq.com/openai/v1/chat/completions',
                  {
                    model: modelCandidate,
                    messages: [
                      {
                        role: 'user',
                        content: [
                          {
                            type: 'text',
                            text: 'Analyze this medical/medication image carefully and accurately. Perform detailed OCR and extract: 1. Brand name (e.g. Bidical 500, Metformin), 2. Generic ingredients (e.g. Calcium, Vitamin D3), 3. Dosage strength (e.g. 500mg), 4. Manufacturer, 5. All readable label text. Be precise and clear.',
                          },
                          {
                            type: 'image_url',
                            image_url: {
                              url: `data:${mimeType};base64,${base64Content}`,
                            },
                          },
                        ],
                      },
                    ],
                    temperature: 0.1,
                    max_tokens: 600,
                  },
                  {
                    headers: {
                      Authorization: `Bearer ${groqApiKey}`,
                      'Content-Type': 'application/json',
                    },
                    timeout: 15000,
                  }
                );

                const visionAnalysis =
                  groqVisionRes.data.choices?.[0]?.message?.content;
                if (visionAnalysis && visionAnalysis.trim()) {
                  visionContextText = `[GROQ VISION IMAGE ANALYSIS & TRANSCRIBED CONTENT]:\n${visionAnalysis.trim()}`;
                  visionProcessed = true;
                  console.log(`[ChatbotRoute] Groq Vision succeeded with model: ${modelCandidate}`);
                }
              } catch (groqVisionErr) {
                visionError = groqVisionErr;
                console.warn(
                  `[ChatbotRoute] Groq Vision AI warning (${modelCandidate}):`,
                  groqVisionErr?.response?.data || groqVisionErr.message
                );
              }
            }
          }
        }

        // If vision analysis was not available from cloud OCR, inform the LLM of the image upload gracefully
        if (!visionProcessed) {
          visionContextText = `[IMAGE ATTACHMENT]: The user attached an image of a medication packaging/box/report. Acknowledge that they attached a photo, and ask them to share the medicine name or dosage if they need specific instructions, or explain general medication guidance.`;
        }

        const userCaption = extractedQuery;
        // Validate user-supplied caption length
        if (userCaption && typeof userCaption === 'string' && userCaption.length > 1000) {
          return res
            .status(400)
            .json(
              buildErrorResponse(
                'validation',
                'User query exceeds the limit of 1000 characters.'
              )
            );
        }

        const structuredContext = [
          `[USER ATTACHED IMAGE]`,
          `${visionContextText}`,
          `User Question / Caption: ${userCaption || 'What does this image say or show?'}`
        ].join('\n\n');

        extractedQuery = structuredContext;
      }

      // 3. Validate query
      if (!extractedQuery) {
        return res
          .status(400)
          .json(
            buildErrorResponse(
              'validation',
              'Neither audio, image, nor text query was provided.'
            )
          );
      }

      // Query length check (anti-abuse: 1000 chars for text only, up to 25000 for image OCR context)
      const maxAllowedLength = imageFile ? 25000 : 1000;
      if (extractedQuery.length > maxAllowedLength) {
        return res
          .status(400)
          .json(
            buildErrorResponse(
              'validation',
              `Query exceeds the limit of ${maxAllowedLength} characters.`
            )
          );
      }

      // Server-Side Emergency Filter
      const lowercaseQuery = extractedQuery.toLowerCase();
      const matchedPhrase = emergencyConfig.emergency_phrases.find((phrase) =>
        lowercaseQuery.includes(phrase)
      );
      if (matchedPhrase) {
        console.warn(
          `[ChatbotRoute] Emergency detected (matched phrase: "${matchedPhrase}"). Intercepting and alerting.`
        );

        // Log security and safety incident to AuditLog
        try {
          const mongoose = require('mongoose');
          await AuditLog.createLog({
            supabaseUid: req.auth?.userId || 'unknown_patient',
            action: 'emergency_warning_triggered',
            resourceType: 'patient',
            resourceId: patientId
              ? new mongoose.Types.ObjectId(patientId)
              : undefined,
            outcome: 'success',
            dataClassification: 'restricted',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            details: {
              query: extractedQuery,
              matchedPhrase,
            },
          });
        } catch (auditError) {
          console.error(
            '[ChatbotRoute] Failed to write emergency audit log:',
            auditError.message
          );
        }

        // Immediately start SSE and write emergency response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        if (transcribedText) {
          res.write(
            `data: ${JSON.stringify({ type: 'meta', transcribedText })}\n\n`
          );
        }

        const warningMsg =
          '🚨 **Emergency Alert**\n\nIf you are experiencing severe symptoms like **chest pain, severe dizziness, loss of consciousness, fainting, stroke symptoms, seizure, uncontrolled bleeding, difficulty breathing, or a hypertensive crisis**, please call emergency services immediately.\n\nOur CareMyMed coordinators are dedicated to regular health check-ins and care plans, but **they are not emergency first responders**.';
        res.write(
          `data: ${JSON.stringify({ type: 'chunk', text: warningMsg })}\n\n`
        );
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        return;
      }

      // 3. Resolve Session history and Concurrency lock
      let historyMessages = [];
      if (sessionId) {
        const session = await AIChatSession.findOne({
          _id: sessionId,
          patient_id: patientId,
          is_active: true,
        });
        if (!session) {
          return res
            .status(404)
            .json(buildErrorResponse('validation', 'Chat session not found.'));
        }
        if (session.is_generating) {
          return res
            .status(409)
            .json(
              buildErrorResponse(
                'concurrency',
                'Please wait for the current response to finish before sending another message.'
              )
            );
        }

        // Apply lock
        session.is_generating = true;
        await session.save();

        // Load last 10 messages for memory (excluding system disclaimers if needed, but we pass all)
        const lastMessages = session.messages.slice(-10);
        historyMessages = lastMessages.map((m) => ({
          role: m.role,
          content: m.text,
        }));
        let savedImageUri = undefined;
        let savedAttachments = [];
        if (imageFile && imageFile.buffer) {
          const mime = imageFile.mimetype || 'image/jpeg';
          const path = require('path');
          const fs = require('fs');
          const fileExt = imageFile.originalname
            ? path.extname(imageFile.originalname)
            : '.jpg';
          const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const filename = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${fileExt || '.jpg'}`;
          const uploadsDir = path.resolve(__dirname, '../../uploads/chat_attachments');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          const filepath = path.join(uploadsDir, filename);
          fs.writeFileSync(filepath, imageFile.buffer);

          const publicUrl = `/api/chatbot/attachments/${attachmentId}`;
          savedImageUri = publicUrl;
          savedAttachments = [
            {
              attachmentId,
              type: 'image',
              url: publicUrl,
              mimeType: mime,
              fileName: imageFile.originalname || filename,
              storagePath: filename,
            },
          ];
        }

        const userDisplayQuery =
          req.body.query && req.body.query.trim().length > 0
            ? req.body.query.trim()
            : imageFile
              ? 'Uploaded an image'
              : extractedQuery;

        // Append user query to database
        session.messages.push({
          role: 'user',
          text: userDisplayQuery,
          image: savedImageUri,
          attachments: savedAttachments,
          audioDuration: audioDuration ? Number(audioDuration) : undefined,
          timestamp: new Date(),
        });

        // Auto-generate title from first message if it's default 'New Chat'
        if (session.title === 'New Chat') {
          session.title =
            userDisplayQuery.substring(0, 40) +
            (userDisplayQuery.length > 40 ? '...' : '');
        }

        session.message_count = session.messages.length;
        await session.save();
      }

      console.log(
        `[ChatbotRoute] Streaming RAG pipeline for query: "${extractedQuery}"`
      );

      // 4. Set SSE headers and begin streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering if behind proxy
      res.flushHeaders();

      // Handle client disconnect (abort / cancellation)
      let clientDisconnected = false;
      res.on('close', () => {
        clientDisconnected = true;
        console.log('[ChatbotRoute] Client disconnected, aborting stream.');
      });

      // 5. Stream the response
      await streamPoCResponse(
        patientId,
        extractedQuery,
        targetLanguage,
        res,
        transcribedText,
        sessionId,
        historyMessages
      );

      // 6. Close the SSE stream
      if (!clientDisconnected) {
        res.end();
      }
    } catch (error) {
      console.error('Chatbot API Error:', error);
      // If headers haven't been sent yet, send a normal JSON error
      if (!res.headersSent) {
        res
          .status(500)
          .json(
            buildErrorResponse(
              'server',
              'Internal server error during chat processing.'
            )
          );
      } else {
        // Headers already sent (SSE mode), emit error event
        try {
          res.write(
            `data: ${JSON.stringify({ type: 'error', message: 'Internal server error.' })}\n\n`
          );
          res.end();
        } catch (e) {
          // Response already closed, ignore
        }
      }
    } finally {
      // 7. Ensure Lock Release
      if (sessionId && patientId) {
        try {
          await AIChatSession.updateOne(
            { _id: sessionId, patient_id: patientId },
            { $set: { is_generating: false } }
          );
        } catch (lockErr) {
          console.error(
            '[ChatbotRoute] Failed to release generating lock:',
            lockErr.message
          );
        }
      }
    }
  }
);

/**
 * GET /api/chatbot/attachments/:attachmentId
 * Authenticated attachment download endpoint.
 * Validates token via `authenticate` middleware, verifies session ownership,
 * enforces strict path traversal protection, and serves file bytes.
 */
router.get('/attachments/:attachmentId', authenticate, async (req, res) => {
  try {
    const patientId = await getPatientId(req);
    if (!patientId) {
      return res.status(400).json({ error: 'Patient context not found.' });
    }

    const rawId = req.params.attachmentId;
    if (!rawId || typeof rawId !== 'string') {
      return res.status(400).json({ error: 'Invalid attachment ID.' });
    }

    const path = require('path');
    const fs = require('fs');

    // Path traversal check on requested identifier
    const sanitizedId = path.basename(rawId);
    if (sanitizedId !== rawId || rawId.includes('..')) {
      return res.status(400).json({ error: 'Invalid attachment request path.' });
    }

    // Find active or past session belonging to patientId containing this attachmentId or filename
    const session = await AIChatSession.findOne({
      patient_id: patientId,
      $or: [
        { 'messages.attachments.attachmentId': sanitizedId },
        { 'messages.attachments.url': { $regex: sanitizedId } },
        { 'messages.attachments.storagePath': sanitizedId },
        { 'messages.image': { $regex: sanitizedId } },
      ],
    });

    if (!session) {
      return res.status(404).json({ error: 'Attachment not found or access denied.' });
    }

    // Locate the matching attachment object from session messages
    let storageFileName = null;
    for (const msg of session.messages) {
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (
            att.attachmentId === sanitizedId ||
            att.storagePath === sanitizedId ||
            (att.url && att.url.includes(sanitizedId))
          ) {
            storageFileName = att.storagePath || (att.url ? path.basename(att.url) : null);
            break;
          }
        }
      }
      if (!storageFileName && msg.image && msg.image.includes(sanitizedId)) {
        storageFileName = path.basename(msg.image);
      }
      if (storageFileName) break;
    }

    if (!storageFileName) {
      storageFileName = sanitizedId;
    }

    const safeFilename = path.basename(storageFileName);
    const canonicalDir = path.resolve(__dirname, '../../uploads/chat_attachments');
    const legacyDir = path.resolve(__dirname, '../uploads/chat_attachments');
    
    let targetPath = path.resolve(canonicalDir, safeFilename);
    if (!fs.existsSync(targetPath)) {
      const legacyPath = path.resolve(legacyDir, safeFilename);
      if (fs.existsSync(legacyPath)) {
        targetPath = legacyPath;
      }
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Attachment file does not exist on disk.' });
    }

    return res.sendFile(targetPath);
  } catch (err) {
    console.error('[ChatbotRoutes] Attachment fetch error:', err);
    return res.status(500).json({ error: 'Failed to retrieve attachment.' });
  }
});

module.exports = router;
