"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  CloudOff,
  Loader2,
  Check,
  Headphones,
  Maximize2,
  FileText,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiFetch, ApiError, authHeaders } from "@/lib/api";
import { getToken } from "@/lib/session";
import StudentQuestionAudioPlayer, { StudentAudioClip } from "./StudentQuestionAudioPlayer";

// Worker servido desde el propio servidor del colegio (ver scripts/copy-pdf-worker.js)
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const ALL_OPTIONS = ["A", "B", "C", "D", "E"];

interface StartData {
  submissionId: number;
  assignmentId: number;
  exam: { id: number; title: string; subject: string; optionsCount: number };
  questions: { id: number; questionNumber: number; questionType?: string; maxPoints?: number }[];
  audioClips?: StudentAudioClip[];
  answers: Record<string, string>;
  serverNow: string;
  deadline: string;
}

type SaveState = "idle" | "saving" | "saved" | "offline";

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ExamScreen({ assignmentId }: { assignmentId: number }) {
  const router = useRouter();
  const [data, setData] = useState<StartData | null>(null);
  const [fatal, setFatal] = useState<string>("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<{
    id: number;
    questionNumber: number;
    maxPoints?: number;
  } | null>(null);

  // Cola de respuestas pendientes de guardar (questionId -> alternativa o null)
  const pending = useRef<Map<number, string | null>>(new Map());
  const inFlight = useRef(false);
  const clockOffset = useRef(0);
  const finished = useRef(false);
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  // --- Autoguardado ---
  const flush = useCallback(async (): Promise<boolean> => {
    if (!data || inFlight.current || pending.current.size === 0) return pending.current.size === 0;
    inFlight.current = true;
    const batch = Array.from(pending.current.entries());
    pending.current.clear();
    setSaveState("saving");
    try {
      await apiFetch(`/student/submissions/${data.submissionId}/answers`, {
        method: "PUT",
        body: { answers: batch.map(([questionId, selectedAnswer]) => ({ questionId, selectedAnswer })) },
      });
      setSaveState(pending.current.size ? "saving" : "saved");
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        finished.current = true;
        setFatal(e.message);
        return false;
      }
      // Sin conexión: devolver a la cola sin pisar cambios más nuevos
      for (const [q, a] of batch) if (!pending.current.has(q)) pending.current.set(q, a);
      setSaveState("offline");
      return false;
    } finally {
      inFlight.current = false;
      if (pending.current.size > 0 && !finished.current) {
        setTimeout(() => flush(), 200);
      }
    }
  }, [data]);

  // --- Carga / retoma del intento ---
  useEffect(() => {
    apiFetch<StartData>(`/student/assignments/${assignmentId}/start`, { method: "POST" })
      .then((d) => {
        clockOffset.current = new Date(d.serverNow).getTime() - Date.now();
        const restored: Record<number, string> = {};
        for (const [k, v] of Object.entries(d.answers)) restored[Number(k)] = v;

        // Revisar respaldos en localStorage por si hubo desconexión previa o recarga
        for (const q of d.questions) {
          if (q.questionType === "WRITTEN") {
            try {
              const localBackup = localStorage.getItem(`ccg_written_backup_${assignmentId}_${q.id}`);
              if (localBackup && (!restored[q.id] || localBackup.length > (restored[q.id]?.length || 0))) {
                restored[q.id] = localBackup;
                pending.current.set(q.id, localBackup);
              }
            } catch { }
          }
        }

        setAnswers(restored);
        setData(d);
        if (pending.current.size > 0) {
          setTimeout(() => flush(), 500);
        }
      })
      .catch((e) => setFatal(e instanceof ApiError ? e.message : "No se pudo cargar el ensayo"));
  }, [assignmentId, flush]);

  // Reintento periódico si quedó algo pendiente
  useEffect(() => {
    const id = setInterval(() => {
      if (pending.current.size && !inFlight.current) flush();
    }, 3000);
    return () => clearInterval(id);
  }, [flush]);

  // Cerrar modal de desarrollo con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedQuestion) {
        flush();
        setExpandedQuestion(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedQuestion, flush]);

  const handleAnswerSelect = (questionId: number, option: string) => {
    if (finished.current) return;
    const next = answers[questionId] === option ? null : option; // segundo clic desmarca
    setAnswers((prev) => {
      const copy = { ...prev };
      if (next === null) delete copy[questionId];
      else copy[questionId] = next;
      return copy;
    });
    pending.current.set(questionId, next);
    flush();
  };

  const handleWrittenChange = (questionId: number, text: string) => {
    if (finished.current) return;
    const trimmed = text.trim();
    setAnswers((prev) => {
      const copy = { ...prev };
      if (!trimmed) delete copy[questionId];
      else copy[questionId] = text;
      return copy;
    });
    pending.current.set(questionId, trimmed ? text : null);

    // 1. Respaldo inmediato en localStorage contra desconexión o corte de luz
    try {
      if (trimmed) {
        localStorage.setItem(`ccg_written_backup_${assignmentId}_${questionId}`, text);
      } else {
        localStorage.removeItem(`ccg_written_backup_${assignmentId}_${questionId}`);
      }
    } catch { }

    // 2. Autoguardado continuo con debounce corto (800ms)
    setSaveState("saving");
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    autoSaveTimeout.current = setTimeout(() => {
      flush();
    }, 800);
  };

  // --- Entrega ---
  const submitExam = useCallback(
    async (auto = false) => {
      if (!data || finished.current) return;
      setSubmitting(true);
      // Intentar guardar lo pendiente antes de entregar (hasta 3 intentos)
      for (let i = 0; i < 3 && pending.current.size; i++) {
        const ok = await flush();
        if (!ok) await new Promise((r) => setTimeout(r, 1000));
      }
      if (pending.current.size && !auto) {
        setSubmitting(false);
        setConfirmOpen(false);
        setSaveState("offline");
        alert("Hay respuestas sin guardar por problemas de conexión. Revisa tu conexión e inténtalo de nuevo.");
        return;
      }
      try {
        await apiFetch(`/student/submissions/${data.submissionId}/submit`, { method: "POST" });
        finished.current = true;
        // Limpiar respaldos locales tras entrega confirmada
        if (data.questions) {
          for (const q of data.questions) {
            if (q.questionType === "WRITTEN") {
              try {
                localStorage.removeItem(`ccg_written_backup_${assignmentId}_${q.id}`);
              } catch { }
            }
          }
        }
        router.replace("/student");
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          finished.current = true;
          router.replace("/student");
          return;
        }
        setSubmitting(false);
        alert(e instanceof ApiError ? e.message : "No se pudo entregar el ensayo");
      }
    },
    [data, flush, router]
  );

  // --- Temporizador basado en la hora del servidor ---
  useEffect(() => {
    if (!data) return;
    const deadline = new Date(data.deadline).getTime();
    const tick = () => {
      const left = deadline - (Date.now() + clockOffset.current);
      setRemaining(left);
      if (left <= 0 && !finished.current) submitExam(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data, submitExam]);

  // Aviso al cerrar la pestaña si hay respuestas sin guardar
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current.size && !finished.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // El objeto file debe ser estable para que react-pdf no recargue el PDF en cada render
  const pdfFile = useMemo(
    () => ({ url: `/api/student/assignments/${assignmentId}/pdf`, httpHeaders: authHeaders() }),
    [assignmentId]
  );

  if (fatal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white border rounded-xl p-8 max-w-md text-center shadow-sm">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-gray-800 font-semibold mb-4">{fatal}</p>
          <Link href="/student" className="text-blue-600 font-medium hover:underline">
            Volver a mis ensayos
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500 animate-pulse">Preparando ensayo…</div>;
  }

  const options = ALL_OPTIONS.slice(0, data.exam.optionsCount);
  const answerableQuestions = data.questions.filter((q) => q.questionType !== "ORAL");
  const answeredCount = answerableQuestions.filter((q) => Boolean(answers[q.id]?.trim())).length;
  const progress = answerableQuestions.length ? Math.round((answeredCount / answerableQuestions.length) * 100) : 100;
  const lowTime = remaining !== null && remaining < 5 * 60 * 1000;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Panel izquierdo: PDF */}
      <div className="flex-1 flex flex-col border-r border-gray-300 bg-white relative">
        <div className="h-14 flex items-center justify-between px-4 border-b bg-white shadow-sm z-10">
          <div className="min-w-0">
            <p className="text-xs text-blue-600 font-semibold uppercase">{data.exam.subject}</p>
            <h1 className="text-base font-bold text-gray-800 truncate">{data.exam.title}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <SaveIndicator state={saveState} />
            <span
              className={`flex items-center font-mono font-semibold px-2 py-1 rounded ${
                lowTime ? "bg-red-100 text-red-700 animate-pulse" : "text-gray-700"
              }`}
              title="Tiempo restante"
            >
              <Clock className="w-4 h-4 mr-1" /> {remaining !== null ? formatRemaining(remaining) : "--:--:--"}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-200 p-4 flex justify-center">
          <Document
            file={pdfFile}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            className="shadow-lg"
            loading={<div className="animate-pulse text-gray-500">Cargando ensayo…</div>}
            error={
              <div className="text-red-500 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" /> Error al cargar el PDF. Recarga la página.
              </div>
            }
          >
            <Page pageNumber={pageNumber} renderTextLayer={false} renderAnnotationLayer={false} scale={scale} />
          </Document>
        </div>

        <div className="h-12 bg-white border-t flex items-center justify-between px-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
              className="w-8 h-8 flex items-center justify-center border rounded hover:bg-gray-100 text-gray-700 font-bold"
              title="Alejar"
            >
              -
            </button>
            <span className="text-sm text-gray-600 font-medium">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(s => Math.min(3, s + 0.2))}
              className="w-8 h-8 flex items-center justify-center border rounded hover:bg-gray-100 text-gray-700 font-bold"
              title="Acercar"
            >
              +
            </button>
          </div>
          <div className="flex items-center space-x-4">
            <button
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => p - 1)}
              className="flex items-center px-3 py-1 rounded hover:bg-gray-100 disabled:opacity-50 text-gray-700 font-medium"
            >
              <ChevronLeft className="w-5 h-5 mr-1" /> Anterior
            </button>
            <span className="text-sm text-gray-600 font-medium w-32 text-center">
              Página {pageNumber} de {numPages || "--"}
            </span>
            <button
              disabled={pageNumber >= (numPages || 1)}
              onClick={() => setPageNumber((p) => p + 1)}
              className="flex items-center px-3 py-1 rounded hover:bg-gray-100 disabled:opacity-50 text-gray-700 font-medium"
            >
              Siguiente <ChevronRight className="w-5 h-5 ml-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Panel derecho: hoja de respuestas */}
      <div className="w-96 bg-white flex flex-col shadow-xl z-20">
        <div className="h-14 flex items-center px-6 border-b bg-blue-600 text-white">
          <h2 className="text-lg font-bold flex items-center">
            <CheckCircle2 className="w-5 h-5 mr-2" /> Hoja de Respuestas
          </h2>
        </div>

        <div className="p-4 border-b bg-gray-50">
          <div className="flex justify-between text-xs font-medium text-gray-500 mb-1">
            <span>
              {answeredCount} de {answerableQuestions.length} respondidas
            </span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {data.questions.map((q) => {
            // Buscar si esta pregunta tiene un audio asociado
            const matchingClip = (data.audioClips || []).find((c) =>
              c.questionNumbers?.includes(q.questionNumber)
            );
            const isPrimaryForClip =
              matchingClip &&
              matchingClip.questionNumbers?.length > 0 &&
              q.questionNumber === Math.min(...matchingClip.questionNumbers);
            const isSecondaryForClip =
              matchingClip &&
              matchingClip.questionNumbers?.length > 1 &&
              !isPrimaryForClip;

            const token = getToken() || undefined;

            return (
              <div key={q.id} className="space-y-1">
                {isPrimaryForClip && matchingClip && (
                  <StudentQuestionAudioPlayer
                    assignmentId={data.assignmentId}
                    clip={matchingClip}
                    token={token}
                  />
                )}
                {isSecondaryForClip && matchingClip && (
                  <div className="text-[10px] text-blue-800 bg-blue-50 border border-blue-200/80 rounded-md px-2 py-0.5 flex items-center gap-1 font-semibold">
                    <Headphones className="w-3 h-3 text-blue-500" />
                    <span>Responde escuchando el audio de la pregunta {Math.min(...matchingClip.questionNumbers)} ({matchingClip.title})</span>
                  </div>
                )}

                {q.questionType === "WRITTEN" ? (
                  <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/90 shadow-2xs space-y-2 transition-all hover:border-amber-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-gray-800 text-sm">{q.questionNumber}.</span>
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-200">
                          📝 Desarrollo ({q.maxPoints ?? 1} pts)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedQuestion(q)}
                        className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-2 py-1 rounded-md transition shadow-2xs cursor-pointer"
                        title="Abrir editor amplio para escribir cómodamente"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Ampliar</span>
                      </button>
                    </div>

                    <div className="relative">
                      <textarea
                        rows={3}
                        value={answers[q.id] || ""}
                        onChange={(e) => handleWrittenChange(q.id, e.target.value)}
                        onBlur={() => flush()}
                        placeholder="Escribe aquí o pulsa 'Ampliar' para redactar con espacio..."
                        className="w-full text-xs border border-amber-300/90 rounded-lg p-2.5 pb-6 bg-white text-gray-800 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 outline-none resize-y leading-relaxed"
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedQuestion(q)}
                        className="absolute bottom-2 right-2 text-gray-400 hover:text-blue-600 bg-white/95 hover:bg-blue-50 px-1.5 py-0.5 rounded border border-gray-200 transition text-[10px] font-medium flex items-center gap-1 shadow-2xs cursor-pointer"
                        title="Abrir en pantalla completa para ver toda tu respuesta"
                      >
                        <Maximize2 className="w-2.5 h-2.5" />
                        <span>Ver completa</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
                      <span className="font-medium text-amber-900/80">
                        {answers[q.id]?.trim()
                          ? `${answers[q.id].trim().split(/\s+/).filter(Boolean).length} palabras`
                          : "Sin responder aún"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedQuestion(q)}
                        className="text-blue-600 hover:underline font-bold text-[11px] cursor-pointer"
                      >
                        Escribir en modal →
                      </button>
                    </div>
                  </div>
                ) : q.questionType === "ORAL" ? (
                  <div className="flex items-center justify-between bg-purple-50/70 px-3 py-2.5 rounded-lg border border-purple-200">
                    <span className="font-bold text-gray-800 w-8">{q.questionNumber}.</span>
                    <span className="text-xs font-semibold text-purple-800 bg-purple-100 px-2.5 py-1 rounded-md">
                      🗣️ Respuesta Oral ({q.maxPoints ?? 1} pts) — Evaluada por el profesor
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border">
                    <span className="font-bold text-gray-700 w-8">{q.questionNumber}.</span>
                    <div className="flex gap-1.5">
                      {options.map((option) => (
                        <button
                          key={option}
                          onClick={() => handleAnswerSelect(q.id, option)}
                          aria-label={`Pregunta ${q.questionNumber}, alternativa ${option}`}
                          className={`w-9 h-9 rounded-full font-bold border-2 flex items-center justify-center transition-colors ${
                            answers[q.id] === option
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-500"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors disabled:opacity-50"
          >
            Finalizar Ensayo
          </button>
        </div>
      </div>

      {/* Modal Ampliado de Respuesta de Desarrollo */}
      {expandedQuestion && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col h-[88vh] max-h-[850px] border border-slate-200 overflow-hidden">
            {/* Cabecera del Modal */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-amber-600 via-amber-600 to-amber-700 text-white flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-lg text-white border border-white/25 shadow-inner">
                  {expandedQuestion.questionNumber}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      Pregunta {expandedQuestion.questionNumber}: Respuesta de Desarrollo
                    </h3>
                    <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full border border-white/30 backdrop-blur-md">
                      {expandedQuestion.maxPoints ?? 1} {expandedQuestion.maxPoints === 1 ? "punto" : "puntos"}
                    </span>
                  </div>
                  <p className="text-xs text-amber-100 font-medium">
                    {data.exam.title} • {data.exam.subject}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Indicador en tiempo real de autoguardado */}
                <div className="bg-black/25 backdrop-blur-md rounded-full px-3 py-1 flex items-center gap-1.5 text-xs text-white border border-white/15">
                  {saveState === "saving" ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-200" />
                      <span className="font-semibold text-amber-100">Guardando cambios...</span>
                    </>
                  ) : saveState === "offline" ? (
                    <>
                      <CloudOff className="w-3.5 h-3.5 text-red-300" />
                      <span className="font-semibold text-red-200">Guardado local (sin red)</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300 stroke-[3]" />
                      <span className="font-semibold text-emerald-100">Todo guardado</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    flush();
                    setExpandedQuestion(null);
                  }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                  title="Cerrar modal (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Banner de tranquilidad pedagógica */}
            <div className="bg-amber-50/90 border-b border-amber-200/80 px-6 py-2.5 flex items-center justify-between text-xs text-amber-950">
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <span className="font-medium">
                  Escribe con tranquilidad tu desarrollo completo. <strong>Cada palabra se guarda continuamente</strong> en el servidor y en la memoria de este computador para que nunca pierdas nada.
                </span>
              </div>
              <div className="text-[11px] text-gray-500 font-mono hidden md:block">
                Cerrar: <kbd className="px-1.5 py-0.5 bg-white border rounded font-bold text-gray-600 shadow-2xs">Esc</kbd>
              </div>
            </div>

            {/* Área de escritura amplia y cómoda */}
            <div className="flex-1 p-4 sm:p-6 flex flex-col bg-slate-50/60 overflow-hidden">
              <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-300 shadow-inner overflow-hidden focus-within:ring-2 focus-within:ring-amber-500/50 focus-within:border-amber-500 transition">
                <textarea
                  autoFocus
                  value={answers[expandedQuestion.id] || ""}
                  onChange={(e) => handleWrittenChange(expandedQuestion.id, e.target.value)}
                  onBlur={() => flush()}
                  placeholder="Escribe aquí tu respuesta, fundamentación, cálculos o explicación completa..."
                  className="w-full flex-1 p-4 sm:p-6 text-gray-800 text-base sm:text-lg leading-relaxed outline-none resize-none placeholder:text-gray-400 font-sans selection:bg-amber-100 selection:text-amber-900 overflow-y-auto"
                  spellCheck="true"
                />
              </div>
            </div>

            {/* Barra de herramientas inferior */}
            <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4 text-xs text-gray-600 font-medium">
                <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    <strong>{answers[expandedQuestion.id]?.trim() ? answers[expandedQuestion.id].trim().split(/\s+/).filter(Boolean).length : 0}</strong> palabras
                  </span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  <span>
                    <strong>{answers[expandedQuestion.id]?.length || 0}</strong> caracteres
                  </span>
                </div>

                <span className="text-emerald-700 font-semibold hidden md:flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Respaldo continuo activo
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    await flush();
                  }}
                  disabled={saveState === "saving"}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                  title="Guardar de inmediato en el servidor"
                >
                  {saveState === "saving" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-blue-600" />
                  )}
                  <span>Guardar ahora</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    flush();
                    setExpandedQuestion(null);
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer active:scale-98"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Listo, volver al ensayo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Entregar el ensayo?</h3>
            <p className="text-sm text-gray-600 mb-1">
              Respondiste <b>{answeredCount}</b> de <b>{answerableQuestions.length}</b> preguntas.
            </p>
            {answeredCount < answerableQuestions.length && (
              <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded mt-2">
                Tienes {answerableQuestions.length - answeredCount} pregunta(s) sin responder.
              </p>
            )}
            <p className="text-sm text-gray-600 mt-3">Una vez entregado no podrás modificar tus respuestas.</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="flex-1 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Seguir respondiendo
              </button>
              <button
                onClick={() => submitExam(false)}
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
              >
                {submitting ? "Entregando…" : "Entregar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {submitting && !confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 flex items-center">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Entregando ensayo…
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="flex items-center text-gray-500">
        <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Guardando…
      </span>
    );
  if (state === "saved")
    return (
      <span className="flex items-center text-green-600">
        <Check className="w-4 h-4 mr-1" /> Guardado
      </span>
    );
  if (state === "offline")
    return (
      <span className="flex items-center text-red-600" title="Tus respuestas se guardarán al recuperar la conexión">
        <CloudOff className="w-4 h-4 mr-1" /> Sin conexión, reintentando…
      </span>
    );
  return null;
}
