import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers

from .models import Agency, Attachment, Expense, Job, Payment

User = get_user_model()


def _request_user(serializer):
    request = serializer.context.get('request')
    return getattr(request, 'user', None)


def _limit_job_queryset(serializer, fields):
    user = _request_user(serializer)
    if user is not None and user.is_authenticated:
        fields['job'].queryset = Job.objects.filter(owner=user)
    else:
        fields['job'].queryset = Job.objects.none()
    return fields


# --- Accounts ---------------------------------------------------------------


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']

    def validate(self, attrs):
        validate_password(attrs['password'], user=User(username=attrs.get('username'), email=attrs.get('email', '')))
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']
        read_only_fields = ['username']


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('La password attuale non e corretta.')
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context['request'].user)
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(attrs['uid'])), is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if user is None or not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError({'token': 'Link non valido o scaduto. Richiedine uno nuovo.'})
        validate_password(attrs['new_password'], user=user)
        attrs['user'] = user
        return attrs


# --- Agencies ---------------------------------------------------------------


class AgencySerializer(serializers.ModelSerializer):
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Agency
        fields = ['id', 'name', 'owner']
        validators = [
            serializers.UniqueTogetherValidator(
                queryset=Agency.objects.all(),
                fields=['owner', 'name'],
                message="Hai gia un'agenzia con questo nome.",
            )
        ]


class AgencyNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agency
        fields = ['id', 'name']


# --- Job children -----------------------------------------------------------


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'job', 'amount', 'date', 'note']

    def get_fields(self):
        return _limit_job_queryset(self, super().get_fields())

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("L'importo deve essere maggiore di zero.")
        return value


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = ['id', 'job', 'date', 'category', 'amount', 'reimbursable', 'reimbursed', 'note']

    def get_fields(self):
        return _limit_job_queryset(self, super().get_fields())

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("L'importo deve essere maggiore di zero.")
        return value

    def validate(self, attrs):
        reimbursable = attrs.get('reimbursable', getattr(self.instance, 'reimbursable', True))
        if not reimbursable:
            attrs['reimbursed'] = False
        return attrs


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = ['id', 'job', 'file', 'name', 'size', 'uploaded_at']
        read_only_fields = ['name', 'size', 'uploaded_at']
        extra_kwargs = {'file': {'write_only': True}}

    def get_fields(self):
        return _limit_job_queryset(self, super().get_fields())

    def validate_file(self, value):
        extension = os.path.splitext(value.name)[1].lower()
        if extension not in settings.ALLOWED_ATTACHMENT_EXTENSIONS:
            allowed = ', '.join(settings.ALLOWED_ATTACHMENT_EXTENSIONS)
            raise serializers.ValidationError(f'Formato non supportato. Ammessi: {allowed}.')
        if value.size > settings.MAX_ATTACHMENT_SIZE:
            limit_mb = settings.MAX_ATTACHMENT_SIZE // (1024 * 1024)
            raise serializers.ValidationError(f'Il file supera il limite di {limit_mb} MB.')
        return value

    def create(self, validated_data):
        upload = validated_data['file']
        validated_data['name'] = os.path.basename(upload.name)[:255]
        validated_data['size'] = upload.size
        return super().create(validated_data)


class AttachmentNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = ['id', 'name', 'size', 'uploaded_at']


# --- Jobs -------------------------------------------------------------------


class JobSerializer(serializers.ModelSerializer):
    agency = AgencyNestedSerializer(read_only=True)
    agency_id = serializers.PrimaryKeyRelatedField(
        queryset=Agency.objects.none(),
        source='agency',
        write_only=True,
    )
    mark_paid = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
        help_text='Se vero, registra un pagamento pari al residuo (saldo).',
    )
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    amount_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    expenses_total = serializers.SerializerMethodField()
    expenses_to_reimburse = serializers.SerializerMethodField()
    payments = PaymentSerializer(many=True, read_only=True)
    expenses = ExpenseSerializer(many=True, read_only=True)
    attachments = AttachmentNestedSerializer(many=True, read_only=True)

    class Meta:
        model = Job
        fields = [
            'id', 'agency', 'agency_id',
            'first_day', 'work_days', 'daily_pay',
            'contract_type', 'payment_months',
            'total', 'due_date', 'paid', 'paid_on', 'mark_paid',
            'amount_paid', 'amount_due',
            'expenses_total', 'expenses_to_reimburse',
            'payments', 'expenses', 'attachments',
        ]
        read_only_fields = ('total', 'due_date', 'paid', 'paid_on')

    def get_fields(self):
        fields = super().get_fields()
        user = _request_user(self)
        if user is not None and user.is_authenticated:
            fields['agency_id'].queryset = Agency.objects.filter(owner=user)
        return fields

    def get_expenses_total(self, job):
        return f"{sum((e.amount for e in job.expenses.all()), 0):.2f}"

    def get_expenses_to_reimburse(self, job):
        pending = (e.amount for e in job.expenses.all() if e.reimbursable and not e.reimbursed)
        return f"{sum(pending, 0):.2f}"

    def validate_work_days(self, value):
        if value < 1:
            raise serializers.ValidationError('Inserisci almeno un giorno di lavoro.')
        return value

    def validate_daily_pay(self, value):
        if value < 0:
            raise serializers.ValidationError('Il compenso non puo essere negativo.')
        return value

    def validate_payment_months(self, value):
        if value < 1:
            raise serializers.ValidationError('I mesi di pagamento devono essere almeno 1.')
        return value

    def _save(self, instance_factory, validated_data):
        mark_paid = validated_data.pop('mark_paid', False)
        job = instance_factory(validated_data)
        if mark_paid:
            job.settle()
        else:
            # Total may have changed: re-derive the paid status from the payments.
            job.sync_paid_status()
        return job

    def create(self, validated_data):
        return self._save(super().create, validated_data)

    def update(self, instance, validated_data):
        return self._save(lambda data: super(JobSerializer, self).update(instance, data), validated_data)
