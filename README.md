# PromiPay

Monitor di compensi e scadenze per chi lavora a giornata con più agenzie (promoter, hostess, eventi, fiere).
Registri i lavori svolti; PromiPay calcola il totale dovuto e la data di scadenza del pagamento, tiene traccia
degli incassi (anche parziali) e ti avvisa dei pagamenti in ritardo.

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
| `EMAIL_BACKEND`, `EMAIL_HOST`, ... | backend console | Invio email dei promemoria |

## API

Tutte le rotte (tranne registrazione e login) richiedono `Authorization: Bearer <access token>`.
Ogni utente vede solo i propri dati.

| Metodo | Endpoint | Descrizione |
|---|---|---|
| POST | `/api/auth/register/` | Registrazione (`username`, `email`, `password`) |
| POST | `/api/auth/token/` | Login: restituisce `access` e `refresh` |
| POST | `/api/auth/token/refresh/` | Rinnova il token di accesso |
| GET | `/api/auth/me/` | Utente corrente |
| CRUD | `/api/agencies/` | Agenzie (`?search=`) |
| CRUD | `/api/jobs/` | Lavori (`?status=open\|paid\|overdue\|due_soon`, `?agency=`, `?paid=`, `?contract_type=`, `?search=`, `?ordering=due_date`, `?page=`, `?page_size=`) |
| GET | `/api/jobs/summary/` | Totali e conteggi per la dashboard |
| GET | `/api/jobs/export/` | Export CSV (accetta gli stessi filtri dell'elenco) |
| CRUD | `/api/payments/` | Pagamenti parziali (`job`, `amount`, `date`, `note`) |

Le liste sono paginate (20 elementi, `page_size` fino a 500).

Regole di calcolo:
- `total = daily_pay × work_days`
- `due_date = first_day + payment_months` mesi di calendario (es. 31/01 + 1 mese = 28/02)
- quando la somma dei pagamenti copre il totale il lavoro diventa `paid` e `paid_on` prende la data dell'ultimo pagamento

## Comandi di gestione

```bash
python manage.py test jobs                          # test automatici
python manage.py seed_demo_data --user <username>   # dati demo per un utente
python manage.py assign_owner <username>            # assegna i dati creati prima dell'autenticazione
python manage.py send_payment_reminders --days 7    # email con pagamenti in ritardo/in scadenza
python manage.py send_payment_reminders --dry-run   # anteprima senza inviare
```

Per i promemoria automatici, pianifica il comando con cron, ad esempio ogni mattina alle 8:

```
0 8 * * * cd /percorso/PromiPay/backend && ../venv/bin/python manage.py send_payment_reminders
```

## Pannello admin

`/admin/` (con un superuser) permette di gestire agenzie, lavori e pagamenti.
