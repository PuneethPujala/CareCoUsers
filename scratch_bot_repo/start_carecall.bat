@echo off
title CareCall Medical Summarizer
echo ============================================
echo   CareCall - Medical Call Audio Summarizer
echo   Starting Local Server...
echo ============================================
echo.

REM Check if virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found. Please run setup.bat first.
    pause
    exit /b 1
)

REM Activate the virtual environment
call venv\Scripts\activate.bat

REM Check if Ollama is running, if not tell the user
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | %SystemRoot%\System32\find.exe /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [WARNING] Ollama is not currently running in the background!
    echo           Please ensure you start Ollama so the AI summarizer works.
    echo.
)

REM Start the FastAPI server and open browser
echo Starting the web server...
echo.
echo ==============================================================
echo   SUCCESS! The CareCall UI is now starting...
echo   Your web browser will open automatically in a few seconds.
echo ==============================================================
echo.
echo (Keep this window open while using the application)
echo.

REM Start the server and immediately open the browser
start "" http://localhost:8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000
