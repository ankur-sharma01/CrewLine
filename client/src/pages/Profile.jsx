import { useRef, useState } from "react";
import { BadgeCheck, Camera, MailWarning, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api, errorMessage, fieldErrors } from "../lib/api.js";
import { avatarUrl, displayName } from "../lib/utils.js";
import { Avatar, Field, PasswordInput, Spinner, SubmitButton } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

async function toSquareJpeg(file, size = 256) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas
    .getContext("2d")
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image"))),
      "image/jpeg",
      0.88,
    ),
  );
}

const PROVIDER_LABELS = { google: "Google", github: "GitHub" };

export default function Profile() {
  const { user, logout, setUser, refreshUser } = useAuth();
  const toast = useToast();
  const picker = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const choosePhoto = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const body = new FormData();
      body.append("avatar", await toSquareJpeg(file), "avatar.jpg");
      setUser(await api("/users/me/avatar", { method: "PUT", body }));
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      setUser(await api("/users/me/avatar", { method: "DELETE" }));
      toast.success("Profile photo removed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setErrors({});
    if (form.newPassword !== form.confirm) return setErrors({ confirm: "Passwords don't match" });
    setBusy(true);
    try {
      const body = user.hasPassword
        ? { oldPassword: form.oldPassword, newPassword: form.newPassword }
        : { newPassword: form.newPassword };
      await api("/auth/change-password", { method: "POST", body });
      toast.success(user.hasPassword ? "Password changed" : "Password set. You can now also log in with your email.");
      setForm({ oldPassword: "", newPassword: "", confirm: "" });
      await refreshUser();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.status === 422 ? "" : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Profile</h1>
          <p>Your account and security settings.</p>
        </div>
      </div>

      <div className="profile-grid">
        <div className="card">
          <div className="profile-hero">
            <div className="avatar-edit">
              <Avatar user={user} size={96} />
              <button
                type="button"
                className="avatar-edit-btn"
                onClick={() => picker.current.click()}
                disabled={photoBusy}
                aria-label="Change profile photo"
                title="Change photo"
              >
                {photoBusy ? <Spinner /> : <Camera size={16} />}
              </button>
              <input
                ref={picker}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={choosePhoto}
              />
            </div>
            {avatarUrl(user) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={removePhoto} disabled={photoBusy}>
                <Trash2 size={14} /> Remove photo
              </button>
            )}
            <h2>{displayName(user)}</h2>
            <span className="muted">@{user.username}</span>
            {user.isEmailVerified ? (
              <span className="chip ok">
                <BadgeCheck size={14} /> Email verified
              </span>
            ) : (
              <span className="chip role-project_admin">
                <MailWarning size={14} /> Email not verified
              </span>
            )}
          </div>
          <div className="kv">
            <div>
              <span>Email</span>
              {user.email}
            </div>
            <div>
              <span>Member since</span>
              {new Date(user.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
            <div>
              <span>Sign-in methods</span>
              <span className="methods">
                {user.hasPassword && <span className="chip">Password</span>}
                {user.providers.map((p) => (
                  <span key={p} className="chip role-admin">
                    {PROVIDER_LABELS[p] ?? p}
                  </span>
                ))}
              </span>
            </div>
          </div>
          <div style={{ padding: "0 22px 22px" }}>
            <button className="btn btn-danger btn-block" onClick={logout}>
              Log out
            </button>
          </div>
        </div>

        <div className="card card-pad">
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
            {user.hasPassword ? "Change password" : "Set a password"}
          </h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            {user.hasPassword
              ? "Use at least 8 characters."
              : "You signed in with " +
                user.providers.map((p) => PROVIDER_LABELS[p] ?? p).join(" / ") +
                ". Add a password to also log in with your email."}
          </p>
          <form className="form" onSubmit={submit}>
            {error && <div className="form-error">{error}</div>}
            {user.hasPassword && (
              <Field label="Current password" error={errors.oldPassword}>
                <PasswordInput
                  autoComplete="current-password"
                  invalid={!!errors.oldPassword}
                  value={form.oldPassword}
                  onChange={set("oldPassword")}
                  required
                />
              </Field>
            )}
            <Field label="New password" error={errors.newPassword}>
              <PasswordInput
                autoComplete="new-password"
                invalid={!!errors.newPassword}
                value={form.newPassword}
                onChange={set("newPassword")}
                required
              />
            </Field>
            <Field label="Confirm new password" error={errors.confirm}>
              <PasswordInput
                autoComplete="new-password"
                invalid={!!errors.confirm}
                value={form.confirm}
                onChange={set("confirm")}
                required
              />
            </Field>
            <div>
              <SubmitButton busy={busy}>{user.hasPassword ? "Update password" : "Set password"}</SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
