import csv
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .filters import JobFilter
from .models import Agency, Job, Payment
from .serializers import (
    AgencySerializer,
    JobSerializer,
    PaymentSerializer,
    RegisterSerializer,
    UserSerializer,
)

ZERO = Value(Decimal('0'), output_field=DecimalField(max_digits=12, decimal_places=2))


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class AgencyViewSet(viewsets.ModelViewSet):
    serializer_class = AgencySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def get_queryset(self):
        return Agency.objects.filter(owner=self.request.user).order_by('name')


class JobViewSet(viewsets.ModelViewSet):
    serializer_class = JobSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = JobFilter
    search_fields = ['agency__name']
    ordering_fields = ['first_day', 'due_date', 'total']
    ordering = ['-first_day']

    def get_queryset(self):
        return (
            Job.objects.filter(owner=self.request.user)
            .select_related('agency')
            .prefetch_related('payments')
            .annotate(payments_sum=Coalesce(Sum('payments__amount'), ZERO))
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False)
    def summary(self, request):
        today = timezone.localdate()
        jobs = Job.objects.filter(owner=request.user)

        counts = jobs.aggregate(
            total_jobs=Count('id'),
            open_count=Count('id', filter=Q(paid=False)),
            paid_count=Count('id', filter=Q(paid=True)),
            overdue_count=Count('id', filter=Q(paid=False, due_date__lt=today)),
            due_soon_count=Count(
                'id',
                filter=Q(paid=False, due_date__gte=today, due_date__lte=today + timedelta(days=7)),
            ),
            total_paid_jobs=Coalesce(Sum('total', filter=Q(paid=True)), ZERO),
            total_open_gross=Coalesce(Sum('total', filter=Q(paid=False)), ZERO),
        )
        partial = Payment.objects.filter(job__owner=request.user, job__paid=False).aggregate(
            s=Coalesce(Sum('amount'), ZERO)
        )['s']

        return Response({
            'total_jobs': counts['total_jobs'],
            'total_agencies': Agency.objects.filter(owner=request.user).count(),
            'open_count': counts['open_count'],
            'paid_count': counts['paid_count'],
            'overdue_count': counts['overdue_count'],
            'due_soon_count': counts['due_soon_count'],
            # Strings, like every other money field in the API, to avoid float rounding.
            'total_open': f"{counts['total_open_gross'] - partial:.2f}",
            'total_paid': f"{counts['total_paid_jobs'] + partial:.2f}",
        })

    @action(detail=False)
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        contract_labels = dict(Job.CONTRACT_TYPE_CHOICES)

        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="promipay_lavori.csv"'
        response.write('﻿')  # BOM so Excel detects UTF-8

        writer = csv.writer(response, delimiter=';')
        writer.writerow([
            'Agenzia', 'Data inizio', 'Giorni', 'Compenso giornaliero', 'Contratto',
            'Mesi pagamento', 'Totale', 'Incassato', 'Residuo', 'Scadenza', 'Pagato', 'Pagato il',
        ])

        def money(value):
            return f"{value:.2f}".replace('.', ',')

        for job in queryset:
            writer.writerow([
                job.agency.name,
                job.first_day.isoformat(),
                job.work_days,
                money(job.daily_pay),
                contract_labels.get(job.contract_type, job.contract_type),
                job.payment_months,
                money(job.total),
                money(job.amount_paid),
                money(job.amount_due),
                job.due_date.isoformat() if job.due_date else '',
                'Si' if job.paid else 'No',
                job.paid_on.isoformat() if job.paid_on else '',
            ])
        return response


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['job']

    def get_queryset(self):
        return Payment.objects.filter(job__owner=self.request.user).select_related('job')

    def perform_create(self, serializer):
        payment = serializer.save()
        payment.job.sync_paid_status()

    def perform_update(self, serializer):
        previous_job = serializer.instance.job
        payment = serializer.save()
        payment.job.sync_paid_status()
        if previous_job.pk != payment.job.pk:
            previous_job.sync_paid_status()

    def perform_destroy(self, instance):
        job = instance.job
        instance.delete()
        job.sync_paid_status()
