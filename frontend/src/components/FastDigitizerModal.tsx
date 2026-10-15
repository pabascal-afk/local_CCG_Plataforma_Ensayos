"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Keyboard,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  User,
  Save,
  Check,
  RotateCcw,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface FastDigitizerModalProps {
  assignmentId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface StudentItem {
  rut: string;
  name: string;
  grade?: number;
  simceScore?: number;
  hasSubmission: boolean;
  answersCount: number;
}

export default function FastDigitizerModal({
  assignmentId,
  isOpen,
  onClose,
  onSuccess,
}: FastDigitizerModalProps) {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedStudentRut, setSelectedStudentRut] = useState<string>("");
  const [examMeta, setExamMeta] = useState<{
    title: string;
    questionCount: number;
    optionsCount: number;
  } | null>(null);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [activeQuestion, setActiveQuestion] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  // Cargar estudiantes y datos del examen
  const loadData = useCallback(async () => {
    try {
      const [sheetData, liveData]: [any, any] = await Promise.all([
        apiFetch<any>(`/teacher/assignments/${assignmentId}/printable-sheet-data`),
        apiFetch<any>(`/teacher/assignments/${assignmentId}/live`).catch(() => null),
      ]);

      if (sheetData && sheetData.exam) {
        setExamMeta({
          title: sheetData.exam.title,
          questionCount: sheetData.questions?.length || sheetData.exam.questionCount || 30,
          optionsCount: sheetData.exam.optionsCount || 4,
        });
      }

      const liveMap = new Map<string, any>();
      if (liveData && liveData.students) {
        liveData.students.forEach((st: any) => {
          liveMap.set(st.rut, st);
        });
      }

      if (sheetData && sheetData.students) {
        const studentList: StudentItem[] = sheetData.students.map((st: any) => {
          const liveSt = liveMap.get(st.rut);
          return {
            rut: st.rut,
            name: st.name,
            grade: liveSt?.grade,
            simceScore: liveSt?.simceScore,
            hasSubmission: liveSt?.state === "SUBMITTED",
            answersCount: liveSt?.answersCount || 0,
          };
        });

        setStudents(studentList);
        if (studentList.length > 0 && !selectedStudentRut) {
          // Seleccionar el primer alumno sin entregar o el primero
          const firstPending = studentList.find((s) => !s.hasSubmission);
          setSelectedStudentRut(firstPending ? firstPending.rut : studentList[0].rut);
        }
      }
    } catch (err: any) {
      console.error("Error al cargar datos para digitador:", err);
      setErrorMessage(err.message || "Error al cargar información");
    }
  }, [assignmentId, selectedStudentRut]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Manejar teclado para digitación ultra-rápida (A, B, C, D, E, Flechas, Backspace)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está en un input o select
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "select" || activeTag === "textarea") {
        return;
      }

      const qCount = examMeta?.questionCount || 30;
      const oCount = examMeta?.optionsCount || 4;
      const validLetters = ["A", "B", "C", "D", "E"].slice(0, oCount);

      const key = e.key.toUpperCase();

      if (validLetters.includes(key)) {
        e.preventDefault();
        setAnswers((prev) => ({
          ...prev,
          [activeQuestion]: key,
        }));
        if (activeQuestion < qCount) {
          setActiveQuestion((q) => q + 1);
        }
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setAnswers((prev) => {
          const next = { ...prev };
          delete next[activeQuestion];
          return next;
        });
        if (e.key === "Backspace" && activeQuestion > 1) {
          setActiveQuestion((q) => q - 1);
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "Tab") {
        e.preventDefault();
        if (activeQuestion < qCount) {
          setActiveQuestion((q) => q + 1);
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeQuestion > 1) {
          setActiveQuestion((q) => q - 1);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSaveCurrent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, activeQuestion, examMeta, answers]);

  // Cambiar alumno y reiniciar estado de respuestas
  const handleSelectStudent = (rut: string) => {
    setSelectedStudentRut(rut);
    setAnswers({});
    setActiveQuestion(1);
    setSaveNotice(null);
  };

  const handleOptionClick = (qNum: number, letter: string) => {
    setActiveQuestion(qNum);
    setAnswers((prev) => {
      const current = prev[qNum];
      if (current === letter) {
        const next = { ...prev };
        delete next[qNum];
        return next;
      }
      return {
        ...prev,
        [qNum]: letter,
      };
    });
  };

  // Guardar alumno actual y avanzar automáticamente
  const handleSaveCurrent = async () => {
    if (!selectedStudentRut) return;

    const answeredCount = Object.keys(answers).length;
    if (answeredCount === 0) {
      alert("No has ingresado ninguna alternativa para este alumno.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await apiFetch<any>(`/teacher/assignments/${assignmentId}/omr-bulk-submit`, {
        method: "POST",
        body: {
          submissions: [
            {
              studentRut: selectedStudentRut,
              answers,
            },
          ],
        },
      });

      const currentStudentObj = students.find((s) => s.rut === selectedStudentRut);
      const studentName = currentStudentObj?.name || selectedStudentRut;
      setSaveNotice(`¡Guardado! ${studentName} calificado con éxito.`);

      // Actualizar estado local del alumno a entregado
      setStudents((prev) =>
        prev.map((s) =>
          s.rut === selectedStudentRut
            ? { ...s, hasSubmission: true, answersCount: answeredCount }
            : s
        )
      );

      // Avanzar al siguiente alumno de la lista
      const currentIndex = students.findIndex((s) => s.rut === selectedStudentRut);
      const nextStudent = students[currentIndex + 1];

      setTimeout(() => {
        if (nextStudent) {
          setSelectedStudentRut(nextStudent.rut);
          setAnswers({});
          setActiveQuestion(1);
          setSaveNotice(null);
        } else {
          setSaveNotice("¡Has completado todos los alumnos de la lista!");
        }
      }, 700);

      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || "Error al guardar respuestas");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentStudent = students.find((s) => s.rut === selectedStudentRut);
  const qCount = examMeta?.questionCount || 30;
  const oCount = examMeta?.optionsCount || 4;
  const letters = ["A", "B", "C", "D", "E"].slice(0, oCount);
  const answeredTotal = Object.keys(answers).length;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
    >
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Encabezado */}
        <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-slate-800 text-white p-4 px-6 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <Keyboard className="w-6 h-6 text-indigo-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Digitador Rápido de Teclado</h2>
                <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Modo Teclado Ultra-Rápido
                </span>
              </div>
              <p className="text-xs text-indigo-200">
                Presiona A, B, C, D en tu teclado físico para avanzar automáticamente de pregunta.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones */}
        {errorMessage && (
          <div className="bg-rose-50 border-b border-rose-200 p-2.5 px-6 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {saveNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 p-2.5 px-6 text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}

        {/* Barra superior de control de alumno */}
        <div className="p-3 px-6 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[280px]">
            <User className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-xs font-bold text-gray-700 whitespace-nowrap">Estudiante:</span>
            <select
              value={selectedStudentRut}
              onChange={(e) => handleSelectStudent(e.target.value)}
              className="flex-1 text-xs border border-gray-300 rounded-lg p-2 font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            >
              {students.map((st, i) => (
                <option key={st.rut} value={st.rut}>
                  {i + 1}. {st.name} ({st.rut}) {st.hasSubmission ? "✓ [Entregado]" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Navegación de alumno anterior / siguiente */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const idx = students.findIndex((s) => s.rut === selectedStudentRut);
                if (idx > 0) handleSelectStudent(students[idx - 1].rut);
              }}
              disabled={students.findIndex((s) => s.rut === selectedStudentRut) <= 0}
              className="p-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-30 text-gray-700 text-xs flex items-center gap-1 font-semibold"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = students.findIndex((s) => s.rut === selectedStudentRut);
                if (idx < students.length - 1) handleSelectStudent(students[idx + 1].rut);
              }}
              disabled={students.findIndex((s) => s.rut === selectedStudentRut) >= students.length - 1}
              className="p-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-30 text-gray-700 text-xs flex items-center gap-1 font-semibold"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Zona Central: Grilla de Preguntas e Indicadores */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Columna Principal: Grilla interactiva de preguntas */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            
            {/* Banner de atajos de teclado */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="font-bold">Atajos activos:</span>
                <span>Usa teclas <kbd className="bg-white border px-1.5 py-0.5 rounded font-mono font-bold">A</kbd>, <kbd className="bg-white border px-1.5 py-0.5 rounded font-mono font-bold">B</kbd>, <kbd className="bg-white border px-1.5 py-0.5 rounded font-mono font-bold">C</kbd>, <kbd className="bg-white border px-1.5 py-0.5 rounded font-mono font-bold">D</kbd> para marcar.</span>
              </div>
              <div className="flex items-center gap-3 text-indigo-700">
                <span><kbd className="bg-white border px-1.5 py-0.5 rounded font-mono font-bold">Flechas</kbd> navegar</span>
                <span><kbd className="bg-white border px-1.5 py-0.5 rounded font-mono font-bold">Borrar</kbd> limpiar</span>
                <span><kbd className="bg-white border px-1.5 py-0.5 rounded font-mono font-bold">Enter</kbd> guardar</span>
              </div>
            </div>

            {/* Grilla de preguntas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: qCount }).map((_, idx) => {
                const qNum = idx + 1;
                const selected = answers[qNum];
                const isActive = activeQuestion === qNum;

                return (
                  <div
                    key={qNum}
                    onClick={() => setActiveQuestion(qNum)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      isActive
                        ? "bg-indigo-50/90 border-indigo-500 shadow ring-2 ring-indigo-400"
                        : selected
                        ? "bg-slate-50 border-gray-300 hover:border-indigo-300"
                        : "bg-white border-dashed border-gray-200 hover:bg-slate-50 text-gray-400"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold w-6 text-right ${isActive ? "text-indigo-900" : "text-gray-700"}`}>
                        {qNum}.
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {letters.map((letra) => {
                        const isChecked = selected === letra;
                        return (
                          <button
                            key={letra}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOptionClick(qNum, letra);
                            }}
                            className={`w-7 h-7 rounded-full font-bold text-xs transition flex items-center justify-center ${
                              isChecked
                                ? "bg-indigo-600 text-white shadow ring-2 ring-indigo-300"
                                : "bg-white border border-gray-300 text-gray-700 hover:bg-indigo-50 hover:border-indigo-400"
                            }`}
                          >
                            {letra}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Barra Lateral: Resumen del Alumno Actual */}
          <div className="w-64 border-l border-gray-200 bg-slate-50 p-4 hidden lg:flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Estudiante Activo
                </span>
                <h4 className="text-sm font-bold text-gray-900 mt-0.5 leading-snug">
                  {currentStudent?.name || "Selecciona un alumno"}
                </h4>
                <p className="text-xs font-mono text-gray-500">{currentStudent?.rut}</p>
              </div>

              <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Preguntas:</span>
                  <span className="font-bold text-gray-800">{qCount}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Contestadas:</span>
                  <span className="font-bold text-indigo-700">{answeredTotal} / {qCount}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mt-1">
                  <div
                    className="bg-indigo-600 h-2 transition-all duration-200"
                    style={{ width: `${(answeredTotal / qCount) * 100}%` }}
                  />
                </div>
              </div>

              {currentStudent?.hasSubmission && (
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs text-emerald-800">
                  <div className="flex items-center gap-1 font-bold">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Ya fue entregado</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Guardar nuevamente sobrescribirá y recalculará su puntaje.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAnswers({})}
                className="w-full text-xs text-gray-600 hover:text-rose-600 bg-white border border-gray-300 hover:border-rose-300 p-2 rounded-xl flex items-center justify-center gap-1.5 transition font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Limpiar Respuestas
              </button>

              <button
                type="button"
                disabled={answeredTotal === 0 || isSaving}
                onClick={handleSaveCurrent}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold p-2.5 rounded-xl flex items-center justify-center gap-2 shadow-md transition"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Guardar y Siguiente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Inferior */}
        <div className="p-3 px-6 bg-slate-100 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition"
          >
            Cerrar Digitador
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:inline">
              {answeredTotal} de {qCount} respuestas listas para {currentStudent?.name?.split(" ")[0] || "el alumno"}.
            </span>

            <button
              type="button"
              disabled={answeredTotal === 0 || isSaving}
              onClick={handleSaveCurrent}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Alumno y Pasar al Siguiente</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
