import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { FolderKanban, LayoutDashboard, LogOut, MailWarning, Menu, Moon, Sun, Tent, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../lib/theme.js";
import { api, errorMessage } from "../lib/api.js";
import { displayName } from "../lib/utils.js";
import { Avatar, Spinner } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

export const Brand = () => (
  <Link to="/" className="brand">
    <span className="brand-mark">
      <Tent size={21} />
    </span>
    BaseCampy
  </Link>
);

function VerifyBanner() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      await api("/auth/resend-email-verification", { method: "POST" });
      toast.success("Verification email sent. Check your inbox.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="banner">
      <MailWarning size={20} />
      Please verify your email address to secure your account.
      <button className="btn btn-secondary btn-sm" onClick={resend} disabled={busy}>
        {busy && <Spinner />} Resend email
      </button>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const name = displayName(user);

  // close the mobile menu on navigation
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="app">
      <aside className={`sidebar${open ? " open" : ""}`}>
        <Brand />
        <nav className="nav">
          <NavLink to="/" end>
            <LayoutDashboard size={19} /> Dashboard
          </NavLink>
          <NavLink to="/projects">
            <FolderKanban size={19} /> Projects
          </NavLink>
          <NavLink to="/profile">
            <UserRound size={19} /> Profile
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <Avatar user={user} size={38} />
          <div className="who">
            <b>{name}</b>
            <span>@{user.username}</span>
          </div>
          <button onClick={logout} aria-label="Log out" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className={`scrim${open ? " show" : ""}`} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="topbar-right">
            <button className="icon-btn" onClick={toggle} aria-label="Toggle theme" title="Toggle light / dark">
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link to="/profile" aria-label="Your profile">
              <Avatar user={user} size={40} />
            </Link>
          </div>
        </header>
        <main className="content">
          {!user.isEmailVerified && <VerifyBanner />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
