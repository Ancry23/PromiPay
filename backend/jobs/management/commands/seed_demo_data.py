from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from jobs.models import Agency, Job


class Command(BaseCommand):
    help = "Create demo agencies and jobs for dashboard and filter testing."

    def add_arguments(self, parser):
        parser.add_argument("--user", required=True, help="Username che diventera proprietario dei dati demo.")

    def handle(self, *args, **options):
        User = get_user_model()
        try:
            owner = User.objects.get(username=options["user"])
        except User.DoesNotExist as exc:
            raise CommandError(f"Utente '{options['user']}' non trovato.") from exc

        today = timezone.localdate()

        dataset = [
            {
                "agency": "Demo Retail Nord",
                "first_day": today - timedelta(days=45),
                "work_days": 4,
                "daily_pay": Decimal("95.00"),
                "contract_type": "fixed",
                "payment_months": 1,
                "paid": False,
            },
            {
                "agency": "Demo Eventi Roma",
                "first_day": today - timedelta(days=25),
                "work_days": 3,
                "daily_pay": Decimal("120.00"),
                "contract_type": "occasional",
                "payment_months": 1,
                "paid": False,
            },
            {
                "agency": "Demo Brand Milano",
                "first_day": today - timedelta(days=30),
                "work_days": 2,
                "daily_pay": Decimal("150.00"),
                "contract_type": "other",
                "payment_months": 1,
                "paid": False,
            },
            {
                "agency": "Demo Sampling Sud",
                "first_day": today - timedelta(days=12),
                "work_days": 6,
                "daily_pay": Decimal("78.00"),
                "contract_type": "fixed",
                "payment_months": 2,
                "paid": False,
            },
            {
                "agency": "Demo Tour Estate",
                "first_day": today - timedelta(days=40),
                "work_days": 5,
                "daily_pay": Decimal("110.00"),
                "contract_type": "occasional",
                "payment_months": 1,
                "paid": True,
            },
            {
                "agency": "Demo Hospitality Expo",
                "first_day": today - timedelta(days=90),
                "work_days": 8,
                "daily_pay": Decimal("88.00"),
                "contract_type": "fixed",
                "payment_months": 2,
                "paid": True,
            },
            {
                "agency": "Demo Fiere Centro",
                "first_day": today - timedelta(days=3),
                "work_days": 7,
                "daily_pay": Decimal("67.50"),
                "contract_type": "other",
                "payment_months": 3,
                "paid": False,
            },
        ]

        created_jobs = 0

        for entry in dataset:
            agency, _ = Agency.objects.get_or_create(owner=owner, name=entry["agency"])

            job, created = Job.objects.update_or_create(
                owner=owner,
                agency=agency,
                first_day=entry["first_day"],
                defaults={
                    "work_days": entry["work_days"],
                    "daily_pay": entry["daily_pay"],
                    "contract_type": entry["contract_type"],
                    "payment_months": entry["payment_months"],
                },
            )
            if entry["paid"] and not job.paid:
                job.settle(on_date=job.due_date, note="Saldo (demo)")
            else:
                job.sync_paid_status()

            if created:
                created_jobs += 1

            self.stdout.write(
                f"- {job.agency.name}: {job.first_day} | {job.contract_type} | paid={job.paid}"
            )

        self.stdout.write(self.style.SUCCESS(f"Demo seed completed. New jobs created: {created_jobs}."))
