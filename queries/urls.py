from rest_framework.routers import DefaultRouter

from .views import QueryViewSet

router = DefaultRouter()
router.register("queries", QueryViewSet, basename="query")

urlpatterns = router.urls
