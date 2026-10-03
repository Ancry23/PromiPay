"""Yearly fiscal summary and per-agency reliability stats, computed in Python (data volumes are small)."""
from collections import defaultdict
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from .models import Agency, Expense, Job, Payment

ZERO = Decimal('0')


def _money(value):
    return f"{value:.2f}"


def fiscal_summary(user, year):
    jobs = list(Job.objects.filter(owner=user, first_day__year=year).select_related('agency'))
    payments = list(
        Payment.objects.filter(job__owner=user, date__year=year).select_related('job', 'job__agency')
    )
    expenses = list(Expense.objects.filter(job__owner=user, date__year=year))
    contract_labels = dict(Job.CONTRACT_TYPE_CHOICES)
    rate = Decimal(str(settings.OCCASIONAL_WITHHOLDING_RATE))
    threshold = Decimal(str(settings.OCCASIONAL_INPS_THRESHOLD))

    by_contract = defaultdict(lambda: {'gross': ZERO, 'received': ZERO, 'jobs': 0})
    by_agency = defaultdict(lambda: {'gross': ZERO, 'received': ZERO, 'jobs': 0})
    by_month = {m: {'gross': ZERO, 'received': ZERO} for m in range(1, 13)}
    agency_names = {}

    for job in jobs:
        by_contract[job.contract_type]['gross'] += job.total
        by_contract[job.contract_type]['jobs'] += 1
        by_agency[job.agency_id]['gross'] += job.total
        by_agency[job.agency_id]['jobs'] += 1
        by_month[job.first_day.month]['gross'] += job.total
        agency_names[job.agency_id] = job.agency.name

    occasional_received = ZERO
    for payment in payments:
        job = payment.job
        by_contract[job.contract_type]['received'] += payment.amount
        by_agency[job.agency_id]['received'] += payment.amount
        by_month[payment.date.month]['received'] += payment.amount
        agency_names[job.agency_id] = job.agency.name
        if job.contract_type == 'occasional':
            occasional_received += payment.amount

    gross = sum((j.total for j in jobs), ZERO)
    received = sum((p.amount for p in payments), ZERO)
    withholding = (occasional_received * rate).quantize(Decimal('0.01'))

    years = {d.year for d in Job.objects.filter(owner=user).dates('first_day', 'year')}
    years |= {d.year for d in Payment.objects.filter(job__owner=user).dates('date', 'year')}
    years.add(timezone.localdate().year)

    return {
        'year': year,
        'years_available': sorted(years, reverse=True),
        'totals': {
            'gross': _money(gross),
            'received': _money(received),
            'outstanding': _money(sum((j.amount_due for j in jobs), ZERO)),
            'withholding_estimate': _money(withholding),
            'net_estimate': _money(received - withholding),
            'expenses': _money(sum((e.amount for e in expenses), ZERO)),
            'expenses_to_reimburse': _money(
                sum((e.amount for e in expenses if e.reimbursable and not e.reimbursed), ZERO)
            ),
        },
        'occasional': {
            'received': _money(occasional_received),
            'threshold': _money(threshold),
            'remaining': _money(max(threshold - occasional_received, ZERO)),
            'percent': round(float(occasional_received / threshold * 100), 1) if threshold else 0,
            'over_threshold': occasional_received > threshold,
            'withholding_rate': float(rate),
        },
        'by_contract': [
            {
                'contract_type': key,
                'label': contract_labels.get(key, key),
                'gross': _money(v['gross']),
                'received': _money(v['received']),
                'jobs': v['jobs'],
            }
            for key, v in sorted(by_contract.items())
        ],
        'by_agency': sorted(
            (
                {
                    'agency_id': agency_id,
                    'name': agency_names[agency_id],
                    'gross': _money(v['gross']),
                    'received': _money(v['received']),
                    'jobs': v['jobs'],
                }
                for agency_id, v in by_agency.items()
            ),
            key=lambda row: Decimal(row['gross']),
            reverse=True,
        ),
        'by_month': [
            {'month': m, 'gross': _money(v['gross']), 'received': _money(v['received'])}
            for m, v in by_month.items()
        ],
    }


def agency_stats(user):
    today = timezone.localdate()
    stats = {
        agency.id: {
            'agency_id': agency.id,
            'name': agency.name,
            'jobs': 0,
            'paid_jobs': 0,
            'open_jobs': 0,
            'overdue_jobs': 0,
            'outstanding': ZERO,
            'on_time': 0,
            'delays': [],
        }
        for agency in Agency.objects.filter(owner=user)
    }

    for job in Job.objects.filter(owner=user).prefetch_related('payments'):
        row = stats.get(job.agency_id)
        if row is None:
            continue
        row['jobs'] += 1
        if job.paid and job.paid_on and job.due_date:
            row['paid_jobs'] += 1
            delay = (job.paid_on - job.due_date).days
            row['delays'].append(delay)
            if delay <= 0:
                row['on_time'] += 1
        elif not job.paid:
            row['open_jobs'] += 1
            row['outstanding'] += job.amount_due
            if job.due_date and job.due_date < today:
                row['overdue_jobs'] += 1

    result = []
    for row in stats.values():
        delays = row.pop('delays')
        paid = row['paid_jobs']
        row['avg_delay_days'] = round(sum(delays) / len(delays), 1) if delays else None
        row['on_time_percent'] = round(row['on_time'] / paid * 100) if paid else None
        row['outstanding'] = _money(row['outstanding'])
        result.append(row)

    return sorted(result, key=lambda r: r['name'].lower())
