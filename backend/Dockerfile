FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_STATIC_ROOT=/app/staticfiles \
    DJANGO_MEDIA_ROOT=/app/media \
    DJANGO_BACKUP_DIR=/app/backups

WORKDIR /app

COPY requirements.txt requirements-prod.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements-prod.txt

COPY backend/ /app/

RUN useradd --create-home promipay \
    && mkdir -p /app/staticfiles /app/media /app/backups \
    && chown -R promipay /app
USER promipay

EXPOSE 8000

# Apply migrations and collect admin static files, then start gunicorn.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn backend.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --access-logfile -"]
