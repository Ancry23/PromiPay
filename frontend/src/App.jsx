import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Home from "./pages/Home";
import Jobs from "./pages/Jobs";
import Agencies from "./pages/Agencies";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Account from "./pages/Account";
import Fiscal from "./pages/Fiscal";
import Calendar from "./pages/Calendar";

const navClass = ({ isActive }) => (isActive ? "nav-link active" : "nav-link");

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function App() {
  const { user, checking, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PromiPay</p>
          <h1>Monitor compensi e scadenze</h1>
        </div>

        {user ? (
          <nav className="nav">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/jobs" className={navClass}>
              Lavori
            </NavLink>
            <NavLink to="/calendar" className={navClass}>
              Calendario
            </NavLink>
            <NavLink to="/agencies" className={navClass}>
              Agenzie
            </NavLink>
            <NavLink to="/fiscal" className={navClass}>
              Fiscale
            </NavLink>
            <NavLink to="/account" className={({ isActive }) => (isActive ? "user-chip active" : "user-chip")}>
              {user.username}
            </NavLink>
            <button className="ghost-button" type="button" onClick={logout}>
              Esci
            </button>
          </nav>
        ) : null}
      </header>

      <main className="page">
        {checking ? (
          <section className="panel">
            <p className="muted">Verifica sessione...</p>
          </section>
        ) : (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/jobs" element={<RequireAuth><Jobs /></RequireAuth>} />
            <Route path="/agencies" element={<RequireAuth><Agencies /></RequireAuth>} />
            <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
            <Route path="/fiscal" element={<RequireAuth><Fiscal /></RequireAuth>} />
            <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default App;
