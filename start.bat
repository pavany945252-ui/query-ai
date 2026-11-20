@echo off
REM One-click setup + run for Windows (VS Code terminal: just type  start.bat)
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python not found. Install Python 3.12 or newer from python.org and tick "Add to PATH".
  pause & exit /b 1
)

if not exist venv (
  echo [1/4] Creating virtual environment...
  python -m venv venv || (echo Failed to create venv & pause & exit /b 1)
)
call venv\Scripts\activate

echo [2/4] Installing requirements...
python -m pip install -q -r requirements.txt || (echo Install failed. Check internet and Python version ^(3.12+^). & pause & exit /b 1)

if not exist .env (
  copy .env.example .env >nul
  echo Created .env  ^(AI runs in fallback mode until you add AI_API_KEY^)
)

echo [3/4] Preparing database...
python manage.py migrate || (pause & exit /b 1)
python manage.py seed_demo

echo [4/4] Starting server...  Open http://127.0.0.1:8000/   (login: demo / Demo@12345)
python manage.py runserver
