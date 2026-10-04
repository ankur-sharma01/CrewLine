import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  Copy,
  FolderPlus,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { api, errorMessage, fieldErrors } from "../lib/api.js";
import { ROLES, STATUS_BY_KEY, displayName, roleLabel, timeAgo } from "../lib/utils.js";
import { Avatar, Field, PageLoader, RoleChip, Spinner, SubmitButton } from "../components/ui.jsx";
import { Donut, WeeklyBars, Workload } from "../components/charts.jsx";
import { useToast } from "../components/Toast.jsx";

export function MembersTab({ projectId, members, setMembers, isAdmin, me, onMemberRemoved }) {
  const toast = useToast();
  const [form, setForm] = useState({ email: "", role: "member" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [invites, setInvites] = useState([]);
  const [link, setLink] = useState(null); // the secret link of the invitation that was just created

  useEffect(() => {
    if (!isAdmin) return;
    api(`/projects/${projectId}/invitations`)
      .then(setInvites)
      .catch(() => {});
  }, [projectId, isAdmin]);

  const remember = (data) => {
    setInvites((list) => [data.invitation, ...list.filter((i) => i._id !== data.invitation._id)]);
    setLink({ email: data.invitation.email, url: data.inviteUrl, emailSent: data.emailSent });
  };

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const data = await api(`/projects/${projectId}/invitations`, { method: "POST", body: form });
      remember(data);
      setForm({ ...form, email: "" });
      toast.success(data.emailSent ? "Invitation emailed" : "Invitation created");
    } catch (err) {
      setErrors(err.status === 409 ? { email: errorMessage(err) } : fieldErrors(err));
      if (![409, 422].includes(err.status)) toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async (inv) => {
    try {
      remember(await api(`/projects/${projectId}/invitations/${inv._id}/resend`, { method: "POST" }));
      toast.success("New link created");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const revoke = async (inv) => {
    try {
      await api(`/projects/${projectId}/invitations/${inv._id}`, { method: "DELETE" });
      setInvites((list) => list.filter((i) => i._id !== inv._id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  };

  const changeRole = async (member, role) => {
    try {
      const updated = await api(`/projects/${projectId}/members/${member._id}`, { method: "PATCH", body: { role } });
      setMembers((list) => list.map((m) => (m._id === updated._id ? updated : m)));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async (member) => {
    if (!window.confirm(`Remove ${displayName(member)} from this project?`)) return;
    try {
      await api(`/projects/${projectId}/members/${member._id}`, { method: "DELETE" });
      setMembers((list) => list.filter((m) => m._id !== member._id));
      onMemberRemoved(member._id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="stack">
      <div className="card">
        {isAdmin && (
          <form className="add-member" onSubmit={invite}>
            <Field
              label="Invite someone by email"
              error={errors.email}
              hint="They don't need an account yet. They'll get a link to join."
            >
              <input
                className={`input${errors.email ? " invalid" : ""}`}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="teammate@example.com"
                required
              />
            </Field>
            <Field label="Role">
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <SubmitButton busy={busy}>
              <Send size={16} /> Send invite
            </SubmitButton>
          </form>
        )}
        {link && (
          <div className="invite-link">
            <div>
              <b>Invitation for {link.email}</b>
              <small>
                {link.emailSent
                  ? "We emailed it. You can also share this link yourself:"
                  : "Email isn't set up on this server, so send them this link yourself:"}
              </small>
            </div>
            <div className="invite-link-row">
              <input
                className="input"
                readOnly
                value={link.url}
                onFocus={(e) => e.target.select()}
                aria-label="Invitation link"
              />
              <button type="button" className="btn btn-secondary" onClick={copy}>
                <Copy size={16} /> Copy
              </button>
            </div>
          </div>
        )}
        {members.map((m) => (
          <div key={m._id} className="member-row">
            <div className="member-info">
              <Avatar user={m} size={40} />
              <div style={{ minWidth: 0 }}>
                <b>
                  {displayName(m)}{" "}
                  {m._id === me && (
                    <span className="muted" style={{ fontWeight: 600 }}>
                      (you)
                    </span>
                  )}
                </b>
                <small>{m.email}</small>
              </div>
            </div>
            {isAdmin ? (
              <select
                className="input"
                value={m.role}
                onChange={(e) => changeRole(m, e.target.value)}
                aria-label={`Role of ${displayName(m)}`}
              >
                {ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            ) : (
              <RoleChip role={m.role} />
            )}
            {isAdmin ? (
              <button
                className="icon-btn"
                onClick={() => remove(m)}
                aria-label={`Remove ${displayName(m)}`}
                title="Remove from project"
              >
                <Trash2 size={17} />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>

      {isAdmin && invites.length > 0 && (
        <div className="card">
          <div className="section-head">
            <h2>Pending invitations</h2>
            <span className="chip">{invites.length}</span>
          </div>
          {invites.map((inv) => (
            <div key={inv._id} className="member-row">
              <div className="member-info">
                <span className="avatar ghost">@</span>
                <div style={{ minWidth: 0 }}>
                  <b>{inv.email}</b>
                  <small>{inv.expired ? "Expired, send it again" : `Expires ${timeAgo(inv.expiresAt)}`}</small>
                </div>
              </div>
              <RoleChip role={inv.role} />
              <span className="row-actions">
                <button
                  className="icon-btn"
                  onClick={() => resend(inv)}
                  aria-label={`Send again to ${inv.email}`}
                  title="Send again (new link)"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => revoke(inv)}
                  aria-label={`Revoke invitation for ${inv.email}`}
                  title="Revoke"
                >
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ICONS = {
  project_created: FolderPlus,
  task_created: FolderPlus,
  task_status_changed: ArrowRightLeft,
  task_assigned: UserCheck,
  task_deleted: Trash2,
  comment_added: MessageSquare,
  attachment_added: Paperclip,
  member_joined: UserPlus,
  member_role_changed: ShieldCheck,
  member_removed: UserMinus,
  invitation_sent: Send,
};

function sentence(a) {
  const m = a.meta || {};
  const task = m.taskTitle ? `"${m.taskTitle}"` : "a task";
  const status = (k) => STATUS_BY_KEY[k]?.label ?? k;
  switch (a.type) {
    case "project_created":
      return "created the project";
    case "task_created":
      return `created the task ${task}`;
    case "task_status_changed":
      return `moved ${task} from ${status(m.from)} to ${status(m.to)}`;
    case "task_assigned":
      return m.assigneeName ? `assigned ${task} to ${m.assigneeName}` : `unassigned ${task}`;
    case "task_deleted":
      return `deleted the task ${task}`;
    case "comment_added":
      return `commented on ${task}`;
    case "attachment_added":
      return `attached ${m.fileName || "a file"} to ${task}`;
    case "member_joined":
      return `added ${m.memberName} as ${roleLabel(m.role)}`;
    case "member_role_changed":
      return `changed the role of ${m.memberName} to ${roleLabel(m.role)}`;
    case "member_removed":
      return `removed ${m.memberName} from the project`;
    case "invitation_sent":
      return `invited ${m.email} as ${roleLabel(m.role)}`;
    default:
      return a.type;
  }
}

export function ActivityTab({ projectId }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async (before) => {
    const data = await api(`/projects/${projectId}/activity?limit=20${before ? `&before=${before}` : ""}`);
    setItems((list) => (before ? [...(list || []), ...data.items] : data.items));
    setCursor(data.nextCursor);
  };

  useEffect(() => {
    load().catch((err) => {
      toast.error(errorMessage(err));
      setItems([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!items) return <PageLoader />;
  if (items.length === 0) return <div className="card card-pad muted">Nothing has happened yet.</div>;

  return (
    <div className="card">
      <ol className="timeline">
        {items.map((a) => {
          const Icon = ICONS[a.type] || ArrowRightLeft;
          return (
            <li key={a._id}>
              <span className="timeline-icon">
                <Icon size={15} />
              </span>
              <Avatar user={a.actor} size={28} />
              <p>
                <b>{displayName(a.actor) || "Someone"}</b> {sentence(a)}
              </p>
              <time title={new Date(a.createdAt).toLocaleString()}>{timeAgo(a.createdAt)}</time>
            </li>
          );
        })}
      </ol>
      {cursor && (
        <div style={{ padding: 16, textAlign: "center" }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              try {
                await load(cursor);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setLoadingMore(false);
              }
            }}
          >
            {loadingMore && <Spinner />} Load older activity
          </button>
        </div>
      )}
    </div>
  );
}

export function InsightsTab({ projectId }) {
  const toast = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    api(`/projects/${projectId}/analytics`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, [projectId, toast]);

  if (!data) return <PageLoader />;
  const { totals, avgCycleDays, weekly, workload, unassigned } = data;
  const kpis = [
    { label: "Completion", value: `${totals.completionRate}%`, hint: `${totals.done} of ${totals.total} tasks done` },
    { label: "Overdue", value: totals.overdue, hint: "open tasks past their due date", bad: totals.overdue > 0 },
    { label: "Due this week", value: totals.dueSoon, hint: "open tasks due in 7 days" },
    { label: "Avg. cycle time", value: avgCycleDays == null ? "-" : `${avgCycleDays}d`, hint: "from created to done" },
  ];

  return (
    <div className="stack">
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <span>{k.label}</span>
            <b className={k.bad ? "bad" : ""}>{k.value}</b>
            <small>{k.hint}</small>
          </div>
        ))}
      </div>
      <div className="insight-grid">
        <div className="card card-pad">
          <h2 className="card-title">Status</h2>
          <div className="donut-wrap">
            <Donut counts={totals} />
            <ul className="legend">
              {["todo", "in_progress", "done"].map((k) => (
                <li key={k}>
                  <span className="dot" style={{ "--c": STATUS_BY_KEY[k].color }} /> {STATUS_BY_KEY[k].label}{" "}
                  <b>{totals[k]}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card card-pad">
          <h2 className="card-title">Created vs completed per week</h2>
          <WeeklyBars weeks={weekly} />
          <ul className="legend inline">
            <li>
              <span className="dot" style={{ "--c": "var(--primary)" }} /> Created
            </li>
            <li>
              <span className="dot" style={{ "--c": "var(--success)" }} /> Completed
            </li>
          </ul>
        </div>
      </div>
      <div className="card card-pad">
        <h2 className="card-title">Workload by person</h2>
        <Workload rows={workload} unassigned={unassigned} />
        <ul className="legend inline">
          {["todo", "in_progress", "done"].map((k) => (
            <li key={k}>
              <span className="dot" style={{ "--c": STATUS_BY_KEY[k].color }} /> {STATUS_BY_KEY[k].label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
