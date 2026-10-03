import { useEffect, useMemo, useState } from "react";
import { fetchAll } from "../api/axios";
import { formatCurrency } from "../utils/formatters";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parse(value) {
  return new Date(`${value}T00:00:00`);
}

export default function Calendar() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [workJobs, setWorkJobs] = useState([]);
  const [dueJobs, setDueJobs] = useState([]);
  const [error, setError] = useState("");

  const monthStart = cursor;
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor]);

  useEffect(() => {
    let active = true;
    // Jobs can span several days, so also fetch the ones that started shortly before this month.
    const lookback = new Date(monthStart);
    lookback.setDate(lookback.getDate() - 60);

    Promise.all([
      fetchAll("jobs/", { first_from: iso(lookback), first_to: iso(monthEnd) }),
      fetchAll("jobs/", { due_from: iso(monthStart), due_to: iso(monthEnd) }),
    ])
      .then(([work, due]) => {
        if (!active) return;
        setWorkJobs(work);
        setDueJobs(due);
        setError("");
      })
      .catch((err) => {
        console.error("Errore calendario:", err);
        if (active) setError("Impossibile caricare il calendario.");
      });

    return () => {
      active = false;
    };
  }, [monthStart, monthEnd]);

  const eventsByDay = useMemo(() => {
    const map = {};
    const add = (key, event) => {
      (map[key] ??= []).push(event);
    };

    for (const job of workJobs) {
      const start = parse(job.first_day);
      // The app stores first day + number of days: assume consecutive days.
      for (let i = 0; i < job.work_days; i += 1) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        add(iso(day), { type: "work", job, label: job.agency?.name ?? "-" });
      }
    }
    for (const job of dueJobs) {
      add(job.due_date, { type: job.paid ? "due-paid" : "due", job, label: job.agency?.name ?? "-" });
    }
    return map;
  }, [workJobs, dueJobs]);

  const cells = useMemo(() => {
    const leading = (monthStart.getDay() + 6) % 7; // Monday-first grid
    const days = [];
    for (let i = 0; i < leading; i += 1) days.push(null);
    for (let d = 1; d <= monthEnd.getDate(); d += 1) {
      days.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [monthStart, monthEnd]);

  const monthLabel = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(monthStart);
  const todayKey = iso(new Date());
  const monthPrefix = iso(monthStart).slice(0, 7);
  const monthEntries = Object.entries(eventsByDay).filter(([key]) => key.startsWith(monthPrefix));
  const workedThisMonth = monthEntries.filter(([, events]) => events.some((e) => e.type === "work")).length;
  const dueThisMonth = dueJobs.filter((job) => !job.paid).reduce((sum, job) => sum + Number(job.amount_due), 0);

  const move = (delta) => setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <section className="page-grid">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2 className="capitalize">{monthLabel}</h2>
            <p className="muted">
              {workedThisMonth} giorni lavorati &middot; {formatCurrency(dueThisMonth)} in scadenza nel mese
            </p>
          </div>
          <div className="inline-actions">
            <button className="ghost-button" type="button" onClick={() => move(-1)}>
              &larr; Mese prec.
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            >
              Oggi
            </button>
            <button className="ghost-button" type="button" onClick={() => move(1)}>
              Mese succ. &rarr;
            </button>
          </div>
        </div>

        <p className="muted calendar-legend">
          <span className="chip chip-work">Lavoro</span>
          <span className="chip chip-due">Scadenza da incassare</span>
          <span className="chip chip-due-paid">Scadenza pagata</span>
        </p>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="calendar-grid">
          {WEEKDAYS.map((day) => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
          {cells.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} className="calendar-cell is-empty" />;
            const key = iso(date);
            const events = eventsByDay[key] ?? [];
            return (
              <div key={key} className={key === todayKey ? "calendar-cell is-today" : "calendar-cell"}>
                <span className="calendar-day">{date.getDate()}</span>
                {events.map((event, i) => (
                  <span
                    key={`${event.type}-${event.job.id}-${i}`}
                    className={`chip chip-${event.type}`}
                    title={
                      event.type === "work"
                        ? `${event.label}: ${formatCurrency(event.job.daily_pay)} al giorno`
                        : `${event.label}: scadenza ${formatCurrency(event.job.paid ? event.job.total : event.job.amount_due)}`
                    }
                  >
                    {event.type === "work" ? "" : "€ "}
                    {event.label}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        {monthEntries.length === 0 && !error ? (
          <p className="muted">Nessun lavoro o scadenza in questo mese.</p>
        ) : null}
      </section>
    </section>
  );
}
