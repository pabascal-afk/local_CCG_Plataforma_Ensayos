"use client";

import { useEffect, useState, useMemo } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { 
  ArrowLeft, Trash2, FileText, Plus, Download, Search, 
  Filter, BookOpen, Layers, Clock, X, ChevronRight, Check, Sparkles,
  ChevronDown, ChevronUp, Headphones, FileSpreadsheet
} from "lucide-react";
import { useSchoolYear } from "@/context/SchoolYearContext";
import AiPromptModal from "@/components/AiPromptModal";
import AudioCutterModal from "@/components/AudioCutterModal";
import { useIsPruebas } from "@/lib/useIsPruebas";

type CourseItem = {
  id: number;
  level: string;
  letter: string;
  year: number;
  name?: string;
};

type Exam = {
  id: number;
  title: string;
  subject: string;
  level: string;
  orderNumber: number;
  examType: string;
  durationMinutes?: number | null;
  questionCount: number;
  optionsCount?: number;
  createdAt?: string;
  assignedCourses?: CourseItem[];
  audioClipsCount?: number;
  hasAudios?: boolean;
  audioQuestionNumbers?: number[];
  writtenCount?: number;
  oralCount?: number;
  multipleChoiceCount?: number;
  totalMaxPoints?: number;
};

function getSubjectTheme(subject: string) {
  const s = (subject || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.includes("matematica")) {
    return {
      bgBadge: "bg-blue-50 text-blue-700 border-blue-200",
      accentBorder: "border-l-blue-500",
      dot: "bg-blue-500"
    };
  }
  if (s.includes("lectura") || s.includes("lenguaje") || s.includes("comunicacion")) {
    return {
      bgBadge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      accentBorder: "border-l-emerald-500",
      dot: "bg-emerald-500"
    };
  }
  if (s.includes("ciencia")) {
    return {
      bgBadge: "bg-amber-50 text-amber-800 border-amber-200",
      accentBorder: "border-l-amber-500",
      dot: "bg-amber-500"
    };
  }
  if (s.includes("historia") || s.includes("sociales")) {
    return {
      bgBadge: "bg-purple-50 text-purple-700 border-purple-200",
      accentBorder: "border-l-purple-500",
      dot: "bg-purple-500"
    };
  }
  if (s.includes("ingles") || s.includes("english")) {
    return {
      bgBadge: "bg-cyan-50 text-cyan-800 border-cyan-200",
      accentBorder: "border-l-cyan-500",
      dot: "bg-cyan-500"
    };
  }
  return {
    bgBadge: "bg-slate-100 text-slate-700 border-slate-200",
    accentBorder: "border-l-slate-400",
    dot: "bg-slate-500"
  };
}

export default function ExamsPage() {
  const { selectedYear } = useSchoolYear();
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // --- Filtros ---
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [subjectFilter, setSubjectFilter] = useState("TODAS");
  const [levelCourseFilter, setLevelCourseFilter] = useState("TODOS");
  const [orderRangePreset, setOrderRangePreset] = useState<"TODOS" | "1-3" | "4-6" | "7-10" | "CUSTOM">("TODOS");
  const [selectedOrderNumbers, setSelectedOrderNumbers] = useState<number[]>([]);
  const [onlyAudioFilter, setOnlyAudioFilter] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [selectedAudioExam, setSelectedAudioExam] = useState<Exam | null>(null);
  const isPruebas = useIsPruebas();

  // Tarjetas compactas por defecto (disclosure progresivo)
  const [expandedExams, setExpandedExams] = useState<Set<number>>(new Set());

  const toggleExamExpand = (id: number) => {
    setExpandedExams(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllExams = () => {
    if (expandedExams.size === filteredExams.length) {
      setExpandedExams(new Set());
    } else {
      setExpandedExams(new Set(filteredExams.map(e => e.id)));
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [examsData, coursesData] = await Promise.all([
        apiFetch<Exam[]>("/admin/exams"),
        apiFetch<CourseItem[]>(`/admin/courses?year=${selectedYear}`).catch(() => [])
      ]);
      setExams(examsData);
      setCourses(coursesData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  // Lista de materias únicas presentes
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    exams.forEach(e => { if (e.subject) set.add(e.subject); });
    return Array.from(set).sort();
  }, [exams]);

  // Lista de tipos de evaluaciones presentes
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    exams.forEach(e => { if (e.examType) set.add(e.examType.toUpperCase()); });
    return Array.from(set).sort();
  }, [exams]);

  // Lista de niveles educativos únicos presentes
  const availableLevels = useMemo(() => {
    const set = new Set<string>();
    exams.forEach(e => { if (e.level) set.add(e.level); });
    return Array.from(set).sort();
  }, [exams]);

  // Números de orden disponibles en el catálogo para selección puntual
  const availableOrderNumbers = useMemo(() => {
    const set = new Set<number>();
    exams.forEach(e => {
      if (e.orderNumber !== undefined && e.orderNumber !== null) set.add(e.orderNumber);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [exams]);

  // Manejador del preset de rango de ensayos
  const handleOrderRangeChange = (preset: "TODOS" | "1-3" | "4-6" | "7-10" | "CUSTOM") => {
    setOrderRangePreset(preset);
    if (preset === "1-3") setSelectedOrderNumbers([1, 2, 3]);
    else if (preset === "4-6") setSelectedOrderNumbers([4, 5, 6]);
    else if (preset === "7-10") setSelectedOrderNumbers([7, 8, 9, 10]);
    else if (preset === "TODOS") setSelectedOrderNumbers([]);
  };

  // Toggle de un número puntual de ensayo
  const toggleOrderNumber = (num: number) => {
    setOrderRangePreset("CUSTOM");
    if (selectedOrderNumbers.includes(num)) {
      const next = selectedOrderNumbers.filter(n => n !== num);
      setSelectedOrderNumbers(next);
      if (next.length === 0) setOrderRangePreset("TODOS");
    } else {
      setSelectedOrderNumbers([...selectedOrderNumbers, num].sort((a, b) => a - b));
    }
  };

  // Reset de todos los filtros
  const handleResetFilters = () => {
    setSearchQuery("");
    setTypeFilter("TODOS");
    setSubjectFilter("TODAS");
    setLevelCourseFilter("TODOS");
    setOrderRangePreset("TODOS");
    setSelectedOrderNumbers([]);
    setOnlyAudioFilter(false);
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() || 
    typeFilter !== "TODOS" || 
    subjectFilter !== "TODAS" || 
    levelCourseFilter !== "TODOS" || 
    orderRangePreset !== "TODOS" || 
    selectedOrderNumbers.length > 0 ||
    onlyAudioFilter
  );

  // Filtrado de evaluaciones
  const filteredExams = useMemo(() => {
    return exams.filter(e => {
      // 0. Filtro solo con audios
      if (onlyAudioFilter && !e.hasAudios) {
        return false;
      }

      // 1. Búsqueda por texto (título, materia, orden)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchOrder = `#${e.orderNumber}`.includes(q) || `${e.orderNumber}` === q;
        const matchSubject = e.subject?.toLowerCase().includes(q);
        if (!matchTitle && !matchOrder && !matchSubject) return false;
      }

      // 2. Tipo de evaluación
      if (typeFilter !== "TODOS") {
        if (e.examType?.toUpperCase() !== typeFilter.toUpperCase()) return false;
      }

      // 3. Materia
      if (subjectFilter !== "TODAS") {
        if (e.subject !== subjectFilter) return false;
      }

      // 4. Curso / Nivel
      if (levelCourseFilter !== "TODOS") {
        // Puede ser un nivel directo (ej: "4B", "2M") o un course id ("course_12")
        if (levelCourseFilter.startsWith("course_")) {
          const courseId = parseInt(levelCourseFilter.replace("course_", ""), 10);
          const hasCourse = (e.assignedCourses || []).some(c => c.id === courseId);
          if (!hasCourse) {
            // Si el curso tiene el mismo nivel que el examen, también puede coincidir
            const targetCourse = courses.find(c => c.id === courseId);
            if (!targetCourse || targetCourse.level !== e.level) return false;
          }
        } else {
          // Filtro por nivel (ej. 4B, 2M)
          if (e.level !== levelCourseFilter) return false;
        }
      }

      // 5. Filtro de Ensayos (por número de orden o rango)
      if (orderRangePreset !== "TODOS" && selectedOrderNumbers.length > 0) {
        if (!selectedOrderNumbers.includes(e.orderNumber)) return false;
      }

      return true;
    });
  }, [exams, searchQuery, typeFilter, subjectFilter, levelCourseFilter, orderRangePreset, selectedOrderNumbers, courses, onlyAudioFilter]);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Seguro que quieres eliminar este ensayo? Esto no se puede deshacer y puede afectar resultados históricos.")) return;
    try {
      await apiFetch(`/admin/exams/${id}`, { method: "DELETE" });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getExamTypeBadge = (type: string) => {
    const t = (type || "ENSAYO").toUpperCase();
    if (t === "QUIZ") return <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider">QUIZ</span>;
    if (t === "REMEDIAL") return <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider">REMEDIAL</span>;
    if (t === "DIAGNOSTICO") return <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider">DIAGNÓSTICO</span>;
    if (t === "ENSAYO_LARGO") return <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider">EXTENDIDO</span>;
    return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider">{isPruebas ? "PRUEBA" : "ENSAYO"}</span>;
  };

  const formatLevelName = (lvl: string) => {
    return (lvl || "").replace("B", "° Básico").replace("M", "° Medio");
  };

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-7xl mx-auto space-y-6">
            
            {/* Cabecera Principal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
              <div>
                <Link href="/admin/dashboard" className="text-blue-600 hover:underline flex items-center gap-1 inline-flex text-xs font-semibold mb-1">
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver al Dashboard
                </Link>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                    {isPruebas ? "Gestión de Pruebas Regulares" : "Gestión de Ensayos"}
                  </h1>
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                    {exams.length} en catálogo
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Filtra, administra y edita la pauta de corrección de todas las evaluaciones del sistema.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAllExams}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-xs transition"
                  title={expandedExams.size === filteredExams.length ? "Colapsar todas las tarjetas" : "Expandir todas las tarjetas"}
                >
                  {expandedExams.size === filteredExams.length ? (
                    <>
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                      <span>Colapsar</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                      <span>Expandir ({expandedExams.size}/{filteredExams.length})</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowAiModal(true)}
                  className="p-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg shadow-xs transition-all"
                  title="Asistente de Prompts para Agentes de IA (Excel, Remediales y Reportes)"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
                    window.location.href = `/api/admin/exams/export.xlsx?token=${token}`;
                  }}
                  className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-colors"
                  title="Exportar Catálogo a Excel (.xlsx)"
                >
                  <Download className="w-4 h-4" />
                </button>

                <Link 
                  href="/admin/exams/new" 
                  className="flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-lg hover:bg-blue-700 text-xs font-bold shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" /> {isPruebas ? "Nueva Prueba" : "Nuevo Ensayo"}
                </Link>
              </div>
            </div>

            {error && <div className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-xl text-xs font-semibold">{error}</div>}

            {/* BARRA DE FILTROS INTEGRAL */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3.5">
              
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <span>Filtros de Búsqueda y Segmentación</span>
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={handleResetFilters}
                    className="text-xs text-blue-600 hover:text-blue-800 font-bold px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 transition flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Limpiar filtros
                  </button>
                )}
              </div>

              {/* Fila 1: Buscador, Tipo, Materia, Curso/Nivel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                
                {/* 1. Buscador */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Buscar Evaluación
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input 
                      type="text"
                      placeholder="Título o número (#1, #2...)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 hover:bg-gray-100/60 focus:bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery("")} 
                        className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Tipo de Evaluación */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Tipo de Evaluación
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2 font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="TODOS">Todos los tipos</option>
                    <option value="ENSAYO">{isPruebas ? "Prueba / Evaluación Sumativa" : "Ensayo SIMCE"}</option>
                    <option value="QUIZ">Quiz / Evaluación Rápida</option>
                    <option value="REMEDIAL">Remedial</option>
                    <option value="DIAGNOSTICO">Diagnóstico</option>
                    <option value="ENSAYO_LARGO">{isPruebas ? "Evaluación Extendida / Semestral" : "Ensayo Largo"}</option>
                  </select>
                </div>

                {/* 3. Materia */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Materia / Asignatura
                  </label>
                  <select
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2 font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="TODAS">Todas las materias</option>
                    {availableSubjects.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* 4. Curso / Nivel */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Curso o Nivel Educativo
                  </label>
                  <select
                    value={levelCourseFilter}
                    onChange={(e) => setLevelCourseFilter(e.target.value)}
                    className="w-full text-xs bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2 font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="TODOS">Todos los cursos y niveles</option>
                    <optgroup label="Nivel Educativo">
                      {availableLevels.map(lvl => (
                        <option key={lvl} value={lvl}>
                          {formatLevelName(lvl)}
                        </option>
                      ))}
                    </optgroup>
                    {courses.length > 0 && (
                      <optgroup label="Cursos Específicos">
                        {courses.map(c => (
                          <option key={c.id} value={`course_${c.id}`}>
                            {formatLevelName(c.level)} {c.letter} ({c.year})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

              </div>

              {/* Fila 2: Segmentación por Ensayos/Pruebas (Rango o Números puntuales) */}
              <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mr-1">
                    {isPruebas ? "Pruebas:" : "Ensayos:"}
                  </span>
                  
                  {/* Presets de rango */}
                  {(["TODOS", "1-3", "4-6", "7-10"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => handleOrderRangeChange(p)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        orderRangePreset === p && (p === "TODOS" || selectedOrderNumbers.length > 0)
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      }`}
                    >
                      {p === "TODOS" ? "Todos" : `${isPruebas ? "Pruebas" : "Ensayos"} ${p}`}
                    </button>
                  ))}

                  <div className="h-4 w-px bg-gray-300 mx-1 hidden sm:block" />

                  <button
                    type="button"
                    onClick={() => setOnlyAudioFilter(prev => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      onlyAudioFilter 
                        ? "bg-purple-600 text-white shadow-xs" 
                        : "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100"
                    }`}
                    title="Filtrar evaluaciones que tienen audios asignados"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Solo con audios</span>
                    {onlyAudioFilter && <Check className="w-3 h-3 ml-0.5" />}
                  </button>
                </div>

                {/* Chips puntuales (ej: 1, 3, 7) */}
                {availableOrderNumbers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="text-[10px] font-semibold text-gray-400 mr-1">Puntuales:</span>
                    {availableOrderNumbers.map(num => {
                      const isSelected = selectedOrderNumbers.includes(num);
                      return (
                        <button
                          key={num}
                          onClick={() => toggleOrderNumber(num)}
                          className={`w-6 h-6 rounded-md font-extrabold text-[11px] flex items-center justify-center transition ${
                            isSelected 
                              ? "bg-indigo-600 text-white shadow-sm" 
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                          title={`Filtrar solo ${isPruebas ? "Prueba" : "Ensayo"} #${num}`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Resumen de Resultados */}
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span>
                Mostrando <strong>{filteredExams.length}</strong> de {exams.length} evaluaciones
              </span>
              {hasActiveFilters && (
                <span className="text-blue-600 font-semibold bg-blue-50 px-2.5 py-0.5 rounded-full">
                  Filtros aplicados
                </span>
              )}
            </div>

            {/* Grilla de Tarjetas de Evaluaciones Compactas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 items-start">
              {loading ? (
                <div className="col-span-full text-center text-gray-400 py-16 animate-pulse font-medium">
                  Cargando catálogo de evaluaciones...
                </div>
              ) : filteredExams.length === 0 ? (
                <div className="col-span-full bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-500">
                  <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-gray-700">No se encontraron evaluaciones</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                    Prueba modificando los filtros seleccionados o limpiando la búsqueda.
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={handleResetFilters}
                      className="mt-4 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-lg font-bold transition"
                    >
                      Restablecer todos los filtros
                    </button>
                  )}
                </div>
              ) : (
                filteredExams.map(e => {
                  const isExpanded = expandedExams.has(e.id);
                  const theme = getSubjectTheme(e.subject);
                  const hasAudio = Boolean(e.hasAudios || (e.audioClipsCount && e.audioClipsCount > 0));

                  return (
                    <div 
                      key={e.id} 
                      className={`bg-white border rounded-xl shadow-xs transition-all overflow-hidden ${
                        isExpanded 
                          ? "border-blue-400 ring-2 ring-blue-50 shadow-md" 
                          : "border-gray-200 hover:border-gray-300 hover:shadow-xs"
                      }`}
                    >
                      {/* Fila / Barra Compacta Clicable */}
                      <div 
                        onClick={() => toggleExamExpand(e.id)}
                        className="p-4 cursor-pointer select-none bg-white hover:bg-slate-50/70 transition-colors"
                      >
                        {/* Fila 1: Badges superiores (Orden, Nivel, Tipo a la izquierda; Botón Audio condicional y Chevron a la derecha) */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="bg-slate-900 text-white font-black text-xs px-2 py-0.5 rounded-md">
                              #{e.orderNumber}
                            </span>
                            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs px-2 py-0.5 rounded-md">
                              {formatLevelName(e.level)}
                            </span>
                            {getExamTypeBadge(e.examType)}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* BOTÓN DE AUDIOS: SOLO SI LA EVALUACIÓN TIENE AUDIOS ASIGNADOS */}
                            {hasAudio && (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setSelectedAudioExam(e);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-md transition"
                                title={`${e.audioClipsCount || 1} audio(s) configurado(s). Clic para abrir el cortador.`}
                              >
                                <Headphones className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                <span>Audios</span>
                              </button>
                            )}

                            <div className={`p-1 rounded-md text-gray-400 hover:text-gray-600 transition ${isExpanded ? "text-blue-600 bg-blue-50" : ""}`}>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>

                        {/* Fila 2: Materia y Título */}
                        <div className="mb-2.5">
                          <div className="text-[11px] font-extrabold text-blue-800 uppercase tracking-wide">
                            {e.subject}
                          </div>
                          <h2 className="text-sm font-bold text-gray-900 leading-snug line-clamp-1 mt-0.5" title={e.title}>
                            {e.title}
                          </h2>
                        </div>

                        {/* Fila 3: Metadatos simples y limpios (1 sola línea, sin colisiones) */}
                        <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100 font-medium">
                          <span className="text-gray-800 font-semibold">{e.questionCount} preg</span>
                          <span>•</span>
                          <span>{e.durationMinutes ? `${e.durationMinutes} min` : "Libre"}</span>
                          <span>•</span>
                          <span>{e.optionsCount ? `${e.optionsCount} alt.` : "4 alt."}</span>
                          {Boolean(e.writtenCount && e.writtenCount > 0) && (
                            <>
                              <span>•</span>
                              <span className="text-amber-700 font-semibold">{e.writtenCount} esc.</span>
                            </>
                          )}
                          {Boolean(e.oralCount && e.oralCount > 0) && (
                            <>
                              <span>•</span>
                              <span className="text-purple-700 font-semibold">{e.oralCount} oral</span>
                            </>
                          )}
                          {hasAudio && (
                            <>
                              <span>•</span>
                              <span className="text-purple-700 font-bold inline-flex items-center gap-0.5">
                                <Headphones className="w-3 h-3" /> Audio
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Contenido Expandido */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-slate-50/70 space-y-3">
                          {/* Resumen en 3 métricas limpias */}
                          <div className="grid grid-cols-3 gap-2 text-xs bg-white p-3 rounded-xl border border-gray-200 shadow-2xs">
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400 font-bold uppercase block">Preguntas</span>
                                <Link 
                                  href={`/admin/exams/${e.id}`} 
                                  className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-0.5"
                                  title="Agregar o quitar preguntas"
                                >
                                  <Plus className="w-2.5 h-2.5" /> + Agregar
                                </Link>
                              </div>
                              <span className="font-black text-gray-800 text-sm">{e.questionCount}</span>
                              <span className="text-[10px] text-gray-500 block truncate">
                                {e.multipleChoiceCount ?? e.questionCount} selec.
                                {(e.writtenCount ?? 0) > 0 ? `, ${e.writtenCount} esc.` : ""}
                                {(e.oralCount ?? 0) > 0 ? `, ${e.oralCount} oral` : ""}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] text-gray-400 font-bold uppercase block">Puntaje Total</span>
                              <span className="font-black text-blue-700 text-sm">
                                {e.totalMaxPoints ?? e.questionCount} pts
                              </span>
                              <span className="text-[10px] text-gray-500 block">Pauta oficial</span>
                            </div>

                            <div>
                              <span className="text-[10px] text-gray-400 font-bold uppercase block">Tiempo</span>
                              <span className="font-black text-gray-800 text-sm">
                                {e.durationMinutes ? `${e.durationMinutes} min` : "Libre"}
                              </span>
                              <span className="text-[10px] text-gray-500 block">Duración</span>
                            </div>
                          </div>

                          {/* Banner de audios: SOLO SI TIENE AUDIOS */}
                          {hasAudio && (
                            <div className="p-2.5 bg-purple-50/90 border border-purple-200 rounded-lg flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2 text-purple-900">
                                <Headphones className="w-4 h-4 text-purple-700 shrink-0" />
                                <span>
                                  <strong>{e.audioClipsCount || 1} pista(s) de audio asignada(s)</strong>
                                  {e.audioQuestionNumbers && e.audioQuestionNumbers.length > 0 ? (
                                    <> (preguntas <strong>{e.audioQuestionNumbers.join(", ")}</strong>).</>
                                  ) : null}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedAudioExam(e)}
                                className="shrink-0 bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-md transition"
                              >
                                Abrir Cortador
                              </button>
                            </div>
                          )}

                          {/* Cursos Asignados */}
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                              Cursos Programados ({e.assignedCourses?.length || 0}):
                            </span>
                            {e.assignedCourses && e.assignedCourses.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {e.assignedCourses.map(ac => (
                                  <span 
                                    key={ac.id} 
                                    className="text-[11px] font-bold bg-white border border-slate-200 text-slate-800 px-2.5 py-0.5 rounded-md shadow-2xs"
                                  >
                                    {formatLevelName(ac.level)} {ac.letter} <span className="text-gray-400 font-normal">({ac.year})</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic bg-white p-2 rounded-lg border border-dashed border-gray-200">
                                Disponible en catálogo. Aún no ha sido asignada a ningún curso.
                              </p>
                            )}
                          </div>

                          {/* Barra de Acciones del Pie */}
                          <div className="pt-2 border-t border-gray-200 flex items-center justify-between gap-2">
                            <button 
                              type="button"
                              onClick={() => handleDelete(e.id)} 
                              className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg font-semibold transition"
                              title="Eliminar esta prueba del catálogo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>

                            <div className="flex items-center gap-2">
                              {hasAudio && (
                                <button 
                                  type="button"
                                  onClick={() => setSelectedAudioExam(e)}
                                  className="inline-flex items-center gap-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs px-2.5 py-1.5 rounded-lg transition"
                                >
                                  <Headphones className="w-3.5 h-3.5 text-purple-600" />
                                  <span>Audios</span>
                                </button>
                              )}
                              <Link 
                                href={`/admin/exams/${e.id}`} 
                                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs transition"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>Editar Pauta y Preguntas</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* Modal Asistente Prompts IA */}
          <AiPromptModal 
            isOpen={showAiModal} 
            onClose={() => setShowAiModal(false)} 
            defaultMode="EXAM_XLSX" 
          />

          {/* Modal Cortador de Audio por Pregunta */}
          {selectedAudioExam && (
            <AudioCutterModal
              isOpen={Boolean(selectedAudioExam)}
              onClose={() => setSelectedAudioExam(null)}
              examId={selectedAudioExam.id}
              examTitle={selectedAudioExam.title}
              questionCount={selectedAudioExam.questionCount}
              onClipsUpdated={loadData}
            />
          )}
        </AppShell>
      )}
    </RequireRole>
  );
}
