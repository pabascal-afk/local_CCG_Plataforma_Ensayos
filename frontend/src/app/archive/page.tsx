"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Archive,
  Search,
  Filter,
  FileText,
  BarChart2,
  RotateCcw,
  Settings,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  X,
  Check,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch, ApiError } from "@/lib/api";
import { useSchoolYear } from "@/context/SchoolYearContext";
import { useIsPruebas } from "@/lib/useIsPruebas";
import type { SessionUser } from "@/lib/session";

type ArchivedAssignment = {
  id: number;
  examId: number;
  courseId: number;
  courseName?: string;
  title?: string;
  subject?: string;
  opensAt: string;
  closesAt: string;
  applicationMode?: "DIGITAL" | "PRINTED";
  submissionsCount?: number;
  totalStudents?: number;
  isArchived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  archivedReason: string | null;
  Exam?: {
    id: number;
    title: string;
    subject: string;
    examType: string;
    level: string;
  };
  Course?: {
    id: number;
    level: string;
    letter: string;
    _count?: { students: number };
  };
};

type ArchiveSettings = {
  enabled: boolean;
  days: number;
};

function ArchiveContent({ user }: { user: SessionUser }) {
  const { selectedYear } = useSchoolYear();
  const isPruebas = useIsPruebas();

  const [assignments, setAssignments] = useState<ArchivedAssignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("ALL");
  const [selectedCourse, setSelectedCourse] = useState("ALL");

  // Settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<ArchiveSettings>({ enabled: true, days: 30 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningAuto, setRunningAuto] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const isAdminOrDirector = user.role === "ADMIN" || user.role === "DIRECTOR";

  const loadArchivedAssignments = async () => {
    setLoading(true);
    setError("");
    try {
      const endpoint = isAdminOrDirector
        ? `/admin/assignments?archived=true&year=${selectedYear}`
        : `/teacher/assignments?archived=true&year=${selectedYear}`;

      const data = await apiFetch<ArchivedAssignment[]>(endpoint);
      setAssignments(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al cargar evaluaciones archivadas");
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    if (!isAdminOrDirector) return;
    try {
      const s = await apiFetch<ArchiveSettings>("/admin/settings/archive");
      setSettings(s);
    } catch (e) {
      console.error("Error al cargar configuración de archivado:", e);
    }
  };

  useEffect(() => {
    loadArchivedAssignments();
    if (isAdminOrDirector) {
      loadSettings();
    }
  }, [selectedYear]);

  // Normalizar datos entre endpoint de admin y teacher
  const normalizedList = useMemo(() => {
    if (!assignments) return [];
    return assignments.map((a) => {
      const title = a.title || a.Exam?.title || "Evaluación sin título";
      const subject = a.subject || a.Exam?.subject || "General";
      const courseName = a.courseName || (a.Course ? `${a.Course.level} ${a.Course.letter}` : "Curso");
      const totalStudents = a.totalStudents ?? a.Course?._count?.students ?? 0;
      const submissions = a.submissionsCount ?? 0;

      return {
        ...a,
        displayTitle: title,
        displaySubject: subject,
        displayCourse: courseName,
        displaySubmissions: submissions,
        displayTotalStudents: totalStudents,
      };
    });
  }, [assignments]);

  // Listas de filtros únicos
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    normalizedList.forEach((a) => set.add(a.displaySubject));
    return Array.from(set).sort();
  }, [normalizedList]);

  const availableCourses = useMemo(() => {
    const set = new Set<string>();
    normalizedList.forEach((a) => set.add(a.displayCourse));
    return Array.from(set).sort();
  }, [normalizedList]);

  // Filtrado
  const filteredList = useMemo(() => {
    return normalizedList.filter((a) => {
      if (selectedSubject !== "ALL" && a.displaySubject !== selectedSubject) return false;
      if (selectedCourse !== "ALL" && a.displayCourse !== selectedCourse) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = a.displayTitle.toLowerCase().includes(q);
        const matchSubject = a.displaySubject.toLowerCase().includes(q);
        const matchCourse = a.displayCourse.toLowerCase().includes(q);
        if (!matchTitle && !matchSubject && !matchCourse) return false;
      }
      return true;
    });
  }, [normalizedList, search, selectedSubject, selectedCourse]);

  // Acción: Desarchivar
  const handleUnarchive = async (assignment: (typeof normalizedList)[0]) => {
    const confirmMsg = `¿Deseas desarchivar la evaluación "${assignment.displayTitle}" (${assignment.displayCourse})?\n\nVolverá a aparecer en la lista activa de Reportes y Asignaciones.`;
    if (!confirm(confirmMsg)) return;

    try {
      const endpoint = isAdminOrDirector
        ? `/admin/assignments/${assignment.id}/unarchive`
        : `/teacher/assignments/${assignment.id}/unarchive`;

      await apiFetch(endpoint, { method: "POST" });
      loadArchivedAssignments();
    } catch (e: any) {
      alert(e?.message || "Error al desarchivar la evaluación");
    }
  };

  // Guardar configuración de auto-archivado
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsFeedback(null);
    try {
      await apiFetch("/admin/settings/archive", {
        method: "PUT",
        body: settings,
      });
      setSettingsFeedback({ type: "success", message: "Configuración guardada correctamente." });
      setTimeout(() => setShowSettingsModal(false), 1200);
    } catch (e: any) {
      setSettingsFeedback({ type: "error", message: e?.message || "Error al guardar configuración." });
    } finally {
      setSavingSettings(false);
    }
  };

  // Ejecutar auto-archivado manual
  const handleRunAutoArchive = async () => {
    setRunningAuto(true);
    setSettingsFeedback(null);
    try {
      const res = await apiFetch<{ archivedCount: number; message: string }>("/admin/assignments/auto-archive/run", {
        method: "POST",
      });
      setSettingsFeedback({
        type: "success",
        message: `Archivado completado: ${res.archivedCount} evaluaciones archivadas automáticamente.`,
      });
      loadArchivedAssignments();
    } catch (e: any) {
      setSettingsFeedback({ type: "error", message: e?.message || "Error al ejecutar archivado automático." });
    } finally {
      setRunningAuto(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl">
              <Archive className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                {isPruebas ? "Archivo de Pruebas" : "Archivo de Ensayos"}
              </h1>
              <p className="text-sm text-gray-500">
                Histórico centralizado de evaluaciones cerradas. Consulta informes pedagógicos, estadísticas y restaura evaluaciones a la cola activa.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdminOrDirector && (
            <button
              onClick={() => {
                setSettingsFeedback(null);
                setShowSettingsModal(true);
              }}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-4 py-2 rounded-xl text-sm font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4 text-slate-600" />
              <span>Configuración de Auto-archivado</span>
            </button>
          )}

          <Link
            href="/teacher"
            className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
          >
            <span>Ir a Reportes Activos</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Búsqueda */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por título, asignatura o curso..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtro Curso */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-500">Curso:</span>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">Todos los cursos</option>
              {availableCourses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Asignatura */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-500">Asignatura:</span>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">Todas las asignaturas</option>
              {availableSubjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Contador */}
        <div className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
          {filteredList.length} de {normalizedList.length} archivadas
        </div>
      </div>

      {/* Estado de error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Listado de Evaluaciones Archivadas */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 animate-pulse font-medium">
          Cargando evaluaciones archivadas...
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white border rounded-2xl p-16 text-center max-w-xl mx-auto shadow-2xs">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Archive className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">No hay evaluaciones archivadas</h3>
          <p className="text-sm text-gray-500 mb-6">
            {normalizedList.length === 0
              ? "Las evaluaciones que cierren y hayan sido revisadas pueden archivarse manual o automáticamente para mantener despejadas las vistas cotidianas."
              : "No se encontraron evaluaciones archivadas que coincidan con los filtros seleccionados."}
          </p>
          {(selectedCourse !== "ALL" || selectedSubject !== "ALL" || search) && (
            <button
              onClick={() => {
                setSelectedCourse("ALL");
                setSelectedSubject("ALL");
                setSearch("");
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              Restablecer filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredList.map((a) => {
            const closedDate = new Date(a.closesAt).toLocaleDateString("es-CL", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            const archivedDate = a.archivedAt
              ? new Date(a.archivedAt).toLocaleDateString("es-CL", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "Desconocida";

            const isAuto = a.archivedReason?.startsWith("AUTO") || a.archivedBy === "SISTEMA_AUTO";

            return (
              <div
                key={a.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs hover:border-slate-400 hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Badges de curso y modalidad */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-blue-100 text-blue-900 text-xs font-black px-2.5 py-0.5 rounded-md">
                        {a.displayCourse}
                      </span>
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        {a.displaySubject}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isAuto
                          ? "bg-purple-100 text-purple-800 border border-purple-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                      title={isAuto ? "Archivado automáticamente por regla de días" : "Archivado de forma manual"}
                    >
                      {isAuto ? "Auto-archivado" : "Manual"}
                    </span>
                  </div>

                  {/* Título de la prueba */}
                  <h3 className="font-extrabold text-gray-900 text-base leading-snug mb-3 line-clamp-2" title={a.displayTitle}>
                    {a.displayTitle}
                  </h3>

                  {/* Fechas y detalles */}
                  <div className="space-y-1.5 bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs text-gray-600 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Rendida el:
                      </span>
                      <span className="font-semibold text-gray-700">{closedDate}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Archive className="w-3.5 h-3.5" /> Archivada el:
                      </span>
                      <span className="font-semibold text-gray-700">{archivedDate}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> Rendición:
                      </span>
                      <span className="font-bold text-gray-900">
                        {a.displaySubmissions} / {a.displayTotalStudents} alumnos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex gap-2">
                    <Link
                      href={`/teacher/assignments/${a.id}/report`}
                      target="_blank"
                      className="inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-2 rounded-lg text-xs gap-1.5 transition shadow-2xs"
                      title="Generar e imprimir Informe Pedagógico en PDF"
                    >
                      <FileText className="w-4 h-4 text-rose-600" />
                      <span>PDF</span>
                    </Link>

                    <Link
                      href={`/teacher/assignments/${a.id}`}
                      className="flex-1 inline-flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2 px-3 rounded-lg border border-blue-200 transition-colors text-xs gap-1.5"
                    >
                      <BarChart2 className="w-4 h-4 text-blue-600" />
                      <span>Ver Reporte</span>
                    </Link>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUnarchive(a)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-gray-50 hover:bg-amber-50 text-gray-600 hover:text-amber-800 border border-gray-200 hover:border-amber-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    title="Restaurar esta evaluación a la cola activa de reportes y asignaciones"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-gray-500 hover:text-amber-600" />
                    <span>Desarchivar / Restaurar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Configuración de Auto-archivado (Admin / Director) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-6 border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-gray-900 text-lg">Configuración de Auto-archivado</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                El sistema puede archivar de forma automática las evaluaciones una vez transcurrido cierto tiempo desde su fecha de cierre.
                Esto evita colas eternas en Reportes y Asignaciones sin perder ningún dato histórico.
              </p>

              {/* Switch Activado / Desactivado */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <div className="font-bold text-sm text-gray-800">Auto-archivado automático</div>
                  <div className="text-xs text-gray-500">
                    {settings.enabled ? "Habilitado en segundo plano" : "Desactivado (solo archivado manual)"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
                  className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    settings.enabled ? "bg-indigo-600 justify-end" : "bg-gray-300 justify-start"
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                </button>
              </div>

              {/* Presets de días */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 block">
                  Archivar después de:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[15, 30, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={!settings.enabled}
                      onClick={() => setSettings((s) => ({ ...s, days: d }))}
                      className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-all ${
                        settings.days === d && settings.enabled
                          ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      } ${!settings.enabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {d} días
                      {d === 30 && <span className="block text-[9px] font-normal text-indigo-600">(Recomendado)</span>}
                    </button>
                  ))}
                </div>

                {/* Opción personalizada */}
                <div className="pt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">O cantidad de días personalizada:</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    disabled={!settings.enabled}
                    value={settings.days}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) setSettings((s) => ({ ...s, days: val }));
                    }}
                    className="w-20 px-2 py-1 text-xs font-bold border rounded-lg text-center bg-gray-50 border-gray-300 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-500">días</span>
                </div>
              </div>

              {/* Botón de Ejecutar Auto-archivado Inmediato */}
              <div className="pt-3 border-t">
                <button
                  type="button"
                  disabled={runningAuto || !settings.enabled}
                  onClick={handleRunAutoArchive}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-slate-600" />
                  <span>{runningAuto ? "Evaluando y archivando..." : "Ejecutar archivado automático ahora"}</span>
                </button>
              </div>

              {/* Feedback */}
              {settingsFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    settingsFeedback.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  {settingsFeedback.type === "success" ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{settingsFeedback.message}</span>
                </div>
              )}
            </div>

            {/* Acciones Modal */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveSettings}
                className="px-5 py-2 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? "Guardando..." : "Guardar Ajustes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ArchivePage() {
  return (
    <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <ArchiveContent user={user} />
        </AppShell>
      )}
    </RequireRole>
  );
}
