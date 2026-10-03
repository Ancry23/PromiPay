import calendar
from datetime import date

from django.db import migrations


def add_months(start, months):
    # Frozen copy of jobs.dates.add_months: migrations must not depend on app code that may change.
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def recompute_due_dates(apps, schema_editor):
    Job = apps.get_model('jobs', 'Job')
    for job in Job.objects.all():
        job.due_date = add_months(job.first_day, job.payment_months)
        job.save(update_fields=['due_date'])


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0002_owner_payments_paid_on"),
    ]

    operations = [
        migrations.RunPython(recompute_due_dates, migrations.RunPython.noop),
    ]
