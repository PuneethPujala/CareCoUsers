"""
Medicine Detection Module
Uses RapidFuzz fuzzy matching against medicines CSV dataset.
Detects medicine names in transcript and enriches with uses/side effects.
"""

import gc
import ctypes
import re
from pathlib import Path
from typing import List, Dict

import pandas as pd
from rapidfuzz import fuzz


# Default medicines CSV path
DEFAULT_CSV_PATH = Path(__file__).parent.parent / "data" / "medicines.csv"

# Fuzzy matching threshold (85% similarity)
MATCH_THRESHOLD = 85

# Minimum word length to consider as potential medicine name
MIN_WORD_LENGTH = 3


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


def load_medicines(csv_path: Path = None) -> pd.DataFrame:
    """Load medicines CSV into a DataFrame."""
    path = csv_path or DEFAULT_CSV_PATH
    if not path.exists():
        raise FileNotFoundError(f"Medicines CSV not found: {path}")

    print(f"[MedicineDetector] Loading medicines from: {path}")
    df = pd.read_csv(str(path), encoding="utf-8", on_bad_lines="skip")

    # Standardize column names
    df.columns = [col.strip().lower().replace(" ", "_") for col in df.columns]

    # Ensure required columns exist
    if "medicine_name" not in df.columns:
        raise ValueError("CSV must have 'medicine_name' column")

    # Clean medicine names
    df["medicine_name"] = df["medicine_name"].astype(str).str.strip().str.lower()

    # Fill missing columns with defaults
    if "uses" not in df.columns:
        df["uses"] = "Not available"
    if "side_effects" not in df.columns:
        df["side_effects"] = "Not available"

    # Drop rows with empty medicine names
    df = df[df["medicine_name"].str.len() > 0].reset_index(drop=True)

    print(f"[MedicineDetector] Loaded {len(df)} medicines")
    return df


def extract_candidate_phrases(transcript: str) -> List[str]:
    """
    Extract candidate phrases from transcript that could be medicine names.
    Generates 1-gram, 2-gram, and 3-gram phrases.
    """
    # Remove speaker labels
    clean_text = re.sub(r'\[(?:Caretaker|Patient)\]\s*', '', transcript)

    # Split into words, keeping alphanumeric and common medicine characters
    words = re.findall(r'[a-zA-Z0-9]+(?:[-][a-zA-Z0-9]+)*', clean_text.lower())

    # Filter short words
    words = [w for w in words if len(w) >= MIN_WORD_LENGTH]

    candidates = set()

    # 1-grams
    for w in words:
        candidates.add(w)

    # 2-grams
    for i in range(len(words) - 1):
        candidates.add(f"{words[i]} {words[i+1]}")

    # 3-grams
    for i in range(len(words) - 2):
        candidates.add(f"{words[i]} {words[i+1]} {words[i+2]}")

    return list(candidates)


def detect_medicines(
    transcript: str,
    csv_path: Path = None
) -> List[Dict]:
    """
    Detect medicine names in transcript using fuzzy matching.

    Args:
        transcript: Full call transcript text
        csv_path: Optional path to medicines CSV

    Returns:
        List of detected medicines with name, uses, and side_effects
    """
    print("[MedicineDetector] Starting medicine detection...")

    # Load medicines dataset
    df = load_medicines(csv_path)

    # Build a lookup dict for faster searching
    # For large datasets, we use a subset approach: extract candidates
    # from transcript first, then match against the dataset
    medicine_names = df["medicine_name"].tolist()

    # Extract candidates from transcript
    candidates = extract_candidate_phrases(transcript)
    print(f"[MedicineDetector] Extracted {len(candidates)} candidate phrases")

    # For efficiency with large datasets (225K+), we match candidates
    # against medicine names rather than the other way around
    detected = []
    seen_medicines = set()

    for candidate in candidates:
        best_score = 0
        best_match_idx = -1

        # Quick exact check first
        exact_matches = df[df["medicine_name"] == candidate]
        if not exact_matches.empty:
            row = exact_matches.iloc[0]
            med_name = row["medicine_name"]
            if med_name not in seen_medicines:
                seen_medicines.add(med_name)
                detected.append({
                    "name": med_name.title(),
                    "highlighted": True,
                    "uses": str(row.get("uses", "Not available")),
                    "side_effects": str(row.get("side_effects", "Not available"))
                })
            continue

        # Fuzzy matching - sample for performance on large datasets
        # Check against a subset if dataset is very large
        sample_size = min(len(medicine_names), 10000)
        if len(medicine_names) > sample_size:
            # Prioritize medicines that share starting characters
            first_char = candidate[0] if candidate else ""
            filtered = [m for m in medicine_names if m and m[0] == first_char]
            if len(filtered) < sample_size:
                # Add more from the full list
                remaining = sample_size - len(filtered)
                filtered.extend(medicine_names[:remaining])
            check_names = filtered[:sample_size]
        else:
            check_names = medicine_names

        for idx, med_name in enumerate(check_names):
            if not med_name or len(med_name) < MIN_WORD_LENGTH:
                continue

            # Use token_sort_ratio for better matching of reordered words
            score = fuzz.ratio(candidate, med_name)

            if score > best_score:
                best_score = score
                best_match_idx = medicine_names.index(med_name) if med_name in medicine_names else -1

        if best_score >= MATCH_THRESHOLD and best_match_idx >= 0:
            row = df.iloc[best_match_idx]
            med_name = row["medicine_name"]

            if med_name not in seen_medicines:
                seen_medicines.add(med_name)
                detected.append({
                    "name": med_name.title(),
                    "highlighted": True,
                    "uses": str(row.get("uses", "Not available")),
                    "side_effects": str(row.get("side_effects", "Not available"))
                })

    print(f"[MedicineDetector] Detected {len(detected)} medicines")

    # Free memory
    del df
    del medicine_names
    del candidates
    free_memory()
    print("[MedicineDetector] Memory freed")

    return detected
