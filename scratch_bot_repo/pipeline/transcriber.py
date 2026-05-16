"""
Speech-to-Text Transcription Module
Uses faster-whisper (medium model, int8) for offline multilingual transcription.
Supports: English, Hindi, Telugu, Kannada, Tamil, Marathi, Hinglish.
"""

import gc
import ctypes
from pathlib import Path


def free_memory():
    """Free RAM aggressively on Windows."""
    gc.collect()
    try:
        kernel32 = ctypes.windll.kernel32
        kernel32.SetProcessWorkingSetSize(
            kernel32.GetCurrentProcess(), ctypes.c_size_t(-1), ctypes.c_size_t(-1)
        )
    except Exception:
        pass


def transcribe_audio(audio_path: Path) -> str:
    """
    Transcribe audio file to text using faster-whisper medium model.

    Uses int8 compute type for CPU efficiency on 16GB RAM systems.
    Auto-detects language. Adds speaker labels based on pause heuristics.

    Args:
        audio_path: Path to preprocessed 16kHz mono WAV file

    Returns:
        Full transcript string with [Caretaker] and [Patient] speaker labels
    """
    from faster_whisper import WhisperModel

    print("[Transcriber] Loading faster-whisper medium model (int8)...")
    model = WhisperModel(
        "medium",
        device="cpu",
        compute_type="int8",
        download_root=str(Path(__file__).parent.parent / "models")
    )
    print("[Transcriber] Model loaded successfully")

    print(f"[Transcriber] Transcribing and Translating to English: {audio_path.name}")
    segments, info = model.transcribe(
        str(audio_path),
        task="translate", # Forces Whisper to output English regardless of input language
        beam_size=5,
        language=None,  # Auto-detect language
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200
        )
    )

    detected_lang = info.language
    lang_prob = info.language_probability
    print(f"[Transcriber] Detected input language: {detected_lang} ({lang_prob:.1%}) -> Translating to English")

    # Collect all segments with deduplication
    all_segments = []
    prev_text = ""
    for segment in segments:
        text = segment.text.strip()
        # Skip empty or duplicate consecutive segments (Whisper repetition bug)
        if not text or text == prev_text:
            continue
        all_segments.append({
            "start": segment.start,
            "end": segment.end,
            "text": text
        })
        prev_text = text

    print(f"[Transcriber] Transcribed {len(all_segments)} segments (after dedup)")

    # Build transcript with speaker labels
    # Heuristic: alternate speakers based on pauses > 1.5 seconds
    transcript_parts = []
    current_speaker = "Caretaker"
    prev_end = 0.0
    pause_threshold = 1.5  # seconds

    for seg in all_segments:
        if not seg["text"]:
            continue

        gap = seg["start"] - prev_end
        if gap > pause_threshold and prev_end > 0:
            # Switch speaker on significant pause
            current_speaker = (
                "Patient" if current_speaker == "Caretaker" else "Caretaker"
            )

        transcript_parts.append(f"[{current_speaker}] {seg['text']}")
        prev_end = seg["end"]

    transcript = "\n".join(transcript_parts)

    # Unload model and free memory
    print("[Transcriber] Unloading model...")
    del model
    del segments
    del all_segments
    free_memory()
    print("[Transcriber] Model unloaded, memory freed")

    return transcript
