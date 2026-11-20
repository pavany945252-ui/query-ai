#!/usr/bin/env bash
# One-command setup + run for Mac/Linux:  bash start.sh
set -e
cd "$(dirname "$0")"
PY=$(command -v python3 || command -v python) || { echo "Install Python 3.12+ first"; exit 1; }
[ -d venv ] || { echo "[1/4] Creating virtual environment..."; "$PY" -m venv venv; }
source venv/bin/activate
echo "[2/4] Installing requirements..."
python -m pip install -q -r requirements.txt
[ -f .env ] || { cp .env.example .env; echo "Created .env (AI runs in fallback mode until you add AI_API_KEY)"; }
echo "[3/4] Preparing database..."
python manage.py migrate
python manage.py seed_demo
echo "[4/4] Starting server... open http://127.0.0.1:8000/  (login: demo / Demo@12345)"
python manage.py runserver
