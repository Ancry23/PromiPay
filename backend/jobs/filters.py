from datetime import timedelta

import django_filters
from django.utils import timezone

from .models import Job


class JobFilter(django_filters.FilterSet):
    STATUS_CHOICES = [
        ('open', 'Aperti'),
        ('paid', 'Pagati'),
        ('overdue', 'In ritardo'),
        ('due_soon', 'In scadenza entro 7 giorni'),
    ]

    status = django_filters.ChoiceFilter(choices=STATUS_CHOICES, method='filter_status')
    due_from = django_filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_to = django_filters.DateFilter(field_name='due_date', lookup_expr='lte')
    first_from = django_filters.DateFilter(field_name='first_day', lookup_expr='gte')
    first_to = django_filters.DateFilter(field_name='first_day', lookup_expr='lte')

    class Meta:
        model = Job
        fields = ['agency', 'paid', 'contract_type']

    def filter_status(self, queryset, name, value):
        today = timezone.localdate()
        if value == 'open':
            return queryset.filter(paid=False)
        if value == 'paid':
            return queryset.filter(paid=True)
        if value == 'overdue':
            return queryset.filter(paid=False, due_date__lt=today)
        if value == 'due_soon':
            return queryset.filter(paid=False, due_date__gte=today, due_date__lte=today + timedelta(days=7))
        return queryset
