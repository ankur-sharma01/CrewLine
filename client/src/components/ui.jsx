import { useEffect, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { STATUS_BY_KEY, accentFor, avatarUrl, displayName, initials, roleLabel } from "../lib/utils.js";

export function Avatar({ user, name, src, size = 36 }) {
  const [broken, setBroken] = useState(false);
  const label = name ?? displayName(user) ?? "?";
  const image = src ?? avatarUrl(user);
  const box = { width: size, height: size };

  if (image && !broken) {
    return (
      <img
        className="avatar"
        src={image}
        alt={label}
        title={label}
        style={{ ...box, objectFit: "cover" }}
        onError={() => setBroken(true)}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className="avatar"
      title={label}
      style={{
        ...box,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${accentFor(label)}, ${accentFor(label + "x")})`,
      }}
    >
      {initials(label)}
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="center-screen">
      <Spinner />
    </div>
  );
}

export function StatusChip({ status }) {
  const s = STATUS_BY_KEY[status];
  return (
    <span className="chip status-chip" style={{ "--c": s.color }}>
      {s.label}
    </span>
  );
}

export const RoleChip = ({ role }) => <span className={`chip role-${role}`}>{roleLabel(role)}</span>;

export function Field({ label, error, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function PasswordInput({ value, onChange, invalid, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input
        className={`input${invalid ? " invalid" : ""}`}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        {...rest}
      />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function SubmitButton({ busy, children, ...rest }) {
  return (
    <button className="btn btn-primary" disabled={busy} {...rest}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  // escape closes it
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
