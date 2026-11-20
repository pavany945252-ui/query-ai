# AI Integration Explanation

**Which AI model/API was used?**
A hosted LLM called through its REST API. The provider is chosen in `.env` (`AI_PROVIDER`): Google Gemini
(`gemini-2.5-flash`), OpenAI (`gpt-4o-mini`) or Anthropic Claude (`claude-haiku-5-5`). No model was trained;
a pre-trained LLM does the classification and writes the reply. The default `fallback` mode needs no API.

**How was it integrated with Django?**
All AI logic lives in one module, `queries/ai_service.py`, separate from the views. The endpoint
`POST /api/queries/{id}/analyze/` loads the query, calls `analyze_query(subject, description)` and saves
`category`, `priority`, `suggested_response` and `ai_source` on the `Query` model. Calls use the `requests`
library with a timeout. The API key and model name are read from environment variables (`.env`, not committed),
via Django settings.

**How does the application process and interpret the AI response?**
A system prompt tells the model to return only JSON with `category`, `priority` and `suggested_response`
and explains what High/Medium/Low mean. The app strips markdown fences, parses the JSON, then validates it:
category must be one of Technical / Billing / General / Account Related and priority one of Low / Medium / High
(case-insensitive, so "billing" becomes "Billing"). The suggested response is trimmed to a safe length. Only a
fully valid result is saved and returned with `"source": "ai"`.

**Fallback mechanism**
If the key is missing, the network fails, the call times out or the output is invalid, the app uses a keyword-based
classifier (for example "deducted", "payment" -> Billing/High; "password", "login" -> Account Related) with template
replies, and returns `"source": "fallback"`. The API therefore never returns a 500 because of the AI service.

**Challenges faced**
1. LLMs sometimes wrap JSON in markdown or add text, so parsing is tolerant and strictly validated afterwards.
2. Models can return labels outside the allowed set, so values are normalised or rejected.
3. External APIs can be slow or down, so timeouts and the fallback were added.
4. Keeping secrets out of the code: everything sensitive comes from environment variables.
5. Keeping users' data separate: querysets are filtered by the logged-in user.
