import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, MessageSquare, Paperclip, Pencil, Trash2, Upload } from "lucide-react";
import { api, errorMessage, fieldErrors } from "../lib/api.js";
import { STATUSES, displayName, formatBytes, timeAgo, toDateInput } from "../lib/utils.js";
import { Avatar, Field, Modal, Spinner, SubmitButton } from "./ui.jsx";
import { useToast } from "./Toast.jsx";

const MAX_FILE = 2 * 1024 * 1024;
const MAX_FILES = 5;

function Comments({ projectId, taskId, me, canModerate, onCount }) {
  const toast = useToast();
  const [comments, setComments] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { id, body }
  const base = `/projects/${projectId}/tasks/${taskId}/comments`;

  useEffect(() => {
    api(base)
      .then((list) => {
        setComments(list);
        onCount(list.length);
      })
      .catch((err) => {
        toast.error(errorMessage(err));
        setComments([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const update = (list) => {
    setComments(list);
    onCount(list.length);
  };

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const created = await api(base, { method: "POST", body: { body: text } });
      update([...comments, created]);
      setText("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    try {
      const saved = await api(`${base}/${editing.id}`, { method: "PATCH", body: { body: editing.body } });
      setComments(comments.map((c) => (c._id === saved._id ? saved : c)));
      setEditing(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async (id) => {
    try {
      await api(`${base}/${id}`, { method: "DELETE" });
      update(comments.filter((c) => c._id !== id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <section className="sub-section">
      <h3>
        <MessageSquare size={17} /> Comments {comments && <span className="chip">{comments.length}</span>}
      </h3>
      {!comments ? (
        <Spinner />
      ) : (
        <div className="comments">
          {comments.length === 0 && <p className="muted small">No comments yet. Start the conversation.</p>}
          {comments.map((c) => {
            const mine = c.author?._id === me;
            return (
              <div key={c._id} className="comment">
                <Avatar user={c.author} size={30} />
                <div className="comment-body">
                  <div className="comment-head">
                    <b>{displayName(c.author) || "Former member"}</b>
                    <span title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</span>
                    {c.edited && <span>(edited)</span>}
                    <span className="comment-actions">
                      {mine && (
                        <button
                          type="button"
                          aria-label="Edit comment"
                          onClick={() => setEditing({ id: c._id, body: c.body })}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {(mine || canModerate) && (
                        <button type="button" aria-label="Delete comment" onClick={() => remove(c._id)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </span>
                  </div>
                  {editing?.id === c._id ? (
                    <div className="comment-edit">
                      <textarea
                        className="input"
                        value={editing.body}
                        onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                        maxLength={2000}
                      />
                      <div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
                          Save
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>{c.body}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <form className="comment-form" onSubmit={add}>
        <textarea
          className="input"
          placeholder="Write a comment..."
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && add(e)}
        />
        <SubmitButton busy={busy} disabled={busy || !text.trim()}>
          Comment
        </SubmitButton>
      </form>
    </section>
  );
}

function Attachments({ projectId, task, me, canManage, onChange }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const base = `/projects/${projectId}/tasks/${task._id}/attachments`;
  const files = task.attachments || [];

  const upload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE) return toast.error("That file is larger than 2 MB.");
    if (files.length >= MAX_FILES) return toast.error(`A task can have at most ${MAX_FILES} attachments.`);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const created = await api(base, { method: "POST", body: form });
      onChange([...files, created]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a) => {
    try {
      await api(`${base}/${a.file}`, { method: "DELETE" });
      onChange(files.filter((f) => f.file !== a.file));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <section className="sub-section">
      <h3>
        <Paperclip size={17} /> Attachments <span className="chip">{files.length}</span>
      </h3>
      <div className="attachments">
        {files.map((a) => {
          const url = `/api/v1/files/${a.file}`;
          const isImage = a.contentType.startsWith("image/");
          return (
            <div key={a.file} className="attachment">
              {isImage ? (
                <img src={url} alt="" />
              ) : (
                <span className="file-icon">
                  {a.contentType === "application/pdf" ? <FileText size={20} /> : <ImageIcon size={20} />}
                </span>
              )}
              <div className="grow">
                <a href={url} target="_blank" rel="noreferrer" download={isImage ? undefined : a.name}>
                  {a.name}
                </a>
                <small>{formatBytes(a.size)}</small>
              </div>
              {(a.uploadedBy === me || canManage) && (
                <button type="button" className="icon-btn" aria-label={`Remove ${a.name}`} onClick={() => remove(a)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,.csv,.txt"
        onChange={upload}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy || files.length >= MAX_FILES}
        onClick={() => input.current.click()}
      >
        {busy ? <Spinner /> : <Upload size={15} />} Attach a file
      </button>
      <span className="field-hint" style={{ marginLeft: 10 }}>
        Images, PDF or text, up to 2 MB
      </span>
    </section>
  );
}

export default function TaskModal({
  projectId,
  task,
  defaultStatus,
  members,
  me,
  canManage,
  canMove,
  onClose,
  onSaved,
  onDeleted,
  onTaskPatch,
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? defaultStatus ?? "todo",
    assignedTo: task?.assignedTo?._id ?? "",
    dueDate: toDateInput(task?.dueDate),
  });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const locked = Boolean(task) && !canManage; // members can't edit the details
  const canSave = canManage || canMove;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    // members can only send the status
    const body = canManage
      ? { ...form, assignedTo: form.assignedTo || null, dueDate: form.dueDate || null }
      : { status: form.status };
    try {
      const saved = task
        ? await api(`/projects/${projectId}/tasks/${task._id}`, { method: "PATCH", body })
        : await api(`/projects/${projectId}/tasks`, { method: "POST", body });
      onSaved(saved, Boolean(task));
    } catch (err) {
      setErrors(fieldErrors(err));
      if (err.status !== 422) toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/projects/${projectId}/tasks/${task._id}`, { method: "DELETE" });
      onDeleted(task._id);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={task ? (canManage ? "Edit task" : "Task") : "New task"}
      subtitle={locked ? "Only project admins can edit the details." : undefined}
      onClose={onClose}
      wide={Boolean(task)}
    >
      <form className="form" onSubmit={submit}>
        <Field label="Title" error={errors.title}>
          <input
            className={`input${errors.title ? " invalid" : ""}`}
            autoFocus={!locked}
            disabled={locked}
            value={form.title}
            onChange={set("title")}
            placeholder="What needs to be done?"
            maxLength={120}
            required
          />
        </Field>
        <Field label="Description" error={errors.description}>
          <textarea
            className="input"
            disabled={locked}
            value={form.description}
            onChange={set("description")}
            placeholder="Add more detail (optional)"
            maxLength={1000}
          />
        </Field>
        <div className="form-row">
          <Field label="Status" error={errors.status}>
            <select className="input" value={form.status} onChange={set("status")} disabled={task ? !canSave : false}>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignee" error={errors.assignedTo}>
            <select className="input" value={form.assignedTo} onChange={set("assignedTo")} disabled={locked}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m._id} value={m._id}>
                  {displayName(m)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Due date" error={errors.dueDate}>
          <input className="input" type="date" disabled={locked} value={form.dueDate} onChange={set("dueDate")} />
        </Field>
        <div className="modal-actions">
          {task &&
            canManage &&
            (confirming ? (
              <button type="button" className="btn btn-danger spread" onClick={remove} disabled={busy}>
                Yes, delete it
              </button>
            ) : (
              <button type="button" className="btn btn-ghost spread" onClick={() => setConfirming(true)}>
                <Trash2 size={16} /> Delete
              </button>
            ))}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {canSave ? "Cancel" : "Close"}
          </button>
          {canSave && <SubmitButton busy={busy}>{task ? "Save changes" : "Create task"}</SubmitButton>}
        </div>
      </form>

      {task && (
        <>
          <Attachments
            projectId={projectId}
            task={task}
            me={me}
            canManage={canManage}
            onChange={(attachments) => onTaskPatch(task._id, { attachments })}
          />
          <Comments
            projectId={projectId}
            taskId={task._id}
            me={me}
            canModerate={canManage}
            onCount={(commentCount) => onTaskPatch(task._id, { commentCount })}
          />
        </>
      )}
    </Modal>
  );
}
