from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Agency, Job, Payment

User = get_user_model()


def _request_user(serializer):
    request = serializer.context.get('request')
    return getattr(request, 'user', None)


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


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'job', 'amount', 'date', 'note']

    def get_fields(self):
        fields = super().get_fields()
        user = _request_user(self)
        if user is not None and user.is_authenticated:
            fields['job'].queryset = Job.objects.filter(owner=user)
        else:
            fields['job'].queryset = Job.objects.none()
        return fields

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("L'importo deve essere maggiore di zero.")
        return value


class JobSerializer(serializers.ModelSerializer):
    agency = AgencyNestedSerializer(read_only=True)
    agency_id = serializers.PrimaryKeyRelatedField(
        queryset=Agency.objects.none(),
        source='agency',
        write_only=True,
    )
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    amount_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Job
        fields = [
            'id', 'agency', 'agency_id',
            'first_day', 'work_days', 'daily_pay',
            'contract_type', 'payment_months',
            'total', 'due_date', 'paid', 'paid_on',
            'amount_paid', 'amount_due', 'payments',
        ]
        read_only_fields = ('total', 'due_date')

    def get_fields(self):
        fields = super().get_fields()
        user = _request_user(self)
        if user is not None and user.is_authenticated:
            fields['agency_id'].queryset = Agency.objects.filter(owner=user)
        return fields

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
