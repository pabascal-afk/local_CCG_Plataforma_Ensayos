"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, TrendingUp, Award, BookOpen, Download } from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch, ApiError } from "@/lib/api";
import { useParams } from "next/navigation";
import LongitudinalChart from "@/components/charts/LongitudinalChart";
import { useIsPruebas } from "@/lib/useIsPruebas";

export default function StudentEvolutionPage() {
  const { rut } = useParams();
  const isPruebas = useIsPruebas();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/teacher/students/${rut}`)
      .then(setData)
      .catch((e: any) => setError(e.message));
  }, [rut]);

  if (error) {
    return (
      <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
        {(user) => (
          <AppShell user={user}>
            <div className="p-8 text-red-600">{error}</div>
          </AppShell>
        )}
      </RequireRole>
    );
  }

  if (!data) {
    return (
      <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
        {(user) => (
          <AppShell user={user}>
            <div className="p-8 text-gray-500 animate-pulse">Cargando ficha del estudiante...</div>
          </AppShell>
        )}
      </RequireRole>
    );
  }

  // Agrupar por asignatura
  const bySubject: Record<string, any[]> = {};
  data.history.forEach((h: any) => {
    if (!bySubject[h.subject]) bySubject[h.subject] = [];
    bySubject[h.subject].push(h);
  });

  return (
    <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-5xl mx-auto">
            <Link href="/teacher" className="text-blue-600 hover:underline flex items-center gap-1 mb-6 text-sm">
              <ArrowLeft className="w-4 h-4" /> Volver al portal
            </Link>

            <div className="bg-white rounded-xl shadow-sm border p-6 flex items-center gap-6 mb-8">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <User className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
                <p className="text-gray-500 font-mono mt-1">{data.rut}</p>
                <div className="mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                  <BookOpen className="w-3.5 h-3.5 mr-1" /> {data.courseName}
                </div>
              </div>
            </div>

            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-blue-500" /> Evolución de Resultados y Trayectoria
              </h2>
              {data.history && data.history.length > 0 && (
                <button
                  onClick={() => {
                    const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
                    window.location.href = `/api/teacher/students/${data.rut}/export.xlsx?token=${token}`;
                  }}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" /> Exportar Ficha a Excel
                </button>
              )}
            </div>

            {Object.keys(bySubject).length === 0 ? (
              <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
                {isPruebas
                  ? "El estudiante no ha rendido ninguna evaluación."
                  : "El estudiante no ha rendido ningún ensayo."}
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(bySubject).map(([subject, exams]) => {
                  const chartData = exams.map((exam: any) => ({
                    id: exam.id,
                    title: exam.title,
                    date: exam.date,
                    simceScore: exam.simceScore || (exam.percent ? Math.round(250 + (exam.percent - 50) * 2) : 250),
                    grade: exam.grade,
                    percent: exam.percent,
                    level: exam.level,
                  }));

                  return (
                    <div key={subject} className="space-y-6">
                      <LongitudinalChart data={chartData} />

                      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                          <h3 className="text-lg font-bold text-white uppercase tracking-wide">{subject}</h3>
                          <span className="text-xs bg-white/20 text-white px-2.5 py-1 rounded-full font-medium">
                            {exams.length} evaluación(es)
                          </span>
                        </div>
                        <div className="p-6">
                          <div className="relative border-l-2 border-gray-200 ml-4 space-y-8">
                            {exams.map((exam: any, idx: number) => (
                              <div key={exam.id} className="relative pl-8">
                                <div className="absolute w-4 h-4 bg-blue-600 rounded-full -left-[9px] top-1 border-4 border-white" />
                                <div className="bg-gray-50 border rounded-lg p-4">
                                  <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-900">{exam.title}</h4>
                                    <span className="text-xs text-gray-500">{new Date(exam.date).toLocaleDateString()}</span>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                                    <div className="text-center bg-white border rounded px-3 py-2">
                                      <span className="block text-[10px] text-gray-400 uppercase font-bold">
                                        {isPruebas ? "Puntaje" : "Puntaje SIMCE"}
                                      </span>
                                      <span className="block text-xl font-extrabold text-blue-600">
                                        {exam.simceScore || (exam.percent ? Math.round(250 + (exam.percent - 50) * 2) : 250)}
                                      </span>
                                    </div>
                                    <div className="text-center bg-white border rounded px-3 py-2">
                                      <span className="block text-[10px] text-gray-400 uppercase font-bold">Nota Escolar</span>
                                      <span className="block text-xl font-bold text-gray-800">{exam.grade?.toFixed(1)}</span>
                                    </div>
                                    <div className="text-center bg-white border rounded px-3 py-2">
                                      <span className="block text-[10px] text-gray-400 uppercase font-bold">% Logro</span>
                                      <span className="block text-xl font-bold text-orange-600">
                                        {Math.round(exam.percent > 1 ? exam.percent : exam.percent * 100)}%
                                      </span>
                                    </div>
                                    <div className="text-center bg-white border rounded px-3 py-2">
                                      <span className="block text-[10px] text-gray-400 uppercase font-bold">Estándar</span>
                                      <span className={`block text-xs font-bold mt-1.5 px-2 py-0.5 rounded ${
                                        exam.level === "ADECUADO" ? "bg-emerald-100 text-emerald-800" :
                                        exam.level === "ELEMENTAL" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                                      }`}>
                                        {exam.level || "N/A"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </AppShell>
      )}
    </RequireRole>
  );
}
