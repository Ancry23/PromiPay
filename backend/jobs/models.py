import os
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Max, Sum
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone

from .dates import add_months


class Agency(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='agencies',
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=200)

    class Meta:
        verbose_name_plural = 'agencies'
        constraints = [
            models.UniqueConstraint(fields=['owner', 'name'], name='unique_agency_name_per_owner'),
        ]

    def __str__(self):
        return self.name


class Job(models.Model):
    CONTRACT_TYPE_CHOICES = [
        ('fixed', 'Determinato'),
        ('occasional', 'Occasionale'),
        ('other', 'Altro'),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='jobs',
        null=True,
        blank=True,
    )
    agency = models.ForeignKey(Agency, on_delete=models.PROTECT, related_name='jobs')
    first_day = models.DateField()
    work_days = models.PositiveIntegerField()
    daily_pay = models.DecimalField(max_digits=10, decimal_places=2)
    contract_type = models.CharField(max_length=50, choices=CONTRACT_TYPE_CHOICES, default='fixed')
    payment_months = models.PositiveIntegerField(default=1)

    total = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    due_date = models.DateField(blank=True, null=True)
    paid = models.BooleanField(default=False)
    paid_on = models.DateField(blank=True, null=True)

    def save(self, *args, **kwargs):
        # paid / paid_on are derived from payments: only sync_paid_status() changes them.
        self.total = Decimal(self.daily_pay) * self.work_days
        self.due_date = add_months(self.first_day, self.payment_months)
        super().save(*args, **kwargs)

    @property
    def amount_paid(self):
        # Use the annotation when the queryset provides it, to avoid one query per row.
        annotated = getattr(self, 'payments_sum', None)
        if annotated is not None:
            return annotated
        return self.payments.aggregate(s=Sum('amount'))['s'] or Decimal('0')

    @property
    def amount_due(self):
        if self.paid:
            return Decimal('0')
        return max((self.total or Decimal('0')) - self.amount_paid, Decimal('0'))

    def settle(self, on_date=None, note='Saldo'):
        """Record a payment for the outstanding amount, which marks the job paid."""
        received = self.payments.aggregate(s=Sum('amount'))['s'] or Decimal('0')
        remaining = (self.total or Decimal('0')) - received
        if remaining > 0:
            Payment.objects.create(job=self, amount=remaining, date=on_date or timezone.localdate(), note=note)
        self.sync_paid_status()

    def sync_paid_status(self):
        """Mark the job paid once its payments cover the total, and unpaid otherwise."""
        stats = self.payments.aggregate(s=Sum('amount'), last=Max('date'))
        covered = (stats['s'] or Decimal('0')) >= (self.total or Decimal('0'))
        self.paid = covered
        self.paid_on = stats['last'] if covered else None
        self.save(update_fields=['paid', 'paid_on', 'total', 'due_date'])

    def __str__(self):
        return f"{self.agency.name} - {self.first_day} - {self.total}"


class Payment(models.Model):
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField(default=timezone.localdate)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['date', 'id']

    def __str__(self):
        return f"{self.job} - {self.amount} ({self.date})"


class Expense(models.Model):
    CATEGORY_CHOICES = [
        ('travel', 'Viaggio'),
        ('meal', 'Pasti'),
        ('parking', 'Parcheggio'),
        ('lodging', 'Alloggio'),
        ('other', 'Altro'),
    ]

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='expenses')
    date = models.DateField(default=timezone.localdate)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='travel')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reimbursable = models.BooleanField(default=True)
    reimbursed = models.BooleanField(default=False)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['date', 'id']

    def __str__(self):
        return f"{self.job} - {self.get_category_display()} {self.amount}"


def attachment_upload_to(instance, filename):
    extension = os.path.splitext(filename)[1].lower()
    return f"attachments/{instance.job.owner_id or 'none'}/{uuid.uuid4().hex}{extension}"


class Attachment(models.Model):
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to=attachment_upload_to)
    name = models.CharField(max_length=255)
    size = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at', '-id']

    def __str__(self):
        return self.name


@receiver(post_delete, sender=Attachment)
def delete_attachment_file(sender, instance, **kwargs):
    # Runs for cascades too (deleting a job), unlike overriding Model.delete().
    if instance.file:
        instance.file.storage.delete(instance.file.name)
