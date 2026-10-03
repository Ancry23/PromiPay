from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from .dates import add_months
from .models import Agency, Job, Payment

User = get_user_model()


class AddMonthsTests(TestCase):
    def test_adds_calendar_months(self):
        self.assertEqual(add_months(date(2026, 4, 1), 2), date(2026, 6, 1))
        self.assertEqual(add_months(date(2026, 11, 15), 3), date(2027, 2, 15))

    def test_clamps_to_end_of_month(self):
        self.assertEqual(add_months(date(2026, 1, 31), 1), date(2026, 2, 28))
        self.assertEqual(add_months(date(2028, 1, 31), 1), date(2028, 2, 29))


class JobModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("mario", password="pw-Sicura-123")
        self.agency = Agency.objects.create(owner=self.user, name="Example Agency")

    def make_job(self, **kwargs):
        defaults = dict(
            owner=self.user,
            agency=self.agency,
            first_day=date(2026, 4, 1),
            work_days=3,
            daily_pay=Decimal("75.50"),
            payment_months=2,
        )
        defaults.update(kwargs)
        return Job.objects.create(**defaults)

    def test_save_calculates_total_and_due_date(self):
        job = self.make_job()
        self.assertEqual(job.total, Decimal("226.50"))
        self.assertEqual(job.due_date, date(2026, 6, 1))

    def test_paid_on_follows_paid_flag(self):
        job = self.make_job(paid=True)
        self.assertEqual(job.paid_on, timezone.localdate())

        job.paid = False
        job.save()
        self.assertIsNone(job.paid_on)

    def test_partial_payments_update_amounts_and_status(self):
        job = self.make_job()
        Payment.objects.create(job=job, amount=Decimal("100.00"), date=date(2026, 6, 5))
        job.sync_paid_status()
        self.assertFalse(job.paid)
        self.assertEqual(job.amount_due, Decimal("126.50"))

        Payment.objects.create(job=job, amount=Decimal("126.50"), date=date(2026, 6, 20))
        job.sync_paid_status()
        self.assertTrue(job.paid)
        self.assertEqual(job.paid_on, date(2026, 6, 20))
        self.assertEqual(job.amount_due, Decimal("0"))


class AuthApiTests(APITestCase):
    def test_api_requires_authentication(self):
        self.assertEqual(self.client.get("/api/jobs/").status_code, 401)
        self.assertEqual(self.client.get("/api/agencies/").status_code, 401)

    def test_register_and_obtain_token(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "lucia", "email": "lucia@example.com", "password": "pw-Sicura-123"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password", response.data)

        token = self.client.post(
            "/api/auth/token/", {"username": "lucia", "password": "pw-Sicura-123"}, format="json"
        )
        self.assertEqual(token.status_code, 200)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.data['access']}")
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.data["username"], "lucia")

    def test_register_rejects_weak_password(self):
        response = self.client.post(
            "/api/auth/register/", {"username": "weak", "password": "123"}, format="json"
        )
        self.assertEqual(response.status_code, 400)


class AuthenticatedApiTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("mario", password="pw-Sicura-123")
        self.other = User.objects.create_user("anna", password="pw-Sicura-123")
        self.agency = Agency.objects.create(owner=self.user, name="Agency One")
        self.client.force_authenticate(self.user)

    def job_payload(self, **kwargs):
        payload = {
            "agency_id": self.agency.id,
            "first_day": "2026-04-10",
            "work_days": 4,
            "daily_pay": "80.00",
            "contract_type": "fixed",
            "payment_months": 2,
            "paid": False,
        }
        payload.update(kwargs)
        return payload


class AgencyApiTests(AuthenticatedApiTestCase):
    def test_agency_crud(self):
        create_response = self.client.post("/api/agencies/", {"name": "Agency Two"}, format="json")
        self.assertEqual(create_response.status_code, 201)
        agency_id = create_response.data["id"]
        self.assertEqual(Agency.objects.get(id=agency_id).owner, self.user)

        update_response = self.client.put(
            f"/api/agencies/{agency_id}/", {"name": "Agency Two Updated"}, format="json"
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["name"], "Agency Two Updated")

        delete_response = self.client.delete(f"/api/agencies/{agency_id}/")
        self.assertEqual(delete_response.status_code, 204)

    def test_agency_name_unique_per_owner_only(self):
        duplicate = self.client.post("/api/agencies/", {"name": "Agency One"}, format="json")
        self.assertEqual(duplicate.status_code, 400)

        self.client.force_authenticate(self.other)
        same_name = self.client.post("/api/agencies/", {"name": "Agency One"}, format="json")
        self.assertEqual(same_name.status_code, 201)

    def test_users_only_see_their_agencies(self):
        Agency.objects.create(owner=self.other, name="Other Agency")
        response = self.client.get("/api/agencies/")
        names = [a["name"] for a in response.data["results"]]
        self.assertEqual(names, ["Agency One"])


class JobApiTests(AuthenticatedApiTestCase):
    def test_job_crud(self):
        create_response = self.client.post("/api/jobs/", self.job_payload(), format="json")
        self.assertEqual(create_response.status_code, 201)
        job_id = create_response.data["id"]
        self.assertEqual(create_response.data["total"], "320.00")
        self.assertEqual(create_response.data["due_date"], "2026-06-10")
        self.assertEqual(Job.objects.get(id=job_id).owner, self.user)

        update_response = self.client.put(
            f"/api/jobs/{job_id}/",
            self.job_payload(work_days=5, contract_type="occasional", paid=True),
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["total"], "400.00")
        self.assertTrue(update_response.data["paid"])
        self.assertIsNotNone(update_response.data["paid_on"])

        delete_response = self.client.delete(f"/api/jobs/{job_id}/")
        self.assertEqual(delete_response.status_code, 204)

    def test_cannot_use_another_users_agency(self):
        foreign = Agency.objects.create(owner=self.other, name="Foreign")
        response = self.client.post("/api/jobs/", self.job_payload(agency_id=foreign.id), format="json")
        self.assertEqual(response.status_code, 400)

    def test_cannot_access_another_users_job(self):
        foreign_agency = Agency.objects.create(owner=self.other, name="Foreign")
        foreign_job = Job.objects.create(
            owner=self.other, agency=foreign_agency, first_day=date(2026, 1, 1), work_days=1, daily_pay=10
        )
        self.assertEqual(self.client.get(f"/api/jobs/{foreign_job.id}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/jobs/{foreign_job.id}/").status_code, 404)

    def test_rejects_invalid_values(self):
        response = self.client.post(
            "/api/jobs/", self.job_payload(work_days=0, daily_pay="-5", payment_months=0), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("work_days", response.data)
        self.assertIn("daily_pay", response.data)
        self.assertIn("payment_months", response.data)

    def test_list_is_paginated(self):
        for day in range(1, 26):
            Job.objects.create(
                owner=self.user, agency=self.agency, first_day=date(2026, 1, day), work_days=1, daily_pay=10
            )
        response = self.client.get("/api/jobs/")
        self.assertEqual(response.data["count"], 25)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])

        response = self.client.get("/api/jobs/?page_size=100")
        self.assertEqual(len(response.data["results"]), 25)


class JobStatusAndSummaryTests(AuthenticatedApiTestCase):
    def setUp(self):
        super().setUp()
        today = timezone.localdate()

        def job(first_day, paid=False, months=1, daily_pay="100.00"):
            # payment_months=1 => due date one calendar month after first_day
            return Job.objects.create(
                owner=self.user, agency=self.agency, first_day=first_day, work_days=1,
                daily_pay=Decimal(daily_pay), payment_months=months, paid=paid,
            )

        self.overdue = job(add_months(today, -1) - timedelta(days=3))
        self.due_soon = job(add_months(today + timedelta(days=3), -1))
        self.future = job(today + timedelta(days=10))
        self.paid = job(today - timedelta(days=60), paid=True, daily_pay="50.00")
        Payment.objects.create(job=self.future, amount=Decimal("30.00"))

        # A job owned by somebody else must never be counted.
        other_agency = Agency.objects.create(owner=self.other, name="Other")
        Job.objects.create(owner=self.other, agency=other_agency, first_day=today, work_days=1, daily_pay=999)

    def ids(self, query):
        return {j["id"] for j in self.client.get(f"/api/jobs/?{query}").data["results"]}

    def test_status_filters(self):
        self.assertEqual(self.ids("status=paid"), {self.paid.id})
        self.assertEqual(self.ids("status=open"), {self.overdue.id, self.due_soon.id, self.future.id})
        self.assertEqual(self.ids("status=overdue"), {self.overdue.id})
        self.assertIn(self.due_soon.id, self.ids("status=due_soon"))
        self.assertNotIn(self.future.id, self.ids("status=due_soon"))

    def test_summary(self):
        data = self.client.get("/api/jobs/summary/").data
        self.assertEqual(data["total_jobs"], 4)
        self.assertEqual(data["total_agencies"], 1)
        self.assertEqual(data["open_count"], 3)
        self.assertEqual(data["overdue_count"], 1)
        self.assertEqual(Decimal(data["total_paid"]), Decimal("80.00"))  # 50 paid + 30 partial
        self.assertEqual(Decimal(data["total_open"]), Decimal("270.00"))  # 300 open - 30 partial

    def test_export_csv(self):
        response = self.client.get("/api/jobs/export/?status=paid")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        rows = response.content.decode("utf-8-sig").strip().splitlines()
        self.assertEqual(len(rows), 2)
        self.assertTrue(rows[0].startswith("Agenzia;"))
        self.assertIn("50,00", rows[1])


class PaymentApiTests(AuthenticatedApiTestCase):
    def setUp(self):
        super().setUp()
        self.job = Job.objects.create(
            owner=self.user, agency=self.agency, first_day=date(2026, 4, 1), work_days=2, daily_pay=100
        )

    def test_payments_mark_job_paid_and_revert_on_delete(self):
        first = self.client.post(
            "/api/payments/", {"job": self.job.id, "amount": "120.00", "date": "2026-05-01"}, format="json"
        )
        self.assertEqual(first.status_code, 201)
        job = self.client.get(f"/api/jobs/{self.job.id}/").data
        self.assertFalse(job["paid"])
        self.assertEqual(job["amount_paid"], "120.00")
        self.assertEqual(job["amount_due"], "80.00")

        second = self.client.post(
            "/api/payments/", {"job": self.job.id, "amount": "80.00", "date": "2026-05-10"}, format="json"
        )
        job = self.client.get(f"/api/jobs/{self.job.id}/").data
        self.assertTrue(job["paid"])
        self.assertEqual(job["paid_on"], "2026-05-10")
        self.assertEqual(len(job["payments"]), 2)

        self.client.delete(f"/api/payments/{second.data['id']}/")
        job = self.client.get(f"/api/jobs/{self.job.id}/").data
        self.assertFalse(job["paid"])
        self.assertIsNone(job["paid_on"])

    def test_rejects_non_positive_amount_and_foreign_job(self):
        response = self.client.post("/api/payments/", {"job": self.job.id, "amount": "0"}, format="json")
        self.assertEqual(response.status_code, 400)

        foreign_agency = Agency.objects.create(owner=self.other, name="Foreign")
        foreign_job = Job.objects.create(
            owner=self.other, agency=foreign_agency, first_day=date(2026, 1, 1), work_days=1, daily_pay=10
        )
        response = self.client.post("/api/payments/", {"job": foreign_job.id, "amount": "5"}, format="json")
        self.assertEqual(response.status_code, 400)


class CommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("mario", email="mario@example.com", password="pw-Sicura-123")

    def test_assign_owner_claims_orphan_records(self):
        agency = Agency.objects.create(name="Legacy")
        Job.objects.create(agency=agency, first_day=date(2026, 1, 1), work_days=1, daily_pay=10)

        call_command("assign_owner", "mario", stdout=StringIO())

        self.assertEqual(Agency.objects.filter(owner=self.user).count(), 1)
        self.assertEqual(Job.objects.filter(owner=self.user).count(), 1)

    def test_seed_demo_data_is_idempotent(self):
        call_command("seed_demo_data", "--user", "mario", stdout=StringIO())
        call_command("seed_demo_data", "--user", "mario", stdout=StringIO())
        self.assertEqual(Job.objects.filter(owner=self.user).count(), 7)

    def test_send_payment_reminders(self):
        agency = Agency.objects.create(owner=self.user, name="Late Payer")
        today = timezone.localdate()
        Job.objects.create(
            owner=self.user, agency=agency, first_day=add_months(today, -2), work_days=1, daily_pay=10
        )
        Job.objects.create(
            owner=self.user, agency=agency, first_day=today, work_days=1, daily_pay=10, payment_months=3
        )

        call_command("send_payment_reminders", stdout=StringIO())

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["mario@example.com"])
        self.assertIn("IN RITARDO", mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].body.count("Late Payer"), 1)
