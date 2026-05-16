"""
CareCall — Medical Call Audio Summarizer
FastAPI application with REST API endpoints.

Endpoints:
  GET  /health              — Health check
  POST /analyze-call        — Upload audio + optional CSV, returns job_id
  GET  /result/{job_id}     — Poll for job result
  GET  /results             — List all past results
"""

import uuid
import shutil
import tempfile
import traceback
from pathlib import Path
from typing import Optional, Union

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from database.db import init_db, create_job, update_job, get_job, get_all_jobs, get_job_count
from pipeline.preprocessor import preprocess_audio
from pipeline.transcriber import transcribe_audio
from pipeline.summarizer import summarize_transcript
from pipeline.medicine_detector import detect_medicines

# ─── App Setup ──────────────────────────────────────────────
app = FastAPI(
    title="CareCall — Medical Call Audio Summarizer",
    description="AI pipeline that transcribes medical call audio and produces structured summaries",
    version="1.0.0"
)

# CORS — allow admin app frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supported audio formats
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac", ".mp4"}

# Data directory
DATA_DIR = Path(__file__).parent / "data"
MEDICINES_CSV = DATA_DIR / "medicines.csv"


# ─── Startup ────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    """Initialize database on startup."""
    init_db()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print("[CareCall] Service started")
    print(f"[CareCall] Medicines CSV: {'Found' if MEDICINES_CSV.exists() else 'Not found'}")

# ─── Frontend UI ────────────────────────────────────────────
@app.get("/")
async def serve_ui():
    """Serve the frontend testing UI."""
    return FileResponse(Path(__file__).parent / "static" / "index.html")


# ─── Health Check ───────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Health check endpoint for admin app to verify service is running."""
    return {
        "status": "ok",
        "service": "carecall",
        "medicines_loaded": MEDICINES_CSV.exists(),
        "total_jobs": get_job_count()
    }


# ─── Analyze Call ───────────────────────────────────────────
@app.post("/analyze-call")
async def analyze_call(
    request: Request,
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = File(...)
):
    """
    Upload an audio file for analysis.
    Returns a job_id immediately. Poll /result/{job_id} for the result.

    - audio_file: Audio file (MP3, WAV, M4A, OGG) — required
    - medicines_csv: Medicines CSV file — optional (only needed first time)
    """
    # Validate audio file extension
    file_ext = Path(audio_file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {file_ext}. Supported: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Generate job ID
    job_id = str(uuid.uuid4())

    # Save uploaded audio to temp location
    temp_dir = Path(tempfile.mkdtemp(prefix=f"carecall_{job_id}_"))
    audio_path = temp_dir / f"input{file_ext}"

    try:
        with open(audio_path, "wb") as f:
            content = await audio_file.read()
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save audio file: {e}")

    # Save medicines CSV if provided
    form = await request.form()
    medicines_csv = form.get("medicines_csv")
    if medicines_csv and hasattr(medicines_csv, "filename") and medicines_csv.filename:
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            with open(MEDICINES_CSV, "wb") as f:
                csv_content = await medicines_csv.read()
                f.write(csv_content)
            print(f"[CareCall] Medicines CSV updated: {MEDICINES_CSV}")
        except Exception as e:
            print(f"[CareCall] Warning: Failed to save medicines CSV: {e}")

    # Create job in database
    create_job(job_id, audio_file.filename)

    # Run pipeline in background
    background_tasks.add_task(run_pipeline, job_id, audio_path, temp_dir)

    return {
        "job_id": job_id,
        "status": "processing",
        "message": "Audio file received. Processing started.",
        "poll_url": f"/result/{job_id}"
    }

# ─── Chatbot STT Endpoint (Phase 0) ─────────────────────────
@app.post("/analyze-audio")
async def analyze_audio(audio_file: UploadFile = File(...)):
    """
    Endpoint for Phase 0 Chatbot PoC.
    Receives Telugu/Kannada audio, runs STT using faster-whisper, and returns English text.
    """
    ext = Path(audio_file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file extension: {ext}")

    try:
        # Save uploaded file to a temp directory
        temp_dir = Path(tempfile.mkdtemp(prefix="chatbot_audio_"))
        audio_path = temp_dir / audio_file.filename
        
        with open(audio_path, "wb") as f:
            content = await audio_file.read()
            f.write(content)

        print(f"[Chatbot] Received audio: {audio_file.filename}")

        # Preprocess and Transcribe
        processed_path = preprocess_audio(audio_path)
        english_transcript = transcribe_audio(processed_path)

        # Clean up
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except Exception:
            pass

        return {
            "success": True,
            "text": english_transcript
        }
    except Exception as e:
        print(f"[Chatbot API] Error: {e}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

# ─── Get Result ─────────────────────────────────────────────
@app.get("/result/{job_id}")
async def get_result(job_id: str):
    """
    Get the result of a call analysis job.
    Returns status and result when completed.
    """
    job = get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")

    if job["status"] == "processing":
        return {
            "job_id": job_id,
            "status": "processing",
            "message": "Still processing. Please poll again."
        }

    if job["status"] == "failed":
        return {
            "job_id": job_id,
            "status": "failed",
            "error": job.get("error_message", "Unknown error")
        }

    # Status is "completed"
    return {
        "job_id": job_id,
        "status": "completed",
        "result": job.get("result_json", {})
    }


# ─── List All Results ───────────────────────────────────────
@app.get("/results")
async def list_results(limit: int = 50, offset: int = 0):
    """
    List all past call analysis results.
    Used by admin app to fetch summaries.
    """
    jobs = get_all_jobs(limit=limit, offset=offset)
    total = get_job_count()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": jobs
    }


# ─── Pipeline Runner ────────────────────────────────────────
def run_pipeline(job_id: str, audio_path: Path, temp_dir: Path):
    """
    Run the full analysis pipeline sequentially.
    Each step loads its model, runs, then frees memory.
    """
    try:
        print(f"\n{'='*60}")
        print(f"[Pipeline] Starting job: {job_id}")
        print(f"{'='*60}")

        # ── Step 1: Audio Preprocessing ──
        print("\n[Pipeline] Step 1/5: Audio Preprocessing")
        cleaned_audio = preprocess_audio(audio_path, temp_dir)
        print("[Pipeline] Step 1 complete")

        # ── Step 2: Speech to Text ──
        print("\n[Pipeline] Step 2/5: Speech to Text")
        transcript = transcribe_audio(cleaned_audio)
        print(f"[Pipeline] Step 2 complete ({len(transcript)} chars)")

        # ── Step 3: Summarization ──
        print("\n[Pipeline] Step 3/5: Summarization via Ollama")
        summary = summarize_transcript(transcript)
        print("[Pipeline] Step 3 complete")

        # ── Step 4: Medicine Detection ──
        print("\n[Pipeline] Step 4/5: Medicine Detection")
        csv_path = MEDICINES_CSV if MEDICINES_CSV.exists() else None
        medicines = detect_medicines(transcript, csv_path) if csv_path else []
        print(f"[Pipeline] Step 4 complete ({len(medicines)} medicines found)")

        # ── Step 5: Combine Results ──
        print("\n[Pipeline] Step 5/5: Combining Results")

        # Generate quick summary
        quick_summary = generate_quick_summary(summary)

        final_result = {
            "transcript": transcript,
            "summary": summary,
            "medicines_detected": medicines,
            "quick_summary": quick_summary
        }

        # Store result in database
        update_job(job_id, "completed", result=final_result)
        print(f"\n[Pipeline] Job {job_id} COMPLETED")
        print(f"{'='*60}\n")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"\n[Pipeline] Job {job_id} FAILED: {error_msg}")
        traceback.print_exc()
        update_job(job_id, "failed", error=error_msg)

    finally:
        # Cleanup temp files
        try:
            if temp_dir.exists():
                shutil.rmtree(str(temp_dir), ignore_errors=True)
                print(f"[Pipeline] Cleaned up temp dir: {temp_dir}")
        except Exception:
            pass


def generate_quick_summary(summary: dict) -> str:
    """Generate a 2-3 line plain English quick summary from the structured summary."""
    skip_values = {"Not mentioned", "Not mentioned in transcript", "Not available", ""}
    parts = []

    overview = summary.get("call_overview", "")
    if isinstance(overview, list):
        overview = ". ".join(str(item) for item in overview)
    overview = str(overview)
    if overview and overview not in skip_values:
        parts.append(overview)

    key_points = summary.get("key_points", "")
    if isinstance(key_points, list):
        key_points = ". ".join(str(item) for item in key_points)
    key_points = str(key_points)
    if key_points and key_points not in skip_values:
        if len(key_points) > 150:
            key_points = key_points[:150].rsplit(" ", 1)[0] + "."
        parts.append(key_points)

    follow_up = summary.get("follow_up_reason", "")
    if isinstance(follow_up, list):
        follow_up = ". ".join(str(item) for item in follow_up)
    follow_up = str(follow_up)
    if summary.get("follow_up_required") and follow_up and follow_up not in skip_values:
        parts.append(f"Follow-up needed: {follow_up}")

    if not parts:
        return "Call summary could not be generated."

    return " ".join(parts[:3])


# ─── Run with uvicorn ───────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
