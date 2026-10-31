@echo off
title AMBIT SecretGuard - Backend
color 0B
echo.
echo  ===================================================
echo   AMBIT SecretGuard - Flask Backend (Port 5000)
echo  ===================================================
echo.
cd /d "%~dp0backend"

REM Create .env if not exists
if not exist .env (
    echo Creating .env from .env.example...
    if exist "..\\.env.example" copy "..\\.env.example" ".env"
)

REM Install dependencies
echo Installing Python dependencies...
pip install -r requirements.txt --quiet

REM Initialize DB and start Flask
echo.
echo Starting Flask server on http://localhost:5000
echo Press Ctrl+C to stop.
echo.
python app.py
pause
