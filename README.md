# AI-Powered Customer Query Management System

Django + Django REST Framework app to submit and manage customer queries, with AI that automatically
detects **category**, **priority** and drafts a **suggested response**. Includes a rule-based fallback
when the AI service is unavailable.

## Features
- **Web frontend (QueryDesk)** at `/`: login/register, dashboard, query list with search/filters/pagination, detail drawer with status stepper and AI analysis. No build step, served by Django itself
- Register / Login (Django auth + DRF token authentication)
- Customer query CRUD, status update (Pending / In Progress / Resolved)
- AI analysis endpoint (Gemini, OpenAI or Anthropic via plain REST) with automatic fallback
- Bonus: search, filters, pagination, dashboard, unit tests, Swagger API docs

## Quick start (easiest)
1. Unzip the project and open the folder in VS Code (File > Open Folder).
2. Open the terminal (Ctrl + `) and run:
   - **Windows:** `start.bat`
   - **Mac/Linux:** `bash start.sh`
3. Open http://127.0.0.1:8000/ and log in with **demo / Demo@12345** (or create your own account).

The script creates the virtual environment, installs requirements, creates `.env`, runs migrations,
adds demo data (`python manage.py seed_demo`) and starts the server. Requires Python 3.12+.

To use a real AI model, open `.env`, set `AI_PROVIDER` (`gemini`, `openai` or `anthropic`) and `AI_API_KEY`,
then restart the server. Without a key the app uses the built-in rule-based fallback.
In the app, the AI triage box on each query shows whether the reply came from the AI model or the fallback.

## Manual setup
```bash
git clone <repo-url> && cd query_ai
python -m venv venv
venv\Scripts\activate            # Windows   (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt

cp .env.example .env             # Windows: copy .env.example .env
# edit .env: set SECRET_KEY, AI_PROVIDER and AI_API_KEY

python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/
python manage.py runserver
```
- Web app (frontend): `http://127.0.0.1:8000/`
- API base: `http://127.0.0.1:8000/api/`
- Swagger docs: `http://127.0.0.1:8000/api/docs/`
- Admin: `http://127.0.0.1:8000/admin/`

## AI configuration (`.env`)
| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `gemini`, `openai`, `anthropic` or `fallback` |
| `AI_API_KEY` | Provider API key (never commit it) |
| `AI_MODEL` | Optional model override. Defaults: gemini `gemini-2.5-flash`, openai `gpt-4o-mini`, anthropic `claude-haiku-5-5` |
| `AI_TIMEOUT_SECONDS` | HTTP timeout for AI calls (default 20) |

If the provider is `fallback`, the key is missing, or the AI call fails, keyword-based analysis is used
and the response has `"source": "fallback"` (otherwise `"source": "ai"`).

## Run tests
```bash
python manage.py test
```

## Project structure
```
config/            settings, root urls
accounts/          register + login APIs
web/               Frontend (template + static CSS/JS)
queries/           Query model, serializers, viewset, ai_service.py, tests.py
docs/              API.md, SAMPLES.md, EXPLANATION.md
```
See `docs/API.md` for endpoints, `docs/SAMPLES.md` for sample requests/responses and
`docs/EXPLANATION.md` for the 1-page AI integration explanation.
