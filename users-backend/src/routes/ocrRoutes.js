const express = require("express");
const router = express.Router();
const { extractPrescription } = require("../controllers/ocrController");
const { authenticate } = require("../middleware/authenticate");

/**
 * POST /api/ocr/extract
 * Extracts medications from a prescription image (base64) using a hybrid pipeline (Vision -> LLM structuring).
 */
router.post("/extract", authenticate, extractPrescription);

module.exports = router;
