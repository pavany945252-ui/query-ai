"""Create a demo login and a few sample queries so the app is not empty on first run.

Usage: python manage.py seed_demo
Login afterwards with  username: demo   password: Demo@12345
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from queries.ai_service import analyze_query
from queries.models import Query

SAMPLES = [
    ("Rahul Sharma", "rahul@example.com", "Payment deducted twice",
     "My payment has been deducted twice, but my subscription is still not activated.", "Pending"),
    ("Anita Verma", "anita@example.com", "Cannot log in to my account",
     "I forgot my password and the reset email never arrives, so I am locked out.", "In Progress"),
    ("Karan Mehta", "karan@example.com", "App crashes on startup",
     "The mobile app shows an error and crashes every time I open it after the latest update.", "Pending"),
    ("Sneha Iyer", "sneha@example.com", "Office timings",
     "I was wondering what your support team's working hours are. Just a general question.", "Resolved"),
    ("Vikram Singh", "vikram@example.com", "Invoice copy needed",
     "Could you please send me a copy of last month's invoice for my records?", "Pending"),
]


class Command(BaseCommand):
    help = "Create a demo user (demo / Demo@12345) with sample queries."

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(username="demo", defaults={"email": "demo@example.com"})
        if created:
            user.set_password("Demo@12345")
            user.save()
        if Query.objects.filter(created_by=user).exists():
            self.stdout.write("Demo data already exists, nothing to do.")
            return
        for name, email, subject, description, status in SAMPLES:
            result = analyze_query(subject, description)
            Query.objects.create(
                created_by=user, customer_name=name, email=email, subject=subject,
                description=description, status=status, category=result["category"],
                priority=result["priority"], suggested_response=result["suggested_response"],
                ai_source=result["source"],
            )
        self.stdout.write(self.style.SUCCESS(
            f"Created {len(SAMPLES)} sample queries. Login: demo / Demo@12345"))
