import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { apiErrorMessage } from "../api/axios";
import { useAuth } from "../auth/AuthContext";

const initialForm = { username: "", email: "", password: "" };

export default function Login() {
  const { user, login, register } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={location.state?.from ?? "/"} replace />;
  }

  const isRegister = mode === "register";

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError("Inserisci username e password.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      if (isRegister) {
        await register({ ...form, username: form.username.trim(), email: form.email.trim() });
      } else {
        await login(form.username.trim(), form.password);
      }
    } catch (err) {
      setError(
        isRegister
          ? apiErrorMessage(err, "Registrazione non riuscita.")
          : "Credenziali non valide."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel auth-panel">
      <div className="section-head">
        <div>
          <h2>{isRegister ? "Crea un account" : "Accedi"}</h2>
          <p className="muted">
            {isRegister
              ? "I tuoi lavori e le tue agenzie saranno visibili solo a te."
              : "Entra per vedere compensi e scadenze."}
          </p>
        </div>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Username</span>
          <input
            type="text"
            autoComplete="username"
            value={form.username}
            onChange={(event) => setField("username", event.target.value)}
          />
        </label>

        {isRegister ? (
          <label className="field">
            <span>Email (per i promemoria scadenze)</span>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
            />
          </label>
        ) : null}

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={form.password}
            onChange={(event) => setField("password", event.target.value)}
          />
        </label>

        {error ? <p className="error-text compact">{error}</p> : null}

        <div className="actions-row">
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Attendere..." : isRegister ? "Registrati" : "Accedi"}
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={submitting}
            onClick={() => {
              setMode(isRegister ? "login" : "register");
              setError("");
            }}
          >
            {isRegister ? "Hai gia un account? Accedi" : "Nuovo utente? Registrati"}
          </button>
        </div>
      </form>
    </section>
  );
}
