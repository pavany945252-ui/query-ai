from unittest.mock import patch

import requests
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from . import ai_service
from .models import Query

QUERY_PAYLOAD = {
    "customer_name": "Rahul Sharma",
    "email": "rahul@example.com",
    "subject": "Payment deducted twice",
    "description": "My payment has been deducted twice, but my subscription is still not activated.",
}


class AuthTests(APITestCase):
    def test_register_and_login(self):
        r = self.client.post("/api/register/", {"username": "u1", "email": "u1@x.com", "password": "Str0ng!Pass99"})
        self.assertEqual(r.status_code, 201)
        self.assertIn("token", r.data)
        r = self.client.post("/api/login/", {"username": "u1", "password": "Str0ng!Pass99"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("token", r.data)

    def test_register_validation(self):
        r = self.client.post("/api/register/", {"username": "u1", "email": "bad", "password": "123"})
        self.assertEqual(r.status_code, 400)

    def test_duplicate_email_rejected(self):
        User.objects.create_user("a", "dup@x.com", "Str0ng!Pass99")
        r = self.client.post("/api/register/", {"username": "b", "email": "dup@x.com", "password": "Str0ng!Pass99"})
        self.assertEqual(r.status_code, 400)

    def test_login_wrong_password(self):
        User.objects.create_user("a", "a@x.com", "Str0ng!Pass99")
        r = self.client.post("/api/login/", {"username": "a", "password": "wrong"})
        self.assertEqual(r.status_code, 400)


class QueryAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("vishal", "v@x.com", "Str0ng!Pass99")
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def _create(self, **over):
        return self.client.post("/api/queries/", {**QUERY_PAYLOAD, **over}, format="json")

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.get("/api/queries/").status_code, 401)

    def test_create_list_detail_update_delete(self):
        r = self._create()
        self.assertEqual(r.status_code, 201)
        qid = r.data["id"]
        self.assertEqual(r.data["status"], "Pending")

        self.assertEqual(self.client.get("/api/queries/").data["count"], 1)
        self.assertEqual(self.client.get(f"/api/queries/{qid}/").status_code, 200)

        r = self.client.put(f"/api/queries/{qid}/", {**QUERY_PAYLOAD, "subject": "Updated subject", "priority": "High"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["subject"], "Updated subject")

        self.assertEqual(self.client.delete(f"/api/queries/{qid}/").status_code, 204)
        self.assertEqual(Query.objects.count(), 0)

    def test_validation_errors(self):
        self.assertEqual(self._create(description="short").status_code, 400)
        self.assertEqual(self._create(email="not-an-email").status_code, 400)

    def test_status_update(self):
        qid = self._create().data["id"]
        r = self.client.patch(f"/api/queries/{qid}/status/", {"status": "Resolved"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "Resolved")
        r = self.client.patch(f"/api/queries/{qid}/status/", {"status": "Nope"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_users_cannot_see_others_queries(self):
        qid = self._create().data["id"]
        other = User.objects.create_user("other", "o@x.com", "Str0ng!Pass99")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=other).key}")
        self.assertEqual(self.client.get(f"/api/queries/{qid}/").status_code, 404)
        self.assertEqual(self.client.get("/api/queries/").data["count"], 0)

    def test_search_filter_dashboard(self):
        self._create()
        self._create(customer_name="Anita", email="anita@example.com", priority="Low")
        self.assertEqual(self.client.get("/api/queries/?search=anita").data["count"], 1)
        self.assertEqual(self.client.get("/api/queries/?priority=Low").data["count"], 1)
        d = self.client.get("/api/queries/dashboard/").data
        self.assertEqual(d["total"], 2)
        self.assertEqual(d["pending"], 2)
        self.assertEqual(d["resolved"], 0)

    def test_analyze_uses_fallback_when_not_configured(self):
        qid = self._create().data["id"]
        r = self.client.post(f"/api/queries/{qid}/analyze/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["category"], "Billing")
        self.assertEqual(r.data["priority"], "High")
        self.assertEqual(r.data["source"], "fallback")
        self.assertEqual(Query.objects.get(pk=qid).category, "Billing")

    @override_settings(AI_PROVIDER="gemini", AI_API_KEY="test-key")
    def test_analyze_with_ai_success(self):
        qid = self._create().data["id"]
        fake = '```json\n{"category": "billing", "priority": "high", "suggested_response": "We apologise. We will verify the payment."}\n```'
        with patch.dict(ai_service.PROVIDERS, {"gemini": lambda text: fake}):
            r = self.client.post(f"/api/queries/{qid}/analyze/")
        self.assertEqual(r.data["source"], "ai")
        self.assertEqual(r.data["category"], "Billing")
        self.assertEqual(r.data["priority"], "High")

    @override_settings(AI_PROVIDER="gemini", AI_API_KEY="test-key")
    def test_analyze_falls_back_when_ai_down(self):
        qid = self._create().data["id"]

        def boom(text):
            raise requests.ConnectionError("down")

        with patch.dict(ai_service.PROVIDERS, {"gemini": boom}):
            r = self.client.post(f"/api/queries/{qid}/analyze/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["source"], "fallback")

    @override_settings(AI_PROVIDER="gemini", AI_API_KEY="test-key")
    def test_analyze_falls_back_on_garbage_ai_output(self):
        qid = self._create().data["id"]
        with patch.dict(ai_service.PROVIDERS, {"gemini": lambda text: "sorry I cannot help"}):
            r = self.client.post(f"/api/queries/{qid}/analyze/")
        self.assertEqual(r.data["source"], "fallback")


class FallbackLogicTests(APITestCase):
    def test_categories(self):
        self.assertEqual(ai_service.fallback_analysis("Login", "I forgot my password")["category"], "Account Related")
        self.assertEqual(ai_service.fallback_analysis("App", "The app crashes with an error")["category"], "Technical")
        self.assertEqual(ai_service.fallback_analysis("Hello", "What are your office timings")["category"], "General")
