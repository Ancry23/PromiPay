# PromiPay - frontend

Single Page Application React + Vite per PromiPay. Vedi il [README principale](../README.md) per la panoramica.

```bash
npm install
npm run dev       # server di sviluppo su http://localhost:5173
npm run build     # build di produzione in dist/
npm run lint      # ESLint
npm run preview   # anteprima della build
```

Variabili d'ambiente (file `.env.local`):

- `VITE_API_BASE_URL`: URL dell'API Django (default `http://127.0.0.1:8000/api/`).

Struttura:

- `src/api/` - istanza Axios con token JWT e refresh automatico, helper per paginazione ed errori
- `src/auth/` - contesto di autenticazione (login, registrazione, logout)
- `src/pages/` - Dashboard, Lavori (filtri, paginazione, export CSV, pagamenti), Agenzie, Login
- `src/components/` - componenti condivisi
- `src/utils/` - formattazione valuta/date e calcolo delle scadenze
