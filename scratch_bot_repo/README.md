# CareCall — Medical Call Audio Summarizer

A fully offline AI pipeline that takes recorded medical call audio and produces structured summaries with medicine detection. Built as a FastAPI microservice for integration with admin applications.

## Features

- **Speech-to-Text**: Multilingual transcription using faster-whisper (English, Hindi, Telugu, Kannada, Tamil, Marathi, Hinglish)
- **AI Summarization**: Structured call summaries via Ollama (Mistral 7B) running locally
- **Medicine Detection**: Fuzzy matching against 225K+ medicines dataset using RapidFuzz
- **Async Processing**: Upload audio, get job ID, poll for results
- **SQLite Storage**: All results stored locally for admin app queries
- **Fully Offline**: No external APIs required after initial setup

## Prerequisites

- **Python 3.10+** — [Download](https://python.org)
- **Ollama** — [Download for Windows](https://ollama.com/download)
- **16GB RAM** minimum

## Quick Start

### 1. Setup Environment

Double-click `setup.bat` or run manually:

```bat
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Setup Ollama

1. Download and install Ollama from [ollama.com](https://ollama.com/download)
2. Open a terminal and pull the model:

```bash
ollama pull mistral:7b-instruct-q4_K_M
```

> Ollama runs as a background service automatically on Windows — no manual server start needed.

### 3. Start the Server

```bash
venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "service": "carecall",
  "medicines_loaded": true,
  "total_jobs": 5
}
```

### Analyze Call

```
POST /analyze-call
Content-Type: multipart/form-data
```

Parameters:
- `audio_file` (required) — Audio file (MP3, WAV, M4A, OGG)
- `medicines_csv` (optional) — Medicines CSV file (only needed first time to update dataset)

Response:
```json
{
  "job_id": "abc123-...",
  "status": "processing",
  "message": "Audio file received. Processing started.",
  "poll_url": "/result/abc123-..."
}
```

Example with curl:
```bash
curl -X POST http://localhost:8000/analyze-call \
  -F "audio_file=@call_recording.mp3"
```

### Get Result

```
GET /result/{job_id}
```

Response (completed):
```json
{
  "job_id": "abc123-...",
  "status": "completed",
  "result": {
    "transcript": "Full conversation with [Caretaker] and [Patient] labels",
    "summary": {
      "call_overview": "...",
      "key_points": "...",
      "action_items": "...",
      "medicine_reminders": "...",
      "patient_health_notes": "...",
      "follow_up_required": true,
      "follow_up_reason": "..."
    },
    "medicines_detected": [
      {
        "name": "Paracetamol",
        "highlighted": true,
        "uses": "Treatment of fever and pain",
        "side_effects": "Nausea, Rash"
      }
    ],
    "quick_summary": "2-3 line plain English summary"
  }
}
```

### List All Results

```
GET /results?limit=50&offset=0
```

Returns all past job results (for admin app integration).

## Admin App Integration

This service is designed to be plugged into your admin app (React Native + Express + Node):

1. **From Express backend**, call `POST http://localhost:8000/analyze-call` to submit audio
2. **Poll** `GET http://localhost:8000/result/{job_id}` for completed results
3. **Sync results** from `GET http://localhost:8000/results` into your admin app's database
4. **CORS is enabled** — the admin app frontend can call this API directly
5. **Health check** — use `GET /health` to verify the service is running

### Example Express Integration

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Submit audio for analysis
async function analyzeCall(audioFilePath) {
  const form = new FormData();
  form.append('audio_file', fs.createReadStream(audioFilePath));

  const response = await axios.post(
    'http://localhost:8000/analyze-call',
    form,
    { headers: form.getHeaders() }
  );
  return response.data.job_id;
}

// Poll for result
async function getResult(jobId) {
  const response = await axios.get(`http://localhost:8000/result/${jobId}`);
  return response.data;
}
```

## Project Structure

```
CAREMYMED/
├── main.py                  ← FastAPI app, endpoints
├── pipeline/
│   ├── preprocessor.py      ← Audio cleaning and conversion
│   ├── transcriber.py       ← faster-whisper transcription
│   ├── summarizer.py        ← Ollama summarization
│   └── medicine_detector.py ← RapidFuzz medicine matching
├── database/
│   └── db.py                ← SQLite storage for call results
├── data/
│   └── medicines.csv        ← Medicine dataset (225K+ entries)
├── prompts/
│   └── summary_prompt.txt   ← LLM prompt template
├── requirements.txt
├── setup.bat
└── README.md
```

## Memory Management

The pipeline runs sequentially to stay within 16GB RAM:

1. **Preprocess** → load audio, clean, save → free memory
2. **Transcribe** → load whisper model, transcribe → unload model, free memory
3. **Summarize** → HTTP call to Ollama (separate process) → no cleanup needed
4. **Detect Medicines** → load CSV, match → free memory

Peak usage: ~4-5GB during whisper transcription.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Cannot connect to Ollama` | Ensure Ollama is running: open terminal, run `ollama serve` |
| `Model not found` | Run `ollama pull mistral:7b-instruct-q4_K_M` |
| `Out of memory` | Close other applications; the pipeline needs ~5GB free RAM |
| `FFmpeg error` | The `imageio-ffmpeg` package includes ffmpeg — no manual setup needed |
| `Slow transcription` | Normal on CPU — medium model takes 2-5 minutes for a 10-minute call |
