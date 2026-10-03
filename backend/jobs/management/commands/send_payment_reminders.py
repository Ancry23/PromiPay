from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.utils import timezone

from jobs.models import Job


class Command(BaseCommand):
    help = "Email each user the unpaid jobs that are overdue or due within the next N days."

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=7, help='Giorni di anticipo per le scadenze (default 7).')
        parser.add_argument('--dry-run', action='store_true', help='Mostra le email senza inviarle.')

    def handle(self, *args, **options):
        today = timezone.localdate()
        limit = today + timedelta(days=options['days'])
        sent = 0

        users = get_user_model().objects.filter(is_active=True).exclude(email='')
        for user in users:
            jobs = list(
                Job.objects.filter(owner=user, paid=False, due_date__lte=limit)
                .select_related('agency')
                .order_by('due_date')
            )
            if not jobs:
                continue

            lines = []
            for job in jobs:
                label = 'IN RITARDO' if job.due_date < today else 'in scadenza'
                lines.append(
                    f"- {job.agency.name}: {job.amount_due:.2f} EUR, scadenza {job.due_date:%d/%m/%Y} ({label})"
                )

            subject = f"PromiPay: {len(jobs)} pagamenti da controllare"
            body = (
                f"Ciao {user.username},\n\n"
                f"questi compensi risultano ancora da incassare:\n\n"
                + "\n".join(lines)
                + "\n\nApri PromiPay per aggiornare lo stato dei pagamenti.\n"
            )

            if options['dry_run']:
                self.stdout.write(f"--- {user.email}\n{subject}\n{body}")
            else:
                send_mail(subject, body, None, [user.email])
            sent += 1

        self.stdout.write(self.style.SUCCESS(f"Promemoria preparati per {sent} utenti."))
