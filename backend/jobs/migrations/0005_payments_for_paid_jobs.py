from decimal import Decimal

from django.db import migrations
from django.db.models import Sum


def create_settling_payments(apps, schema_editor):
    """Jobs ticked as paid by hand get a payment for the remainder, so payments become the only source of truth."""
    Job = apps.get_model('jobs', 'Job')
    Payment = apps.get_model('jobs', 'Payment')

    for job in Job.objects.filter(paid=True):
        received = Payment.objects.filter(job=job).aggregate(s=Sum('amount'))['s'] or Decimal('0')
        remaining = (job.total or Decimal('0')) - received
        if remaining > 0:
            Payment.objects.create(
                job=job,
                amount=remaining,
                date=job.paid_on or job.due_date or job.first_day,
                note='Saldo (segnato come pagato prima dei pagamenti)',
            )
        if job.paid_on is None:
            last = Payment.objects.filter(job=job).order_by('-date').first()
            job.paid_on = last.date if last else job.due_date
            job.save(update_fields=['paid_on'])


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0004_expenses_attachments"),
    ]

    operations = [
        migrations.RunPython(create_settling_payments, migrations.RunPython.noop),
    ]
