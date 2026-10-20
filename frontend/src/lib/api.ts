import { clearSession, getToken } from "./session";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * fetch hacia /api/* (mismo origen, el proxy de Next.js lo envía al backend).
 * Agrega el token y, ante un 401, cierra la sesión y vuelve al login.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; keepalive?: boolean } = {}
): Promise<T> {
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined
        ? (isFormData ? (options.body as BodyInit) : JSON.stringify(options.body))
        : undefined,
      keepalive: options.keepalive,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Sin conexión con el servidor", 0, null);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin JSON */
  }

  if (res.status === 401 && !path.startsWith("/auth/login")) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login?expired=1";
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error || `Error ${res.status}`;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

/** Cabeceras para recursos que no pasan por apiFetch (ej. el PDF en react-pdf). */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
