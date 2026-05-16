import time
import requests
import numpy as np
import soundfile as sf
from pathlib import Path

# Create a 3-second dummy audio file (sine wave)
sr = 16000
t = np.linspace(0, 3, int(sr * 3))
audio = 0.5 * np.sin(2 * np.pi * 440 * t)  # 440 Hz sine wave
dummy_audio_path = Path("test_audio.wav")
sf.write(str(dummy_audio_path), audio, sr)

print(f"Created dummy audio: {dummy_audio_path}")

# Test the API
url = "http://localhost:8001/analyze-call"
try:
    with open(dummy_audio_path, "rb") as f:
        files = {"audio_file": ("test_audio.wav", f, "audio/wav")}
        print(f"Sending POST to {url}...")
        response = requests.post(url, files=files)
        
    print(f"Status Code: {response.status_code}")
    if response.status_code != 200:
        print(f"Error Response: {response.text}")
        exit(1)
        
    data = response.json()
    job_id = data.get("job_id")
    print(f"Job ID received: {job_id}")
    
    if not job_id:
        print("No job ID found in response.")
        exit(1)
        
    print("Polling for result...")
    poll_url = f"http://localhost:8001/result/{job_id}"
    
    while True:
        resp = requests.get(poll_url)
        res_data = resp.json()
        status = res_data.get("status")
        
        print(f"Status: {status}")
        if status == "completed":
            print("Job completed successfully!")
            print(res_data)
            break
        elif status == "failed":
            print(f"Job failed! Error: {res_data.get('error')}")
            break
            
        time.sleep(5)
except Exception as e:
    print(f"Test script failed: {e}")
finally:
    if dummy_audio_path.exists():
        dummy_audio_path.unlink()
