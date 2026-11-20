from django.views.generic import TemplateView


class IndexView(TemplateView):
    """Serves the single-page frontend. All data comes from the /api/ endpoints."""

    template_name = "web/index.html"
