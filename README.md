# PromiPay

Monitor di compensi e scadenze per chi lavora a giornata con più agenzie (promoter, hostess, eventi, fiere).
Registri i lavori svolti; PromiPay calcola il totale dovuto e la data di scadenza del pagamento, tiene traccia
degli incassi (anche parziali), delle spese e dei documenti, e ti avvisa dei pagamenti in ritardo.

Funzioni principali:
- **Dashboard** con importi da incassare, ritardi e scadenze vicine
- **Lavori** con filtri, paginazione, export CSV e dettagli (pagamenti parziali, spese/rimborsi, documenti allegati)
- **Calendario** mensile di giornate lavorate e scadenze
- **Agenzie** con indice di affidabilita (puntualita e ritardo medio nei pagamenti)
- **Riepilogo fiscale** annuale: lordo, incassato, ritenuta stimata, soglia 5.000 EUR delle prestazioni occasionali
- **Account**: registrazione, cambio email/password, recupero password via email

- **Backend:** Python 3.9+, Django 4.2, Django REST Framework, SimpleJWT, SQLite
- **Frontend:** React 19, Vite 7, React Router 7, Axios

## Avvio rapido

### Backend

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp backend/.env.example backend/.env   # poi imposta DJANGO_SECRET_KEY
cd backend
python manage.py migrate
python manage.py createsuperuser        # oppure registrati dall'interfaccia
python manage.py runserver              # http://127.0.0.1:8000
```

Genera una chiave segreta con:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### Frontend

```bash
cd frontend
npm install
npm run dev                             # http://localhost:5173
```

L'URL dell'API si cambia con `VITE_API_BASE_URL` (default `http://127.0.0.1:8000/api/`).

## Configurazione (`backend/.env`)

| Variabile | Default | Descrizione |
|---|---|---|
| `DJANGO_SECRET_KEY` | — (obbligatoria se `DEBUG` è off) | Chiave segreta Django |
| `DJANGO_DEBUG` | `False` | Modalità debug |
| `DJANGO_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Host consentiti |
| `CORS_ALLOWED_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Origini del frontend |
| `DJANGO_DB_PATH` | `backend/db.sqlite3` | Percorso del database SQLite |
| `DATABASE_URL` | — | Se impostata (es. PostgreSQL) sostituisce SQLite |
| `FRONTEND_URL` | `http://localhost:5173` | Usato nei link di reset password |
| `DJANGO_MEDIA_ROOT` | `backend/media` | Dove salvare i documenti caricati |
| `MAX_ATTACHMENT_SIZE_MB` | `10` | Dimensione massima dei documenti |
| `DJANGO_BACKUP_DIR` | `backend/backups` | Cartella dei backup |
| `OCCASIONAL_WITHHOLDING_RATE` | `0.20` | Ritenuta d'acconto stimata sulle prestazioni occasionali |
| `OCCASIONAL_INPS_THRESHOLD` | `5000` | Soglia annua delle prestazioni occasionali |
| `THROTTLE_LOGIN` / `THROTTLE_REGISTER` / `THROTTLE_PASSWORD_RESET` | `10/min`, `5/hour`, `5/hour` | Limiti ai tentativi |
| `EMAIL_BACKEND`, `EMAIL_HOST`, ... | backend console | Invio email dei promemoria |

## API

Tutte le rotte (tranne registrazione e login) richiedono `Authorization: Bearer <access token>`.
Ogni utente vede solo i propri dati.

| Metodo | Endpoint | Descrizione |
|---|---|---|
| POST | `/api/auth/register/` | Registrazione (`username`, `email`, `password`) |
| POST | `/api/auth/token/` | Login: restituisce `access` e `refresh` |
| POST | `/api/auth/token/refresh/` | Rinnova i token (il vecchio refresh viene invalidato) |
| POST | `/api/auth/logout/` | Invalida il refresh token (`{"refresh": ...}`) |
| GET / PATCH | `/api/auth/me/` | Utente corrente, modifica email |
| POST | `/api/auth/password/change/` | Cambio password (disconnette gli altri dispositivi) |
| POST | `/api/auth/password/reset/` | Invia per email il link di reset |
| POST | `/api/auth/password/reset/confirm/` | Imposta la nuova password (`uid`, `token`, `new_password`) |
| CRUD | `/api/agencies/` | Agenzie (`?search=`) |
| GET | `/api/agencies/stats/` | Affidabilita: lavori, puntualita, ritardo medio, residuo |
| CRUD | `/api/jobs/` | Lavori (`?status=open\|paid\|overdue\|due_soon`, `?agency=`, `?contract_type=`, `?search=`, `?first_from=`, `?first_to=`, `?due_from=`, `?due_to=`, `?ordering=due_date`, `?page=`, `?page_size=`). `mark_paid: true` registra il saldo |
| POST | `/api/jobs/{id}/settle/` | Registra un pagamento pari al residuo |
| GET | `/api/jobs/summary/` | Totali e conteggi per la dashboard |
| GET | `/api/jobs/fiscal/?year=` | Riepilogo fiscale annuale |
| GET | `/api/jobs/export/` | Export CSV (accetta gli stessi filtri dell'elenco) |
| CRUD | `/api/payments/` | Pagamenti (`job`, `amount`, `date`, `note`) |
| CRUD | `/api/expenses/` | Spese (`job`, `date`, `category`, `amount`, `reimbursable`, `reimbursed`, `note`) |
| POST / GET / DELETE | `/api/attachments/` | Documenti (upload multipart `job` + `file`); download da `/api/attachments/{id}/download/` |

Le liste sono paginate (20 elementi, `page_size` fino a 500).

Regole di calcolo:
- `total = daily_pay × work_days`
- `due_date = first_day + payment_months` mesi di calendario (es. 31/01 + 1 mese = 28/02)
- lo stato `paid` dipende solo dai pagamenti: quando la loro somma copre il totale il lavoro e saldato e `paid_on`
  prende la data dell'ultimo pagamento; eliminando un pagamento torna aperto

## Comandi di gestione

```bash
python manage.py test jobs                          # test automatici
python manage.py seed_demo_data --user <username>   # dati demo per un utente
python manage.py assign_owner <username>            # assegna i dati creati prima dell'autenticazione
python manage.py send_payment_reminders --days 7    # email con pagamenti in ritardo/in scadenza
python manage.py send_payment_reminders --dry-run   # anteprima senza inviare
python manage.py backup_db --keep 14                # copia del database SQLite in backend/backups/
```

Per i promemoria automatici, pianifica il comando con cron, ad esempio ogni mattina alle 8:

```
0 8 * * * cd /percorso/PromiPay/backend && ../venv/bin/python manage.py send_payment_reminders
30 2 * * * cd /percorso/PromiPay/backend && ../venv/bin/python manage.py backup_db
```

## Test

```bash
cd backend && python manage.py test jobs    # backend
cd frontend && npm test                     # frontend (Vitest)
```

A ogni push su GitHub la pipeline in `.github/workflows/ci.yml` esegue test, lint e build.

## Messa in produzione (Docker)

```bash
cp deploy/.env.production.example deploy/.env.production   # compila i valori
docker compose up -d --build                              # http://localhost:8080
docker compose exec backend python manage.py createsuperuser
```

Lo stack avvia PostgreSQL, Django con gunicorn e nginx, che serve il frontend e inoltra `/api` e `/admin` al
backend. Per l'HTTPS mettilo dietro un proxy (es. Caddy o Traefik) e imposta `DJANGO_SSL_REDIRECT=True`.
Con PostgreSQL usa `pg_dump` per i backup al posto di `backup_db`.

## Pannello admin

`/admin/` (con un superuser) permette di gestire agenzie, lavori e pagamenti.

## Note

Progetto realizzato a scopo di studio. Parte del codice e stata sviluppata con l'aiuto di un assistente AI
(Claude), usato per scrivere, rivedere e spiegare le singole funzionalita.
