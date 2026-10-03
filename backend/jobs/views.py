import csv
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView

from .filters import JobFilter
from .fiscal import agency_stats, fiscal_summary
from .models import Agency, Attachment, Expense, Job, Payment
from .serializers import (
    AgencySerializer,
    AttachmentSerializer,
    ExpenseSerializer,
    JobSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PaymentSerializer,
    RegisterSerializer,
    UserSerializer,
)

ZERO = Value(Decimal('0'), output_field=DecimalField(max_digits=12, decimal_places=2))


def _blacklist_all_tokens(user):
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def _token_pair(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}


# --- Accounts ---------------------------------------------------------------


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'register'


class LoginView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'


class LogoutView(TokenBlacklistView):
    """Blacklist the refresh token so it can no longer be used, even if it was copied."""


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_object(self):
        return self.request.user


class PasswordChangeView(APIView):
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        # Log out every other device, keep this one signed in with fresh tokens.
        _blacklist_all_tokens(user)
        return Response(_token_pair(user))


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        for user in get_user_model().objects.filter(email__iexact=email, is_active=True):
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
            send_mail(
                'PromiPay: reimposta la password',
                f"Ciao {user.username},\n\n"
                f"per scegliere una nuova password apri questo link:\n{link}\n\n"
                "Se non hai chiesto tu il reset, ignora questa email.\n",
                None,
                [user.email],
            )

        # Same answer whether or not the email exists, so accounts cannot be enumerated.
        return Response({'detail': "Se l'email e registrata riceverai un link per reimpostare la password."})


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        _blacklist_all_tokens(user)
        return Response({'detail': 'Password aggiornata. Ora puoi accedere.'})


# --- Agencies ---------------------------------------------------------------


class AgencyViewSet(viewsets.ModelViewSet):
    serializer_class = AgencySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def get_queryset(self):
        return Agency.objects.filter(owner=self.request.user).order_by('name')

    @action(detail=False)
    def stats(self, request):
        return Response(agency_stats(request.user))


# --- Jobs -------------------------------------------------------------------


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
            .prefetch_related('payments', 'expenses', 'attachments')
            .annotate(payments_sum=Coalesce(Sum('payments__amount'), ZERO))
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['post'])
    def settle(self, request, pk=None):
        job = self.get_object()
        job.settle()
        return Response(self.get_serializer(self.get_queryset().get(pk=job.pk)).data)

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
    def fiscal(self, request):
        try:
            year = int(request.query_params.get('year', timezone.localdate().year))
        except ValueError as exc:
            raise ValidationError({'year': 'Anno non valido.'}) from exc
        return Response(fiscal_summary(request.user, year))

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
            'Spese', 'Spese da rimborsare',
        ])

        def money(value):
            return f"{value:.2f}".replace('.', ',')

        for job in queryset:
            expenses = list(job.expenses.all())
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
                money(sum((e.amount for e in expenses), Decimal('0'))),
                money(sum((e.amount for e in expenses if e.reimbursable and not e.reimbursed), Decimal('0'))),
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


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['job', 'category', 'reimbursable', 'reimbursed']

    def get_queryset(self):
        return Expense.objects.filter(job__owner=self.request.user)


class AttachmentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AttachmentSerializer
    parser_classes = [MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['job']

    def get_queryset(self):
        return Attachment.objects.filter(job__owner=self.request.user)

    @action(detail=True)
    def download(self, request, pk=None):
        attachment = self.get_object()
        try:
            handle = attachment.file.open('rb')
        except FileNotFoundError:
            return Response({'detail': 'File non trovato.'}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(handle, as_attachment=True, filename=attachment.name)
