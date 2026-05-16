@echo off
echo ============================================
echo   CareCall - Medical Call Audio Summarizer
echo   One-Click Setup for Windows
echo ============================================
echo.

REM Check Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Python is not installed or not in PATH.
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

echo [1/3] Creating virtual environment...
python -m venv venv
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to create virtual environment.
    pause
    exit /b 1
)

echo [2/3] Activating virtual environment...
call venv\Scripts\activate.bat

echo [3/3] Installing dependencies...
pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Install Ollama from https://ollama.com
echo   2. Run: ollama pull mistral:7b-instruct-q4_K_M
echo   3. Start the server:
echo      venv\Scripts\activate
echo      uvicorn main:app --reload --host 0.0.0.0 --port 8000
echo.
pause
