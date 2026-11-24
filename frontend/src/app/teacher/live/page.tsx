"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  Headphones,
  Zap,
  Plus,
  Radio,
  KeyRound,
  PlayCircle,
  Calendar,
} from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch, ApiError } from "@/lib/api";
import { useSchoolYear } from "@/context/SchoolYearContext";
import { useIsPruebas } from "@/lib/useIsPruebas";
import AudioCutterModal from "@/components/AudioCutterModal";
import ReactivateCourseModal from "@/components/ReactivateCourseModal";
import AssignExamModal from "@/components/AssignExamModal";

type Assignment = {
  id: number;
  examId: number;
  courseId: number;
  courseName: string;
  title: string;
  subject: string;
  opensAt: string;
  closesAt: string;
  released: boolean;
  releasedAt: string | null;
  dynamicPassword?: string | null;
  dynamicPasswordActive?: boolean;
  submissionsCount: number;
  totalStudents: number;
};

type LiveFilter = "ALL" | "LIVE" | "SCHEDULED" | "CLOSED";

function TeacherLiveDashboard() {
  const { selectedYear } = useSchoolYear();
  const isPruebas = useIsPruebas();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [filter, setFilter] = useState<LiveFilter>("ALL");
  const [selectedAudioAssignment, setSelectedAudioAssignment] = useState<Assignment | null>(null);
  const [selectedReactivateAssignment, setSelectedReactivateAssignment] = useState<Assignment | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [error, setError] = useState("");

  const loadAssignments = () => {
    apiFetch<Assignment[]>(`/teacher/assignments?year=${selectedYear}`)
      .then(setAssignments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"));
  };

  useEffect(() => {
    loadAssignments();
  }, [selectedYear]);

  const enriched = useMemo(() => {
    if (!assignments) return [];
    const now = new Date();
    const mapped = assignments.map((a) => {
      const opens = new Date(a.opensAt);
      const closes = new Date(a.closesAt);
      const isLive = now >= opens && now <= closes;
      const isScheduled = now < opens;
      const statusKey: Exclude<LiveFilter, "ALL"> = isLive
        ? "LIVE"
        : isScheduled
        ? "SCHEDULED"
        : "CLOSED";
      const priority = isLive ? 0 : isScheduled ? 1 : 2;
      return { ...a, statusKey, priority };
    });

    mapped.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.opensAt).getTime() - new Date(a.opensAt).getTime();
    });
    return mapped;
  }, [assignments]);

  const counts = useMemo(() => {
    const c = { ALL: enriched.length, LIVE: 0, SCHEDULED: 0, CLOSED: 0 };
    for (const item of enriched) {
      c[item.statusKey]++;
    }
    return c;
  }, [enriched]);

  const visibleAssignments = useMemo(() => {
    if (filter === "ALL") return enriched;
    return enriched.filter((item) => item.statusKey === filter);
  }, [enriched, filter]);

  const formatTimeWindow = (opensAt: string, closesAt: string) => {
    const o = new Date(opensAt);
    const c = new Date(closesAt);
    const sameDay = o.toDateString() === c.toDateString();
    const dateStr = o.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
    const startStr = o.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    const endStr = c.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    if (sameDay) {
      return `${dateStr} · ${startStr} – ${endStr}`;
    }
    const endDateStr = c.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
    return `${dateStr} ${startStr} – ${endDateStr} ${endStr}`;
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700">
              <Radio className="w-5 h-5" />
            </span>
            <span>Monitor y Control En Vivo</span>
          </h1>
          <p className="text-gray-500 mt-1">
            Supervisión de sala en tiempo real, PIN dinámico, audios, prórrogas y reactivación de evaluaciones.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isPruebas ? "Asignar Prueba" : "Asignar Ensayo"}</span>
          </button>
        </div>
      </div>

      {/* Filtros rápidos de estado */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(
          [
            { key: "ALL", label: "Todas", count: counts.ALL },
            { key: "LIVE", label: "En Curso", count: counts.LIVE },
            { key: "SCHEDULED", label: "Programadas", count: counts.SCHEDULED },
            { key: "CLOSED", label: "Finalizadas", count: counts.CLOSED },
          ] as const
        ).map((pill) => {
          const active = filter === pill.key;
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => setFilter(pill.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                active
                  ? "bg-gray-900 text-white border-gray-900 shadow-xs"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {pill.key === "LIVE" && counts.LIVE > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
              <span>{pill.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {pill.count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {!assignments && !error ? (
        <div className="text-gray-500 animate-pulse">Cargando...</div>
      ) : visibleAssignments.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
          {assignments?.length === 0
            ? isPruebas
              ? "No tienes cursos o evaluaciones asignadas actualmente."
              : "No tienes cursos o ensayos asignados actualmente."
            : "No hay evaluaciones en este estado para el año escolar seleccionado."}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleAssignments.map((a) => {
            const isLive = a.statusKey === "LIVE";
            const isScheduled = a.statusKey === "SCHEDULED";

            return (
              <div
                key={a.id}
                className={`bg-white border rounded-xl p-6 shadow-sm flex flex-col relative overflow-hidden group transition-colors ${
                  isLive ? "border-emerald-300 hover:border-emerald-400" : "hover:border-blue-300"
                }`}
              >
                {isLive && (
                  <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    En Curso
                  </div>
                )}
                {isScheduled && (
                  <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Programada
                  </div>
                )}
                {!isLive && !isScheduled && (
                  <div className="absolute top-0 right-0 bg-gray-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg uppercase tracking-wider">
                    Finalizada
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3 pr-20">
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded">
                    {a.courseName}
                  </span>
                  <span className="text-xs text-gray-500 uppercase font-semibold truncate">
                    {a.subject}
                  </span>
                </div>

                <h3 className="font-bold text-gray-900 mb-4 line-clamp-2" title={a.title}>
                  {a.title}
                </h3>

                <div className="mt-auto space-y-2 mb-5 text-xs text-gray-600">
                  <div className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                    <span className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-2 text-gray-400" /> Ventana
                    </span>
                    <span className="font-semibold text-gray-800">{formatTimeWindow(a.opensAt, a.closesAt)}</span>
                  </div>

                  <div className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                    <span className="flex items-center">
                      <Users className="w-3.5 h-3.5 mr-2 text-gray-400" /> Rendición
                    </span>
                    <span className="font-semibold text-gray-900">
                      {a.submissionsCount} / {a.totalStudents}
                    </span>
                  </div>

                  <div className="flex justify-between items-center px-3 py-1.5">
                    <span className="flex items-center">
                      <KeyRound className="w-3.5 h-3.5 mr-2 text-gray-400" /> PIN Dinámico
                    </span>
                    {a.dynamicPasswordActive && a.dynamicPassword ? (
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        {a.dynamicPassword}
                      </span>
                    ) : (
                      <span className="text-gray-400 font-medium">Inactivo</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAudioAssignment(a)}
                    className="inline-flex items-center justify-center bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold px-2.5 py-2.5 rounded-lg text-xs gap-1 transition shadow-2xs cursor-pointer"
                    title="Gestionar y cortar audios para este examen"
                  >
                    <Headphones className="w-4 h-4 text-purple-600" />
                    <span>Audios</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedReactivateAssignment(a)}
                    className="inline-flex items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold px-2.5 py-2.5 rounded-lg text-xs gap-1 transition shadow-2xs cursor-pointer"
                    title="Extender plazo o reactivar evaluación para este curso"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-600 fill-current" />
                    <span>Reactivar</span>
                  </button>
                  <Link
                    href={`/teacher/live/${a.id}`}
                    className={`flex-1 inline-flex items-center justify-center font-bold py-2.5 px-3 rounded-lg transition-colors text-xs gap-1.5 shadow-2xs ${
                      isLive
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>Monitor En Vivo</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Cortador de Audio */}
      {selectedAudioAssignment && (
        <AudioCutterModal
          isOpen={Boolean(selectedAudioAssignment)}
          onClose={() => setSelectedAudioAssignment(null)}
          assignmentId={selectedAudioAssignment.id}
          examId={selectedAudioAssignment.examId}
          examTitle={selectedAudioAssignment.title}
          questionCount={30}
        />
      )}

      {/* Modal Reactivar Curso */}
      {selectedReactivateAssignment && (
        <ReactivateCourseModal
          isOpen={Boolean(selectedReactivateAssignment)}
          onClose={() => setSelectedReactivateAssignment(null)}
          assignmentId={selectedReactivateAssignment.id}
          currentClosesAt={selectedReactivateAssignment.closesAt}
          examTitle={selectedReactivateAssignment.title}
          courseName={selectedReactivateAssignment.courseName}
          onSuccess={loadAssignments}
        />
      )}

      {/* Modal Asignar Evaluación Dinámica */}
      <AssignExamModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onSuccess={loadAssignments}
      />
    </div>
  );
}

export default function TeacherLivePage() {
  return (
    <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <TeacherLiveDashboard />
        </AppShell>
      )}
    </RequireRole>
  );
}
