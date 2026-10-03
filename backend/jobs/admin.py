from django.contrib import admin

from .models import Agency, Job, Payment


@admin.register(Agency)
class AgencyAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner')
    list_filter = ('owner',)
    search_fields = ('name',)


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ('agency', 'owner', 'first_day', 'work_days', 'daily_pay', 'total', 'due_date', 'paid', 'paid_on')
    list_filter = ('paid', 'contract_type', 'owner', 'agency')
    search_fields = ('agency__name',)
    date_hierarchy = 'first_day'
    readonly_fields = ('total', 'due_date')
    inlines = [PaymentInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('job', 'amount', 'date', 'note')
    list_filter = ('date',)
    search_fields = ('job__agency__name', 'note')
