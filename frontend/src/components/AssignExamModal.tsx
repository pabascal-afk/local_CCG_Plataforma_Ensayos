"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  X, Zap, Sparkles, Clock, Calendar, ShieldCheck, Printer, 
  KeyRound, BookOpen, School, Settings, Plus, Trash2, CheckCircle2,
  AlertCircle, ChevronRight, HelpCircle, Laptop
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useIsPruebas } from "@/lib/useIsPruebas";

type CourseOption = {
  id: number;
  level: string;
  letter: string;
  year?: number;
  name: string;
  studentCount?: number;
};

type ExamOption = {
  id: number;
  title: string;
  subject: string;
  level: string;
  examType: string;
  orderNumber: number;
  durationMinutes?: number | null;
  questionCount?: number;
};

type BellBlock = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  orderIndex: number;
  isActive: boolean;
};

type PresetType = "CLASSROOM" | "QUIZ" | "HOMEWORK" | "PRINTED";

interface AssignExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newAssignment: any) => void;
  apiEndpointPrefix?: string; // "/teacher" o "/admin"
  initialCourseId?: number;
  initialExamId?: number;
}

export default function AssignExamModal({
  isOpen,
  onClose,
  onSuccess,
  apiEndpointPrefix = "/teacher",
  initialCourseId,
  initialExamId
}: AssignExamModalProps) {
  const isPruebas = useIsPruebas();

  // Datos del sistema
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [bellBlocks, setBellBlocks] = useState<BellBlock[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [error, setError] = useState("");

  // Selección de Entidades
  const [selectedCourseId, setSelectedCourseId] = useState<number | "">("");
  const [selectedExamId, setSelectedExamId] = useState<number | "">("");

  // Modo de Asignación
  const [isQuickLaunch, setIsQuickLaunch] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetType>("CLASSROOM");

  // Parámetros Temporales y de Configuración
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [stagedDate, setStagedDate] = useState<string>(todayStr);
  const [stagedStartTime, setStagedStartTime] = useState<string>("08:15");
  const [stagedEndTime, setStagedEndTime] = useState<string>("09:45");
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);

  const [durationMinutes, setDurationMinutes] = useState<number>(80);
  const [applicationMode, setApplicationMode] = useState<"DIGITAL" | "PRINTED">("DIGITAL");
  const [dynamicPasswordActive, setDynamicPasswordActive] = useState<boolean>(true);
  const [dynamicPassword, setDynamicPassword] = useState<string>("");

  // Gestión de Bloques de Campana (Editor)
  const [showBlockManager, setShowBlockManager] = useState(false);
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockStart, setNewBlockStart] = useState("");
  const [newBlockEnd, setNewBlockEnd] = useState("");
  const [savingBlock, setSavingBlock] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generador de PIN al azar (4 caracteres alfanuméricos)
  const generateRandomPin = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let pin = "";
    for (let i = 0; i < 4; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
  };

  // Cargar cursos, pruebas y bloques de horario
  useEffect(() => {
    if (!isOpen) return;

    setError("");
    setLoadingInitial(true);

    const loadData = async () => {
      try {
        // Cursos
        const coursesPromise = apiFetch<any[]>(
          apiEndpointPrefix === "/admin" ? "/admin/courses" : "/teacher/my-courses"
        );
        // Pruebas
        const examsPromise = apiFetch<any[]>(
          apiEndpointPrefix === "/admin" ? "/admin/exams" : "/teacher/available-exams"
        );
        // Bloques de campana
        const blocksPromise = apiFetch<BellBlock[]>(
          `${apiEndpointPrefix}/bell-blocks`
        ).catch(() => []);

        const [coursesRes, examsRes, blocksRes] = await Promise.all([coursesPromise, examsPromise, blocksPromise]);

        const formattedCourses: CourseOption[] = (coursesRes || []).map((c: any) => ({
          id: c.id,
          level: c.level,
          letter: c.letter,
          year: c.year,
          name: c.name || `${c.level?.replace("B", "° Básico").replace("M", "° Medio")} ${c.letter}`,
          studentCount: c.studentCount || c._count?.students || 0
        }));

        const formattedExams: ExamOption[] = (examsRes || []).map((e: any) => ({
          id: e.id,
          title: e.title,
          subject: e.subject,
          level: e.level,
          examType: e.examType || "ENSAYO",
          orderNumber: e.orderNumber || 1,
          durationMinutes: e.durationMinutes,
          questionCount: e.questionCount || e._count?.questions || 30
        }));

        setCourses(formattedCourses);
        setExams(formattedExams);
        setBellBlocks(blocksRes || []);

        // Preselecciones si vienen en props
        if (initialCourseId && formattedCourses.some(c => c.id === initialCourseId)) {
          setSelectedCourseId(initialCourseId);
        } else if (formattedCourses.length > 0) {
          setSelectedCourseId(formattedCourses[0].id);
        }

        if (initialExamId && formattedExams.some(e => e.id === initialExamId)) {
          setSelectedExamId(initialExamId);
        } else if (formattedExams.length > 0) {
          setSelectedExamId(formattedExams[0].id);
        }

        // Si hay bloques, seleccionar el primer bloque por defecto
        if (blocksRes && blocksRes.length > 0) {
          const first = blocksRes[0];
          setSelectedBlockId(first.id);
          setStagedStartTime(first.startTime);
          setStagedEndTime(first.endTime);
        }

        // Generar PIN inicial
        setDynamicPassword(generateRandomPin());
      } catch (err: any) {
        setError(err.message || "Error al cargar catálogo de asignación");
      } finally {
        setLoadingInitial(false);
      }
    };

    loadData();
  }, [isOpen, apiEndpointPrefix, initialCourseId, initialExamId]);

  // Selección de examen actual
  const currentExam = useMemo(() => {
    return exams.find(e => e.id === Number(selectedExamId)) || null;
  }, [exams, selectedExamId]);

  // Ajustar duración por defecto según examen
  useEffect(() => {
    if (currentExam && currentExam.durationMinutes && currentExam.durationMinutes > 0) {
      setDurationMinutes(currentExam.durationMinutes);
    }
  }, [currentExam]);

  // Manejar cambio de Arquetipo
  const handleApplyPreset = (preset: PresetType) => {
    setActivePreset(preset);
    setIsQuickLaunch(false);

    if (preset === "CLASSROOM") {
      setApplicationMode("DIGITAL");
      setDynamicPasswordActive(true);
      if (!dynamicPassword) setDynamicPassword(generateRandomPin());
      setDurationMinutes(currentExam?.durationMinutes || 80);
    } else if (preset === "QUIZ") {
      setApplicationMode("DIGITAL");
      setDynamicPasswordActive(true);
      setDurationMinutes(20);
    } else if (preset === "HOMEWORK") {
      setApplicationMode("DIGITAL");
      setDynamicPasswordActive(false);
      setDurationMinutes(0); // Tiempo libre
      // Ventana de 3 días
      const future = new Date();
      future.setDate(future.getDate() + 3);
      setStagedDate(todayStr);
      setStagedStartTime("08:00");
      setStagedEndTime("23:59");
    } else if (preset === "PRINTED") {
      setApplicationMode("PRINTED");
      setDynamicPasswordActive(false);
      setDurationMinutes(currentExam?.durationMinutes || 90);
    }
  };

  // Manejar selección de bloque de campana
  const handleSelectBlock = (block: BellBlock) => {
    setSelectedBlockId(block.id);
    setStagedStartTime(block.startTime);
    setStagedEndTime(block.endTime);
    setIsQuickLaunch(false);
  };

  // Crear nuevo bloque de campana
  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockName || !newBlockStart || !newBlockEnd) return;

    setSavingBlock(true);
    try {
      const endpoint = apiEndpointPrefix === "/admin" ? "/admin/bell-blocks" : "/teacher/bell-blocks";
      const created = await apiFetch<BellBlock>(endpoint, {
        method: "POST",
        body: {
          name: newBlockName,
          startTime: newBlockStart,
          endTime: newBlockEnd
        }
      });
      setBellBlocks(prev => [...prev, created]);
      setNewBlockName("");
      setNewBlockStart("");
      setNewBlockEnd("");
      setShowBlockManager(false);
      handleSelectBlock(created);
    } catch (err: any) {
      alert("Error al guardar bloque: " + (err.message || "Error"));
    } finally {
      setSavingBlock(false);
    }
  };

  // Eliminar bloque de campana
  const handleDeleteBlock = async (id: number) => {
    if (!confirm("¿Seguro que deseas eliminar este bloque de campana escolar?")) return;
    try {
      await apiFetch(`/admin/bell-blocks/${id}`, { method: "DELETE" });
      setBellBlocks(prev => prev.filter(b => b.id !== id));
      if (selectedBlockId === id) setSelectedBlockId(null);
    } catch (err: any) {
      alert("Error al eliminar: " + (err.message || "Error"));
    }
  };

  // Envío del formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !selectedExamId) {
      setError("Debes seleccionar una prueba y un curso");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      let finalOpensAt: Date;
      let finalClosesAt: Date;

      if (isQuickLaunch) {
        // Modo Lanzamiento Rápido: empieza ahora mismo
        const start = new Date();
        const durationMins = durationMinutes > 0 ? durationMinutes : 90;
        // Colchón de 10 min de tolerancia de término
        const end = new Date(start.getTime() + (durationMins + 10) * 60000);
        finalOpensAt = start;
        finalClosesAt = end;
      } else {
        finalOpensAt = new Date(`${stagedDate}T${stagedStartTime}:00`);
        finalClosesAt = new Date(`${stagedDate}T${stagedEndTime}:00`);
      }

      if (isNaN(finalOpensAt.getTime()) || isNaN(finalClosesAt.getTime())) {
        throw new Error("Fechas u horas inválidas");
      }

      if (finalClosesAt <= finalOpensAt) {
        throw new Error("La hora de término debe ser posterior a la de inicio");
      }

      const payload = {
        examId: Number(selectedExamId),
        courseId: Number(selectedCourseId),
        opensAt: finalOpensAt.toISOString(),
        closesAt: finalClosesAt.toISOString(),
        durationMinutes: durationMinutes > 0 ? durationMinutes : null,
        dynamicPassword: dynamicPasswordActive && dynamicPassword.trim() ? dynamicPassword.trim().toUpperCase() : null,
        dynamicPasswordActive: Boolean(dynamicPasswordActive),
        applicationMode,
        presetType: isQuickLaunch ? "QUICK_LAUNCH" : activePreset
      };

      const res = await apiFetch<any>(`${apiEndpointPrefix}/assignments`, {
        method: "POST",
        body: payload
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : (err.message || "Error al asignar"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Cabecera */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-700 to-indigo-800 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300 backdrop-blur-xs">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                Asignación Dinámica de {isPruebas ? "Pruebas" : "Ensayos"}
              </h2>
              <p className="text-xs text-blue-100">
                Programación ágil, bloques de campana escolar y lanzamiento inmediato en clase
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-gray-800">

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
              <div>{error}</div>
            </div>
          )}

          {loadingInitial ? (
            <div className="py-12 text-center text-gray-500 animate-pulse font-medium">
              Cargando catálogo de pruebas y bloques de horario...
            </div>
          ) : (
            <form id="assign-exam-form" onSubmit={handleSubmit} className="space-y-6">

              {/* 1. Selección de Prueba y Curso */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Selector de Prueba */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-blue-600" /> 1. {isPruebas ? "Prueba a Asignar" : "Ensayo a Asignar"}
                  </label>
                  <select
                    value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm font-semibold bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all outline-hidden"
                    required
                  >
                    <option value="">Selecciona una evaluación...</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({ex.subject} · {ex.level})
                      </option>
                    ))}
                  </select>
                  {currentExam && (
                    <div className="mt-1 text-[11px] text-gray-500 flex items-center gap-2">
                      <span className="font-medium text-gray-700">{currentExam.questionCount} preguntas</span>
                      <span>·</span>
                      <span>Duración base: {currentExam.durationMinutes || 90} min</span>
                    </div>
                  )}
                </div>

                {/* Selector de Curso */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                    <School className="w-3.5 h-3.5 text-blue-600" /> 2. Curso Destino
                  </label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full border border-gray-200 rounded-xl p-2.5 text-sm font-semibold bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all outline-hidden"
                    required
                  >
                    <option value="">Selecciona el curso...</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.studentCount ? `(${c.studentCount} alumnos)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Banner: Modo Lanzamiento Rápido en Clase */}
              <div 
                onClick={() => setIsQuickLaunch(!isQuickLaunch)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                  isQuickLaunch 
                    ? "bg-amber-500/10 border-amber-500 text-amber-950" 
                    : "bg-gray-50 border-gray-200 hover:border-amber-400 text-gray-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg ${
                    isQuickLaunch ? "bg-amber-500 text-white shadow-xs" : "bg-gray-200 text-gray-600"
                  }`}>
                    ⚡
                  </div>
                  <div>
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      Iniciar en Clase Ahora (Lanzamiento en 1-Clic)
                      {isQuickLaunch && (
                        <span className="bg-amber-500 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                          Activo
                        </span>
                      )}
                    </h4>
                    <p className="text-xs opacity-85">
                      Empieza de inmediato ({now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) y calcula el término automático según la prueba.
                    </p>
                  </div>
                </div>
                <input 
                  type="checkbox" 
                  checked={isQuickLaunch} 
                  onChange={() => {}} 
                  className="w-5 h-5 accent-amber-600 rounded-md cursor-pointer" 
                />
              </div>

              {!isQuickLaunch && (
                <>
                  {/* 2. Arquetipos Pedagógicos en 1 Clic */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> 3. Arquetipo Pedagógico (Preajuste en 1-Clic)
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      {/* Arquetipo 1: Evaluación en Sala */}
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("CLASSROOM")}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          activePreset === "CLASSROOM"
                            ? "bg-blue-50 border-blue-600 text-blue-900 shadow-xs ring-1 ring-blue-600"
                            : "bg-white border-gray-200 hover:border-blue-300 text-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Laptop className="w-4 h-4 text-blue-600" />
                          {activePreset === "CLASSROOM" && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                        </div>
                        <span className="font-bold text-xs">Evaluación en Sala</span>
                        <span className="text-[10px] text-gray-500 mt-1">Con PIN + Tiempo límite estricto</span>
                      </button>

                      {/* Arquetipo 2: Quiz Rápido */}
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("QUIZ")}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          activePreset === "QUIZ"
                            ? "bg-emerald-50 border-emerald-600 text-emerald-900 shadow-xs ring-1 ring-emerald-600"
                            : "bg-white border-gray-200 hover:border-emerald-300 text-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Zap className="w-4 h-4 text-emerald-600" />
                          {activePreset === "QUIZ" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <span className="font-bold text-xs">Quiz Rápido</span>
                        <span className="text-[10px] text-gray-500 mt-1">20 min + Feedback en clase</span>
                      </button>

                      {/* Arquetipo 3: Tarea Abierta */}
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("HOMEWORK")}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          activePreset === "HOMEWORK"
                            ? "bg-purple-50 border-purple-600 text-purple-900 shadow-xs ring-1 ring-purple-600"
                            : "bg-white border-gray-200 hover:border-purple-300 text-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <BookOpen className="w-4 h-4 text-purple-600" />
                          {activePreset === "HOMEWORK" && <CheckCircle2 className="w-4 h-4 text-purple-600" />}
                        </div>
                        <span className="font-bold text-xs">Tarea / Ensayo</span>
                        <span className="text-[10px] text-gray-500 mt-1">3 días libres desde casa</span>
                      </button>

                      {/* Arquetipo 4: Impreso */}
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("PRINTED")}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          activePreset === "PRINTED"
                            ? "bg-slate-100 border-slate-700 text-slate-900 shadow-xs ring-1 ring-slate-700"
                            : "bg-white border-gray-200 hover:border-slate-400 text-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Printer className="w-4 h-4 text-slate-700" />
                          {activePreset === "PRINTED" && <CheckCircle2 className="w-4 h-4 text-slate-700" />}
                        </div>
                        <span className="font-bold text-xs">Papel / OMR</span>
                        <span className="text-[10px] text-gray-500 mt-1">Hojas impresas rotuladas</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. Bloques Pedagógicos de Campana Escolar */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" /> Bloques Horarios de Campana Escolar
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowBlockManager(!showBlockManager)}
                        className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1"
                      >
                        <Settings className="w-3.5 h-3.5" /> Configurar Bloques
                      </button>
                    </div>

                    {/* Selector de Bloques */}
                    <div className="flex flex-wrap gap-2">
                      {bellBlocks.map((b) => {
                        const isSelected = selectedBlockId === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleSelectBlock(b)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                              isSelected
                                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
                            }`}
                          >
                            <span>{b.name}</span>
                            <span className={`text-[10px] ${isSelected ? "text-blue-100" : "text-gray-500"}`}>
                              ({b.startTime} - {b.endTime})
                            </span>
                          </button>
                        );
                      })}
                      {bellBlocks.length === 0 && (
                        <span className="text-xs text-gray-500">No hay bloques de campana registrados.</span>
                      )}
                    </div>

                    {/* Gestor Inline de Bloques */}
                    {showBlockManager && (
                      <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 space-y-3 animate-in fade-in duration-100">
                        <h5 className="text-xs font-bold text-gray-800">Crear o Personalizar Bloques de la Escuela</h5>
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Ej: Bloque 1"
                            value={newBlockName}
                            onChange={(e) => setNewBlockName(e.target.value)}
                            className="text-xs border rounded-md p-1.5 w-28 bg-gray-50"
                          />
                          <input
                            type="time"
                            value={newBlockStart}
                            onChange={(e) => setNewBlockStart(e.target.value)}
                            className="text-xs border rounded-md p-1.5 bg-gray-50"
                          />
                          <span className="text-xs text-gray-400">a</span>
                          <input
                            type="time"
                            value={newBlockEnd}
                            onChange={(e) => setNewBlockEnd(e.target.value)}
                            className="text-xs border rounded-md p-1.5 bg-gray-50"
                          />
                          <button
                            type="button"
                            onClick={handleCreateBlock}
                            disabled={savingBlock || !newBlockName || !newBlockStart || !newBlockEnd}
                            className="px-2.5 py-1.5 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                          >
                            + Guardar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Fecha y Horas Finales Calculadas */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1">Fecha</label>
                        <input
                          type="date"
                          value={stagedDate}
                          onChange={(e) => setStagedDate(e.target.value)}
                          className="w-full text-xs border rounded-lg p-2 bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1">Hora Inicio</label>
                        <input
                          type="time"
                          value={stagedStartTime}
                          onChange={(e) => {
                            setStagedStartTime(e.target.value);
                            setSelectedBlockId(null);
                          }}
                          className="w-full text-xs border rounded-lg p-2 bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1">Hora Cierre</label>
                        <input
                          type="time"
                          value={stagedEndTime}
                          onChange={(e) => {
                            setStagedEndTime(e.target.value);
                            setSelectedBlockId(null);
                          }}
                          className="w-full text-xs border rounded-lg p-2 bg-white"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Parámetros Adicionales: PIN y Modalidad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Clave PIN */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" /> PIN de Aula
                    </span>
                    <input
                      type="checkbox"
                      checked={dynamicPasswordActive}
                      onChange={(e) => setDynamicPasswordActive(e.target.checked)}
                      className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                    />
                  </div>
                  {dynamicPasswordActive ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={dynamicPassword}
                        onChange={(e) => setDynamicPassword(e.target.value.toUpperCase())}
                        maxLength={8}
                        className="w-full text-center font-mono font-bold tracking-widest text-sm border rounded-lg p-1.5 bg-white uppercase"
                      />
                      <button
                        type="button"
                        onClick={() => setDynamicPassword(generateRandomPin())}
                        className="px-2.5 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-semibold"
                        title="Generar nuevo PIN"
                      >
                        🎲
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Sin PIN requerido para entrar</span>
                  )}
                </div>

                {/* Modalidad */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col justify-between">
                  <span className="text-xs font-bold text-gray-700 mb-2">Modalidad de Aplicación</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setApplicationMode("DIGITAL")}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-1 ${
                        applicationMode === "DIGITAL"
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-200"
                      }`}
                    >
                      💻 Digital
                    </button>
                    <button
                      type="button"
                      onClick={() => setApplicationMode("PRINTED")}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-1 ${
                        applicationMode === "PRINTED"
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-gray-700 border-gray-200"
                      }`}
                    >
                      🖨️ Impresa
                    </button>
                  </div>
                </div>
              </div>

            </form>
          )}

        </div>

        {/* Pie de Página */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-200/50 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          
          <button
            type="submit"
            form="assign-exam-form"
            disabled={isSubmitting || loadingInitial || !selectedCourseId || !selectedExamId}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <span>Asignando...</span>
            ) : isQuickLaunch ? (
              <>
                <Zap className="w-4 h-4 text-amber-300" />
                <span>¡Lanzar en Clase Ahora!</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar y Asignar</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
