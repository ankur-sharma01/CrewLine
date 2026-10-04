const BASE = "/api/v1";

export class ApiRequestError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

let refreshing = null;
let onAuthFailure = () => {};
export const setAuthFailureHandler = (fn) => (onAuthFailure = fn);

async function send(path, { method = "GET", body } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + path, {
    method,
    credentials: "include",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // empty body
  }
  return { res, json };
}

export async function api(path, options = {}) {
  let { res, json } = await send(path, options);

  if (res.status === 401 && !options.noRefresh) {
    refreshing ??= send("/auth/refresh-token", { method: "POST", body: {} }).finally(() => (refreshing = null));
    const refreshed = await refreshing;
    if (refreshed.res.ok) {
      ({ res, json } = await send(path, options));
    } else {
      onAuthFailure();
    }
  }

  if (!res.ok) {
    throw new ApiRequestError(json?.message || "Something went wrong. Please try again.", res.status, json?.errors);
  }
  return json?.data;
}

export const errorMessage = (err) => err?.message || "Something went wrong";

// turns [{ email: "Email is invalid" }, ...] into { email: "Email is invalid" }
export const fieldErrors = (err) => Object.assign({}, ...(err?.errors || []));
