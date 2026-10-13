"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, CheckCircle2, PlayCircle, Lock, Award, AlertCircle, CalendarClock } from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch, ApiError } from "@/lib/api";

type State = "UPCOMING" | "AVAILABLE" | "IN_PROGRESS" | "SUBMITTED" | "RESULTS" | "MISSED";

interface StudentAssignment {
  id: number;
  opensAt: string;
  closesAt: string;
  state: State;
  submissionId: number | null;
  exam: { title: string; subject: string; durationMinutes: number | null; questionCount: number };
}

const fmt = (d: string) =>
  new Date(d).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const BADGE: Record<State, { label: string; cls: string; icon: React.ElementType }> = {
  UPCOMING: { label: "Próximamente", cls: "bg-gray-100 text-gray-600", icon: CalendarClock },
  AVAILABLE: { label: "Disponible", cls: "bg-blue-100 text-blue-700", icon: PlayCircle },
  IN_PROGRESS: { label: "En curso", cls: "bg-amber-100 text-amber-700", icon: Clock },
  SUBMITTED: { label: "Entregado · resultados pendientes", cls: "bg-green-100 text-green-700", icon: CheckCircle2 },
  RESULTS: { label: "Resultados disponibles", cls: "bg-purple-100 text-purple-700", icon: Award },
  MISSED: { label: "No rendido", cls: "bg-red-100 text-red-700", icon: Lock },
};

import LongitudinalChart from "@/components/charts/LongitudinalChart";

function StudentDashboard() {
  const [activeTab, setActiveTab] = useState<"assignments" | "trajectory">("assignments");
  const [items, setItems] = useState<StudentAssignment[] | null>(null);
  const [trajectoryData, setTrajectoryData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<StudentAssignment[]>("/student/assignments")
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"));

    apiFetch<any>("/student/trajectory")
      .then(setTrajectoryData)
      .catch((e) => console.error("Error al cargar trayectoria:", e));
  }, []);

  const chartData = (trajectoryData?.trajectory || []).map((t: any) => ({
    id: t.id,
    title: t.examTitle,
    date: t.date,
    simceScore: t.simceScore || (t.percent ? Math.round(250 + (t.percent - 50) * 2) : 250),
    grade: t.grade,
    percent: t.percent,
    level: t.level
  }));

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Portal del Estudiante</h1>
          <p className="text-gray-500">Revisa tus ensayos asignados y tu evolución académica</p>
        </div>

        {/* Pestañas */}
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("assignments")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "assignments" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Mis Ensayos
          </button>
          <button
            onClick={() => setActiveTab("trajectory")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "trajectory" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Award className="w-4 h-4 text-blue-600" />
            Mi Progreso SIMCE
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center mb-4">
          <AlertCircle className="w-5 h-5 mr-2" /> {error}
        </div>
      )}

      {activeTab === "assignments" ? (
        <div className="space-y-4">
          {!items && !error && <p className="text-gray-500 animate-pulse">Cargando…</p>}
          {items?.length === 0 && (
            <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
              Aún no tienes ensayos asignados.
            </div>
          )}

          {items?.map((a) => {
            const badge = BADGE[a.state];
            const Icon = badge.icon;
            return (
              <div key={a.id} className="bg-white border rounded-xl p-5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{a.exam.subject}</p>
                  <h2 className="text-lg font-bold text-gray-800">{a.exam.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {a.exam.questionCount} preguntas
                    {a.exam.durationMinutes ? ` · ${a.exam.durationMinutes} minutos` : ""} · Disponible del{" "}
                    {fmt(a.opensAt)} al {fmt(a.closesAt)}
                  </p>
                  <span className={`inline-flex items-center mt-3 px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
                    <Icon className="w-3.5 h-3.5 mr-1" /> {badge.label}
                  </span>
                </div>

                {(a.state === "AVAILABLE" || a.state === "IN_PROGRESS") && (
                  <Link
                    href={`/student/exam/${a.id}`}
                    className="ml-4 shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg"
                  >
                    {a.state === "AVAILABLE" ? "Comenzar" : "Continuar"}
                  </Link>
                )}
                {a.state === "RESULTS" && a.submissionId && (
                  <Link
                    href={`/student/results/${a.submissionId}`}
                    className="ml-4 shrink-0 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2.5 rounded-lg"
                  >
                    Ver resultados
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          <LongitudinalChart data={chartData} />

          {chartData.length > 0 && (
            <div className="bg-white rounded-xl border p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-gray-900 text-sm">Historial Detallado de Evaluaciones</h3>
              <div className="divide-y text-sm">
                {chartData.map((d: any, idx: number) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-800">{d.title}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(d.date).toLocaleDateString("es-CL", { dateStyle: "long" })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs text-gray-400 block">SIMCE</span>
                        <span className="font-bold text-blue-600">{d.simceScore} ptos</span>
                      </div>
                      {d.grade && (
                        <div className="text-right">
                          <span className="text-xs text-gray-400 block">Nota</span>
                          <span className="font-semibold text-gray-700">{d.grade.toFixed(1)}</span>
                        </div>
                      )}
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                        d.level === "ADECUADO" ? "bg-emerald-100 text-emerald-700" :
                        d.level === "ELEMENTAL" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      }`}>
                        {d.level}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StudentPage() {
  return (
    <RequireRole roles={["STUDENT"]}>
      {(user) => (
        <AppShell user={user}>
          <StudentDashboard />
        </AppShell>
      )}
    </RequireRole>
  );
}
