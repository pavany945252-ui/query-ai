"""
AI integration layer.

analyze_query(subject, description) -> dict with keys:
    category, priority, suggested_response, source ("ai" | "fallback")

Flow:
    1. Build a prompt that forces a strict JSON reply.
    2. Call the configured provider (gemini / openai / anthropic) over plain REST.
    3. Parse + validate the JSON (normalise category/priority to allowed values).
    4. If anything fails (no key, network, timeout, bad JSON) -> rule-based fallback.

The view never crashes because of the AI service being down.
"""
import json
import logging
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

CATEGORIES = ["Technical", "Billing", "General", "Account Related"]
PRIORITIES = ["Low", "Medium", "High"]

DEFAULT_MODELS = {
    "gemini": "gemini-2.5-flash",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-haiku-5-5",
}

SYSTEM_PROMPT = (
    "You are a customer-support triage assistant. Read the customer query and reply with ONLY a "
    "JSON object, no markdown, no extra text, with exactly these keys:\n"
    '  "category": one of ["Technical", "Billing", "General", "Account Related"]\n'
    '  "priority": one of ["Low", "Medium", "High"]\n'
    '  "suggested_response": a polite, professional reply of at most 2 sentences.\n'
    "Priority guide: High = money lost/charged wrongly, service fully down, security or account "
    "compromise; Medium = feature partly broken or needs action soon; Low = general question or feedback."
)


class AIServiceError(Exception):
    """Raised when the AI provider fails or returns unusable output."""


# ----------------------------------------------------------------------------
# Provider calls
# ----------------------------------------------------------------------------
def _model_name():
    return settings.AI_MODEL or DEFAULT_MODELS.get(settings.AI_PROVIDER, "")


def _call_gemini(user_text):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{_model_name()}:generateContent"
    resp = requests.post(
        url,
        headers={"x-goog-api-key": settings.AI_API_KEY, "Content-Type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
        },
        timeout=settings.AI_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


def _call_openai(user_text):
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.AI_API_KEY}"},
        json={
            "model": _model_name(),
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_text},
            ],
        },
        timeout=settings.AI_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _call_anthropic(user_text):
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.AI_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": _model_name(),
            "max_tokens": 400,
            "temperature": 0.2,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_text}],
        },
        timeout=settings.AI_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"]


PROVIDERS = {"gemini": _call_gemini, "openai": _call_openai, "anthropic": _call_anthropic}


# ----------------------------------------------------------------------------
# Parsing + validation
# ----------------------------------------------------------------------------
def _extract_json(raw):
    """Tolerate ```json fences or extra text around the JSON object."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if not match:
            raise AIServiceError("AI response did not contain JSON.")
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise AIServiceError(f"Invalid JSON from AI: {exc}") from exc


def _normalise(value, allowed, aliases=None):
    text = str(value or "").strip().lower()
    aliases = aliases or {}
    if text in aliases:
        return aliases[text]
    for option in allowed:
        if option.lower() == text:
            return option
    return None


def _validate(data):
    if not isinstance(data, dict):
        raise AIServiceError("AI JSON is not an object.")
    category = _normalise(
        data.get("category"), CATEGORIES, {"account": "Account Related", "account-related": "Account Related"}
    )
    priority = _normalise(data.get("priority"), PRIORITIES)
    response = str(data.get("suggested_response") or "").strip()
    if not category or not priority or not response:
        raise AIServiceError(f"AI JSON missing/invalid fields: {data}")
    return {"category": category, "priority": priority, "suggested_response": response[:600]}


# ----------------------------------------------------------------------------
# Rule-based fallback (used when AI is unavailable)
# ----------------------------------------------------------------------------
_CATEGORY_KEYWORDS = {
    "Billing": ["payment", "paid", "charge", "charged", "deducted", "refund", "invoice", "bill",
                "billing", "subscription", "price", "transaction", "card", "upi"],
    "Account Related": ["password", "login", "log in", "sign in", "account", "username", "otp",
                        "profile", "email change", "hacked", "locked", "verification"],
    "Technical": ["error", "bug", "crash", "not working", "doesn't work", "does not work", "slow",
                  "loading", "down", "failed", "broken", "install", "app", "website", "server"],
}
_HIGH_WORDS = ["urgent", "asap", "immediately", "twice", "double", "deducted", "fraud", "hacked",
               "unauthorized", "unauthorised", "locked out", "cannot access", "can't access", "down", "crash"]
_LOW_WORDS = ["question", "how to", "information", "feedback", "suggestion", "wondering", "curious"]

_FALLBACK_RESPONSES = {
    "Billing": "We apologise for the inconvenience. Our team will verify your payment details and get back to you shortly.",
    "Technical": "Sorry for the trouble. Our technical team is looking into the issue and will update you soon.",
    "Account Related": "Thank you for reaching out. Our team will review your account and help you regain access or fix the issue.",
    "General": "Thank you for contacting us. Our team will review your query and respond as soon as possible.",
}


def fallback_analysis(subject, description):
    text = f"{subject} {description}".lower()
    scores = {cat: sum(1 for kw in kws if kw in text) for cat, kws in _CATEGORY_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    category = best if scores[best] > 0 else "General"

    if any(word in text for word in _HIGH_WORDS):
        priority = "High"
    elif any(word in text for word in _LOW_WORDS) or category == "General":
        priority = "Low"
    else:
        priority = "Medium"

    return {
        "category": category,
        "priority": priority,
        "suggested_response": _FALLBACK_RESPONSES[category],
        "source": "fallback",
    }


# ----------------------------------------------------------------------------
# Public entry point
# ----------------------------------------------------------------------------
def analyze_query(subject, description):
    provider = settings.AI_PROVIDER
    caller = PROVIDERS.get(provider)

    if caller is None or not settings.AI_API_KEY:
        logger.info("AI provider not configured (%s); using fallback.", provider)
        return fallback_analysis(subject, description)

    user_text = f"Subject: {subject}\nDescription: {description}"
    try:
        raw = caller(user_text)
        result = _validate(_extract_json(raw))
        result["source"] = "ai"
        return result
    except (requests.RequestException, KeyError, IndexError, ValueError, AIServiceError) as exc:
        logger.warning("AI analysis failed (%s): %s. Using fallback.", provider, exc)
        return fallback_analysis(subject, description)
