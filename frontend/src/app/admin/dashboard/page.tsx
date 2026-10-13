"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import RequireRole from "@/components/RequireRole";
import { apiFetch } from "@/lib/api";
import LongitudinalChart from "@/components/charts/LongitudinalChart";
import { 
  BarChart3, 
  Users, 
  FileText, 
  Activity, 
  TrendingUp, 
  Download, 
  CalendarDays, 
  Filter, 
  Layers, 
  Calendar, 
  CheckSquare, 
  Award,
  ChevronRight,
  TrendingDown,
  Minus,
  Sparkles,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useSchoolYear } from "@/context/SchoolYearContext";
import AiPromptModal from "@/components/AiPromptModal";

export default function AdminDashboardPage() {
  const { selectedYear } = useSchoolYear();
  const [data, setData] = useState<any>(null);
  const [multiannualData, setMultiannualData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMulti, setLoadingMulti] = useState(false);

  // Modos de vista: Mapa de Calor, Evolución Longitudinal del Año, y Trayectoria Multianual
  const [viewMode, setViewMode] = useState<"heatmap" | "evolution" | "multiannual">("heatmap");
  const [showAiModal, setShowAiModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // Compacto por defecto

  const formatLevelName = (lvl: string) => {
    return (lvl || "").replace("B", "° Básico").replace("M", "° Medio");
  };

  // Filtros interactivos
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("TODOS");
  const [selectedExamType, setSelectedExamType] = useState<string>("ENSAYO");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("TODOS");

  // Filtro de ensayos por rango o selección individual
  const [examRangePreset, setExamRangePreset] = useState<"ALL" | "1_3" | "4_6" | "7_9" | "CUSTOM">("ALL");
  const [customSelectedExams, setCustomSelectedExams] = useState<number[]>([]);

  // Filtros específicos para la Trayectoria Multianual
  const [multiLevel, setMultiLevel] = useState<string>("4B");
  const [multiSubject, setMultiSubject] = useState<string>("TODOS");
  const [multiExamType, setMultiExamType] = useState<string>("ENSAYO");

  // Cargar datos anuales con filtros
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear) params.set("year", String(selectedYear));
      if (selectedSubject && selectedSubject !== "TODOS") params.set("subject", selectedSubject);
      if (selectedExamType && selectedExamType !== "TODOS") params.set("examType", selectedExamType);
      if (selectedLevel && selectedLevel !== "TODOS") params.set("level", selectedLevel);

      // Calcular orderNumbers a enviar
      if (examRangePreset === "1_3") params.set("orderNumbers", "1,2,3");
      else if (examRangePreset === "4_6") params.set("orderNumbers", "4,5,6");
      else if (examRangePreset === "7_9") params.set("orderNumbers", "7,8,9");
      else if (examRangePreset === "CUSTOM" && customSelectedExams.length > 0) {
        params.set("orderNumbers", customSelectedExams.sort((a,b)=>a-b).join(","));
      }

      const res = await apiFetch<any>(`/admin/dashboard?${params.toString()}`);
      setData(res);
      const levels = Object.keys(res.heatmap || {});
      if (levels.length > 0 && (!selectedLevel || !levels.includes(selectedLevel))) {
        setSelectedLevel(levels[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos de Trayectoria Multianual
  const loadMultiannualData = async () => {
    setLoadingMulti(true);
    try {
      const params = new URLSearchParams();
      if (multiLevel && multiLevel !== "TODOS") params.set("level", multiLevel);
      if (multiSubject && multiSubject !== "TODOS") params.set("subject", multiSubject);
      if (multiExamType && multiExamType !== "TODOS") params.set("examType", multiExamType);

      const res = await apiFetch<any>(`/admin/dashboard/multiannual?${params.toString()}`);
      setMultiannualData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMulti(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [selectedYear, selectedSubject, selectedExamType, selectedLevel, examRangePreset, customSelectedExams]);

  useEffect(() => {
    if (viewMode === "multiannual") {
      loadMultiannualData();
    }
  }, [viewMode, multiLevel, multiSubject, multiExamType]);

  const stats = data?.stats || { students: 0, teachers: 0, submissions: 0 };
  const heatmapData = data?.heatmap?.[selectedLevel] || [];
  const rawEvolutionList = data?.evolution?.[selectedLevel] || [];

  // Filtrado en cliente por curso si se seleccionó uno específico
  const evolutionList = useMemo(() => {
    if (selectedCourseFilter === "TODOS") return rawEvolutionList;
    return rawEvolutionList.filter((e: any) => e.courses && e.courses[selectedCourseFilter] !== undefined);
  }, [rawEvolutionList, selectedCourseFilter]);

  // Lista de cursos disponibles en el nivel seleccionado
  const coursesSet = new Set<string>();
  heatmapData.forEach((row: any) => {
    Object.keys(row).forEach(k => {
      if (k !== "oa") coursesSet.add(k);
    });
  });
  rawEvolutionList.forEach((e: any) => {
    if (e.courses) {
      Object.keys(e.courses).forEach(c => coursesSet.add(c));
    }
  });
  const courses = Array.from(coursesSet).sort();

  // Lista de números de exámenes detectados para selector personalizado
  const availableExamNumbers = data?.filters?.availableOrderNumbers || [1, 2, 3, 4, 5, 6, 7];

  const getColor = (val: number) => {
    if (val === undefined || isNaN(val)) return "bg-gray-100 text-gray-400";
    if (val < 50) return "bg-red-100 text-red-700 font-bold border-red-200 border";
    if (val < 75) return "bg-amber-100 text-amber-700 font-bold border-amber-200 border";
    return "bg-emerald-100 text-emerald-700 font-bold border-emerald-200 border";
  };

  // Datos para LongitudinalChart
  const chartData = evolutionList.map((e: any, idx: number) => {
    let score = e.avgSimce;
    if (selectedCourseFilter !== "TODOS" && e.courses?.[selectedCourseFilter]?.avgSimce) {
      score = e.courses[selectedCourseFilter].avgSimce;
    }
    return {
      id: e.examId || idx,
      title: e.examTitle,
      date: e.date,
      simceScore: score,
    };
  });

  const toggleCustomExam = (num: number) => {
    setCustomSelectedExams(prev => 
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  if (loading && !data) {
    return (
      <RequireRole roles={["ADMIN", "DIRECTOR"]}>
        {user => <AppShell user={user}><div className="p-8 text-center text-gray-500">Cargando métricas institucionales...</div></AppShell>}
      </RequireRole>
    );
  }

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-7xl mx-auto space-y-6">
            
            {/* Cabecera Principal */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                  <Award className="w-7 h-7 text-blue-600" />
                  Panel Global de Dirección y Trayectorias
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                  Supervisa el rendimiento académico, evolución longitudinal anual y trayectoria multianual entre cohortes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Selector de Modos de Vista */}
                <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                  <button
                    onClick={() => setViewMode("heatmap")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      viewMode === "heatmap" ? "bg-white text-gray-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    Mapa de Calor
                  </button>
                  <button
                    onClick={() => setViewMode("evolution")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      viewMode === "evolution" ? "bg-white text-blue-600 shadow-xs" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    Evolución Longitudinal
                  </button>
                  <button
                    onClick={() => setViewMode("multiannual")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      viewMode === "multiannual" ? "bg-white text-indigo-700 shadow-xs" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <CalendarDays className="w-4 h-4 text-indigo-600" />
                    Trayectoria Multianual
                  </button>
                </div>

                {/* Botón Prompt IA Informe UTP (Icono con tooltip) */}
                <button
                  type="button"
                  onClick={() => setShowAiModal(true)}
                  className="p-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl shadow-xs transition-all"
                  title="Asistente de Prompts para Agentes de IA: Generar Informe Técnico UTP"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </button>

                {/* Botón Exportar a Excel (Icono con tooltip) */}
                {viewMode === "multiannual" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
                      window.location.href = `/api/admin/dashboard/multiannual/export.xlsx?level=${multiLevel}&subject=${multiSubject}&examType=${multiExamType}&token=${token}`;
                    }}
                    className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors"
                    title="Exportar Trayectoria Multianual a Excel (.xlsx)"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
                      window.location.href = `/api/admin/dashboard/export.xlsx?token=${token}`;
                    }}
                    className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors"
                    title="Exportar Métricas del Dashboard a Excel (.xlsx)"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* KPIs Generales del Año Activo (solo en vistas anuales) */}
            {viewMode !== "multiannual" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-xs border p-4 flex items-center gap-3">
                  <div className="bg-blue-100 p-2.5 rounded-lg text-blue-600">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Estudiantes {selectedYear}</div>
                    <div className="text-xl font-extrabold text-gray-900">{stats.students}</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-xs border p-4 flex items-center gap-3">
                  <div className="bg-purple-100 p-2.5 rounded-lg text-purple-600">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Docentes Activos</div>
                    <div className="text-xl font-extrabold text-gray-900">{stats.teachers}</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-xs border p-4 flex items-center gap-3">
                  <div className="bg-emerald-100 p-2.5 rounded-lg text-emerald-600">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Evaluaciones Rendidas</div>
                    <div className="text-xl font-extrabold text-gray-900">{stats.submissions}</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-xs border p-4 flex items-center gap-3">
                  <div className="bg-orange-100 p-2.5 rounded-lg text-orange-600">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-medium">Niveles con Datos</div>
                    <div className="text-xl font-extrabold text-gray-900">{Object.keys(data?.heatmap || {}).length}</div>
                  </div>
                </div>
              </div>
            )}

            {/* BARRA DE FILTROS Y DESAGREGACIÓN PARA VISTAS ANUALES */}
            {viewMode !== "multiannual" && (
              <div className="bg-white rounded-2xl border shadow-xs overflow-hidden">
                <div 
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-4 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Filter className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-xs font-bold text-gray-800 shrink-0">
                      Filtros y Desagregación ({selectedYear})
                    </span>
                    <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded shrink-0">
                      {formatLevelName(selectedLevel) || "Nivel"}
                    </span>
                    <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded shrink-0">
                      {selectedSubject === "TODOS" ? "Todas las materias" : selectedSubject}
                    </span>
                    <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded shrink-0">
                      {selectedExamType}
                    </span>
                    {selectedCourseFilter !== "TODOS" && (
                      <span className="text-[11px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded shrink-0">
                        Curso {selectedCourseFilter}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSubject("TODOS");
                        setSelectedExamType("TODOS");
                        setSelectedCourseFilter("TODOS");
                        setExamRangePreset("ALL");
                        setCustomSelectedExams([]);
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:underline"
                    >
                      Restablecer
                    </button>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-600 p-1 rounded-md transition"
                      title={showFilters ? "Colapsar filtros" : "Expandir filtros"}
                    >
                      {showFilters ? (
                        <ChevronUp className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {showFilters && (
                  <div className="p-5 pt-2 border-t border-gray-100 space-y-4 bg-slate-50/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Filtro por Nivel */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Nivel de Enseñanza</label>
                        <select
                          value={selectedLevel}
                          onChange={(e) => setSelectedLevel(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-xs bg-white font-medium focus:outline-blue-500"
                        >
                          {Object.keys(data?.heatmap || {}).map(lvl => (
                            <option key={lvl} value={lvl}>{formatLevelName(lvl)}</option>
                          ))}
                        </select>
                      </div>

                      {/* Filtro por Materia */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Materia / Asignatura</label>
                        <select
                          value={selectedSubject}
                          onChange={(e) => setSelectedSubject(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-xs bg-white font-medium focus:outline-blue-500"
                        >
                          <option value="TODOS">Todas las materias</option>
                          {(data?.filters?.availableSubjects || ["Matematica", "Lectura", "Ciencias Naturales", "Historia"]).map((s: string) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Filtro por Tipo de Evaluación */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de Evaluación</label>
                        <select
                          value={selectedExamType}
                          onChange={(e) => setSelectedExamType(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-xs bg-white font-medium focus:outline-blue-500"
                        >
                          <option value="ENSAYO">Ensayos Oficiales SIMCE (Predeterminado)</option>
                          <option value="TODOS">Todos los tipos (Mixto)</option>
                          <option value="QUIZ">Quizzes / Pruebas Cortas</option>
                          <option value="REMEDIAL">Evaluaciones Remediales (Formativo)</option>
                          <option value="DIAGNOSTICO">Diagnósticos</option>
                        </select>
                      </div>

                      {/* Desagregación por Curso */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Curso Específico</label>
                        <select
                          value={selectedCourseFilter}
                          onChange={(e) => setSelectedCourseFilter(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-xs bg-white font-medium focus:outline-blue-500"
                        >
                          <option value="TODOS">Todos los cursos del nivel</option>
                          {courses.map(c => (
                            <option key={c} value={c}>Curso {c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Selector Rápido y Personalizado de Ensayos */}
                    <div className="pt-2 border-t border-gray-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">Ensayos a Graficar:</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setExamRangePreset("ALL"); setCustomSelectedExams([]); }}
                            className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                              examRangePreset === "ALL" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            Todos
                          </button>
                          <button
                            type="button"
                            onClick={() => { setExamRangePreset("1_3"); setCustomSelectedExams([1,2,3]); }}
                            className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                              examRangePreset === "1_3" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            Del 1 al 3
                          </button>
                          <button
                            type="button"
                            onClick={() => { setExamRangePreset("4_6"); setCustomSelectedExams([4,5,6]); }}
                            className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                              examRangePreset === "4_6" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            Del 4 al 6
                          </button>
                          <button
                            type="button"
                            onClick={() => { setExamRangePreset("CUSTOM"); }}
                            className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                              examRangePreset === "CUSTOM" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            Personalizado
                          </button>
                        </div>
                      </div>

                      {/* Pills interactivos de selección múltiple personalizada */}
                      {examRangePreset === "CUSTOM" && (
                        <div className="flex flex-wrap items-center gap-1.5 bg-blue-50/60 p-1.5 rounded-lg border border-blue-200">
                          <span className="text-[11px] font-semibold text-blue-900 mr-1">Elegir:</span>
                          {availableExamNumbers.map((num: number) => {
                            const isSelected = customSelectedExams.includes(num);
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => toggleCustomExam(num)}
                                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                                  isSelected ? "bg-blue-600 text-white shadow-xs" : "bg-white text-gray-600 border border-gray-300 hover:border-blue-400"
                                }`}
                              >
                                #{num}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VISTA 1: MAPA DE CALOR POR OA */}
            {viewMode === "heatmap" && (
              <div className="bg-white rounded-2xl shadow-xs border p-6">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-blue-500" />
                      Mapa de Calor de Aprendizaje (OAs) · {formatLevelName(selectedLevel)}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">Comparativa transversal de porcentaje de logro por objetivo de aprendizaje.</p>
                  </div>
                </div>

                {heatmapData.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed text-xs">
                    No hay suficientes datos de evaluaciones rendidas con los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 text-gray-600 border-b">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Objetivo de Aprendizaje</th>
                          {courses.map(c => (
                            <th key={c} className="px-4 py-3 font-semibold text-center">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmapData.map((row: any, i: number) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-gray-50/60 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-800">{row.oa}</td>
                            {courses.map(c => {
                              const val = row[c];
                              return (
                                <td key={c} className="px-4 py-2 text-center">
                                  {val !== undefined ? (
                                    <div className={`w-full py-1.5 rounded-md ${getColor(val)}`}>
                                      {val}%
                                    </div>
                                  ) : (
                                    <div className="text-gray-300">—</div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-3 border-t">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div> &lt; 50% (Crítico / Insuficiente)</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-100 border border-amber-200 rounded"></div> 50% - 74% (En Desarrollo / Elemental)</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-100 border border-emerald-200 rounded"></div> &ge; 75% (Logrado / Adecuado)</span>
                </div>
              </div>
            )}

            {/* VISTA 2: EVOLUCIÓN LONGITUDINAL ANUAL */}
            {viewMode === "evolution" && (
              <div className="space-y-6">
                <LongitudinalChart data={chartData} />

                <div className="bg-white border rounded-2xl overflow-hidden shadow-xs">
                  <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        Trayectoria Histórica del Nivel {selectedLevel} ({selectedYear})
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Promedio SIMCE y desglose por cursos paralelos en cada evaluación.
                      </p>
                    </div>
                    {selectedCourseFilter !== "TODOS" && (
                      <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-full">
                        Filtrado por: {selectedCourseFilter}
                      </span>
                    )}
                  </div>

                  {evolutionList.length === 0 ? (
                    <div className="p-10 text-center text-gray-500 text-xs">
                      No hay suficientes evaluaciones con los criterios seleccionados para trazar la trayectoria.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-100 text-gray-600 uppercase font-semibold">
                          <tr>
                            <th className="px-5 py-3.5">Evaluación</th>
                            <th className="px-4 py-3.5">Tipo</th>
                            <th className="px-4 py-3.5">Fecha</th>
                            <th className="px-4 py-3.5 text-center">Prom. SIMCE Nivel</th>
                            {courses.map(c => (
                              <th key={c} className="px-4 py-3.5 text-center">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y text-gray-700">
                          {evolutionList.map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-gray-900">
                                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded mr-1.5 font-mono">
                                  #{item.orderNumber || idx + 1}
                                </span>
                                {item.examTitle}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                  item.examType === 'QUIZ' ? 'bg-emerald-100 text-emerald-800' :
                                  item.examType === 'REMEDIAL' ? 'bg-amber-100 text-amber-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {item.examType || 'ENSAYO'}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-gray-500 font-mono">
                                {new Date(item.date).toLocaleDateString("es-CL", { dateStyle: "short" })}
                              </td>
                              <td className="px-4 py-3.5 text-center font-extrabold text-blue-600 text-sm">
                                {item.avgSimce} ptos
                              </td>
                              {courses.map(c => {
                                const cData = item.courses?.[c];
                                const cScore = typeof cData === 'object' ? cData.avgSimce : cData;
                                return (
                                  <td key={c} className="px-4 py-3.5 text-center">
                                    {cScore !== undefined ? (
                                      <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${
                                        cScore >= 284 ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                                        cScore >= 241 ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-red-100 text-red-800 border border-red-200"
                                      }`}>
                                        {cScore} ptos
                                      </span>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VISTA 3: TRAYECTORIA MULTIANUAL (SOLICITADA) */}
            {viewMode === "multiannual" && (
              <div className="space-y-6">
                
                {/* Barra de Filtros Multianuales */}
                <div className="bg-white rounded-2xl border p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Nivel a Comparar</label>
                      <select
                        value={multiLevel}
                        onChange={(e) => setMultiLevel(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-xs bg-gray-50 font-bold text-gray-800 focus:outline-indigo-500"
                      >
                        <option value="4B">4° Básico</option>
                        <option value="6B">6° Básico</option>
                        <option value="8B">8° Básico</option>
                        <option value="2M">2° Medio</option>
                        <option value="TODOS">Todos los niveles</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Materia</label>
                      <select
                        value={multiSubject}
                        onChange={(e) => setMultiSubject(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-xs bg-gray-50 font-medium focus:outline-indigo-500"
                      >
                        <option value="TODOS">Todas las materias</option>
                        <option value="Matematica">Matemática</option>
                        <option value="Lectura">Lectura</option>
                        <option value="Ciencias Naturales">Ciencias Naturales</option>
                        <option value="Historia">Historia</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de Evaluación</label>
                      <select
                        value={multiExamType}
                        onChange={(e) => setMultiExamType(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-xs bg-gray-50 font-medium focus:outline-indigo-500"
                      >
                        <option value="ENSAYO">Ensayos Oficiales SIMCE (Predeterminado)</option>
                        <option value="TODOS">Todos los tipos</option>
                        <option value="QUIZ">Quizzes</option>
                        <option value="REMEDIAL">Remediales</option>
                      </select>
                    </div>
                  </div>

                  {/* Tarjeta de Delta de Crecimiento Histórico */}
                  {multiannualData && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 text-white rounded-lg">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[11px] text-indigo-700 font-semibold uppercase tracking-wider">Crecimiento Histórico</div>
                        <div className="text-base font-black text-indigo-950">
                          {multiannualData.deltaSimce >= 0 ? `+${multiannualData.deltaSimce}` : multiannualData.deltaSimce} ptos SIMCE
                          <span className="text-xs font-normal text-indigo-600 ml-1">
                            ({multiannualData.yearsCount} años evaluados)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Gráfico Visual Multianual */}
                {loadingMulti ? (
                  <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border">
                    Cargando comparativa multianual...
                  </div>
                ) : !multiannualData?.yearly || multiannualData.yearly.length === 0 ? (
                  <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-dashed">
                    No se encontraron evaluaciones históricas para los filtros seleccionados.
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border p-6 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                          <CalendarDays className="w-5 h-5 text-indigo-600" />
                          Trayectoria Interanual {multiLevel !== "TODOS" ? formatLevelName(multiLevel) : "Institucional"}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Evolución del puntaje SIMCE promedio cohorte a cohorte a lo largo de los años escolares.
                        </p>
                      </div>
                    </div>

                    {/* Gráfico de Barras y Curva Multianual */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 py-4">
                      {multiannualData.yearly.map((y: any, yIdx: number) => {
                        const prevYear = yIdx > 0 ? multiannualData.yearly[yIdx - 1] : null;
                        const yDiff = prevYear ? y.avgSimce - prevYear.avgSimce : null;

                        return (
                          <div 
                            key={y.year}
                            className="bg-slate-50 border-2 border-slate-200/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-indigo-400 hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-black text-slate-800">Año {y.year}</span>
                              <span className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-full font-bold text-slate-600">
                                {y.studentsCount} alumnos
                              </span>
                            </div>

                            <div className="space-y-1 text-center py-2">
                              <span className="text-xs text-slate-500 font-semibold block uppercase tracking-wider">Promedio SIMCE</span>
                              <span className="text-3xl font-black text-indigo-700 tracking-tight">
                                {y.avgSimce} ptos
                              </span>

                              {yDiff !== null && (
                                <div className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${
                                  yDiff > 0 ? 'bg-emerald-100 text-emerald-800' :
                                  yDiff < 0 ? 'bg-rose-100 text-rose-800' :
                                  'bg-gray-200 text-gray-700'
                                }`}>
                                  {yDiff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : yDiff < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                  {yDiff > 0 ? `+${yDiff}` : yDiff} vs año anterior
                                </div>
                              )}
                            </div>

                            {/* Barra de Distribución de Logro del Año */}
                            <div className="space-y-1.5 pt-2 border-t border-slate-200">
                              <div className="flex h-3 rounded-full overflow-hidden bg-gray-200">
                                {y.levels.insPct > 0 && <div style={{ width: `${y.levels.insPct}%` }} className="bg-red-500" title={`Insuficiente: ${y.levels.insPct}%`} />}
                                {y.levels.elePct > 0 && <div style={{ width: `${y.levels.elePct}%` }} className="bg-amber-400" title={`Elemental: ${y.levels.elePct}%`} />}
                                {y.levels.adePct > 0 && <div style={{ width: `${y.levels.adePct}%` }} className="bg-emerald-500" title={`Adecuado: ${y.levels.adePct}%`} />}
                              </div>
                              <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-red-600">Ins: {y.levels.insPct}%</span>
                                <span className="text-amber-600">Ele: {y.levels.elePct}%</span>
                                <span className="text-emerald-600">Ade: {y.levels.adePct}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tabla Multianual Detallada */}
                {multiannualData?.yearly && multiannualData.yearly.length > 0 && (
                  <div className="bg-white rounded-2xl border shadow-xs overflow-hidden">
                    <div className="px-6 py-4 bg-slate-50 border-b flex items-center justify-between">
                      <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-600" />
                        Registro Multianual Comparativo
                      </h4>
                      <span className="text-xs text-gray-500">
                        {multiannualData.yearly.length} años registrados
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-100 text-gray-600 uppercase font-semibold">
                          <tr>
                            <th className="px-5 py-3.5">Año Escolar</th>
                            <th className="px-4 py-3.5 text-center">Evaluados</th>
                            <th className="px-4 py-3.5 text-center">Entregas</th>
                            <th className="px-4 py-3.5 text-center">Promedio SIMCE</th>
                            <th className="px-4 py-3.5 text-center">Nota Promedio</th>
                            <th className="px-4 py-3.5 text-center">% Logro</th>
                            <th className="px-4 py-3.5 text-center">Distribución de Niveles</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-gray-700">
                          {multiannualData.yearly.map((y: any) => (
                            <tr key={y.year} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-5 py-4 font-black text-gray-900 text-sm">
                                Año {y.year}
                              </td>
                              <td className="px-4 py-4 text-center font-medium">
                                {y.studentsCount}
                              </td>
                              <td className="px-4 py-4 text-center font-medium">
                                {y.submissionsCount}
                              </td>
                              <td className="px-4 py-4 text-center">
                                <span className="text-base font-black text-indigo-700">
                                  {y.avgSimce} ptos
                                </span>
                              </td>
                              <td className="px-4 py-4 text-center font-bold text-gray-800">
                                {y.avgGrade ? y.avgGrade.toFixed(1) : "—"}
                              </td>
                              <td className="px-4 py-4 text-center font-bold text-gray-800">
                                {y.avgPercent}%
                              </td>
                              <td className="px-4 py-4">
                                <div className="w-44 mx-auto space-y-1">
                                  <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-200">
                                    <div style={{ width: `${y.levels.insPct}%` }} className="bg-red-500" />
                                    <div style={{ width: `${y.levels.elePct}%` }} className="bg-amber-400" />
                                    <div style={{ width: `${y.levels.adePct}%` }} className="bg-emerald-500" />
                                  </div>
                                  <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                                    <span className="text-red-600">{y.levels.insPct}%</span>
                                    <span className="text-amber-600">{y.levels.elePct}%</span>
                                    <span className="text-emerald-600">{y.levels.adePct}%</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>

          {/* Modal Asistente Prompts IA */}
          <AiPromptModal
            isOpen={showAiModal}
            onClose={() => setShowAiModal(false)}
            defaultMode="UTP_REPORT"
            initialLevel={selectedLevel ? selectedLevel.replace("B", "° Básico").replace("M", "° Medio") : "4° Básico"}
            initialSubject={selectedSubject !== "TODOS" ? selectedSubject : "Matemática"}
          />
        </AppShell>
      )}
    </RequireRole>
  );
}
