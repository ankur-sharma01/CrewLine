import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, ListChecks, MailCheck, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api, errorMessage, fieldErrors } from "../lib/api.js";
import { Brand } from "../components/Layout.jsx";
import { Field, PageLoader, PasswordInput, Spinner, SubmitButton } from "../components/ui.jsx";
import { roleLabel } from "../lib/utils.js";
import { useToast } from "../components/Toast.jsx";

const OAUTH_ERRORS = {
  oauth_denied: "Sign-in was cancelled.",
  oauth_state: "That sign-in session expired. Please try again.",
  oauth_failed: "We couldn't complete the sign-in with that provider. Please try again.",
  oauth_email_unverified:
    "That account's email address isn't verified with the provider, so we can't use it to sign you in.",
  oauth_no_email: "We couldn't read a verified email address from that account.",
  oauth_not_configured: "That sign-in option isn't set up on this server.",
};

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

function OAuthButtons({ next = "/" }) {
  const [providers, setProviders] = useState({});
  useEffect(() => {
    api("/auth/oauth/providers", { noRefresh: true })
      .then(setProviders)
      .catch(() => {});
  }, []);

  const shown = [
    ["google", "Google", GoogleIcon],
    ["github", "GitHub", GitHubIcon],
  ].filter(([key]) => providers[key]);
  if (shown.length === 0) return null;

  return (
    <>
      <div className="oauth">
        {shown.map(([key, label, Icon]) => (
          <a
            key={key}
            className="btn btn-secondary btn-block"
            href={`/api/v1/auth/oauth/${key}?next=${encodeURIComponent(next)}`}
          >
            <Icon /> Continue with {label}
          </a>
        ))}
      </div>
      <div className="divider">
        <span>or use your email</span>
      </div>
    </>
  );
}

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <section className="auth-art">
        <Brand />
        <div>
          <h2>Plan the work. Ship it together.</h2>
          <p className="lead">Projects, tasks and teammates in one calm place, so nothing slips through the cracks.</p>
        </div>
        <div className="float-stack">
          <div className="float-card">
            <span className="ico">
              <ListChecks size={20} />
            </span>
            <div>
              <b>Website redesign</b>
              <small>8 of 12 tasks done</small>
              <div className="progress">
                <i style={{ width: "66%" }} />
              </div>
            </div>
          </div>
          <div className="float-card">
            <span className="ico">
              <Users size={20} />
            </span>
            <div>
              <b>Roles that make sense</b>
              <small>Admins, project admins and members</small>
            </div>
          </div>
        </div>
      </section>
      <section className="auth-side">
        <div className="auth-card">
          <Brand />
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="sub">{subtitle}</p>}
          </div>
          {children}
          {footer && <p className="auth-foot">{footer}</p>}
        </div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const [error, setError] = useState(OAUTH_ERRORS[params.get("error")] || "");
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    // the api takes an email or a username
    const id = form.identifier.trim();
    try {
      await login(
        id.includes("@") ? { email: id, password: form.password } : { username: id, password: form.password },
      );
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.status === 422 ? "" : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      footer={
        <>
          New here?{" "}
          <Link to="/register" state={location.state}>
            Create an account
          </Link>
        </>
      }
    >
      <OAuthButtons next={location.state?.from || "/"} />
      <form className="form" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <Field label="Email or username" error={errors.email || errors.username}>
          <input
            className="input"
            autoComplete="username"
            autoFocus
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Your password"
            required
          />
        </Field>
        <div className="between">
          <span />
          <Link to="/forgot-password" style={{ fontSize: 13.5, fontWeight: 700 }}>
            Forgot password?
          </Link>
        </div>
        <SubmitButton busy={busy}>Log in</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ fullName: "", username: "", email: location.state?.email || "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    try {
      await register({ ...form, fullName: form.fullName.trim() || undefined });
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.status === 422 ? "" : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to start. Takes under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" state={location.state}>
            Log in
          </Link>
        </>
      }
    >
      <OAuthButtons next={location.state?.from || "/"} />
      <form className="form" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <Field label="Full name" error={errors.fullName}>
          <input
            className="input"
            autoComplete="name"
            value={form.fullName}
            onChange={set("fullName")}
            placeholder="Ada Lovelace"
          />
        </Field>
        <div className="form-row">
          <Field label="Username" error={errors.username}>
            <input
              className={`input${errors.username ? " invalid" : ""}`}
              autoComplete="username"
              value={form.username}
              onChange={set("username")}
              placeholder="ada_l"
              required
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <input
              className={`input${errors.email ? " invalid" : ""}`}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={set("email")}
              placeholder="you@example.com"
              required
            />
          </Field>
        </div>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          <PasswordInput
            autoComplete="new-password"
            invalid={!!errors.password}
            value={form.password}
            onChange={set("password")}
            placeholder="Choose a password"
            required
          />
        </Field>
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email }, noRefresh: true });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your inbox" footer={<Link to="/login">Back to log in</Link>}>
        <div className="state-card">
          <div className="state-icon info">
            <MailCheck size={32} />
          </div>
          <p className="muted">
            If <b>{email}</b> is registered, we've sent a link to reset your password. It expires in 20 minutes.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
      footer={<Link to="/login">Back to log in</Link>}
    >
      <form className="form" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <Field label="Email">
          <input
            className="input"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </Field>
        <SubmitButton busy={busy}>Send reset link</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setErrors({});
    if (password !== confirm) return setErrors({ confirm: "Passwords don't match" });
    setBusy(true);
    try {
      await api(`/auth/reset-password/${token}`, { method: "POST", body: { newPassword: password }, noRefresh: true });
      toast.success("Password updated. You can log in now.");
      navigate("/login", { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.status === 422 ? "" : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you haven't used before."
      footer={<Link to="/login">Back to log in</Link>}
    >
      <form className="form" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <Field label="New password" error={errors.newPassword} hint="At least 8 characters.">
          <PasswordInput
            autoComplete="new-password"
            invalid={!!errors.newPassword}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          <PasswordInput
            autoComplete="new-password"
            invalid={!!errors.confirm}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        <SubmitButton busy={busy}>Update password</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  const { token } = useParams();
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return; // the link can only be used once
    called.current = true;
    api(`/auth/verify-email/${token}`, { noRefresh: true })
      .then(() => {
        setState("ok");
        if (user) refreshUser().catch(() => {});
      })
      .catch((err) => {
        setState("error");
        setMessage(errorMessage(err));
      });
  }, [token, user, refreshUser]);

  return (
    <AuthShell
      title={state === "ok" ? "Email verified" : state === "error" ? "Verification failed" : "Verifying your email"}
      footer={<Link to={user ? "/" : "/login"}>{user ? "Go to dashboard" : "Go to log in"}</Link>}
    >
      <div className="state-card">
        {state === "loading" && <Spinner />}
        {state === "ok" && (
          <>
            <div className="state-icon ok">
              <CheckCircle2 size={34} />
            </div>
            <p className="muted">Thanks! Your email address is confirmed.</p>
          </>
        )}
        {state === "error" && (
          <>
            <div className="state-icon bad">
              <CircleAlert size={34} />
            </div>
            <p className="muted">{message}. You can request a new link from the banner inside the app.</p>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export function InvitePage() {
  const { token } = useParams();
  const { user, loading, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [invite, setInvite] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | invalid
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/invitations/${token}`, { noRefresh: true })
      .then((data) => {
        setInvite(data);
        setState("ready");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const { projectId } = await api(`/invitations/${token}/accept`, { method: "POST" });
      await refreshUser();
      toast.success(`You joined ${invite.projectName}`);
      navigate(`/projects/${projectId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (loading || state === "loading") return <PageLoader />;

  if (state === "invalid") {
    return (
      <AuthShell
        title="Invitation not found"
        footer={<Link to={user ? "/" : "/login"}>{user ? "Go to dashboard" : "Go to log in"}</Link>}
      >
        <div className="state-card">
          <div className="state-icon bad">
            <CircleAlert size={34} />
          </div>
          <p className="muted">
            This invitation link is invalid, has expired, or was revoked. Ask the project admin to send a new one.
          </p>
        </div>
      </AuthShell>
    );
  }

  const wrongAccount = user && user.email !== invite.email;
  const here = { from: location.pathname, email: invite.email };

  return (
    <AuthShell title="You're invited" subtitle={`${invite.invitedBy} invited you to collaborate.`}>
      <div className="invite-card">
        <span className="invite-project">{invite.projectName}</span>
        <span className="chip role-admin">{roleLabel(invite.role)}</span>
        <small>Sent to {invite.email}</small>
      </div>
      {error && <div className="form-error">{error}</div>}
      {!user && (
        <div className="form">
          <Link className="btn btn-primary" to="/register" state={here}>
            Create an account to join
          </Link>
          <Link className="btn btn-secondary" to="/login" state={here}>
            I already have an account
          </Link>
          <p className="field-hint" style={{ textAlign: "center" }}>
            Use {invite.email} so the invitation matches your account.
          </p>
        </div>
      )}
      {user && !wrongAccount && (
        <SubmitButton busy={busy} onClick={accept} type="button">
          Accept invitation
        </SubmitButton>
      )}
      {wrongAccount && (
        <div className="form">
          <div className="form-error">
            You're logged in as {user.email}, but this invitation was sent to {invite.email}.
          </div>
          <button className="btn btn-secondary" onClick={logout}>
            Log out and switch account
          </button>
        </div>
      )}
    </AuthShell>
  );
}
