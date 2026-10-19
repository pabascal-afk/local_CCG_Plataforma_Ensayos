"use client";

import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import LongitudinalChart from "@/components/charts/LongitudinalChart";
import { TrendingUp, Users, BookOpen, AlertCircle, Filter, Sparkles } from "lucide-react";
import { useIsPruebas } from "@/lib/useIsPruebas";

interface EvolutionTabProps {
  assignmentId: number;
}

export default function EvolutionTab({ assignmentId }: { assignmentId: number }) {
  const isPruebas = useIsPruebas();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros de trayectoria
  const [selectedExamType, setSelectedExamType] = useState<string>("TODOS");
  const [rangePreset, setRangePreset] = useState<"ALL" | "1_3" | "4_6" | "CUSTOM">("ALL");
  const [customSelectedExams, setCustomSelectedExams] = useState<number[]>([]);

  const loadEvolution = (typeFilter: string, range: string, customList: number[]) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter && typeFilter !== "TODOS") params.set("examType", typeFilter);
    if (range === "1_3") params.set("orderNumbers", "1,2,3");
    else if (range === "4_6") params.set("orderNumbers", "4,5,6");
    else if (range === "CUSTOM" && customList.length > 0) {
      params.set("orderNumbers", customList.sort((a,b)=>a-b).join(","));
    }

    apiFetch(`/teacher/assignments/${assignmentId}/evolution?${params.toString()}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEvolution(selectedExamType, rangePreset, customSelectedExams);
  }, [assignmentId, selectedExamType, rangePreset, customSelectedExams]);

  const rawTimeline = data?.timeline || [];

  // Números de evaluaciones disponibles para selector individual
  const availableOrderNumbers = useMemo(() => {
    if (data?.filters?.availableOrderNumbers && data.filters.availableOrderNumbers.length > 0) {
      return data.filters.availableOrderNumbers;
    }
    const orders = rawTimeline.map((t: any) => t.orderNumber || 1);
    return Array.from(new Set(orders)).sort((a: any, b: any) => a - b);
  }, [data, rawTimeline]);

  const toggleCustomExam = (num: number) => {
    setCustomSelectedExams(prev => 
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  if (loading && !data) {
    return <div className="text-gray-500 py-12 text-center animate-pulse">Cargando evolución del curso...</div>;
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center">
        <AlertCircle className="w-5 h-5 mr-2" /> {error || "No se pudo cargar la evolución."}
      </div>
    );
  }

  const timeline = rawTimeline;

  // Mapear para LongitudinalChart
  const chartPoints = timeline.map((t: any) => ({
    id: t.assignmentId,
    title: t.examTitle,
    date: t.date,
    simceScore: t.avgSimceScore || (t.avgPercent ? Math.round(250 + (t.avgPercent - 50) * 2) : 250),
    grade: t.avgGrade,
    percent: t.avgPercent,
  }));

  return (
    <div className="space-y-6">
      {/* Encabezado contextual */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Evolución Longitudinal de {data.course?.name} · {data.course?.subject}
          </h2>
          <p className="text-xs text-blue-700 mt-1">
            Comparativa del rendimiento del curso a través de {isPruebas ? "las distintas evaluaciones aplicadas" : "los distintos ensayos aplicados"} durante el año.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-semibold text-blue-800 shrink-0">
          <BookOpen className="w-4 h-4 text-blue-600" />
          {timeline.length} evaluación(es) mostrada(s)
        </div>
      </div>

      {/* Barra de Filtros Interactiva: Tipo de Evaluación y Selector de Ensayos */}
      <div className="bg-white border rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tipo de Evaluación */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-semibold text-gray-700">Tipo de Evaluación:</span>
            <div className="flex items-center gap-1.5">
              {[
                { id: "TODOS", label: "Todos" },
                { id: "ENSAYO", label: isPruebas ? "Pruebas" : "Ensayos SIMCE" },
                { id: "QUIZ", label: "Quizzes" },
                { id: "REMEDIAL", label: "Remediales" }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedExamType(t.id)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                    selectedExamType === t.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rango de Ensayos */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700">{isPruebas ? "Pruebas:" : "Ensayos:"}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setRangePreset("ALL"); setCustomSelectedExams([]); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  rangePreset === "ALL" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => { setRangePreset("1_3"); setCustomSelectedExams([1,2,3]); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  rangePreset === "1_3" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Del 1 al 3
              </button>
              <button
                onClick={() => { setRangePreset("4_6"); setCustomSelectedExams([4,5,6]); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  rangePreset === "4_6" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Del 4 al 6
              </button>
              <button
                onClick={() => setRangePreset("CUSTOM")}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  rangePreset === "CUSTOM" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Personalizado
              </button>
            </div>
          </div>
        </div>

        {/* Selección múltiple personalizada */}
        {rangePreset === "CUSTOM" && availableOrderNumbers.length > 0 && (
          <div className="pt-2 border-t flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-600">Marcar evaluaciones específicas:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {availableOrderNumbers.map((num: any) => {
                const isSelected = customSelectedExams.includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => toggleCustomExam(num)}
                    className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                      isSelected ? "bg-indigo-600 text-white shadow-xs" : "bg-white text-gray-600 border border-gray-300 hover:border-indigo-400"
                    }`}
                  >
                    #{num}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Gráfico Longitudinal de la clase */}
      <LongitudinalChart data={chartPoints} />

      {/* Tabla comparativa ensayo a ensayo */}
      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            Comparativa de Resultados de la Cohorte
          </h3>
          <span className="text-xs text-gray-500 font-medium">
            {timeline.length} registro(s)
          </span>
        </div>

        {timeline.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-xs">
            No hay evaluaciones que coincidan con los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Evaluación</th>
                  <th className="px-4 py-3.5">Tipo</th>
                  <th className="px-4 py-3.5">Fecha</th>
                  <th className="px-4 py-3.5 text-center">Rendición</th>
                  <th className="px-4 py-3.5 text-center">{isPruebas ? "Prom. Puntaje" : "Prom. SIMCE"}</th>
                  <th className="px-4 py-3.5 text-center">Prom. Nota</th>
                  <th className="px-4 py-3.5 text-center">Distribución de Logro</th>
                </tr>
              </thead>
              <tbody className="divide-y text-gray-700">
                {timeline.map((item: any) => {
                  const isCurrent = item.assignmentId === data.currentAssignmentId;
                  const totalSubs = item.submissionsCount || 0;
                  const insCount = item.levels?.INSUFICIENTE || 0;
                  const eleCount = item.levels?.ELEMENTAL || 0;
                  const adeCount = item.levels?.ADECUADO || 0;

                  const insPct = totalSubs ? Math.round((insCount / totalSubs) * 100) : 0;
                  const elePct = totalSubs ? Math.round((eleCount / totalSubs) * 100) : 0;
                  const adePct = totalSubs ? Math.round((adeCount / totalSubs) * 100) : 0;

                  return (
                    <tr key={item.assignmentId} className={isCurrent ? "bg-blue-50/50 font-semibold" : "hover:bg-gray-50"}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">
                            #{item.orderNumber || 1}
                          </span>
                          <span>{item.examTitle}</span>
                          {isCurrent && (
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Actual
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          item.examType === 'QUIZ' ? 'bg-emerald-100 text-emerald-800' :
                          item.examType === 'REMEDIAL' ? 'bg-amber-100 text-amber-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {isPruebas && (!item.examType || item.examType === 'ENSAYO') ? 'PRUEBA' : (item.examType || 'ENSAYO')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500 font-mono">
                        {new Date(item.date).toLocaleDateString("es-CL", { dateStyle: "short" })}
                      </td>
                      <td className="px-4 py-4 text-center text-xs">
                        {item.submissionsCount} / {item.totalStudents} ({Math.round((item.submissionsCount / (item.totalStudents || 1)) * 100)}%)
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-base font-extrabold text-blue-600">
                          {item.avgSimceScore || "—"} ptos
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-gray-800">
                        {item.avgGrade ? item.avgGrade.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="w-44 mx-auto space-y-1">
                          <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
                            {insPct > 0 && <div style={{ width: `${insPct}%` }} className="bg-red-500" title={`Insuficiente: ${insPct}%`} />}
                            {elePct > 0 && <div style={{ width: `${elePct}%` }} className="bg-amber-400" title={`Elemental: ${elePct}%`} />}
                            {adePct > 0 && <div style={{ width: `${adePct}%` }} className="bg-emerald-500" title={`Adecuado: ${adePct}%`} />}
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                            <span className="text-red-600">Ins: {insPct}%</span>
                            <span className="text-amber-600">Ele: {elePct}%</span>
                            <span className="text-emerald-600">Ade: {adePct}%</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
