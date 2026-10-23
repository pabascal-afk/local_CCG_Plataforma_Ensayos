"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  History, Clock, User, ShieldCheck, GraduationCap, CheckCircle2, 
  AlertCircle, RefreshCw, Filter, Search, Copy, Check, ChevronDown, 
  ChevronUp, Zap, Calendar, KeyRound, Printer, LockOpen, PenTool,
  Download, FileSpreadsheet
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { useIsPruebas } from "@/lib/useIsPruebas";

type ActionLog = {
  id: number;
  assignmentId: number;
  action: string;
  actorRut: string;
  actorName: string;
  actorRole: string;
  targetRut?: string | null;
  targetName?: string | null;
  details?: string | null;
  note?: string | null;
  createdAt: string;
};

export default function LogsTab({ id, apiEndpointPrefix = "/teacher" }: { id: number; apiEndpointPrefix?: string }) {
  const isPruebas = useIsPruebas();
  const [logs, setLogs] = useState<ActionLog[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Filtros
  const [selectedCategory, setSelectedCategory] = useState<string>("TODOS");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedLogIds, setExpandedLogIds] = useState<Record<number, boolean>>({});

  const loadLogs = async () => {
    setRefreshing(true);
    try {
      const data = await apiFetch<ActionLog[]>(`${apiEndpointPrefix}/assignments/${id}/logs`);
      setLogs(data);
    } catch (err: any) {
      setError(err.message || "Error al cargar la bitácora de auditoría");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [id, apiEndpointPrefix]);

  const toggleExpand = (logId: number) => {
    setExpandedLogIds(prev => ({ ...prev, [logId]: !prev[logId] }));
  };

  // Obtener insignia de acción
  const getActionBadge = (action: string) => {
    switch (action) {
      case "ASSIGNMENT_CREATED":
        return { label: "Evaluación Creada", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 };
      case "COURSE_REACTIVATED":
        return { label: "Reactivación de Curso", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Zap };
      case "STUDENT_REACTIVATED":
        return { label: "Prórroga a Estudiante", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: Clock };
      case "STUDENT_BULK_REACTIVATED":
        return { label: "Prórroga Masiva", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Zap };
      case "TIME_EXTENDED":
        return { label: "Extensión Rápida de Tiempo", color: "bg-amber-100 text-amber-900 border-amber-300", icon: Clock };
      case "RESCHEDULED":
        return { label: "Reprogramación de Fechas", color: "bg-orange-100 text-orange-800 border-orange-200", icon: Calendar };
      case "STATUS_CHANGED":
        return { label: "Estado Modificado", color: "bg-rose-100 text-rose-800 border-rose-200", icon: AlertCircle };
      case "MODE_CHANGED":
        return { label: "Cambio de Modalidad", color: "bg-cyan-100 text-cyan-800 border-cyan-200", icon: Printer };
      case "DYNAMIC_PASSWORD_CHANGED":
        return { label: "PIN de Aula Actualizado", color: "bg-violet-100 text-violet-800 border-violet-200", icon: KeyRound };
      case "RESULTS_RELEASED":
        return { label: "Resultados Liberados", color: "bg-teal-100 text-teal-800 border-teal-200", icon: LockOpen };
      case "TEACHER_REASSIGNED":
        return { label: "Docente Reasignado", color: "bg-slate-100 text-slate-800 border-slate-200", icon: User };
      case "OPEN_QUESTIONS_GRADED":
        return { label: "Desarrollo/Oral Calificado", color: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200", icon: PenTool };
      case "OMR_BULK_SUBMITTED":
      case "ANSWERS_IMPORTED":
        return { label: "Hojas OMR / Planilla", color: "bg-sky-100 text-sky-800 border-sky-200", icon: FileSpreadsheet };
      default:
        return { label: action, color: "bg-gray-100 text-gray-800 border-gray-200", icon: History };
    }
  };

  // Clasificación para filtros
  const filterCategoryMap: Record<string, string[]> = {
    REACTIVACION: ["COURSE_REACTIVATED", "STUDENT_REACTIVATED", "STUDENT_BULK_REACTIVATED"],
    TIEMPO: ["TIME_EXTENDED", "RESCHEDULED"],
    CONFIGURACION: ["ASSIGNMENT_CREATED", "MODE_CHANGED", "DYNAMIC_PASSWORD_CHANGED", "TEACHER_REASSIGNED", "STATUS_CHANGED"],
    CALIFICACION: ["RESULTS_RELEASED", "OPEN_QUESTIONS_GRADED", "OMR_BULK_SUBMITTED", "ANSWERS_IMPORTED"]
  };

  // Filtrado de logs
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      // Filtro de categoría
      if (selectedCategory !== "TODOS") {
        const allowedActions = filterCategoryMap[selectedCategory] || [];
        if (!allowedActions.includes(log.action)) return false;
      }

      // Filtro de texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchActor = log.actorName.toLowerCase().includes(q) || log.actorRut.toLowerCase().includes(q);
        const matchTarget = (log.targetName || "").toLowerCase().includes(q) || (log.targetRut || "").toLowerCase().includes(q);
        const matchNote = (log.note || "").toLowerCase().includes(q);
        const matchAction = log.action.toLowerCase().includes(q);
        const matchDetails = (log.details || "").toLowerCase().includes(q);
        if (!matchActor && !matchTarget && !matchNote && !matchAction && !matchDetails) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedCategory, searchQuery]);

  // Formato legible de fecha
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  // Tiempo relativo aproximado
  const getRelativeTime = (dateStr: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diffSec < 60) return "Hace un momento";
      if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
      if (diffSec < 86400) return `Hace ${Math.floor(diffSec / 3600)} h`;
      return `Hace ${Math.floor(diffSec / 86400)} d`;
    } catch {
      return "";
    }
  };

  // Copiar bitácora completa en texto
  const handleCopyLogs = async () => {
    if (!logs || logs.length === 0) return;
    const text = logs.map(l => {
      const badge = getActionBadge(l.action);
      return `[${formatDate(l.createdAt)}] ${badge.label} | Autor: ${l.actorName} (${l.actorRut}) [${l.actorRole}] | Destino: ${l.targetName || "Curso"} | Detalle: ${l.details || ""} ${l.note ? `| Nota: ${l.note}` : ""}`;
    }).join("\n");

    await copyToClipboard(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Resumen humano generado a partir de details
  const renderHumanSummary = (log: ActionLog) => {
    let parsed: any = null;
    if (log.details) {
      try { parsed = JSON.parse(log.details); } catch { parsed = log.details; }
    }

    if (log.action === "TIME_EXTENDED") {
      return (
        <span className="text-gray-800 font-medium">
          Prórroga rápida de <strong>+{parsed?.minutesAdded || 15} minutos</strong> en caliente. Nuevo cierre:{" "}
          <span className="font-semibold text-blue-700">{parsed?.newClosesAt ? formatDate(parsed.newClosesAt) : "actualizado"}</span>.
        </span>
      );
    }

    if (log.action === "STUDENT_REACTIVATED") {
      return (
        <span className="text-gray-800 font-medium">
          Habilitó prórroga para <strong>{log.targetName || log.targetRut}</strong> hasta el{" "}
          <span className="font-semibold text-indigo-700">{parsed?.deadline ? formatDate(parsed.deadline) : "fecha acordada"}</span>{" "}
          ({parsed?.resetMode === "CLEAR_ANSWERS" ? "reiniciando respuestas" : "conservando respuestas previas"}).
        </span>
      );
    }

    if (log.action === "STUDENT_BULK_REACTIVATED") {
      return (
        <span className="text-gray-800 font-medium">
          Reactivó masivamente a <strong>{parsed?.affectedCount || log.note} estudiantes</strong> hasta el{" "}
          <span className="font-semibold text-blue-700">{parsed?.deadline ? formatDate(parsed.deadline) : "plazo fijado"}</span>{" "}
          ({parsed?.resetMode === "CLEAR_ANSWERS" ? "borrando respuestas anteriores" : "conservando respuestas"}).
        </span>
      );
    }

    if (log.action === "COURSE_REACTIVATED") {
      return (
        <span className="text-gray-800 font-medium">
          Reabrió la evaluación para todo el curso hasta el{" "}
          <span className="font-semibold text-purple-700">{parsed?.newClosesAt ? formatDate(parsed.newClosesAt) : "nuevo plazo"}</span>{" "}
          ({parsed?.scope === "ALL_STUDENTS" ? "incluyendo entregados" : "solo estudiantes pendientes"}).
        </span>
      );
    }

    if (log.action === "ASSIGNMENT_CREATED") {
      return (
        <span className="text-gray-800 font-medium">
          Programó la evaluación para el curso <strong>{parsed?.courseName || ""}</strong>. Modalidad:{" "}
          <strong>{parsed?.applicationMode || "DIGITAL"}</strong> · Duración: <strong>{parsed?.durationMinutes || 90} min</strong>.
        </span>
      );
    }

    if (log.action === "MODE_CHANGED") {
      return (
        <span className="text-gray-800 font-medium">
          Cambió modalidad de aplicación a <strong>{parsed?.newMode || parsed?.applicationMode || "nueva modalidad"}</strong>.
        </span>
      );
    }

    if (log.action === "DYNAMIC_PASSWORD_CHANGED") {
      return (
        <span className="text-gray-800 font-medium">
          Actualizó el estado del PIN de aula (
          {parsed?.dynamicPasswordActive ? "PIN Activado" : "PIN Desactivado"}).
        </span>
      );
    }

    if (log.action === "RESULTS_RELEASED") {
      return (
        <span className="text-gray-800 font-medium">
          Liberó oficialmente los resultados y notas para visualización de los estudiantes.
        </span>
      );
    }

    return (
      <span className="text-gray-700">
        {log.note || (typeof parsed === "string" ? parsed : "Acción registrada en el sistema.")}
      </span>
    );
  };

  return (
    <div className="space-y-6">

      {/* Cabecera y Herramientas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" /> Bitácora de Auditoría e Historial de Acciones
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Registro inmutable de todas las programaciones, prórrogas, reactivaciones y modificaciones de esta evaluación
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            disabled={refreshing}
            className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:text-blue-600 hover:bg-gray-50 transition-colors"
            title="Refrescar historial"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAll ? "Copiado" : "Copiar Bitácora"}</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Selector de Categoría */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "TODOS", label: "Todas" },
            { id: "REACTIVACION", label: "⚡ Reactivaciones" },
            { id: "TIEMPO", label: "⏱️ Tiempos y Prórrogas" },
            { id: "CONFIGURACION", label: "⚙️ Configuración y PIN" },
            { id: "CALIFICACION", label: "📝 Notas y Entrega" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                selectedCategory === cat.id
                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                  : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Buscador de Texto */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por autor, alumno, RUT o detalle..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
          />
        </div>
      </div>

      {/* Contenido Principal */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
          <div>{error}</div>
        </div>
      )}

      {logs === null && !error ? (
        <div className="py-12 text-center text-gray-400 animate-pulse font-medium">
          Cargando eventos de auditoría...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="py-12 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8">
          <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-600">No se encontraron eventos en la bitácora</p>
          <p className="text-xs text-gray-400 mt-1">
            {logs && logs.length > 0 
              ? "Prueba cambiando los filtros o la búsqueda ingresada."
              : "Las acciones de reactivación, prórroga o cambios de horario aparecerán aquí automáticamente."}
          </p>
        </div>
      ) : (
        <div className="relative border-l-2 border-blue-100 ml-4 pl-6 space-y-6">
          {filteredLogs.map((log) => {
            const badge = getActionBadge(log.action);
            const Icon = badge.icon;
            const isExpanded = Boolean(expandedLogIds[log.id]);
            const isTeacher = log.actorRole === "TEACHER";
            const isAdmin = log.actorRole === "ADMIN" || log.actorRole === "DIRECTOR";

            return (
              <div key={log.id} className="relative group">
                
                {/* Punto en la línea de tiempo */}
                <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-blue-600 shadow-2xs group-hover:scale-125 transition-transform" />

                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs hover:border-blue-300 transition-colors">
                  
                  {/* Encabezado del Evento */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${badge.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        <span>{badge.label}</span>
                      </span>

                      {/* Badge del Actor */}
                      <span className="flex items-center gap-1 text-xs text-gray-600 font-semibold bg-gray-100 px-2 py-0.5 rounded-md">
                        {isAdmin ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                        ) : (
                          <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                        )}
                        <span>{log.actorName}</span>
                        <span className="text-[10px] text-gray-400 font-mono">({log.actorRut})</span>
                      </span>
                    </div>

                    {/* Fecha y Hora */}
                    <div className="text-right text-xs text-gray-400 flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-gray-600">{formatDate(log.createdAt)}</span>
                      <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-medium text-gray-500">
                        {getRelativeTime(log.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Resumen Humano de la Acción */}
                  <div className="text-sm mt-1">
                    {renderHumanSummary(log)}
                  </div>

                  {/* Nota o justificación si existe */}
                  {log.note && (
                    <div className="mt-2 p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs text-amber-900">
                      <span className="font-bold">Motivo:</span> {log.note}
                    </div>
                  )}

                  {/* Detalle Técnico Expandible */}
                  {log.details && (
                    <div className="mt-3 pt-2 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => toggleExpand(log.id)}
                        className="text-[11px] text-gray-500 hover:text-blue-600 flex items-center gap-1 font-semibold transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>{isExpanded ? "Ocultar metadatos técnicos" : "Ver metadatos completos (JSON)"}</span>
                      </button>

                      {isExpanded && (
                        <pre className="mt-2 p-3 bg-gray-900 text-gray-100 text-[11px] font-mono rounded-lg overflow-x-auto">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(log.details), null, 2);
                            } catch {
                              return log.details;
                            }
                          })()}
                        </pre>
                      )}
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
