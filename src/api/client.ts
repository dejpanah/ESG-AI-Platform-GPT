/**
 * HTTP client for the Enterprise Python RAG API.
 *
 * Paths in callers are relative to the API root, e.g. "/documents", "/chat".
 * getApiBase() always ends with "/api" so the final URL is:
 *   {origin}/api/documents   or   http://host:8000/api/documents
 */

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Normalize API base so it always includes the /api prefix once. */
export function getApiBase(): string {
  const raw = (import.meta.env.VITE_KNOWLEDGEOS_API_URL as string | undefined)?.trim();
  if (!raw) {
    // Dev: Vite proxies /api → RAG backend
    return "/api";
  }
  let base = raw.replace(/\/$/, "");
  // Accept either http://host:8000 or http://host:8000/api
  if (!base.endsWith("/api")) {
    base = `${base}/api`;
  }
  return base;
}

export function getWorkspaceId(): string {
  return window.localStorage.getItem("knowledgeos.workspace") || "default";
}

export function getUserId(): string {
  return window.localStorage.getItem("knowledgeos.user") || "local";
}

function headers(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("Accept", "application/json");
  h.set("X-Workspace-ID", getWorkspaceId());
  h.set("X-User-ID", getUserId());
  const token = window.localStorage.getItem("knowledgeos.token");
  if (token) h.set("Authorization", `Bearer ${token}`);
  return h;
}

function joinUrl(base: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function parseErrorDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  if (Array.isArray(record.detail)) {
    return record.detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (typeof record.message === "string") return record.message;
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 30000, ...init } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(joinUrl(getApiBase(), path), {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: headers(init.headers),
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new ApiError(text.slice(0, 200) || `Request failed (${response.status})`, response.status);
      }
    }
    if (!response.ok) {
      throw new ApiError(parseErrorDetail(payload, `Request failed (${response.status})`), response.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timed out");
    }
    throw new ApiError(error instanceof Error ? error.message : "Could not reach the RAG API");
  } finally {
    window.clearTimeout(timer);
  }
}

export async function uploadRequest<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  const response = await fetch(joinUrl(getApiBase(), path), {
    method: "POST",
    body: form,
    signal,
    headers: headers(),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError(text.slice(0, 200) || `Upload failed (${response.status})`, response.status);
    }
  }
  if (!response.ok) {
    throw new ApiError(parseErrorDetail(payload, `Upload failed (${response.status})`), response.status);
  }
  return payload as T;
}
