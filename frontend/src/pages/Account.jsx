import { useCallback, useState } from "react";
import api, { apiErrorMessage } from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import Toast from "../components/Toast";

export default function Account() {
  const { user, setUser, changePassword } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailError, setEmailError] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [passwords, setPasswords] = useState({ old: "", next: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [toast, setToast] = useState(null);
  const clearToast = useCallback(() => setToast(null), []);

  const saveEmail = async (event) => {
    event.preventDefault();
    try {
      setSavingEmail(true);
      setEmailError("");
      const response = await api.patch("auth/me/", { email: email.trim() });
      setUser(response.data);
      setToast({ type: "success", message: "Email aggiornata." });
    } catch (err) {
      setEmailError(apiErrorMessage(err, "Aggiornamento non riuscito."));
    } finally {
      setSavingEmail(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (!passwords.old || !passwords.next) {
      setPasswordError("Compila tutti i campi.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordError("Le due password non coincidono.");
      return;
    }

    try {
      setSavingPassword(true);
      setPasswordError("");
      await changePassword(passwords.old, passwords.next);
      setPasswords({ old: "", next: "", confirm: "" });
      setToast({ type: "success", message: "Password aggiornata. Gli altri dispositivi sono stati disconnessi." });
    } catch (err) {
      setPasswordError(apiErrorMessage(err, "Cambio password non riuscito."));
    } finally {
      setSavingPassword(false);
    }
  };

  const setPw = (key, value) => setPasswords((current) => ({ ...current, [key]: value }));

  return (
    <section className="page-grid">
      <Toast toast={toast} onDone={clearToast} />

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Account</h2>
            <p className="muted">Sei connesso come <strong>{user?.username}</strong>.</p>
          </div>
        </div>

        <form className="form-grid" onSubmit={saveEmail}>
          <label className="field">
            <span>Email (promemoria scadenze e recupero password)</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {emailError ? <p className="error-text compact">{emailError}</p> : null}
          <div className="actions-row">
            <button className="primary-button" type="submit" disabled={savingEmail}>
              {savingEmail ? "Salvataggio..." : "Salva email"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Cambia password</h2>
            <p className="muted">Dopo il cambio verrai disconnesso dagli altri dispositivi.</p>
          </div>
        </div>

        <form className="form-grid two-columns" onSubmit={savePassword}>
          <label className="field full-width">
            <span>Password attuale</span>
            <input type="password" autoComplete="current-password" value={passwords.old} onChange={(e) => setPw("old", e.target.value)} />
          </label>
          <label className="field">
            <span>Nuova password</span>
            <input type="password" autoComplete="new-password" value={passwords.next} onChange={(e) => setPw("next", e.target.value)} />
          </label>
          <label className="field">
            <span>Ripeti nuova password</span>
            <input type="password" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPw("confirm", e.target.value)} />
          </label>
          {passwordError ? <p className="error-text compact full-width">{passwordError}</p> : null}
          <div className="actions-row full-width">
            <button className="primary-button" type="submit" disabled={savingPassword}>
              {savingPassword ? "Salvataggio..." : "Cambia password"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
