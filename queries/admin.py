from django.contrib import admin

from .models import Query


@admin.register(Query)
class QueryAdmin(admin.ModelAdmin):
    list_display = ("id", "customer_name", "email", "subject", "category", "priority", "status", "created_at")
    list_filter = ("category", "priority", "status")
    search_fields = ("customer_name", "email", "subject")
