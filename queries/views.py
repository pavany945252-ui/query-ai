from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import viewsets

from .ai_service import analyze_query
from .models import Query
from .serializers import AnalysisResultSerializer, QuerySerializer, StatusUpdateSerializer


class QueryViewSet(viewsets.ModelViewSet):
    """
    CRUD for customer queries (only the logged-in user's queries).

    Filters : ?category=Billing&priority=High&status=Pending
    Search  : ?search=<customer name or email>
    Ordering: ?ordering=-created_at
    """

    serializer_class = QuerySerializer
    queryset = Query.objects.all()
    filterset_fields = ["category", "priority", "status"]
    search_fields = ["customer_name", "email"]
    ordering_fields = ["created_at", "priority", "status"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset
        return Query.objects.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @extend_schema(request=None, responses=AnalysisResultSerializer)
    @action(detail=True, methods=["post"], url_path="analyze")
    def analyze(self, request, pk=None):
        """Run AI analysis: category, priority and suggested response. Saves result on the query."""
        query = self.get_object()
        result = analyze_query(query.subject, query.description)

        query.category = result["category"]
        query.priority = result["priority"]
        query.suggested_response = result["suggested_response"]
        query.ai_source = result["source"]
        query.save(update_fields=["category", "priority", "suggested_response", "ai_source"])
        return Response(result, status=status.HTTP_200_OK)

    @extend_schema(request=StatusUpdateSerializer, responses=QuerySerializer)
    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        """Update only the status: Pending, In Progress or Resolved."""
        query = self.get_object()
        serializer = StatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        query.status = serializer.validated_data["status"]
        query.save(update_fields=["status"])
        return Response(QuerySerializer(query).data)

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"], url_path="dashboard", pagination_class=None, filter_backends=[])
    def dashboard(self, request):
        """Totals by status, category and priority for the logged-in user."""
        qs = self.get_queryset()
        by_status = {row["status"]: row["n"] for row in qs.values("status").annotate(n=Count("id"))}
        by_category = {(row["category"] or "Uncategorised"): row["n"] for row in qs.values("category").annotate(n=Count("id"))}
        by_priority = {row["priority"]: row["n"] for row in qs.values("priority").annotate(n=Count("id"))}
        return Response({
            "total": qs.count(),
            "pending": by_status.get(Query.Status.PENDING, 0),
            "in_progress": by_status.get(Query.Status.IN_PROGRESS, 0),
            "resolved": by_status.get(Query.Status.RESOLVED, 0),
            "by_category": by_category,
            "by_priority": by_priority,
        })
