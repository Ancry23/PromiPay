import { useState } from "react";
import api, { apiErrorMessage } from "../api/axios";
import { formatCurrency, formatDate, formatFileSize, todayIso } from "../utils/formatters";

const TABS = [
  { key: "payments", label: "Pagamenti" },
  { key: "expenses", label: "Spese" },
  { key: "documents", label: "Documenti" },
];

const expenseCategories = [
  { value: "travel", label: "Viaggio" },
  { value: "meal", label: "Pasti" },
  { value: "parking", label: "Parcheggio" },
  { value: "lodging", label: "Alloggio" },
  { value: "other", label: "Altro" },
];

const categoryLabel = (value) => expenseCategories.find((c) => c.value === value)?.label ?? value;

export default function JobDetailsModal({ job, onClose, onChanged }) {
  const [tab, setTab] = useState("payments");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Run an API call, then refresh the job list so totals stay in sync.
  const run = async (request, successMessage, fallbackError) => {
    try {
      setBusy(true);
      setError("");
      await request();
      await onChanged(successMessage);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err, fallbackError));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="modal-card modal-wide" aria-labelledby="details-title">
        <div className="section-head">
          <div>
            <h3 id="details-title">
              {job.agency?.name ?? "-"} &middot; {formatDate(job.first_day)}
            </h3>
            <p className="muted">
              Totale {formatCurrency(job.total)} &middot; Incassato {formatCurrency(job.amount_paid)} &middot; Residuo{" "}
              <strong>{formatCurrency(job.amount_due)}</strong>
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>
            Chiudi
          </button>
        </div>

        <div className="filter-row" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? "filter-chip active" : "filter-chip"}
              onClick={() => {
                setTab(t.key);
                setError("");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "payments" ? <PaymentsTab job={job} busy={busy} run={run} /> : null}
        {tab === "expenses" ? <ExpensesTab job={job} busy={busy} run={run} /> : null}
        {tab === "documents" ? <DocumentsTab job={job} busy={busy} run={run} setError={setError} /> : null}

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}

function PaymentsTab({ job, busy, run }) {
  const [amount, setAmount] = useState(() => (Number(job.amount_due) > 0 ? job.amount_due : ""));
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");

  const addPayment = async (event) => {
    event.preventDefault();
    const ok = await run(
      () => api.post("payments/", { job: job.id, amount, date, note: note.trim() }),
      "Pagamento registrato.",
      "Registrazione pagamento non riuscita."
    );
    if (ok) {
      setAmount("");
      setNote("");
    }
  };

  return (
    <>
      {job.payments?.length ? (
        <ul className="payment-list">
          {job.payments.map((payment) => (
            <li key={payment.id} className="agency-item">
              <span>
                <strong>{formatCurrency(payment.amount)}</strong> il {formatDate(payment.date)}
                {payment.note ? <span className="muted"> &middot; {payment.note}</span> : null}
              </span>
              <button
                className="danger-button"
                type="button"
                disabled={busy}
                onClick={() => run(() => api.delete(`payments/${payment.id}/`), "Pagamento eliminato.", "Eliminazione non riuscita.")}
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
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          <span>Data incasso</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field full-width">
          <span>Nota (opzionale)</span>
          <input type="text" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="actions-row full-width">
          <button className="primary-button" type="submit" disabled={busy || !amount}>
            Registra pagamento
          </button>
        </div>
      </form>
    </>
  );
}

const initialExpense = { date: "", category: "travel", amount: "", reimbursable: true, note: "" };

function ExpensesTab({ job, busy, run }) {
  const [form, setForm] = useState(() => ({ ...initialExpense, date: job.first_day }));
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const addExpense = async (event) => {
    event.preventDefault();
    const ok = await run(
      () => api.post("expenses/", { ...form, job: job.id, note: form.note.trim() }),
      "Spesa registrata.",
      "Registrazione spesa non riuscita."
    );
    if (ok) setForm({ ...initialExpense, date: form.date });
  };

  return (
    <>
      <p className="muted compact-line">
        Totale spese {formatCurrency(job.expenses_total)} &middot; da rimborsare{" "}
        <strong>{formatCurrency(job.expenses_to_reimburse)}</strong>
      </p>

      {job.expenses?.length ? (
        <ul className="payment-list">
          {job.expenses.map((expense) => (
            <li key={expense.id} className="agency-item">
              <span>
                <strong>{formatCurrency(expense.amount)}</strong> {categoryLabel(expense.category)} il{" "}
                {formatDate(expense.date)}
                {expense.note ? <span className="muted"> &middot; {expense.note}</span> : null}{" "}
                <span
                  className={`mini-badge tone-${
                    !expense.reimbursable ? "neutral" : expense.reimbursed ? "success" : "warning"
                  }`}
                >
                  {!expense.reimbursable ? "A mio carico" : expense.reimbursed ? "Rimborsata" : "Da rimborsare"}
                </span>
              </span>
              <div className="inline-actions">
                {expense.reimbursable ? (
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.patch(`expenses/${expense.id}/`, { reimbursed: !expense.reimbursed }),
                        expense.reimbursed ? "Segnata da rimborsare." : "Segnata come rimborsata.",
                        "Aggiornamento non riuscito."
                      )
                    }
                  >
                    {expense.reimbursed ? "Annulla rimborso" : "Rimborsata"}
                  </button>
                ) : null}
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => api.delete(`expenses/${expense.id}/`), "Spesa eliminata.", "Eliminazione non riuscita.")}
                >
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nessuna spesa registrata.</p>
      )}

      <form className="form-grid two-columns payment-form" onSubmit={addExpense}>
        <label className="field">
          <span>Categoria</span>
          <select value={form.category} onChange={(e) => setField("category", e.target.value)}>
            {expenseCategories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Importo</span>
          <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setField("amount", e.target.value)} />
        </label>
        <label className="field">
          <span>Data</span>
          <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
        </label>
        <label className="field">
          <span>Nota (opzionale)</span>
          <input type="text" value={form.note} maxLength={255} onChange={(e) => setField("note", e.target.value)} />
        </label>
        <label className="field checkbox-field full-width">
          <input type="checkbox" checked={form.reimbursable} onChange={(e) => setField("reimbursable", e.target.checked)} />
          <span>Rimborsabile dall'agenzia</span>
        </label>
        <div className="actions-row full-width">
          <button className="primary-button" type="submit" disabled={busy || !form.amount}>
            Aggiungi spesa
          </button>
        </div>
      </form>
    </>
  );
}

function DocumentsTab({ job, busy, run, setError }) {
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.append("job", job.id);
    body.append("file", file);
    const ok = await run(() => api.post("attachments/", body), "Documento caricato.", "Caricamento non riuscito.");
    if (ok) {
      setFile(null);
      setInputKey((k) => k + 1);
    }
  };

  const download = async (attachment) => {
    try {
      const response = await api.get(`attachments/${attachment.id}/download/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Errore download:", err);
      setError("Download non riuscito.");
    }
  };

  return (
    <>
      {job.attachments?.length ? (
        <ul className="payment-list">
          {job.attachments.map((attachment) => (
            <li key={attachment.id} className="agency-item">
              <span>
                <strong>{attachment.name}</strong>{" "}
                <span className="muted">
                  &middot; {formatFileSize(attachment.size)} &middot; {formatDate(attachment.uploaded_at.slice(0, 10))}
                </span>
              </span>
              <div className="inline-actions">
                <button className="ghost-button" type="button" onClick={() => download(attachment)}>
                  Scarica
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(() => api.delete(`attachments/${attachment.id}/`), "Documento eliminato.", "Eliminazione non riuscita.")
                  }
                >
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nessun documento. Puoi caricare contratti, buste paga o ricevute.</p>
      )}

      <form className="form-grid payment-form" onSubmit={upload}>
        <label className="field">
          <span>File (PDF o immagine, max 10 MB)</span>
          <input
            key={inputKey}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="actions-row">
          <button className="primary-button" type="submit" disabled={busy || !file}>
            Carica documento
          </button>
        </div>
      </form>
    </>
  );
}
