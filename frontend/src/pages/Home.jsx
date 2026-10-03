import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { listResults } from "../api/axios";
import { formatCurrency, formatDate } from "../utils/formatters";
import { getDueTone } from "../utils/dueTone";

const dashboardFilters = [
  { key: "all", label: "Tutti" },
  { key: "open", label: "Aperti" },
  { key: "overdue", label: "In ritardo" },
  { key: "due_soon", label: "7 giorni" },
  { key: "paid", label: "Pagati" },
];

const emptySummary = {
  total_jobs: 0,
  total_agencies: 0,
  overdue_count: 0,
  due_soon_count: 0,
  total_open: 0,
  total_paid: 0,
};

export default function Home() {
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [upcomingJobs, setUpcomingJobs] = useState([]);
  const [listError, setListError] = useState("");

  useEffect(() => {
    let active = true;

    api
      .get("jobs/summary/")
      .then((response) => {
        if (active) setSummary(response.data);
      })
      .catch((err) => {
        console.error("Errore dashboard:", err);
        if (active) setError("Impossibile caricare la dashboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const status = activeFilter === "all" ? undefined : activeFilter;

    Promise.all([
      api.get("jobs/", { params: { status, page_size: 8 } }),
      api.get("jobs/", { params: { status, page_size: 5, ordering: "due_date", paid: status ? undefined : false } }),
    ])
      .then(([previewResponse, upcomingResponse]) => {
        if (!active) return;
        setFilteredJobs(listResults(previewResponse.data));
        setFilteredCount(previewResponse.data.count ?? 0);
        setUpcomingJobs(listResults(upcomingResponse.data));
        setListError("");
      })
      .catch((err) => {
        console.error("Errore filtro dashboard:", err);
        if (active) setListError("Impossibile applicare il filtro.");
      });

    return () => {
      active = false;
    };
  }, [activeFilter]);

  if (loading) {
    return (
      <section className="panel">
        <h2>Dashboard</h2>
        <p className="muted">Caricamento in corso...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>Dashboard</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  return (
    <section className="page-grid">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Dashboard</h2>
            <p className="muted">Una vista rapida su volumi, incassi e scadenze.</p>
          </div>
          <span className="badge">Aggiornata ora</span>
        </div>

        <div className="filter-row" aria-label="Filtri dashboard">
          {dashboardFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={activeFilter === filter.key ? "filter-chip active" : "filter-chip"}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">Lavori totali</span>
            <strong className="stat-value">{summary.total_jobs}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Agenzie attive</span>
            <strong className="stat-value">{summary.total_agencies}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Da incassare</span>
            <strong className="stat-value">{formatCurrency(summary.total_open)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Gia incassato</span>
            <strong className="stat-value">{formatCurrency(summary.total_paid)}</strong>
          </article>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Scadenze vicine</h2>
              <p className="muted">Le prossime posizioni aperte ordinate per data.</p>
            </div>
            <Link className="ghost-button link-button" to="/jobs">
              Vai ai lavori
            </Link>
          </div>

          {upcomingJobs.length === 0 ? (
            <p className="muted">Nessun lavoro corrisponde al filtro selezionato.</p>
          ) : (
            <ul className="summary-list">
              {upcomingJobs.map((job) => (
                <li key={job.id} className="summary-item">
                  <div>
                    <strong>{job.agency?.name ?? "-"}</strong>
                    <p className="muted compact-line">
                      Inizio {formatDate(job.first_day)} • Scadenza {formatDate(job.due_date)}
                    </p>
                  </div>
                  <div className="summary-meta">
                    <span className={`mini-badge tone-${getDueTone(job.due_date, job.paid)}`}>
                      {job.paid ? "Pagato" : "Aperto"}
                    </span>
                    <strong>{formatCurrency(job.paid ? job.total : job.amount_due)}</strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Attenzione</h2>
              <p className="muted">I punti che richiedono movimento adesso.</p>
            </div>
          </div>

          <div className="alert-stack">
            <article className="alert-row alert-danger">
              <span className="alert-label">In ritardo</span>
              <strong>{summary.overdue_count}</strong>
            </article>
            <article className="alert-row alert-warning">
              <span className="alert-label">In scadenza entro 7 giorni</span>
              <strong>{summary.due_soon_count}</strong>
            </article>
            <article className="alert-row alert-neutral">
              <span className="alert-label">Agenzie registrate</span>
              <strong>{summary.total_agencies}</strong>
            </article>
            <article className="alert-row alert-success">
              <span className="alert-label">Incassato</span>
              <strong>{formatCurrency(summary.total_paid)}</strong>
            </article>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Anteprima filtrata</h2>
            <p className="muted">Elenco rapido dei lavori inclusi nel filtro attivo.</p>
          </div>
          <span className="badge">{filteredCount} elementi</span>
        </div>

        {listError ? <p className="error-text">{listError}</p> : null}

        {!listError && filteredJobs.length === 0 ? (
          <p className="muted">Nessun risultato per il filtro corrente.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agenzia</th>
                  <th>Inizio</th>
                  <th>Scadenza</th>
                  <th>Totale</th>
                  <th>Residuo</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.agency?.name ?? "-"}</td>
                    <td>{formatDate(job.first_day)}</td>
                    <td>{formatDate(job.due_date)}</td>
                    <td>{formatCurrency(job.total)}</td>
                    <td>{formatCurrency(job.amount_due)}</td>
                    <td>
                      <span className={`status ${job.paid ? "status-paid" : "status-open"}`}>
                        {job.paid ? "Pagato" : "Da pagare"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
