import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { apiErrorMessage } from "../api/axios";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      setError("Le due password non coincidono.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await api.post("auth/password/reset/confirm/", { uid, token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, "Reset non riuscito."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!uid || !token) {
    return (
      <section className="panel auth-panel">
        <h2>Link non valido</h2>
        <p className="muted">Il link di reset e incompleto. Richiedine uno nuovo dalla pagina di accesso.</p>
        <Link className="ghost-button link-button" to="/login">Vai all'accesso</Link>
      </section>
    );
  }

  return (
    <section className="panel auth-panel">
      <div className="section-head">
        <div>
          <h2>Nuova password</h2>
          <p className="muted">Scegli una password che non usi per altri servizi.</p>
        </div>
      </div>

      {done ? (
        <div className="form-grid">
          <p className="success-text">Password aggiornata. Ora puoi accedere.</p>
          <Link className="primary-button link-button" to="/login">Accedi</Link>
        </div>
      ) : (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Nuova password</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>Ripeti password</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error ? <p className="error-text compact">{error}</p> : null}
          <div className="actions-row">
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Attendere..." : "Salva password"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
