import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FolderKanban, Plus, Search, Users } from "lucide-react";
import { api, errorMessage, fieldErrors } from "../lib/api.js";
import { accentFor, initials } from "../lib/utils.js";
import { EmptyState, Field, Modal, PageLoader, RoleChip, SubmitButton } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

function NewProjectModal({ onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const project = await api("/projects", { method: "POST", body: form });
      toast.success("Project created");
      navigate(`/projects/${project._id}`);
    } catch (err) {
      setErrors(fieldErrors(err));
      if (err.status !== 422) toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="New project" subtitle="You'll be its admin and can invite others afterwards." onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Project name" error={errors.name}>
          <input
            className={`input${errors.name ? " invalid" : ""}`}
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Website redesign"
            maxLength={80}
            required
          />
        </Field>
        <Field label="Description" error={errors.description} hint="Optional">
          <textarea
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What is this project about?"
            maxLength={500}
          />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton busy={busy}>Create project</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export default function Projects() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState(null);
  const [query, setQuery] = useState("");
  const creating = params.get("new") === "1";

  useEffect(() => {
    api("/projects")
      .then(setProjects)
      .catch((err) => {
        toast.error(errorMessage(err));
        setProjects([]);
      });
  }, [toast]);

  const shown = useMemo(
    () => (projects || []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, query],
  );
  const closeModal = () => setParams({}, { replace: true });

  if (!projects) return <PageLoader />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>
            {projects.length} {projects.length === 1 ? "project" : "projects"} you belong to.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setParams({ new: "1" })}>
          <Plus size={18} /> New project
        </button>
      </div>

      {projects.length > 0 && (
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              className="input"
              placeholder="Search projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            text="Projects hold your tasks and team. Create one to get going."
          >
            <button className="btn btn-primary" onClick={() => setParams({ new: "1" })}>
              <Plus size={18} /> Create project
            </button>
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">No project matches "{query}".</p>
      ) : (
        <div className="grid-cards">
          {shown.map((p) => {
            const total = p.taskCounts.todo + p.taskCounts.in_progress + p.taskCounts.done;
            const pct = total ? Math.round((p.taskCounts.done / total) * 100) : 0;
            return (
              <Link
                key={p._id}
                to={`/projects/${p._id}`}
                className="card project-card"
                style={{ "--accent": accentFor(p.name) }}
              >
                <div className="project-top">
                  <span className="tile">{initials(p.name)}</span>
                  <RoleChip role={p.myRole} />
                </div>
                <h3>{p.name}</h3>
                <p className="desc">{p.description || "No description yet."}</p>
                <div className="progress">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="project-foot">
                  <span>
                    {p.taskCounts.done}/{total} tasks done
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Users size={14} /> {p.memberCount}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {creating && <NewProjectModal onClose={closeModal} />}
    </>
  );
}
