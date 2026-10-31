@echo off
title AMBIT SecretGuard - Frontend (React)
color 0B
echo.
echo  ===================================================
echo   AMBIT SecretGuard - React Frontend (Port 3000)
echo  ===================================================
echo.

REM Add nodejs to PATH
set "PATH=C:\Users\Victus\nodejs;%PATH%"

cd /d "%~dp0frontend"

echo Installing dependencies (first run only)...
call npm install --silent

echo.
echo Starting React development server on http://localhost:3000
echo Press Ctrl+C to stop.
echo.
call npm start
pause
