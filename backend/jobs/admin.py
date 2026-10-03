from django.contrib import admin

from .models import Agency, Attachment, Expense, Job, Payment


@admin.register(Agency)
class AgencyAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner')
    list_filter = ('owner',)
    search_fields = ('name',)


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0


class ExpenseInline(admin.TabularInline):
    model = Expense
    extra = 0


class AttachmentInline(admin.TabularInline):
    model = Attachment
    extra = 0
    readonly_fields = ('name', 'size', 'uploaded_at')


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ('agency', 'owner', 'first_day', 'work_days', 'daily_pay', 'total', 'due_date', 'paid', 'paid_on')
    list_filter = ('paid', 'contract_type', 'owner', 'agency')
    search_fields = ('agency__name',)
    date_hierarchy = 'first_day'
    # paid / paid_on are derived from the payments below.
    readonly_fields = ('total', 'due_date', 'paid', 'paid_on')
    inlines = [PaymentInline, ExpenseInline, AttachmentInline]

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        form.instance.sync_paid_status()


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('job', 'amount', 'date', 'note')
    list_filter = ('date',)
    search_fields = ('job__agency__name', 'note')

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        obj.job.sync_paid_status()

    def delete_model(self, request, obj):
        job = obj.job
        super().delete_model(request, obj)
        job.sync_paid_status()


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('job', 'date', 'category', 'amount', 'reimbursable', 'reimbursed')
    list_filter = ('category', 'reimbursable', 'reimbursed')


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'job', 'size', 'uploaded_at')
    readonly_fields = ('size', 'uploaded_at')
