"""
Summarization Module
Sends transcript to local Ollama server running mistral:7b-instruct-q4_K_M.
Parses structured JSON summary with retry logic.
"""

import json
import requests
from pathlib import Path


# Ollama local server endpoint
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "mistral:7b-instruct-q4_K_M"
PROMPT_FILE = Path(__file__).parent.parent / "prompts" / "summary_prompt.txt"

# System instruction to prevent hallucination
SYSTEM_MESSAGE = (
    "You are a strict medical call transcript summarizer. "
    "You MUST only state facts that appear word-for-word in the transcript. "
    "NEVER invent names, medicines, symptoms, or details. "
    "If something is not in the transcript, write 'Not mentioned in transcript'. "
    "All values in your JSON must be plain strings, never arrays or lists. "
    "Return ONLY valid JSON with no extra text."
)

# Default summary structure when LLM fails
DEFAULT_SUMMARY = {
    "call_overview": "Unable to generate summary",
    "key_points": "Not available",
    "action_items": "Not available",
    "medicine_reminders": "Not available",
    "patient_health_notes": "Not available",
    "follow_up_required": False,
    "follow_up_reason": "Summary generation failed"
}


def load_prompt_template():
    """Load the LLM prompt template from file."""
    if not PROMPT_FILE.exists():
        raise FileNotFoundError(f"Prompt template not found: {PROMPT_FILE}")
    return PROMPT_FILE.read_text(encoding="utf-8")


def call_ollama(prompt, max_retries=3):
    """Send prompt to Ollama with system message for anti-hallucination."""
    payload = {
        "model": MODEL_NAME,
        "system": SYSTEM_MESSAGE,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "top_p": 0.9,
            "num_predict": 1024,
            "num_ctx": 2048
        }
    }

    for attempt in range(1, max_retries + 1):
        try:
            print(f"[Summarizer] Sending to Ollama (attempt {attempt}/{max_retries})...")
            response = requests.post(OLLAMA_URL, json=payload, timeout=300)
            response.raise_for_status()
            result = response.json()
            return result.get("response", "")
        except requests.exceptions.ConnectionError:
            print("[Summarizer] ERROR: Cannot connect to Ollama. Is it running?")
            if attempt == max_retries:
                raise ConnectionError("Cannot connect to Ollama at localhost:11434.")
        except requests.exceptions.Timeout:
            print(f"[Summarizer] Timeout on attempt {attempt}, retrying...")
            if attempt == max_retries:
                raise TimeoutError("Ollama request timed out after all retries")
        except Exception as e:
            print(f"[Summarizer] Error on attempt {attempt}: {e}")
            if attempt == max_retries:
                raise


def extract_json_from_response(response_text):
    """Extract valid JSON from LLM response, handling code blocks and extra text."""
    text = response_text.strip()

    # Try direct JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try markdown code block
    if "```json" in text:
        start = text.index("```json") + 7
        end = text.index("```", start) if "```" in text[start:] else len(text)
        try:
            return json.loads(text[start:end].strip())
        except json.JSONDecodeError:
            pass

    if "```" in text:
        start = text.index("```") + 3
        newline_pos = text.find("\n", start)
        if newline_pos != -1:
            start = newline_pos + 1
        end = text.index("```", start) if "```" in text[start:] else len(text)
        try:
            return json.loads(text[start:end].strip())
        except json.JSONDecodeError:
            pass

    # Try finding JSON boundaries
    brace_start = text.find("{")
    brace_end = text.rfind("}") + 1
    if brace_start != -1 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start:brace_end])
        except json.JSONDecodeError:
            pass

    return None


def force_string_values(summary):
    """Force all summary values to be strings (except follow_up_required = bool)."""
    for key, value in summary.items():
        if key == "follow_up_required":
            continue
        if isinstance(value, list):
            summary[key] = ". ".join(str(item) for item in value)
        elif isinstance(value, dict):
            summary[key] = json.dumps(value)
        elif not isinstance(value, str):
            summary[key] = str(value)
    return summary


def summarize_transcript(transcript):
    """
    Generate structured summary of a call transcript using Ollama.
    Only summarizes what is actually in the transcript - zero hallucination.
    """
    print("[Summarizer] Loading prompt template...")
    template = load_prompt_template()
    prompt = template.replace("{transcript}", transcript)

    # Log transcript for debugging
    print("[Summarizer] Transcript being summarized:")
    print("--- TRANSCRIPT START ---")
    print(transcript[:2000])
    print("--- TRANSCRIPT END ---")

    try:
        raw_response = call_ollama(prompt)
        print(f"[Summarizer] Got response ({len(raw_response)} chars)")
        print("[Summarizer] Raw LLM response:")
        print(raw_response[:1000])

        summary = extract_json_from_response(raw_response)

        if summary is None:
            print("[Summarizer] WARNING: Could not parse JSON from LLM response")
            return DEFAULT_SUMMARY.copy()

        # Fill missing fields
        required_fields = [
            "call_overview", "key_points", "action_items",
            "medicine_reminders", "patient_health_notes",
            "follow_up_required", "follow_up_reason"
        ]
        for field in required_fields:
            if field not in summary:
                summary[field] = DEFAULT_SUMMARY.get(field, "Not mentioned in transcript")

        # Ensure follow_up_required is boolean
        if not isinstance(summary.get("follow_up_required"), bool):
            val = str(summary.get("follow_up_required", "false")).lower()
            summary["follow_up_required"] = val in ("true", "yes", "1")

        # Force all values to strings to prevent crashes
        summary = force_string_values(summary)

        print("[Summarizer] Summary generated successfully")
        return summary

    except ConnectionError as e:
        print(f"[Summarizer] Connection error: {e}")
        summary = DEFAULT_SUMMARY.copy()
        summary["call_overview"] = "Ollama is not running. Please start Ollama."
        return summary

    except Exception as e:
        print(f"[Summarizer] Error during summarization: {e}")
        return DEFAULT_SUMMARY.copy()
