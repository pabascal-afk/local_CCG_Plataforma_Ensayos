"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import RequireRole from "@/components/RequireRole";
import { apiFetch, authHeaders } from "@/lib/api";

interface AuditLogItem {
  id: number;
  fecha_hora: string;
  origen_actor: "USUARIO" | "PLATAFORMA" | string;
  usuario_id: string | null;
  usuario_email: string;
  usuario_nombre: string | null;
  usuario_rol: string | null;
  desencadenado_por_id: string | null;
  desencadenado_por_nombre: string | null;
  desencadenado_por_rol: string | null;
  modulo: string;
  accion: string;
  nivel: "info" | "success" | "warning" | "danger" | string;
  entidad: string | null;
  entidad_id: string | null;
  descripcion: string;
  detalles: string | null;
  detalles_parsed?: unknown;
  ip: string | null;
  user_agent: string | null;
}

interface AuditListResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: AuditLogItem[];
}

interface AuditKpisResponse {
  total_general: number;
  total_hoy: number;
  acciones_criticas: number;
  acciones_plataforma: number;
  modulo_mas_activo: string;
  modulosDisponibles: string[];
  accionesDisponibles: string[];
}

const KNOWN_MODULES = [
  "Autenticación",
  "Evaluaciones",
  "Asignaciones",
  "Rendición",
  "Resultados",
  "Reportes",
  "Cursos",
  "Usuarios",
  "Audios",
  "Horarios",
  "Calendario e Hitos",
  "Remediales",
  "Auditoría",
];

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(iso: string): { date: string; time: string } {
  if (!iso) return { date: "-", time: "" };
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return { date: iso, time: "" };
  return {
    date: dt.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function getLevelBadge(nivel: string) {
  const n = String(nivel || "info").toLowerCase();
  if (n === "success") {
    return {
      label: "Éxito",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if (n === "warning") {
    return {
      label: "Advertencia",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }
  if (n === "danger") {
    return {
      label: "Crítico",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }
  return {
    label: "Info",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  };
}

function getModuleBadgeClass(modulo: string): string {
  const m = (modulo || "").toLowerCase();
  if (m.includes("evaluac")) return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (m.includes("asignac")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (m.includes("rendic")) return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (m.includes("usuari")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (m.includes("curs")) return "bg-teal-50 text-teal-700 border-teal-200";
  if (m.includes("autentic") || m.includes("auditor")) return "bg-slate-100 text-slate-800 border-slate-300";
  if (m.includes("remed")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (m.includes("audio")) return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
  if (m.includes("report") || m.includes("result")) return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function getRoleLabel(role: string | null): string {
  if (!role) return "";
  const r = role.toUpperCase();
  if (r === "ADMIN") return "Administrador";
  if (r === "DIRECTOR") return "Dirección / UTP";
  if (r === "TEACHER") return "Docente";
  if (r === "STUDENT") return "Estudiante";
  if (r === "SISTEMA") return "Sistema";
  return role;
}

export default function AuditoriaPage() {
  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <AuditoriaContent currentUserRole={user.role} />
        </AppShell>
      )}
    </RequireRole>
  );
}

function AuditoriaContent({ currentUserRole }: { currentUserRole: string }) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [kpis, setKpis] = useState<AuditKpisResponse | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);

  // Filtros
  const [quickRange, setQuickRange] = useState<"hoy" | "7d" | "mes" | "todo">("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [modulo, setModulo] = useState("todos");
  const [origenActor, setOrigenActor] = useState("todos");
  const [nivel, setNivel] = useState("todos");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Modal Detalle
  const [detailLog, setDetailLog] = useState<AuditLogItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Modal Purga
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeDays, setPurgeDays] = useState("180");
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (modulo && modulo !== "todos") params.set("modulo", modulo);
    if (origenActor && origenActor !== "todos") params.set("origen_actor", origenActor);
    if (nivel && nivel !== "todos") params.set("nivel", nivel);
    if (debouncedSearch) params.set("busqueda", debouncedSearch);
    return params;
  }, [desde, hasta, modulo, origenActor, nivel, debouncedSearch]);

  const loadKpis = useCallback(async () => {
    try {
      const data = await apiFetch<AuditKpisResponse>("/auditoria/kpis");
      setKpis(data);
    } catch {
      /* no bloquear tabla si fallan KPIs */
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = buildFilterParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      const data = await apiFetch<AuditListResponse>(`/auditoria?${params.toString()}`);
      setLogs(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los logs de auditoría");
    } finally {
      setLoading(false);
    }
  }, [buildFilterParams, page, limit]);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const applyQuickRange = (range: "hoy" | "7d" | "mes" | "todo") => {
    setQuickRange(range);
    setPage(1);
    const now = new Date();
    if (range === "hoy") {
      const today = formatDateInput(now);
      setDesde(today);
      setHasta(today);
    } else if (range === "7d") {
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      setDesde(formatDateInput(start));
      setHasta(formatDateInput(now));
    } else if (range === "mes") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setDesde(formatDateInput(start));
      setHasta(formatDateInput(now));
    } else {
      setDesde("");
      setHasta("");
    }
  };

  const resetFilters = () => {
    setQuickRange("todo");
    setDesde("");
    setHasta("");
    setModulo("todos");
    setOrigenActor("todos");
    setNivel("todos");
    setSearchInput("");
    setDebouncedSearch("");
    setPage(1);
  };

  const refreshAll = () => {
    loadKpis();
    loadLogs();
  };

  const openDetailModal = async (id: number) => {
    setDetailLoading(true);
    setCopiedJson(false);
    try {
      const detail = await apiFetch<AuditLogItem>(`/auditoria/${id}`);
      setDetailLog(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo obtener el detalle del registro");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = async (formato: "xlsx" | "csv") => {
    setExporting(formato);
    setError("");
    try {
      const params = buildFilterParams();
      params.set("formato", formato);
      const res = await fetch(`/api/auditoria/exportar?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        let msg = `Error al exportar (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `auditoria_plataforma_${dateStr}.${formato}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setTimeout(refreshAll, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al exportar archivo");
    } finally {
      setExporting(null);
    }
  };

  const handlePurge = async () => {
    const dias = parseInt(purgeDays, 10);
    if (isNaN(dias) || dias < 1 || dias > 3650) {
      setPurgeMsg("Ingresa una cantidad válida de días entre 1 y 3650.");
      return;
    }
    setPurging(true);
    setPurgeMsg("");
    try {
      const res = await apiFetch<{ message: string; eliminados: number }>("/auditoria/limpiar", {
        method: "POST",
        body: { dias },
      });
      setPurgeMsg(res.message);
      setTimeout(() => {
        setPurgeOpen(false);
        setPurgeMsg("");
        refreshAll();
      }, 900);
    } catch (err) {
      setPurgeMsg(err instanceof Error ? err.message : "No se pudo completar la purga");
    } finally {
      setPurging(false);
    }
  };

  const handleCopyJson = async () => {
    if (!detailLog) return;
    const text =
      detailLog.detalles_parsed !== null && detailLog.detalles_parsed !== undefined
        ? JSON.stringify(detailLog.detalles_parsed, null, 2)
        : detailLog.detalles || "{}";
    try {
      await navigator.clipboard.writeText(text);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {}
  };

  const moduleOptions = useMemo(() => {
    const set = new Set<string>(KNOWN_MODULES);
    (kpis?.modulosDisponibles || []).forEach((m) => {
      if (m) set.add(m);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [kpis?.modulosDisponibles]);

  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-white shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bitácora Global de Auditoría y Logs</h1>
              <p className="text-sm text-gray-500">
                Trazabilidad en tiempo real de acciones de usuarios y procesos automáticos de la plataforma (incluido quien los desencadena).
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>

          <button
            onClick={() => handleExport("xlsx")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {exporting === "xlsx" ? "Generando..." : "Exportar Excel"}
          </button>

          <button
            onClick={() => handleExport("csv")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <Download className="w-4 h-4" />
            {exporting === "csv" ? "Generando..." : "CSV (UTF-8)"}
          </button>

          {currentUserRole === "ADMIN" && (
            <button
              onClick={() => {
                setPurgeMsg("");
                setPurgeOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition"
            >
              <Trash2 className="w-4 h-4" />
              Purgar Antiguos
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Total Histórico</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">{(kpis?.total_general ?? total).toLocaleString("es-CL")}</p>
          <p className="mt-1 text-xs text-gray-500">Eventos inmutables registrados</p>
        </div>

        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Acciones Hoy</span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">{(kpis?.total_hoy ?? 0).toLocaleString("es-CL")}</p>
          <p className="mt-1 text-xs text-gray-500">Eventos del día en curso</p>
        </div>

        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Acciones Críticas</span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{(kpis?.acciones_criticas ?? 0).toLocaleString("es-CL")}</p>
          <p className="mt-1 text-xs text-gray-500">Nivel danger / eliminaciones / purgas</p>
        </div>

        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Acciones Plataforma</span>
            <Bot className="w-4 h-4 text-purple-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-purple-700">{(kpis?.acciones_plataforma ?? 0).toLocaleString("es-CL")}</p>
          <p className="mt-1 text-xs text-gray-500">Ejecuciones automáticas trazadas</p>
        </div>

        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
            <span>Módulo Más Activo</span>
            <Info className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-gray-900 truncate" title={kpis?.modulo_mas_activo || "Sin actividad"}>
            {kpis?.modulo_mas_activo || "Sin actividad"}
          </p>
          <p className="mt-1 text-xs text-gray-500">Mayor volumen histórico</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Filter className="w-4 h-4 text-gray-500" />
            <span>Filtros Combinables</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "hoy", label: "Hoy" },
                { id: "7d", label: "Últimos 7 días" },
                { id: "mes", label: "Este mes" },
                { id: "todo", label: "Todo el historial" },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                onClick={() => applyQuickRange(r.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                  quickRange === r.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {r.label}
              </button>
            ))}

            <button
              onClick={resetFilters}
              className="px-3 py-1 rounded-full text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setQuickRange("todo");
                  setPage(1);
                }}
                className="w-full pl-8 pr-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={hasta}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setQuickRange("todo");
                  setPage(1);
                }}
                className="w-full pl-8 pr-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Módulo</label>
            <select
              value={modulo}
              onChange={(e) => {
                setModulo(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="todos">Todos los módulos</option>
              {moduleOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ejecutor / Origen</label>
            <select
              value={origenActor}
              onChange={(e) => {
                setOrigenActor(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="todos">Todos (Usuario + Plataforma)</option>
              <option value="USUARIO">Solo Usuarios</option>
              <option value="PLATAFORMA">Solo Plataforma Automática</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nivel / Severidad</label>
            <select
              value={nivel}
              onChange={(e) => {
                setNivel(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="todos">Todos los niveles</option>
              <option value="info">Info</option>
              <option value="success">Éxito (Success)</option>
              <option value="warning">Advertencia (Warning)</option>
              <option value="danger">Crítico (Danger)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Búsqueda Global</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="RUT, nombre, acción, IP..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Fecha / Hora</th>
                <th className="px-4 py-3 text-left">Actor / Desencadenante</th>
                <th className="px-4 py-3 text-left">Módulo & Acción</th>
                <th className="px-4 py-3 text-left">Descripción & Objeto</th>
                <th className="px-4 py-3 text-left">Nivel</th>
                <th className="px-4 py-3 text-left">IP</th>
                <th className="px-4 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    Cargando registros de auditoría...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No se encontraron registros que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const dt = formatDateTime(log.fecha_hora);
                  const lvl = getLevelBadge(log.nivel);
                  const isPlatform = log.origen_actor === "PLATAFORMA";

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{dt.date}</div>
                        <div className="text-xs text-gray-500 font-mono">{dt.time}</div>
                      </td>

                      <td className="px-4 py-3 min-w-[230px]">
                        {isPlatform ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                              <Bot className="w-3.5 h-3.5" />
                              Plataforma Automática
                            </span>
                            {log.desencadenado_por_nombre && (
                              <div className="text-xs text-gray-700 leading-snug">
                                <span className="font-semibold text-gray-600">Desencadenado por:</span>{" "}
                                <span className="font-medium text-gray-900">{log.desencadenado_por_nombre}</span>
                                {log.desencadenado_por_id &&
                                  log.desencadenado_por_id !== log.desencadenado_por_nombre && (
                                    <span className="text-gray-500"> ({log.desencadenado_por_id})</span>
                                  )}
                                {log.desencadenado_por_rol && (
                                  <span className="ml-1 inline-block px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold">
                                    {getRoleLabel(log.desencadenado_por_rol)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 p-1 rounded-full bg-blue-50 text-blue-600 shrink-0">
                              <User className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 truncate">
                                {log.usuario_nombre || log.usuario_email}
                              </div>
                              <div className="text-xs text-gray-500 flex flex-wrap items-center gap-1">
                                <span className="font-mono">{log.usuario_id || log.usuario_email}</span>
                                {log.usuario_rol && (
                                  <span className="px-1.5 py-0.2 rounded bg-gray-100 text-gray-700 text-[10px] font-semibold">
                                    {getRoleLabel(log.usuario_rol)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold border ${getModuleBadgeClass(
                            log.modulo
                          )}`}
                        >
                          {log.modulo}
                        </span>
                        <div className="mt-1 text-xs font-semibold text-gray-800">{log.accion}</div>
                      </td>

                      <td className="px-4 py-3 max-w-md">
                        <p className="text-gray-800 leading-snug">{log.descripcion}</p>
                        {log.entidad && (
                          <span className="mt-1 inline-block text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {log.entidad}
                            {log.entidad_id ? ` #${log.entidad_id}` : ""}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${lvl.className}`}
                        >
                          {lvl.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono text-gray-600 bg-gray-50 border px-1.5 py-0.5 rounded">
                          {log.ip || "-"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => openDetailModal(log.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 transition"
                          title="Ver detalle completo y JSON"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="px-4 py-3 bg-gray-50 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-gray-600">
          <div className="flex items-center gap-3">
            <span>
              Mostrando <strong className="text-gray-900">{startItem}</strong>–
              <strong className="text-gray-900">{endItem}</strong> de{" "}
              <strong className="text-gray-900">{total.toLocaleString("es-CL")}</strong> registros
            </span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="px-2 py-1 text-xs border rounded-md bg-white focus:outline-none"
            >
              <option value={20}>20 / pág</option>
              <option value={25}>25 / pág</option>
              <option value={50}>50 / pág</option>
              <option value={100}>100 / pág</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Anterior
            </button>
            <span className="text-xs font-medium text-gray-700">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              Siguiente
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Detalle */}
      {(detailLog || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-slate-800" />
                <h2 className="font-bold text-gray-900">
                  {detailLog ? `Detalle de Registro #${detailLog.id}` : "Cargando registro..."}
                </h2>
              </div>
              <button
                onClick={() => setDetailLog(null)}
                className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-sm">
              {detailLoading || !detailLog ? (
                <p className="text-center text-gray-500 py-8">Obteniendo información del evento...</p>
              ) : (
                <>
                  {detailLog.origen_actor === "PLATAFORMA" && (
                    <div className="rounded-xl border border-purple-200 bg-purple-50 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2 text-purple-900 font-semibold">
                        <Bot className="w-5 h-5 text-purple-700" />
                        <span>Acción ejecutada automáticamente por la Plataforma</span>
                      </div>
                      <div className="text-xs text-purple-800 bg-white/80 px-2.5 py-1 rounded-lg border border-purple-200">
                        <span className="font-semibold">Desencadenado por:</span>{" "}
                        {detailLog.desencadenado_por_nombre || "Sistema"}{" "}
                        {detailLog.desencadenado_por_id ? `(${detailLog.desencadenado_por_id})` : ""}{" "}
                        {detailLog.desencadenado_por_rol ? `· ${getRoleLabel(detailLog.desencadenado_por_rol)}` : ""}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4 border">
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase">Fecha y Hora</span>
                      <p className="font-medium text-gray-900">
                        {formatDateTime(detailLog.fecha_hora).date} · {formatDateTime(detailLog.fecha_hora).time}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase">Origen / Ejecutor</span>
                      <p className="font-medium text-gray-900">
                        {detailLog.usuario_nombre || detailLog.usuario_email} (
                        {getRoleLabel(detailLog.usuario_rol)})
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase">Módulo / Acción</span>
                      <p className="font-medium text-gray-900">
                        {detailLog.modulo} → {detailLog.accion}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase">Entidad Afectada</span>
                      <p className="font-medium text-gray-900">
                        {detailLog.entidad
                          ? `${detailLog.entidad}${detailLog.entidad_id ? ` #${detailLog.entidad_id}` : ""}`
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase">Dirección IP</span>
                      <p className="font-mono text-xs text-gray-900 mt-0.5">{detailLog.ip || "Desconocida"}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase">Nivel</span>
                      <p className="mt-0.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${
                            getLevelBadge(detailLog.nivel).className
                          }`}
                        >
                          {getLevelBadge(detailLog.nivel).label}
                        </span>
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Navegador / User-Agent</span>
                      <p className="text-xs text-gray-700 break-all mt-0.5">{detailLog.user_agent || "-"}</p>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Descripción del Evento</span>
                    <p className="mt-1 text-gray-900 bg-white border rounded-xl p-3">{detailLog.descripcion}</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Carga Útil Técnica (JSON)</span>
                      <button
                        onClick={handleCopyJson}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                      >
                        {copiedJson ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedJson ? "Copiado" : "Copiar JSON"}
                      </button>
                    </div>
                    <pre className="bg-slate-900 text-slate-100 text-xs rounded-xl p-4 overflow-x-auto max-h-72 font-mono">
                      {detailLog.detalles_parsed !== null && detailLog.detalles_parsed !== undefined
                        ? JSON.stringify(detailLog.detalles_parsed, null, 2)
                        : detailLog.detalles || "{}"}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Purga (Solo ADMIN) */}
      {purgeOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-bold text-lg">Depurar Logs Históricos</h3>
              </div>
              <button
                onClick={() => setPurgeOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600">
              Elimina en bloque los registros con más de <strong>X días</strong> de antigüedad (por defecto 180 días).
              Esta operación se auto-registra obligatoriamente como evento crítico en la bitácora.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Conservar últimos (días):
              </label>
              <input
                type="number"
                min={1}
                max={3650}
                value={purgeDays}
                onChange={(e) => setPurgeDays(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            {purgeMsg && (
              <div className="text-xs rounded-lg p-2.5 bg-gray-100 text-gray-800 border">{purgeMsg}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPurgeOpen(false)}
                disabled={purging}
                className="px-3.5 py-2 text-sm font-medium rounded-lg border text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handlePurge}
                disabled={purging}
                className="px-3.5 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {purging ? "Depurando..." : "Confirmar Purga"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
