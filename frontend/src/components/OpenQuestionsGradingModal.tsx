"use client";

import { useEffect, useState } from "react";
import { X, Check, ChevronRight, ChevronLeft, PenTool, Mic, Save, CheckCircle2, Clock, User } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface OpenQuestionInfo {
  id: number;
  questionNumber: number;
  questionType: "WRITTEN" | "ORAL" | string;
  maxPoints: number;
  skill?: string | null;
  axis?: string | null;
  learningObjective?: string | null;
}

interface StudentOpenData {
  rut: string;
  name: string;
  state: string;
  grade?: number | null;
  percent?: number | null;
  simceScore?: number | null;
  correctCount?: number | null;
  openGradedCount?: number;
  openTotalCount?: number;
  openAnswers?: Record<
    number,
    {
      questionId: number;
      questionType: string;
      maxPoints: number;
      selectedAnswer: string | null;
      awardedPoints: number | null;
    }
  >;
}

interface OpenQuestionsGradingModalProps {
  assignmentId: number;
  isOpen: boolean;
  onClose: () => void;
  openQuestions: OpenQuestionInfo[];
  students: StudentOpenData[];
  initialStudentRut?: string | null;
  onSuccess: () => void;
}

export default function OpenQuestionsGradingModal({
  assignmentId,
  isOpen,
  onClose,
  openQuestions,
  students,
  initialStudentRut,
  onSuccess,
}: OpenQuestionsGradingModalProps) {
  const [selectedRut, setSelectedRut] = useState<string>("");
  const [scores, setScores] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialStudentRut && students.some((s) => s.rut === initialStudentRut)) {
      setSelectedRut(initialStudentRut);
    } else if (students.length > 0 && !selectedRut) {
      const firstSubmitted = students.find((s) => s.state === "SUBMITTED") || students[0];
      setSelectedRut(firstSubmitted.rut);
    }
  }, [isOpen, initialStudentRut, students]);

  const currentStudent = students.find((s) => s.rut === selectedRut) || students[0] || null;
  const currentIndex = currentStudent ? students.findIndex((s) => s.rut === currentStudent.rut) : -1;

  useEffect(() => {
    if (!currentStudent) return;
    const initScores: Record<number, string> = {};
    openQuestions.forEach((oq) => {
      const ans = currentStudent.openAnswers?.[oq.questionNumber];
      initScores[oq.questionNumber] =
        ans?.awardedPoints !== null && ans?.awardedPoints !== undefined ? String(ans.awardedPoints) : "";
    });
    setScores(initScores);
    setFeedbackMsg(null);
  }, [currentStudent?.rut, openQuestions]);

  if (!isOpen || openQuestions.length === 0) return null;

  const handleScoreChange = (qNum: number, maxPts: number, rawVal: string) => {
    if (rawVal === "") {
      setScores((prev) => ({ ...prev, [qNum]: "" }));
      return;
    }
    const num = parseFloat(rawVal.replace(",", "."));
    if (isNaN(num)) return;
    const clamped = Math.max(0, Math.min(maxPts, num));
    setScores((prev) => ({ ...prev, [qNum]: String(clamped) }));
  };

  const handleSave = async (goNext = false) => {
    if (!currentStudent) return;
    setSaving(true);
    setFeedbackMsg(null);
    try {
      const payloadScores: Record<number, number | null> = {};
      openQuestions.forEach((oq) => {
        const val = scores[oq.questionNumber];
        if (val === undefined || val === "") {
          payloadScores[oq.questionNumber] = null;
        } else {
          const parsed = parseFloat(val);
          payloadScores[oq.questionNumber] = isNaN(parsed) ? null : parsed;
        }
      });

      const res = await apiFetch<any>(`/teacher/assignments/${assignmentId}/grade-open-questions`, {
        method: "POST",
        body: {
          studentRut: currentStudent.rut,
          scores: payloadScores,
        },
      });

      onSuccess();

      if (goNext && currentIndex >= 0 && currentIndex < students.length - 1) {
        setSelectedRut(students[currentIndex + 1].rut);
      } else {
        setFeedbackMsg(
          `Guardado: Nota ${res.submission?.grade?.toFixed(1) || "-"} (${Math.round(res.submission?.percent || 0)}% logro)`
        );
      }
    } catch (err: any) {
      alert(err.message || "Error al guardar puntajes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-indigo-700 to-purple-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <PenTool className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Revisión de Preguntas de Desarrollo Escrito y Oral
              </h2>
              <p className="text-xs text-indigo-100">
                Ingresa el puntaje obtenido por cada estudiante (ej. Pregunta 25: 3 pts de 7). La nota y el puntaje se recalculan al instante.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Sidebar de Estudiantes */}
          <div className="md:col-span-4 border-r border-slate-200 bg-slate-50 flex flex-col overflow-hidden max-h-[35vh] md:max-h-none">
            <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Estudiantes ({students.length})
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {openQuestions.length} preg. abierta(s)
              </span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70">
              {students.map((st) => {
                const isSelected = st.rut === currentStudent?.rut;
                const graded = st.openGradedCount || 0;
                const total = openQuestions.length;
                const allGraded = graded >= total && total > 0;

                return (
                  <button
                    key={st.rut}
                    type="button"
                    onClick={() => setSelectedRut(st.rut)}
                    className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 transition ${
                      isSelected
                        ? "bg-indigo-50 border-l-4 border-indigo-600"
                        : "hover:bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`text-xs font-bold truncate ${isSelected ? "text-indigo-950" : "text-slate-800"}`}>
                        {st.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                        <span>{st.rut}</span>
                        {st.grade != null && (
                          <span className="font-sans font-bold text-blue-700">Nota: {st.grade.toFixed(1)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {allGraded ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3" /> {graded}/{total}
                        </span>
                      ) : graded > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock className="w-3 h-3" /> {graded}/{total}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                          0/{total}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel de Calificación del Estudiante Seleccionado */}
          <div className="md:col-span-8 flex flex-col overflow-hidden bg-white">
            {currentStudent ? (
              <>
                {/* Barra Superior Estudiante */}
                <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{currentStudent.name}</h3>
                      <p className="text-xs text-slate-500">
                        RUT: <span className="font-mono">{currentStudent.rut}</span> •{" "}
                        {currentStudent.grade != null ? (
                          <span className="font-bold text-blue-700">
                            Nota Actual: {currentStudent.grade.toFixed(1)} ({Math.round(currentStudent.percent || 0)}%)
                          </span>
                        ) : (
                          <span>Sin entrega previa (se creará al guardar)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentIndex <= 0}
                      onClick={() => currentIndex > 0 && setSelectedRut(students[currentIndex - 1].rut)}
                      className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700"
                      title="Estudiante anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-slate-600 px-2">
                      {currentIndex + 1} / {students.length}
                    </span>
                    <button
                      type="button"
                      disabled={currentIndex >= students.length - 1}
                      onClick={() => currentIndex < students.length - 1 && setSelectedRut(students[currentIndex + 1].rut)}
                      className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700"
                      title="Siguiente estudiante"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Lista de Preguntas Abiertas */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {feedbackMsg && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{feedbackMsg}</span>
                    </div>
                  )}

                  {openQuestions.map((oq) => {
                    const isOral = oq.questionType === "ORAL";
                    const maxPts = Number(oq.maxPoints) || 1;
                    const studentAns = currentStudent.openAnswers?.[oq.questionNumber];
                    const currentVal = scores[oq.questionNumber] ?? "";
                    const numVal = currentVal !== "" ? parseFloat(currentVal) : null;

                    // Quick score buttons (0..maxPts if maxPts <= 10)
                    const quickSteps =
                      maxPts <= 10 && Number.isInteger(maxPts)
                        ? Array.from({ length: maxPts + 1 }, (_, i) => i)
                        : [0, Math.round((maxPts / 2) * 10) / 10, maxPts];

                    return (
                      <div
                        key={oq.questionNumber}
                        className={`rounded-2xl border p-4 space-y-3 shadow-2xs ${
                          isOral ? "border-purple-200 bg-purple-50/30" : "border-amber-200 bg-amber-50/30"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-black">
                              Pregunta {oq.questionNumber}
                            </span>
                            {isOral ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-100 text-purple-900 border border-purple-300 text-xs font-extrabold">
                                <Mic className="w-3.5 h-3.5 text-purple-700" />
                                🗣️ Desarrollo Oral
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold">
                                <PenTool className="w-3.5 h-3.5 text-amber-700" />
                                📝 Desarrollo Escrito
                              </span>
                            )}
                            {(oq.axis || oq.skill || oq.learningObjective) && (
                              <span className="text-[11px] text-slate-500 font-medium">
                                {[oq.axis, oq.skill, oq.learningObjective].filter(Boolean).join(" • ")}
                              </span>
                            )}
                          </div>

                          <div className="text-xs font-extrabold text-slate-700">
                            Puntaje Máximo: <span className="text-indigo-700">{maxPts} pts</span>
                          </div>
                        </div>

                        {/* Respuesta escrita en línea (si el alumno rindió digital) */}
                        {!isOral && studentAns?.selectedAnswer && (
                          <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 space-y-1">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              Respuesta digitada por el estudiante:
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed font-medium">
                              {studentAns.selectedAnswer}
                            </div>
                          </div>
                        )}

                        {/* Selector de Puntaje */}
                        <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-600 mr-1">Asignar rápido:</span>
                            {quickSteps.map((pt) => {
                              const active = numVal === pt;
                              return (
                                <button
                                  key={pt}
                                  type="button"
                                  onClick={() => handleScoreChange(oq.questionNumber, maxPts, String(pt))}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-black border transition ${
                                    active
                                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                                      : "bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-300"
                                  }`}
                                >
                                  {pt}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-xs font-extrabold text-slate-700">Puntaje:</label>
                            <input
                              type="number"
                              min={0}
                              max={maxPts}
                              step="0.5"
                              placeholder="0"
                              value={currentVal}
                              onChange={(e) => handleScoreChange(oq.questionNumber, maxPts, e.target.value)}
                              className="w-20 border-2 border-indigo-300 focus:border-indigo-600 rounded-lg px-2.5 py-1 text-center text-sm font-black text-indigo-950 outline-none"
                            />
                            <span className="text-xs font-bold text-slate-600">de {maxPts} pts</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer de Guardado */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700"
                  >
                    Cerrar
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSave(false)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 transition"
                    >
                      <Save className="w-4 h-4" />
                      <span>{saving ? "Guardando..." : "Guardar Puntajes"}</span>
                    </button>

                    {currentIndex < students.length - 1 && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSave(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs disabled:opacity-50 transition"
                      >
                        <Check className="w-4 h-4" />
                        <span>Guardar y Siguiente Alumno</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-500 text-sm">
                Selecciona un estudiante para calificar sus preguntas de desarrollo.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
