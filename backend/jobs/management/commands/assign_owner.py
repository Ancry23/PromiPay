from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from jobs.models import Agency, Job


class Command(BaseCommand):
    help = "Assign agencies and jobs without an owner (created before authentication existed) to a user."

    def add_arguments(self, parser):
        parser.add_argument('username')

    def handle(self, *args, **options):
        User = get_user_model()
        try:
            user = User.objects.get(username=options['username'])
        except User.DoesNotExist as exc:
            raise CommandError(f"Utente '{options['username']}' non trovato.") from exc

        agencies = Agency.objects.filter(owner__isnull=True).update(owner=user)
        jobs = Job.objects.filter(owner__isnull=True).update(owner=user)
        self.stdout.write(self.style.SUCCESS(
            f"Assegnate a {user.username}: {agencies} agenzie e {jobs} lavori."
        ))
