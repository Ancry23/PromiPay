import sqlite3
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections


class Command(BaseCommand):
    help = "Make a consistent copy of the SQLite database in BACKUP_DIR and keep only the most recent ones."

    def add_arguments(self, parser):
        parser.add_argument('--keep', type=int, default=14, help='Quanti backup conservare (default 14).')
        parser.add_argument('--dir', help='Cartella di destinazione (default BACKUP_DIR).')

    def handle(self, *args, **options):
        db = settings.DATABASES['default']
        if db['ENGINE'] != 'django.db.backends.sqlite3':
            raise CommandError(
                "backup_db gestisce solo SQLite. Per PostgreSQL usa pg_dump, ad es.: "
                "pg_dump \"$DATABASE_URL\" > promipay_$(date +%F).sql"
            )
        if options['keep'] < 1:
            raise CommandError('--keep deve essere almeno 1.')

        backup_dir = Path(options['dir'] or settings.BACKUP_DIR)
        backup_dir.mkdir(parents=True, exist_ok=True)
        target = backup_dir / f"promipay_{datetime.now():%Y%m%d_%H%M%S}.sqlite3"

        # sqlite3's online backup API copies a consistent snapshot even while the app is writing.
        connection = connections['default']
        connection.ensure_connection()
        with sqlite3.connect(target) as destination:
            connection.connection.backup(destination)

        backups = sorted(backup_dir.glob('promipay_*.sqlite3'))
        for old in backups[:-options['keep']]:
            old.unlink()

        self.stdout.write(self.style.SUCCESS(
            f"Backup creato: {target} ({target.stat().st_size // 1024} KB). "
            f"Conservati {min(len(backups), options['keep'])} backup."
        ))
