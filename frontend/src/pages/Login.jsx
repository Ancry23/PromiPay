import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import api, { apiErrorMessage } from "../api/axios";
import { useAuth } from "../auth/AuthContext";

const initialForm = { username: "", email: "", password: "" };

const titles = {
  login: ["Accedi", "Entra per vedere compensi e scadenze."],
  register: ["Crea un account", "I tuoi lavori e le tue agenzie saranno visibili solo a te."],
  forgot: ["Password dimenticata", "Inserisci l'email del tuo account: ti invieremo un link per sceglierne una nuova."],
};

export default function Login() {
  const { user, login, register } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={location.state?.from ?? "/"} replace />;
  }

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setInfo("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfo("");

    if (mode === "forgot") {
      if (!form.email.trim()) {
        setError("Inserisci la tua email.");
        return;
      }
    } else if (!form.username.trim() || !form.password) {
      setError("Inserisci username e password.");
      return;
    }

    try {
      setSubmitting(true);
      if (mode === "register") {
        await register({ ...form, username: form.username.trim(), email: form.email.trim() });
      } else if (mode === "forgot") {
        const response = await api.post("auth/password/reset/", { email: form.email.trim() });
        setInfo(response.data.detail);
      } else {
        await login(form.username.trim(), form.password);
      }
    } catch (err) {
      if (err.response?.status === 429) {
        setError("Troppi tentativi. Riprova tra qualche minuto.");
      } else if (mode === "login") {
        setError("Credenziali non valide.");
      } else {
        setError(apiErrorMessage(err, "Operazione non riuscita."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const [title, subtitle] = titles[mode];

  return (
    <section className="panel auth-panel">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        {mode !== "forgot" ? (
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={(event) => setField("username", event.target.value)}
            />
          </label>
        ) : null}

        {mode !== "login" ? (
          <label className="field">
            <span>{mode === "register" ? "Email (per promemoria e recupero password)" : "Email"}</span>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
            />
          </label>
        ) : null}

        {mode !== "forgot" ? (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={form.password}
              onChange={(event) => setField("password", event.target.value)}
            />
          </label>
        ) : null}

        {error ? <p className="error-text compact">{error}</p> : null}
        {info ? <p className="success-text">{info}</p> : null}

        <div className="actions-row">
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting
              ? "Attendere..."
              : mode === "register"
                ? "Registrati"
                : mode === "forgot"
                  ? "Invia link"
                  : "Accedi"}
          </button>
          {mode === "login" ? (
            <>
              <button className="ghost-button" type="button" disabled={submitting} onClick={() => switchMode("register")}>
                Nuovo utente? Registrati
              </button>
              <button className="link-text" type="button" disabled={submitting} onClick={() => switchMode("forgot")}>
                Password dimenticata?
              </button>
            </>
          ) : (
            <button className="ghost-button" type="button" disabled={submitting} onClick={() => switchMode("login")}>
              Torna all'accesso
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
