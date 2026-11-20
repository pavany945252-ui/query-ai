from django.test import SimpleTestCase


class FrontendTests(SimpleTestCase):
    def test_index_page_loads(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "QueryDesk")
        self.assertContains(response, "web/app.js")
