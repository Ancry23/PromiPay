import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Home from "./pages/Home";
import Jobs from "./pages/Jobs";
import Agencies from "./pages/Agencies";
import Login from "./pages/Login";

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
            <NavLink to="/agencies" className={navClass}>
              Agenzie
            </NavLink>
            <span className="user-chip">{user.username}</span>
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
            <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/jobs" element={<RequireAuth><Jobs /></RequireAuth>} />
            <Route path="/agencies" element={<RequireAuth><Agencies /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default App;
