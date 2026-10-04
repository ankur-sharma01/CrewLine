export const STATUSES = [
  { key: "todo", label: "To do", color: "#8b8ba7" },
  { key: "in_progress", label: "In progress", color: "#f59e0b" },
  { key: "done", label: "Done", color: "#12a594" },
];
export const STATUS_BY_KEY = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

export const ROLES = [
  { key: "admin", label: "Admin" },
  { key: "project_admin", label: "Project admin" },
  { key: "member", label: "Member" },
];
export const roleLabel = (key) => ROLES.find((r) => r.key === key)?.label ?? key;

const ACCENTS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#f59e0b", "#14b8a6", "#0ea5e9"];
const hash = (s = "") => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
// same name, same color
export const accentFor = (s) => ACCENTS[hash(s) % ACCENTS.length];

export const initials = (name = "?") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export const displayName = (u) => u?.fullName || u?.username || "";
export const firstName = (u) => displayName(u).split(" ")[0];

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// due dates are UTC midnight, format in UTC or they show up a day early
export const formatDue = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
export const toDateInput = (iso) => (iso ? iso.slice(0, 10) : "");
export const isOverdue = (iso, status) =>
  Boolean(iso) && status !== "done" && iso.slice(0, 10) < new Date().toISOString().slice(0, 10);

// the placeholder counts as no avatar, we show initials
export const avatarUrl = (u) => (u?.avatar?.url && !u.avatar.url.includes("placehold.co") ? u.avatar.url : null);

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];
export function timeAgo(iso, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
