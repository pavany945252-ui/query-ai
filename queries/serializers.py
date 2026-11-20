from rest_framework import serializers

from .models import Query


class QuerySerializer(serializers.ModelSerializer):
    class Meta:
        model = Query
        fields = [
            "id", "customer_name", "email", "subject", "description",
            "category", "priority", "status",
            "suggested_response", "ai_source", "created_at",
        ]
        read_only_fields = ["id", "suggested_response", "ai_source", "created_at"]

    def validate_customer_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Customer name must be at least 2 characters.")
        return value

    def validate_subject(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Subject must be at least 3 characters.")
        return value

    def validate_description(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError("Description must be at least 10 characters.")
        return value


class StatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Query.Status.choices)


class AnalysisResultSerializer(serializers.Serializer):
    category = serializers.CharField()
    priority = serializers.CharField()
    suggested_response = serializers.CharField()
    source = serializers.CharField(help_text="'ai' or 'fallback'")
