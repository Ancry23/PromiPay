import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiErrorMessage, fetchAll } from "../api/axios";
import Toast from "../components/Toast";
import { formatCurrency } from "../utils/formatters";

function reliability(stats) {
  if (!stats || stats.paid_jobs === 0) return null;
  if (stats.on_time_percent >= 80 && (stats.avg_delay_days ?? 0) <= 3) return { tone: "success", label: "Affidabile" };
  if (stats.on_time_percent >= 50) return { tone: "warning", label: "A volte in ritardo" };
  return { tone: "danger", label: "Spesso in ritardo" };
}

function describeDelay(days) {
  if (days === null || days === undefined) return null;
  if (days === 0) return "paga alla scadenza";
  return days > 0 ? `in media ${days} gg di ritardo` : `in media ${Math.abs(days)} gg in anticipo`;
}

const initialForm = {
  name: "",
};

export default function Agencies() {
  const [agencies, setAgencies] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [agencyToDelete, setAgencyToDelete] = useState(null);

  const isEditing = useMemo(() => editingId !== null, [editingId]);

  async function loadAgencies() {
    try {
      setLoading(true);
      setError("");
      const [list, statsResponse] = await Promise.all([fetchAll("agencies/"), api.get("agencies/stats/")]);
      setAgencies(list);
      setStats(Object.fromEntries(statsResponse.data.map((row) => [row.agency_id, row])));
    } catch (err) {
      console.error("Errore API:", err);
      setError("Impossibile caricare le agenzie.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgencies();
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setSubmitError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      name: form.name.trim(),
    };

    if (!payload.name) {
      setSubmitError("Inserisci il nome dell'agenzia.");
      return;
    }

    try {
      setSaving(true);
      setSubmitError("");

      if (isEditing) {
        await api.put(`agencies/${editingId}/`, payload);
        setToast({ type: "success", message: "Agenzia aggiornata." });
      } else {
        await api.post("agencies/", payload);
        setToast({ type: "success", message: "Agenzia creata." });
      }

      resetForm();
      await loadAgencies();
    } catch (err) {
      console.error("Errore salvataggio agenzia:", err);
      setSubmitError(apiErrorMessage(err, "Salvataggio non riuscito. Controlla che il nome non sia gia presente."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (agency) => {
    setEditingId(agency.id);
    setForm({
      name: agency.name ?? "",
    });
    setSubmitError("");
  };

  const handleDelete = async () => {
    if (!agencyToDelete) return;

    try {
      setDeletingId(agencyToDelete.id);
      setSubmitError("");
      await api.delete(`agencies/${agencyToDelete.id}/`);

      if (editingId === agencyToDelete.id) {
        resetForm();
      }

      setToast({ type: "success", message: "Agenzia eliminata." });
      setAgencyToDelete(null);
      await loadAgencies();
    } catch (err) {
      console.error("Errore eliminazione agenzia:", err);
      setSubmitError("Eliminazione non riuscita. Potrebbero esserci lavori collegati.");
      setAgencyToDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="page-grid">
      <Toast toast={toast} onDone={clearToast} />

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>{isEditing ? "Modifica agenzia" : "Nuova agenzia"}</h2>
            <p className="muted">Aggiungi o aggiorna rapidamente l'anagrafica.</p>
          </div>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Nome</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ name: event.target.value })}
              placeholder="Es. Promo Team Milano"
            />
          </label>

          {submitError ? <p className="error-text compact">{submitError}</p> : null}

          <div className="actions-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Salvataggio..." : isEditing ? "Aggiorna agenzia" : "Crea agenzia"}
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
            <h2>Agenzie</h2>
            <p className="muted">Le agenzie con cui collabori.</p>
          </div>
          <span className="badge">{agencies.length} elementi</span>
        </div>

        {loading ? <p className="muted">Caricamento in corso...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error && agencies.length === 0 ? (
          <p className="muted">Nessuna agenzia presente.</p>
        ) : null}

        {!loading && !error && agencies.length > 0 ? (
          <ul className="agency-list">
            {agencies.map((agency) => (
              <li key={agency.id} className="agency-item">
                <AgencySummary name={agency.name} stats={stats[agency.id]} />
                <div className="inline-actions">
                  <button className="ghost-button" type="button" onClick={() => startEdit(agency)}>
                    Modifica
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={deletingId === agency.id}
                    onClick={() => setAgencyToDelete(agency)}
                  >
                    {deletingId === agency.id ? "Eliminazione..." : "Elimina"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {agencyToDelete ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" aria-labelledby="agency-delete-title">
            <h3 id="agency-delete-title">Eliminare questa agenzia?</h3>
            <p className="muted">
              Stai per rimuovere <strong>{agencyToDelete.name}</strong>. Se ha lavori collegati, il backend blocchera l'operazione.
            </p>
            <div className="actions-row">
              <button className="danger-button" type="button" onClick={handleDelete} disabled={deletingId !== null}>
                Conferma eliminazione
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setAgencyToDelete(null)}
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

function AgencySummary({ name, stats }) {
  const badge = reliability(stats);
  const parts = [];
  if (stats) {
    parts.push(`${stats.jobs} lavori`);
    if (stats.on_time_percent !== null) parts.push(`${stats.on_time_percent}% puntuali`);
    const delay = describeDelay(stats.avg_delay_days);
    if (delay) parts.push(delay);
    if (Number(stats.outstanding) > 0) parts.push(`da incassare ${formatCurrency(stats.outstanding)}`);
    if (stats.overdue_jobs > 0) parts.push(`${stats.overdue_jobs} in ritardo ora`);
  }

  return (
    <div>
      <strong>{name}</strong>{" "}
      {badge ? <span className={`mini-badge tone-${badge.tone}`}>{badge.label}</span> : null}
      {parts.length ? <p className="muted compact-line">{parts.join(" \u00b7 ")}</p> : null}
    </div>
  );
}
