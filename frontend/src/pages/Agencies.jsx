import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiErrorMessage, fetchAll } from "../api/axios";
import Toast from "../components/Toast";

const initialForm = {
  name: "",
};

export default function Agencies() {
  const [agencies, setAgencies] = useState([]);
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
      setAgencies(await fetchAll("agencies/"));
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
                <span>{agency.name}</span>
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
