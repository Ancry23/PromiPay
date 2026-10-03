import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiErrorMessage, fetchAll, listResults } from "../api/axios";
import Toast from "../components/Toast";
import { daysUntil } from "../utils/dueTone";
import { formatCurrency, formatDate } from "../utils/formatters";

const PAGE_SIZE = 20;

const contractOptions = [
  { value: "fixed", label: "Determinato" },
  { value: "occasional", label: "Occasionale" },
  { value: "other", label: "Altro" },
];

const statusOptions = [
  { value: "", label: "Tutti gli stati" },
  { value: "open", label: "Aperti" },
  { value: "overdue", label: "In ritardo" },
  { value: "due_soon", label: "In scadenza (7 giorni)" },
  { value: "paid", label: "Pagati" },
];

const initialForm = {
  agency_id: "",
  first_day: "",
  work_days: 1,
  daily_pay: "",
  contract_type: "fixed",
  payment_months: 1,
  paid: false,
};

const initialFilters = { status: "", agency: "", search: "" };

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

const contractLabel = (value) =>
  contractOptions.find((option) => option.value === value)?.label ?? value;

function getRowTone(dueDate, paid) {
  if (paid) return "is-paid";
  const diff = daysUntil(dueDate);
  if (diff === null) return "";
  if (diff < 0) return "is-overdue";
  if (diff <= 5) return "is-soon";
  return "";
}

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters);
  const [searchInput, setSearchInput] = useState("");
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [jobToDelete, setJobToDelete] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [paymentsJobId, setPaymentsJobId] = useState(null);

  const isEditing = editingId !== null;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const clearToast = useCallback(() => setToast(null), []);

  const queryParams = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      status: filters.status || undefined,
      agency: filters.agency || undefined,
      search: filters.search || undefined,
    }),
    [filters, page]
  );

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("jobs/", { params: queryParams });
      setJobs(listResults(response.data));
      setCount(response.data.count ?? 0);
    } catch (err) {
      // A page beyond the end (e.g. after deleting the last row) returns 404: step back.
      if (err.response?.status === 404 && queryParams.page > 1) {
        setPage((current) => current - 1);
        return;
      }
      console.error("Errore nel fetch jobs:", err);
      setError("Impossibile caricare i lavori. Verifica che il backend Django sia avviato.");
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    fetchAll("agencies/")
      .then(setAgencies)
      .catch((err) => console.error("Errore caricamento agenzie:", err));
  }, []);

  // Debounce the free-text search so we do not hit the API on every keystroke.
  useEffect(() => {
    const value = searchInput.trim();
    if (value === filters.search) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: value }));
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput, filters.search]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setSubmitError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      agency_id: Number(form.agency_id),
      first_day: form.first_day,
      work_days: Number(form.work_days),
      daily_pay: form.daily_pay,
      contract_type: form.contract_type,
      payment_months: Number(form.payment_months),
      paid: form.paid,
    };

    if (!payload.agency_id || !payload.first_day || !payload.daily_pay) {
      setSubmitError("Compila agenzia, data e compenso.");
      return;
    }

    try {
      setSaving(true);
      setSubmitError("");

      if (isEditing) {
        await api.put(`jobs/${editingId}/`, payload);
        setToast({ type: "success", message: "Lavoro aggiornato." });
      } else {
        await api.post("jobs/", payload);
        setToast({ type: "success", message: "Lavoro creato." });
      }

      resetForm();
      await loadJobs();
    } catch (err) {
      console.error("Errore salvataggio lavoro:", err);
      setSubmitError(apiErrorMessage(err, "Salvataggio non riuscito. Controlla i dati inseriti."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (job) => {
    setEditingId(job.id);
    setSubmitError("");
    setForm({
      agency_id: String(job.agency?.id ?? ""),
      first_day: job.first_day ?? "",
      work_days: job.work_days ?? 1,
      daily_pay: job.daily_pay ?? "",
      contract_type: job.contract_type ?? "fixed",
      payment_months: job.payment_months ?? 1,
      paid: Boolean(job.paid),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async () => {
    if (!jobToDelete) return;

    try {
      setDeletingId(jobToDelete.id);
      setSubmitError("");
      await api.delete(`jobs/${jobToDelete.id}/`);

      if (editingId === jobToDelete.id) {
        resetForm();
      }

      setToast({ type: "success", message: "Lavoro eliminato." });
      setJobToDelete(null);
      await loadJobs();
    } catch (err) {
      console.error("Errore eliminazione lavoro:", err);
      setSubmitError("Eliminazione non riuscita.");
      setJobToDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const { page: _page, page_size: _size, ...params } = queryParams;
      const response = await api.get("jobs/export/", { params, responseType: "blob" });
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `promipay_lavori_${todayIso()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Errore export:", err);
      setToast({ type: "error", message: "Export non riuscito." });
    } finally {
      setExporting(false);
    }
  };

  const paymentsJob = jobs.find((job) => job.id === paymentsJobId) ?? null;

  return (
    <section className="page-grid">
      <Toast toast={toast} onDone={clearToast} />

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>{isEditing ? "Modifica lavoro" : "Nuovo lavoro"}</h2>
            <p className="muted">Registra il compenso e lascia che totale e scadenza vengano calcolati dal backend.</p>
          </div>
        </div>

        <form className="form-grid two-columns" onSubmit={handleSubmit}>
          <label className="field">
            <span>Agenzia</span>
            <select value={form.agency_id} onChange={(event) => setField("agency_id", event.target.value)}>
              <option value="">Seleziona agenzia</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Data inizio</span>
            <input type="date" value={form.first_day} onChange={(event) => setField("first_day", event.target.value)} />
          </label>

          <label className="field">
            <span>Giorni</span>
            <input
              type="number"
              min="1"
              value={form.work_days}
              onChange={(event) => setField("work_days", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Compenso giornaliero</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.daily_pay}
              onChange={(event) => setField("daily_pay", event.target.value)}
              placeholder="0.00"
            />
          </label>

          <label className="field">
            <span>Contratto</span>
            <select value={form.contract_type} onChange={(event) => setField("contract_type", event.target.value)}>
              {contractOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Mesi pagamento</span>
            <input
              type="number"
              min="1"
              value={form.payment_months}
              onChange={(event) => setField("payment_months", event.target.value)}
            />
          </label>

          <label className="field checkbox-field full-width">
            <input type="checkbox" checked={form.paid} onChange={(event) => setField("paid", event.target.checked)} />
            <span>Gia pagato</span>
          </label>

          {submitError ? <p className="error-text compact full-width">{submitError}</p> : null}

          <div className="actions-row full-width">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Salvataggio..." : isEditing ? "Aggiorna lavoro" : "Crea lavoro"}
            </button>
            {isEditing ? (
              <button className="secondary-button" type="button" onClick={resetForm} disabled={saving}>
                Annulla
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Lavori</h2>
            <p className="muted">Scadenze evidenziate in base allo stato del pagamento.</p>
          </div>
          <div className="inline-actions">
            <span className="badge">{count} elementi</span>
            <button className="ghost-button" type="button" onClick={handleExport} disabled={exporting || count === 0}>
              {exporting ? "Esportazione..." : "Esporta CSV"}
            </button>
          </div>
        </div>

        <div className="filters-bar">
          <label className="field">
            <span>Stato</span>
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Agenzia</span>
            <select value={filters.agency} onChange={(event) => updateFilter("agency", event.target.value)}>
              <option value="">Tutte le agenzie</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Cerca</span>
            <input
              type="search"
              value={searchInput}
              placeholder="Nome agenzia"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
        </div>

        {loading ? <p className="muted">Caricamento in corso...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error && jobs.length === 0 ? <p className="muted">Nessun lavoro trovato.</p> : null}

        {!error && jobs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agenzia</th>
                  <th>Data inizio</th>
                  <th>Giorni</th>
                  <th>Compenso</th>
                  <th>Tipo</th>
                  <th>Pagamento</th>
                  <th>Totale</th>
                  <th>Residuo</th>
                  <th>Scadenza</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>

              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className={getRowTone(job.due_date, job.paid)}>
                    <td>{job.agency?.name ?? "-"}</td>
                    <td>{formatDate(job.first_day)}</td>
                    <td>{job.work_days}</td>
                    <td>{formatCurrency(job.daily_pay)}</td>
                    <td>{contractLabel(job.contract_type)}</td>
                    <td>{job.payment_months} mesi</td>
                    <td>{formatCurrency(job.total)}</td>
                    <td>{formatCurrency(job.amount_due)}</td>
                    <td>{formatDate(job.due_date)}</td>
                    <td>
                      <span className={job.paid ? "status status-paid" : "status status-open"}>
                        {job.paid ? `Pagato ${formatDate(job.paid_on)}` : Number(job.amount_paid) > 0 ? "Parziale" : "Da pagare"}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button className="ghost-button" type="button" onClick={() => setPaymentsJobId(job.id)}>
                          Pagamenti
                        </button>
                        <button className="ghost-button" type="button" onClick={() => startEdit(job)}>
                          Modifica
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          disabled={deletingId === job.id}
                          onClick={() => setJobToDelete(job)}
                        >
                          {deletingId === job.id ? "Eliminazione..." : "Elimina"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {totalPages > 1 ? (
          <div className="pagination">
            <button
              className="ghost-button"
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              Precedente
            </button>
            <span className="muted compact-line">
              Pagina {page} di {totalPages}
            </span>
            <button
              className="ghost-button"
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Successiva
            </button>
          </div>
        ) : null}
      </section>

      {paymentsJob ? (
        <PaymentsModal
          job={paymentsJob}
          onClose={() => setPaymentsJobId(null)}
          onChanged={async (message) => {
            setToast({ type: "success", message });
            await loadJobs();
          }}
        />
      ) : null}

      {jobToDelete ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" aria-labelledby="job-delete-title">
            <h3 id="job-delete-title">Eliminare questo lavoro?</h3>
            <p className="muted">
              Stai per rimuovere il lavoro di <strong>{jobToDelete.agency?.name ?? "agenzia sconosciuta"}</strong> del{" "}
              <strong>{formatDate(jobToDelete.first_day)}</strong>. Verranno eliminati anche i pagamenti registrati.
            </p>
            <div className="actions-row">
              <button className="danger-button" type="button" onClick={handleDelete} disabled={deletingId !== null}>
                Conferma eliminazione
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setJobToDelete(null)}
                disabled={deletingId !== null}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function PaymentsModal({ job, onClose, onChanged }) {
  const [amount, setAmount] = useState(() => (Number(job.amount_due) > 0 ? job.amount_due : ""));
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const addPayment = async (event) => {
    event.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError("Inserisci un importo maggiore di zero.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      await api.post("payments/", { job: job.id, amount, date, note: note.trim() });
      setAmount("");
      setNote("");
      await onChanged("Pagamento registrato.");
    } catch (err) {
      setError(apiErrorMessage(err, "Registrazione pagamento non riuscita."));
    } finally {
      setBusy(false);
    }
  };

  const removePayment = async (paymentId) => {
    try {
      setBusy(true);
      setError("");
      await api.delete(`payments/${paymentId}/`);
      await onChanged("Pagamento eliminato.");
    } catch (err) {
      setError(apiErrorMessage(err, "Eliminazione pagamento non riuscita."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card modal-wide" aria-labelledby="payments-title">
        <h3 id="payments-title">Pagamenti - {job.agency?.name ?? "-"}</h3>
        <p className="muted">
          Totale {formatCurrency(job.total)} &middot; Incassato {formatCurrency(job.amount_paid)} &middot; Residuo{" "}
          <strong>{formatCurrency(job.amount_due)}</strong>
        </p>

        {job.payments?.length ? (
          <ul className="payment-list">
            {job.payments.map((payment) => (
              <li key={payment.id} className="agency-item">
                <span>
                  <strong>{formatCurrency(payment.amount)}</strong> il {formatDate(payment.date)}
                  {payment.note ? <span className="muted compact-line"> &middot; {payment.note}</span> : null}
                </span>
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() => removePayment(payment.id)}
                >
                  Elimina
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nessun pagamento registrato.</p>
        )}

        <form className="form-grid two-columns payment-form" onSubmit={addPayment}>
          <label className="field">
            <span>Importo</span>
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="field">
            <span>Data incasso</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field full-width">
            <span>Nota (opzionale)</span>
            <input type="text" value={note} maxLength={255} onChange={(event) => setNote(event.target.value)} />
          </label>

          {error ? <p className="error-text compact full-width">{error}</p> : null}

          <div className="actions-row full-width">
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Attendere..." : "Registra pagamento"}
            </button>
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>
              Chiudi
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
