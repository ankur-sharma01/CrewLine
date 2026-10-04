import { describe, expect, it } from "vitest";
import {
  accentFor,
  avatarUrl,
  displayName,
  formatBytes,
  formatDue,
  initials,
  isOverdue,
  timeAgo,
  toDateInput,
} from "./utils.js";

describe("names and avatars", () => {
  it("builds initials from up to two words", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  grace   brewster  hopper ")).toBe("GB");
    expect(initials("linus")).toBe("L");
    expect(initials("")).toBe("?");
  });

  it("prefers the full name and falls back to the username", () => {
    expect(displayName({ fullName: "Ada L", username: "ada" })).toBe("Ada L");
    expect(displayName({ username: "ada" })).toBe("ada");
    expect(displayName(null)).toBe("");
  });

  it("treats the placeholder image as 'no avatar'", () => {
    expect(avatarUrl({ avatar: { url: "https://placehold.co/200x200" } })).toBeNull();
    expect(avatarUrl({ avatar: { url: "/api/v1/files/abc" } })).toBe("/api/v1/files/abc");
    expect(avatarUrl({})).toBeNull();
  });

  it("always gives the same accent color for the same name", () => {
    expect(accentFor("Website redesign")).toBe(accentFor("Website redesign"));
    expect(accentFor("Website redesign")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("dates", () => {
  it("formats due dates in UTC so they never show the previous day", () => {
    expect(formatDue("2026-12-01T00:00:00.000Z")).toMatch(/1/);
    expect(toDateInput("2026-12-01T00:00:00.000Z")).toBe("2026-12-01");
    expect(toDateInput(null)).toBe("");
  });

  it("knows what is overdue (finished tasks never are)", () => {
    expect(isOverdue("2000-01-01T00:00:00.000Z", "todo")).toBe(true);
    expect(isOverdue("2000-01-01T00:00:00.000Z", "done")).toBe(false);
    expect(isOverdue("2999-01-01T00:00:00.000Z", "todo")).toBe(false);
    expect(isOverdue(null, "todo")).toBe(false);
  });

  it("describes times relative to now", () => {
    const now = new Date("2026-10-01T12:00:00Z").getTime();
    expect(timeAgo("2026-10-01T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-10-01T10:00:00Z", now)).toMatch(/2 hours ago/);
    expect(timeAgo("2026-09-29T12:00:00Z", now)).toMatch(/2 days ago/);
    expect(timeAgo("2026-10-08T12:00:00Z", now)).toMatch(/next week|in 1 week|in 7 days/);
  });
});

describe("file sizes", () => {
  it("prints readable sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(300 * 1024)).toBe("300 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});
