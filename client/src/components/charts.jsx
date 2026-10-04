import { Avatar } from "./ui.jsx";
import { STATUSES } from "../lib/utils.js";

const STATUS_COLOR = Object.fromEntries(STATUSES.map((s) => [s.key, s.color]));

// status donut
export function Donut({ counts, size = 168 }) {
  const total = STATUSES.reduce((n, s) => n + counts[s.key], 0);
  const r = 62;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label="Tasks by status">
      <circle cx="80" cy="80" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
      {total > 0 &&
        STATUSES.map((s) => {
          const len = (counts[s.key] / total) * c;
          const arc = (
            <circle
              key={s.key}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={STATUS_COLOR[s.key]}
              strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += len;
          return len > 0 ? arc : null;
        })}
      <text x="80" y="78" textAnchor="middle" fontSize="30" fontWeight="800" fill="var(--text)">
        {total}
      </text>
      <text x="80" y="98" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--muted)">
        {total === 1 ? "TASK" : "TASKS"}
      </text>
    </svg>
  );
}

// weekly bars
export function WeeklyBars({ weeks }) {
  const W = 520;
  const H = 190;
  const pad = { l: 28, r: 8, t: 10, b: 28 };
  const max = Math.max(4, ...weeks.flatMap((w) => [w.created, w.completed]));
  const step = (W - pad.l - pad.r) / weeks.length;
  const bar = Math.min(16, step / 3);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.round(max / 2), max];
  const label = (iso) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Tasks created and completed per week"
      style={{ display: "block" }}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border)"
            strokeDasharray={t === 0 ? "" : "3 4"}
          />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--faint)">
            {t}
          </text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const cx = pad.l + step * i + step / 2;
        return (
          <g key={w.weekStart}>
            <rect
              x={cx - bar - 1.5}
              y={y(w.created)}
              width={bar}
              height={y(0) - y(w.created)}
              rx="3"
              fill="var(--primary)"
            />
            <rect
              x={cx + 1.5}
              y={y(w.completed)}
              width={bar}
              height={y(0) - y(w.completed)}
              rx="3"
              fill="var(--success)"
            />
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {label(w.weekStart)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// workload bars
export function Workload({ rows, unassigned }) {
  const all = [
    ...rows,
    ...(unassigned && unassigned.todo + unassigned.in_progress + unassigned.done > 0
      ? [{ userId: "none", name: "Unassigned", ...unassigned }]
      : []),
  ];
  const max = Math.max(1, ...all.map((r) => r.todo + r.in_progress + r.done));
  return (
    <div className="workload">
      {all.map((r) => {
        const total = r.todo + r.in_progress + r.done;
        return (
          <div key={r.userId} className="workload-row">
            <div className="workload-who">
              {r.userId === "none" ? (
                <span className="avatar ghost">?</span>
              ) : (
                <Avatar user={{ fullName: r.name, avatar: r.avatar }} size={28} />
              )}
              <span>{r.name}</span>
            </div>
            <div className="workload-bar" title={`${r.todo} to do, ${r.in_progress} in progress, ${r.done} done`}>
              {["in_progress", "todo", "done"].map((k) =>
                r[k] ? <i key={k} style={{ width: `${(r[k] / max) * 100}%`, background: STATUS_COLOR[k] }} /> : null,
              )}
            </div>
            <span className="workload-n">{total}</span>
          </div>
        );
      })}
    </div>
  );
}
