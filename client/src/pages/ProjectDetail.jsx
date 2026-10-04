import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Columns3,
  FolderKanban,
  History,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api, errorMessage, fieldErrors } from "../lib/api.js";
import { STATUSES, accentFor, displayName, formatDue, initials, isOverdue } from "../lib/utils.js";
import { Avatar, EmptyState, Field, Modal, PageLoader, RoleChip, SubmitButton } from "../components/ui.jsx";
import TaskModal from "../components/TaskModal.jsx";
import { ActivityTab, InsightsTab, MembersTab } from "./ProjectTabs.jsx";
import { useToast } from "../components/Toast.jsx";

function EditProjectModal({ project, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: project.name, description: project.description || "" });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      onSaved(await api(`/projects/${project._id}`, { method: "PATCH", body: form }));
    } catch (err) {
      setErrors(fieldErrors(err));
      if (err.status !== 422) toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/projects/${project._id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Project settings" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Name" error={errors.name}>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={80}
            required
          />
        </Field>
        <Field label="Description" error={errors.description}>
          <textarea
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={500}
          />
        </Field>
        {confirming && (
          <div className="form-error">This permanently deletes the project, all its tasks and its memberships.</div>
        )}
        <div className="modal-actions">
          {confirming ? (
            <button type="button" className="btn btn-danger spread" onClick={remove} disabled={busy}>
              Yes, delete project
            </button>
          ) : (
            <button type="button" className="btn btn-ghost spread" onClick={() => setConfirming(true)}>
              <Trash2 size={16} /> Delete project
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton busy={busy}>Save</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [tab, setTab] = useState("board");
  const [taskModal, setTaskModal] = useState(null); // { task } or { status } for a new task
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  useEffect(() => {
    setStatus("loading");
    Promise.all([
      api(`/projects/${projectId}`),
      api(`/projects/${projectId}/tasks`),
      api(`/projects/${projectId}/members`),
    ])
      .then(([p, t, m]) => {
        setProject(p);
        setTasks(t);
        setMembers(m);
        setStatus("ready");
      })
      .catch((err) => {
        if (err.status === 404 || err.status === 400) return setStatus("missing");
        toast.error(errorMessage(err));
        setStatus("missing");
      });
  }, [projectId, toast]);

  const byStatus = useMemo(
    () => Object.fromEntries(STATUSES.map((s) => [s.key, tasks.filter((t) => t.status === s.key)])),
    [tasks],
  );

  if (status === "loading") return <PageLoader />;
  if (status === "missing") {
    return (
      <div className="card">
        <EmptyState
          icon={FolderKanban}
          title="Project not found"
          text="It may have been deleted, or you don't have access to it."
        >
          <Link to="/projects" className="btn btn-primary">
            Back to projects
          </Link>
        </EmptyState>
      </div>
    );
  }

  const isAdmin = project.myRole === "admin";
  const canManage = isAdmin || project.myRole === "project_admin";
  const isMine = (t) => t.assignedTo?._id === user._id;
  const canMove = (t) => canManage || isMine(t);
  const accent = accentFor(project.name);

  const moveTask = async (id, next) => {
    const task = tasks.find((t) => t._id === id);
    if (!task || task.status === next || !canMove(task)) return;
    setTasks((list) => list.map((t) => (t._id === id ? { ...t, status: next } : t))); // instant feedback
    try {
      await api(`/projects/${projectId}/tasks/${id}`, { method: "PATCH", body: { status: next } });
    } catch (err) {
      setTasks((list) => list.map((t) => (t._id === id ? { ...t, status: task.status } : t))); // undo
      toast.error(errorMessage(err));
    }
  };

  const patchTask = (id, patch) => setTasks((list) => list.map((t) => (t._id === id ? { ...t, ...patch } : t)));
  // always show the latest copy of the task
  const openTask = taskModal?.task ? (tasks.find((t) => t._id === taskModal.task._id) ?? taskModal.task) : null;

  const onTaskSaved = (saved, wasEdit) => {
    setTasks((list) =>
      wasEdit
        ? list.map((t) => (t._id === saved._id ? { ...t, ...saved, commentCount: t.commentCount } : t))
        : [{ ...saved, commentCount: 0 }, ...list],
    );
    setTaskModal(null);
    toast.success(wasEdit ? "Task updated" : "Task created");
  };

  return (
    <>
      <Link to="/projects" className="crumb">
        <ArrowLeft size={16} /> All projects
      </Link>

      <div className="detail-head" style={{ "--accent": accent }}>
        <div className="detail-title">
          <span className="tile">{initials(project.name)}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{project.name}</h1>
            {project.description && <p>{project.description}</p>}
          </div>
        </div>
        <div className="head-actions">
          <span className="avatar-stack">
            {members.slice(0, 4).map((m) => (
              <Avatar key={m._id} user={m} size={34} />
            ))}
          </span>
          <RoleChip role={project.myRole} />
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Settings
            </button>
          )}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {[
          ["board", Columns3, "Board", tasks.length],
          ["activity", History, "Activity", null],
          ["insights", TrendingUp, "Insights", null],
          ["members", Users, "Members", members.length],
        ].map(([key, Icon, label, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon size={17} /> {label} {count !== null && <span className="count">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "board" ? (
        <div className="board">
          {STATUSES.map((col) => (
            <div
              key={col.key}
              className={`column${overCol === col.key ? " over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                moveTask(e.dataTransfer.getData("text/plain") || dragId, col.key);
                setDragId(null);
              }}
            >
              <div className="column-head">
                <span className="dot" style={{ "--c": col.color }} />
                {col.label}
                <span className="chip">{byStatus[col.key].length}</span>
                {canManage && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTaskModal({ status: col.key })}
                    aria-label={`Add task to ${col.label}`}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
              {byStatus[col.key].map((t) => (
                <button
                  key={t._id}
                  className={`task-card${dragId === t._id ? " dragging" : ""}`}
                  draggable={canMove(t)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", t._id);
                    setDragId(t._id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  onClick={() => setTaskModal({ task: t })}
                >
                  <div className="task-title">{t.title}</div>
                  {t.description && <div className="task-desc">{t.description}</div>}
                  {(t.dueDate || t.assignedTo || t.commentCount > 0 || t.attachments?.length > 0) && (
                    <div className="task-meta">
                      <span className="meta-left">
                        {t.dueDate && (
                          <span className={`chip${isOverdue(t.dueDate, t.status) ? " overdue" : ""}`}>
                            <CalendarDays size={13} /> {formatDue(t.dueDate)}
                          </span>
                        )}
                        {t.commentCount > 0 && (
                          <span className="meta-icon" title="Comments">
                            <MessageSquare size={13} /> {t.commentCount}
                          </span>
                        )}
                        {t.attachments?.length > 0 && (
                          <span className="meta-icon" title="Attachments">
                            <Paperclip size={13} /> {t.attachments.length}
                          </span>
                        )}
                      </span>
                      {t.assignedTo && <Avatar user={t.assignedTo} size={26} />}
                    </div>
                  )}
                </button>
              ))}
              {byStatus[col.key].length === 0 && (
                <div className="column-empty">{canManage ? "Drop tasks here or add one" : "No tasks"}</div>
              )}
            </div>
          ))}
        </div>
      ) : tab === "activity" ? (
        <ActivityTab projectId={projectId} />
      ) : tab === "insights" ? (
        <InsightsTab projectId={projectId} />
      ) : (
        <MembersTab
          projectId={projectId}
          members={members}
          setMembers={setMembers}
          isAdmin={isAdmin}
          me={user._id}
          onMemberRemoved={(id) =>
            setTasks((list) => list.map((t) => (t.assignedTo?._id === id ? { ...t, assignedTo: null } : t)))
          }
        />
      )}

      {taskModal && (
        <TaskModal
          projectId={projectId}
          task={openTask}
          defaultStatus={taskModal.status}
          members={members}
          me={user._id}
          canManage={canManage}
          canMove={openTask ? canMove(openTask) : true}
          onTaskPatch={patchTask}
          onClose={() => setTaskModal(null)}
          onSaved={onTaskSaved}
          onDeleted={(id) => {
            setTasks((list) => list.filter((t) => t._id !== id));
            setTaskModal(null);
            toast.success("Task deleted");
          }}
        />
      )}
      {editing && (
        <EditProjectModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={(p) => {
            setProject(p);
            setEditing(false);
            toast.success("Project updated");
          }}
          onDeleted={() => {
            toast.success("Project deleted");
            navigate("/projects", { replace: true });
          }}
        />
      )}
    </>
  );
}
