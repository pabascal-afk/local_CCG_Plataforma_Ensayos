"use client";

import { useEffect, useState } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch, ApiError } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, Award, TrendingUp, CheckCircle, Target, BarChart2 } from "lucide-react";
import { useParams } from "next/navigation";

export default function ResultsPage() {
  const { submissionId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/student/submissions/${submissionId}/result`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar los resultados"))
      .finally(() => setLoading(false));
  }, [submissionId]);

  if (loading) return <div className="p-8">Cargando resultados...</div>;

  return (
    <RequireRole roles={["STUDENT"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-6">
              <Link href="/student" className="text-blue-600 hover:underline flex items-center gap-1 inline-flex">
                <ArrowLeft className="w-4 h-4" /> Volver a mis ensayos
              </Link>
            </div>

            {error ? (
              <div className="bg-red-50 text-red-600 p-4 rounded mb-6">{error}</div>
            ) : data ? (
              <div className="space-y-6">
                <div className="bg-white border rounded-xl p-8 shadow-sm text-center">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{data.exam.title}</h1>
                  <p className="text-gray-500 mb-8">{data.exam.subject} • Entregado el {new Date(data.submittedAt).toLocaleString()}</p>
                  
                  {/* Hero Card Puntaje SIMCE */}
                  {data.simceScore && (
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-6 mb-6 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-left">
                        <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">Resultado Oficial Estandarizado</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-4xl font-extrabold">{data.simceScore}</span>
                          <span className="text-lg font-medium text-blue-200">puntos SIMCE</span>
                        </div>
                        <p className="text-xs text-blue-100 mt-1">
                          Escala oficial nacional (100 a 400 puntos) basada en Teoría de Respuesta al Ítem (TRI).
                        </p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-5 py-3 text-center">
                        <span className="text-[11px] uppercase tracking-wider text-blue-200 block">Estándar de Aprendizaje</span>
                        <span className="text-xl font-bold text-white block mt-0.5">{data.achievementLevel || "N/A"}</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <p className="text-sm text-blue-600 font-medium mb-1">Nota Escolar</p>
                      <p className="text-3xl font-bold text-blue-900">{data.grade?.toFixed(1)}</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4">
                      <p className="text-sm text-purple-600 font-medium mb-1">Logro</p>
                      <p className="text-2xl font-bold text-purple-900 leading-tight">
                        {data.achievementLevel || "N/A"}
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4">
                      <p className="text-sm text-green-600 font-medium mb-1">Correctas</p>
                      <p className="text-3xl font-bold text-green-900">{data.correctCount} / {data.total}</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-4">
                      <p className="text-sm text-orange-600 font-medium mb-1">% de Logro</p>
                      <p className="text-3xl font-bold text-orange-900">
                        {Math.round(data.percent > 1 ? data.percent : data.percent * 100)}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Desempeño por Habilidad */}
                  <div className="bg-white border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Target className="w-5 h-5 text-blue-500" /> Logro por Habilidad
                    </h2>
                    <div className="space-y-4">
                      {(!data.bySkill || data.bySkill.length === 0) ? (
                        <p className="text-gray-500 text-sm">No hay habilidades registradas.</p>
                      ) : (
                        (Array.isArray(data.bySkill) ? data.bySkill : Object.entries(data.bySkill).map(([k, v]: any) => ({ name: k, ...v }))).map((item: any) => {
                          const name = item.name || item.skill || "Habilidad";
                          const pct = Math.round(item.percent > 1 ? item.percent : item.percent * 100);
                          return (
                            <div key={name}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-gray-700">{name}</span>
                                <span className="text-gray-500">{item.correct}/{item.total} ({pct}%)</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} 
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Desempeño por Eje */}
                  <div className="bg-white border rounded-xl p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-purple-500" /> Logro por Eje Temático
                    </h2>
                    <div className="space-y-4">
                      {(!data.byAxis || data.byAxis.length === 0) ? (
                        <p className="text-gray-500 text-sm">No hay ejes registrados.</p>
                      ) : (
                        (Array.isArray(data.byAxis) ? data.byAxis : Object.entries(data.byAxis).map(([k, v]: any) => ({ name: k, ...v }))).map((item: any) => {
                          const name = item.name || item.axis || "Eje";
                          const pct = Math.round(item.percent > 1 ? item.percent : item.percent * 100);
                          return (
                            <div key={name}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-gray-700">{name}</span>
                                <span className="text-gray-500">{item.correct}/{item.total} ({pct}%)</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} 
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
                  <strong>Nota sobre la pauta:</strong> Para evitar filtraciones mientras otros cursos rinden el mismo ensayo, no se muestra el detalle pregunta a pregunta ni la pauta correcta. Si tienes dudas, consulta con tu profesor.
                </div>
              </div>
            ) : null}
          </div>
        </AppShell>
      )}
    </RequireRole>
  );
}
