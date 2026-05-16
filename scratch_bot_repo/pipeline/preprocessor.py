"""
Audio Preprocessing Module
Converts audio to 16kHz mono WAV, reduces noise, normalizes volume.
Uses imageio-ffmpeg (no manual ffmpeg PATH setup needed on Windows).
"""

import gc
import ctypes
import subprocess
import tempfile
import numpy as np
import soundfile as sf
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


def get_ffmpeg_path() -> str:
    """Get ffmpeg binary path from imageio-ffmpeg package."""
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def convert_to_wav(input_path: Path, output_path: Path) -> Path:
    """Convert any audio format to 16kHz mono WAV using ffmpeg."""
    ffmpeg = get_ffmpeg_path()
    cmd = [
        ffmpeg,
        "-y",                   # Overwrite output
        "-i", str(input_path),  # Input file
        "-ar", "16000",         # 16kHz sample rate
        "-ac", "1",             # Mono channel
        "-sample_fmt", "s16",   # 16-bit PCM
        str(output_path)
    ]
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=300
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg conversion failed: {result.stderr.decode('utf-8', errors='replace')}"
        )
    return output_path


def reduce_noise(audio: np.ndarray, sr: int) -> np.ndarray:
    """Apply noise reduction to audio signal."""
    import noisereduce as nr
    reduced = nr.reduce_noise(y=audio, sr=sr, prop_decrease=0.6)
    return reduced


def normalize_volume(audio: np.ndarray) -> np.ndarray:
    """Peak-normalize audio volume."""
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak * 0.95  # Normalize to 95% to avoid clipping
    return audio


def preprocess_audio(input_path: Path, output_dir: Path = None) -> Path:
    """
    Full audio preprocessing pipeline:
    1. Convert to 16kHz mono WAV via ffmpeg
    2. Reduce background noise
    3. Normalize volume
    4. Save cleaned audio

    Args:
        input_path: Path to input audio file (MP3, WAV, M4A, OGG)
        output_dir: Directory for output files (defaults to temp dir)

    Returns:
        Path to cleaned WAV file
    """
    if output_dir is None:
        output_dir = Path(tempfile.mkdtemp(prefix="carecall_"))
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Preprocessor] Processing: {input_path.name}")

    # Step 1: Convert to 16kHz mono WAV
    raw_wav = output_dir / "raw_16k.wav"
    convert_to_wav(input_path, raw_wav)
    print("[Preprocessor] Converted to 16kHz mono WAV")

    # Step 2: Load the converted audio
    audio, sr = sf.read(str(raw_wav), dtype="float32")
    print(f"[Preprocessor] Loaded audio: {len(audio)/sr:.1f}s at {sr}Hz")

    # Step 3: Noise reduction
    audio = reduce_noise(audio, sr)
    print("[Preprocessor] Noise reduction applied")

    # Step 4: Volume normalization
    audio = normalize_volume(audio)
    print("[Preprocessor] Volume normalized")

    # Step 5: Save cleaned audio
    cleaned_wav = output_dir / "cleaned.wav"
    sf.write(str(cleaned_wav), audio, sr, subtype="PCM_16")
    print(f"[Preprocessor] Saved cleaned audio: {cleaned_wav}")

    # Cleanup
    del audio
    if raw_wav.exists():
        raw_wav.unlink()
    free_memory()
    print("[Preprocessor] Memory freed")

    return cleaned_wav
