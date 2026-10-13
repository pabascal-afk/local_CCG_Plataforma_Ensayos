export type Role = "ADMIN" | "DIRECTOR" | "TEACHER" | "STUDENT";

export interface SessionUser {
  rut: string;
  name: string;
  role: Role;
  courseId: number | null;
  mustChangePassword: boolean;
}

const TOKEN_KEY = "simce_token";
const USER_KEY = "simce_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateUser(user: SessionUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function homeForRole(role: Role): string {
  switch (role) {
    case "STUDENT":
      return "/student";
    case "TEACHER":
      return "/teacher";
    case "ADMIN":
    case "DIRECTOR":
      return "/admin/dashboard";
  }
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  DIRECTOR: "Director(a)",
  TEACHER: "Profesor(a)",
  STUDENT: "Estudiante",
};
