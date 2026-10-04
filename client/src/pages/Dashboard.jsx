import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, FolderKanban, ListTodo, Plus, UserCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api, errorMessage } from "../lib/api.js";
import { accentFor, firstName, formatDue, greeting, initials, isOverdue } from "../lib/utils.js";
import { EmptyState, PageLoader, StatusChip } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState(null);
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    Promise.all([api("/projects"), api("/tasks/mine")])
      .then(([p, t]) => {
        setProjects(p);
        setTasks(t);
      })
      .catch((err) => {
        toast.error(errorMessage(err));
        setProjects([]);
        setTasks([]);
      });
  }, [toast]);

  if (!projects || !tasks) return <PageLoader />;

  const sum = (key) => projects.reduce((n, p) => n + p.taskCounts[key], 0);
  const stats = [
    { label: "Projects", value: projects.length, icon: FolderKanban, accent: "#6366f1" },
    { label: "Open tasks", value: sum("todo") + sum("in_progress"), icon: ListTodo, accent: "#f59e0b" },
    { label: "Completed", value: sum("done"), icon: CheckCircle2, accent: "#12a594" },
    { label: "Assigned to you", value: tasks.length, icon: UserCheck, accent: "#ec4899" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {greeting()}, {firstName(user)}
          </h1>
          <p>Here's what's happening across your projects.</p>
        </div>
        <Link to="/projects?new=1" className="btn btn-primary">
          <Plus size={18} /> New project
        </Link>
      </div>

      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className="card stat" style={{ "--accent": s.accent }}>
            <span className="stat-icon">
              <s.icon size={22} />
            </span>
            <div>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FolderKanban}
            title="Start your first project"
            text="Create a project, invite your team and add tasks to a board."
          >
            <Link to="/projects?new=1" className="btn btn-primary">
              <Plus size={18} /> Create project
            </Link>
          </EmptyState>
        </div>
      ) : (
        <div className="dash-grid">
          <div className="card">
            <div className="section-head">
              <h2>Assigned to you</h2>
            </div>
            {tasks.length === 0 ? (
              <p className="muted" style={{ padding: "8px 22px 24px" }}>
                Nothing assigned to you right now. Enjoy the calm.
              </p>
            ) : (
              tasks.map((t) => (
                <Link key={t._id} to={`/projects/${t.project._id}`} className="list-row">
                  <span className="dot" style={{ "--c": accentFor(t.project.name) }} />
                  <div className="grow">
                    <b>{t.title}</b>
                    <small>{t.project.name}</small>
                  </div>
                  {t.dueDate && (
                    <span className={`chip${isOverdue(t.dueDate, t.status) ? " overdue" : ""}`}>
                      <CalendarDays size={13} /> {formatDue(t.dueDate)}
                    </span>
                  )}
                  <StatusChip status={t.status} />
                </Link>
              ))
            )}
          </div>

          <div className="card">
            <div className="section-head">
              <h2>Your projects</h2>
              <Link to="/projects" style={{ fontSize: 13.5, fontWeight: 700 }}>
                View all
              </Link>
            </div>
            {projects.slice(0, 5).map((p) => {
              const total = p.taskCounts.todo + p.taskCounts.in_progress + p.taskCounts.done;
              const pct = total ? Math.round((p.taskCounts.done / total) * 100) : 0;
              return (
                <Link
                  key={p._id}
                  to={`/projects/${p._id}`}
                  className="list-row"
                  style={{ "--accent": accentFor(p.name) }}
                >
                  <span className="tile">{initials(p.name)}</span>
                  <div className="grow">
                    <b>{p.name}</b>
                    <div className="progress" style={{ marginTop: 8 }}>
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <small style={{ fontWeight: 700 }}>{pct}%</small>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
