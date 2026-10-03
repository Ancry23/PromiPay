import { useEffect, useState } from "react";
import api from "../api/axios";
import { formatCurrency } from "../utils/formatters";

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export default function Fiscal() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get("jobs/fiscal/", { params: { year } })
      .then((response) => {
        if (!active) return;
        setData(response.data);
        setError("");
      })
      .catch((err) => {
        console.error("Errore riepilogo fiscale:", err);
        if (active) setError("Impossibile caricare il riepilogo.");
      });
    return () => {
      active = false;
    };
  }, [year]);

  if (error) {
    return (
      <section className="panel">
        <h2>Riepilogo fiscale</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="panel">
        <h2>Riepilogo fiscale</h2>
        <p className="muted">Caricamento in corso...</p>
      </section>
    );
  }

  const { totals, occasional } = data;
  const maxMonth = Math.max(1, ...data.by_month.flatMap((m) => [Number(m.gross), Number(m.received)]));
  const thresholdTone = occasional.over_threshold ? "danger" : occasional.percent >= 80 ? "warning" : "success";

  return (
    <section className="page-grid">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Riepilogo fiscale {data.year}</h2>
            <p className="muted">Lordo per data di lavoro, incassato per data di pagamento.</p>
          </div>
          <label className="field inline-field">
            <span>Anno</span>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {data.years_available.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">Lordo maturato</span>
            <strong className="stat-value">{formatCurrency(totals.gross)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Incassato nell'anno</span>
            <strong className="stat-value">{formatCurrency(totals.received)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Ritenuta stimata</span>
            <strong className="stat-value">{formatCurrency(totals.withholding_estimate)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Netto stimato</span>
            <strong className="stat-value">{formatCurrency(totals.net_estimate)}</strong>
          </article>
        </div>
        <p className="muted small-note">
          Ancora da incassare sui lavori dell'anno: {formatCurrency(totals.outstanding)} &middot; Spese registrate:{" "}
          {formatCurrency(totals.expenses)} (da rimborsare {formatCurrency(totals.expenses_to_reimburse)})
        </p>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Prestazioni occasionali</h2>
            <p className="muted">
              Oltre {formatCurrency(occasional.threshold)} incassati nell'anno scatta l'iscrizione alla Gestione Separata INPS.
            </p>
          </div>
          <span className={`mini-badge tone-${thresholdTone}`}>{occasional.percent}%</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={occasional.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className={`progress-bar tone-bar-${thresholdTone}`} style={{ width: `${Math.min(occasional.percent, 100)}%` }} />
        </div>
        <p className="muted">
          Incassato {formatCurrency(occasional.received)} &middot;{" "}
          {occasional.over_threshold
            ? "Soglia superata: verifica la tua posizione con un commercialista."
            : `Margine residuo ${formatCurrency(occasional.remaining)}`}
        </p>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Andamento mensile</h2>
            <p className="muted">
              <span className="legend legend-gross" /> Lordo maturato <span className="legend legend-received" /> Incassato
            </p>
          </div>
        </div>
        <div className="month-chart">
          {data.by_month.map((m) => (
            <div key={m.month} className="month-col" title={`${MONTHS[m.month - 1]}: lordo ${formatCurrency(m.gross)}, incassato ${formatCurrency(m.received)}`}>
              <div className="month-bars">
                <div className="bar bar-gross" style={{ height: `${(Number(m.gross) / maxMonth) * 100}%` }} />
                <div className="bar bar-received" style={{ height: `${(Number(m.received) / maxMonth) * 100}%` }} />
              </div>
              <span className="month-label">{MONTHS[m.month - 1]}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Per agenzia</h2>
          {data.by_agency.length === 0 ? (
            <p className="muted">Nessun dato per l'anno selezionato.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table compact-table">
                <thead>
                  <tr>
                    <th>Agenzia</th>
                    <th>Lavori</th>
                    <th>Lordo</th>
                    <th>Incassato</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_agency.map((row) => (
                    <tr key={row.agency_id}>
                      <td>{row.name}</td>
                      <td>{row.jobs}</td>
                      <td>{formatCurrency(row.gross)}</td>
                      <td>{formatCurrency(row.received)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Per contratto</h2>
          {data.by_contract.length === 0 ? (
            <p className="muted">Nessun dato.</p>
          ) : (
            <ul className="summary-list">
              {data.by_contract.map((row) => (
                <li key={row.contract_type} className="summary-item">
                  <div>
                    <strong>{row.label}</strong>
                    <p className="muted compact-line">{row.jobs} lavori</p>
                  </div>
                  <div className="summary-meta">
                    <strong>{formatCurrency(row.gross)}</strong>
                    <span className="muted compact-line">incassato {formatCurrency(row.received)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="muted small-note">
        Stime indicative: ritenuta d'acconto calcolata al {Math.round(occasional.withholding_rate * 100)}% sugli incassi
        da prestazioni occasionali. Non sostituisce il parere di un commercialista.
      </p>
    </section>
  );
}
