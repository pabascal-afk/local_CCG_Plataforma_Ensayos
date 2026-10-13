"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  LayoutDashboard,
  ClipboardList,
  Users,
  School,
  FileText,
  BarChart3,
  KeyRound,
  LogOut,
  Calendar,
} from "lucide-react";
import { clearSession, ROLE_LABEL, type Role, type SessionUser } from "@/lib/session";
import { useSchoolYear } from "@/context/SchoolYearContext";

type NavItem = { href: string; label: string; icon: React.ElementType };

const NAV: Record<Role, NavItem[]> = {
  STUDENT: [{ href: "/student", label: "Mis ensayos", icon: ClipboardList }],
  TEACHER: [
    { href: "/teacher", label: "Mis cursos", icon: BarChart3 },
    { href: "/admin/calendar", label: "Calendario SIMCE", icon: Calendar }
  ],
  ADMIN: [
    { href: "/admin/dashboard", label: "Dashboard Global", icon: LayoutDashboard },
    { href: "/admin/calendar", label: "Calendario SIMCE", icon: Calendar },
    { href: "/admin/courses", label: "Cursos", icon: School },
    { href: "/admin/users", label: "Usuarios", icon: Users },
    { href: "/admin/exams", label: "Ensayos", icon: FileText },
    { href: "/admin/assignments", label: "Asignaciones", icon: ClipboardList },
    { href: "/teacher", label: "Reportes / En vivo", icon: BarChart3 },
  ],
  DIRECTOR: [
    { href: "/admin/dashboard", label: "Dashboard Global", icon: LayoutDashboard },
    { href: "/admin/calendar", label: "Calendario SIMCE", icon: Calendar },
    { href: "/teacher", label: "Reportes Generales", icon: BarChart3 }
  ],
};

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedYear, setSelectedYear, availableYears } = useSchoolYear();

  const logout = () => {
    clearSession();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="h-16 flex items-center px-5 border-b">
          <img src="/CCG-logo-300x300.png" alt="CCG" className="w-8 h-8 object-contain mr-2" />
          <span className="font-extrabold text-gray-800 text-lg tracking-tight">ENSAYOS CCG</span>
        </div>

        {user.role !== "STUDENT" && (
          <div className="px-4 py-2.5 bg-blue-50/70 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-900 flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
              Año Escolar
            </span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="text-xs font-bold text-blue-800 bg-white border border-blue-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer shadow-sm"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1">
          {NAV[user.role].map((item) => {
            const active = item.href === pathname || (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-4 h-4 mr-3" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
          <p className="text-xs text-gray-500 mb-3">
            {ROLE_LABEL[user.role]} · {user.rut}
          </p>
          <Link
            href="/change-password"
            className="flex items-center text-xs text-gray-600 hover:text-blue-600 mb-2"
          >
            <KeyRound className="w-3.5 h-3.5 mr-1.5" /> Cambiar contraseña
          </Link>
          <button onClick={logout} className="flex items-center text-xs text-gray-600 hover:text-red-600">
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
