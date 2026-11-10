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
  FlaskConical,
  RotateCcw,
  Sparkles,
  Target,
  BarChart2,
  UserCheck,
  ArrowLeft,
} from "lucide-react";
import { apiFetch, ApiError, authHeaders } from "@/lib/api";
import { getToken } from "@/lib/session";
import { useIsPruebas } from "@/lib/useIsPruebas";
import StudentQuestionAudioPlayer, { StudentAudioClip } from "./StudentQuestionAudioPlayer";

// Worker servido desde el propio servidor del colegio (ver scripts/copy-pdf-worker.js)
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const ALL_OPTIONS = ["A", "B", "C", "D", "E"];

interface StartData {
  submissionId: number;
  assignmentId: number;
  isMock?: boolean;
  mockStudent?: {
    name: string;
    rut: string;
    courseName: string;
  };
  exam: {
    id: number;
    title: string;
    subject: string;
    level?: string;
    optionsCount: number;
    durationMinutes?: number;
    pdfVersion?: string;
    hasPdfFile?: boolean;
    gradingMode?: "SIMCE" | "NORMAL";
    passThreshold?: number;
    passThresholdPercent?: number;
  };
  questions: { id: number; questionNumber: number; questionType?: string; maxPoints?: number }[];
  audioClips?: StudentAudioClip[];
  answers: Record<string, string>;
  serverNow: string;
  deadline: string;
}

interface MockQuestionAudit {
  questionId: number;
  questionNumber: number;
  questionType: string;
  selected: string | null;
  correctAnswer: string;
  isCorrect: boolean | null;
  awardedPoints: number | null;
  maxPoints: number;
  skill: string | null;
  axis: string | null;
  learningObjective: string | null;
}

interface MockGradeResult {
  isMock: boolean;
  exam: {
    id: number;
    title: string;
    subject: string;
    level?: string;
    optionsCount: number;
    gradingMode?: "SIMCE" | "NORMAL";
    passThreshold?: number;
    passThresholdPercent?: number;
  };
  submittedAt: string;
  questionCount?: number;
  hasWeightedPoints?: boolean;
  correctCount: number;
  total: number;
  maxPoints: number;
  earnedPoints: number;
  percent: number;
  grade: number;
  achievementLevel: string;
  simceScore: number | null;
  theta: number | null;
  seTheta: number | null;
  gradingMode?: "SIMCE" | "NORMAL";
  passThreshold?: number;
  passThresholdPercent?: number;
  bySkill: { name: string; total: number; correct: number; percent: number }[];
  byAxis: { name: string; total: number; correct: number; percent: number }[];
  perQuestion: MockQuestionAudit[];
}

type SaveState = "idle" | "saving" | "saved" | "offline";

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ExamScreen({
  assignmentId = 0,
  mockExamId,
}: {
  assignmentId?: number;
  mockExamId?: number;
}) {
  const router = useRouter();
  const isPruebas = useIsPruebas();
  const isMock = Boolean(mockExamId);

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

  // Estado específico para Mocktest (sin impacto en BD)
  const [mockResult, setMockResult] = useState<MockGradeResult | null>(null);
  const [mockResetKey, setMockResetKey] = useState(0);
  const [mockOpenPoints, setMockOpenPoints] = useState<Record<number, string>>({});
  const [regradingMock, setRegradingMock] = useState(false);
  const [showAuditTable, setShowAuditTable] = useState(true);

  // Cola y refs síncronas para autoguardado sin cierres obsoletos
  const pending = useRef<Map<number, string | null>>(new Map());
  const inFlight = useRef(false);
  const clockOffset = useRef(0);
  const finished = useRef(false);
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef<StartData | null>(null);
  const answersRef = useRef<Record<number, string>>({});

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // --- Autoguardado ---
  const flush = useCallback(async (): Promise<boolean> => {
    const currentData = dataRef.current;
    if (!currentData) return pending.current.size === 0;

    if (isMock && mockExamId) {
      if (pending.current.size === 0) return true;
      pending.current.clear();
      setSaveState("saving");
      try {
        sessionStorage.setItem(`ccg_mock_answers_${mockExamId}`, JSON.stringify(answersRef.current));
      } catch {}
      setTimeout(() => {
        if (!finished.current) setSaveState("saved");
      }, 150);
      return true;
    }

    if (inFlight.current || pending.current.size === 0) return pending.current.size === 0;
    inFlight.current = true;
    const batch = Array.from(pending.current.entries());
    pending.current.clear();
    setSaveState("saving");
    try {
      await apiFetch(`/student/submissions/${currentData.submissionId}/answers`, {
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
  }, [isMock, mockExamId]);

  // --- Carga / retoma del intento o sesión Mocktest ---
  useEffect(() => {
    let cancelled = false;
    setFatal("");

    const endpoint = isMock && mockExamId
      ? `/admin/exams/${mockExamId}/mock-session`
      : `/student/assignments/${assignmentId}/start`;

    apiFetch<StartData>(endpoint, { method: "POST" })
      .then((d) => {
        if (cancelled) return;
        clockOffset.current = new Date(d.serverNow).getTime() - Date.now();
        const restored: Record<number, string> = {};
        for (const [k, v] of Object.entries(d.answers || {})) restored[Number(k)] = v;

        if (isMock && mockExamId) {
          try {
            const storedMock = sessionStorage.getItem(`ccg_mock_answers_${mockExamId}`);
            if (storedMock) {
              const parsed = JSON.parse(storedMock);
              if (parsed && typeof parsed === "object") {
                for (const [k, v] of Object.entries(parsed)) {
                  if (typeof v === "string" && v) restored[Number(k)] = v;
                }
              }
            }
          } catch {}
        } else {
          // Revisar respaldos en localStorage por si hubo desconexión previa o recarga
          for (const q of d.questions) {
            if (q.questionType === "WRITTEN") {
              try {
                const localBackup = localStorage.getItem(`ccg_written_backup_${assignmentId}_${q.id}`);
                if (localBackup && (!restored[q.id] || localBackup.length > (restored[q.id]?.length || 0))) {
                  restored[q.id] = localBackup;
                  pending.current.set(q.id, localBackup);
                }
              } catch {}
            }
          }
        }

        answersRef.current = restored;
        setAnswers(restored);
        dataRef.current = d;
        setData(d);
        if (!isMock && pending.current.size > 0) {
          setTimeout(() => flush(), 500);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setFatal(e instanceof ApiError ? e.message : "No se pudo cargar el ensayo");
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentId, isMock, mockExamId, mockResetKey, flush]);

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
    const next = answersRef.current[questionId] === option ? null : option; // segundo clic desmarca
    const nextMap = { ...answersRef.current };
    if (next === null) delete nextMap[questionId];
    else nextMap[questionId] = next;
    answersRef.current = nextMap;
    setAnswers(nextMap);
    pending.current.set(questionId, next);
    flush();
  };

  const handleWrittenChange = (questionId: number, text: string) => {
    if (finished.current) return;
    const trimmed = text.trim();
    const nextMap = { ...answersRef.current };
    if (!trimmed) delete nextMap[questionId];
    else nextMap[questionId] = text;
    answersRef.current = nextMap;
    setAnswers(nextMap);
    pending.current.set(questionId, trimmed ? text : null);

    // 1. Respaldo inmediato contra desconexión o corte de luz
    try {
      if (isMock && mockExamId) {
        sessionStorage.setItem(`ccg_mock_answers_${mockExamId}`, JSON.stringify(nextMap));
      } else if (trimmed) {
        localStorage.setItem(`ccg_written_backup_${assignmentId}_${questionId}`, text);
      } else {
        localStorage.removeItem(`ccg_written_backup_${assignmentId}_${questionId}`);
      }
    } catch {}

    // 2. Autoguardado continuo con debounce corto (800ms)
    setSaveState("saving");
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    autoSaveTimeout.current = setTimeout(() => {
      flush();
    }, 800);
  };

  const handleResetMock = useCallback(() => {
    if (!isMock || !mockExamId) return;
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    pending.current.clear();
    finished.current = false;
    answersRef.current = {};
    setAnswers({});
    setMockResult(null);
    setMockOpenPoints({});
    setConfirmOpen(false);
    setExpandedQuestion(null);
    setPageNumber(1);
    setSaveState("idle");
    setRemaining(null);
    setData(null);
    dataRef.current = null;
    try {
      sessionStorage.removeItem(`ccg_mock_answers_${mockExamId}`);
      const prefix = `ccg_mock_audio_plays_${mockExamId}_`;
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(prefix)) sessionStorage.removeItem(k);
      }
    } catch {}
    setMockResetKey((k) => k + 1);
  }, [isMock, mockExamId]);

  const handleFillMockRandom = useCallback(() => {
    const currentData = dataRef.current;
    if (!isMock || !mockExamId || !currentData || finished.current) return;
    const opts = ALL_OPTIONS.slice(0, currentData.exam.optionsCount || 4);
    const nextMap: Record<number, string> = { ...answersRef.current };
    for (const q of currentData.questions) {
      const qType = q.questionType || "MULTIPLE_CHOICE";
      if (qType === "MULTIPLE_CHOICE") {
        nextMap[q.id] = opts[Math.floor(Math.random() * opts.length)];
      } else if (qType === "WRITTEN" && !nextMap[q.id]?.trim()) {
        nextMap[q.id] = `Respuesta simulada de prueba para pregunta ${q.questionNumber}.`;
      }
    }
    answersRef.current = nextMap;
    setAnswers(nextMap);
    try {
      sessionStorage.setItem(`ccg_mock_answers_${mockExamId}`, JSON.stringify(nextMap));
    } catch {}
    setSaveState("saved");
  }, [isMock, mockExamId]);

  const handleCloseMockTab = () => {
    window.close();
    setTimeout(() => {
      if (!window.closed) {
        router.push("/admin/exams");
      }
    }, 150);
  };

  // --- Entrega ---
  const submitExam = useCallback(
    async (auto = false) => {
      const currentData = dataRef.current;
      if (!currentData || finished.current) return;
      setSubmitting(true);

      if (isMock && mockExamId) {
        try {
          const result = await apiFetch<MockGradeResult>(`/admin/exams/${mockExamId}/mock-grade`, {
            method: "POST",
            body: { answers: answersRef.current },
          });
          finished.current = true;
          pending.current.clear();
          try {
            sessionStorage.removeItem(`ccg_mock_answers_${mockExamId}`);
          } catch {}
          const initialOpen: Record<number, string> = {};
          for (const pq of result.perQuestion || []) {
            if (pq.questionType === "WRITTEN" || pq.questionType === "ORAL") {
              initialOpen[pq.questionId] = pq.awardedPoints !== null ? String(pq.awardedPoints) : "";
            }
          }
          setMockOpenPoints(initialOpen);
          setMockResult(result);
          setConfirmOpen(false);
        } catch (e) {
          alert(e instanceof ApiError ? e.message : "No se pudo evaluar el Mocktest");
        } finally {
          setSubmitting(false);
        }
        return;
      }

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
        await apiFetch(`/student/submissions/${currentData.submissionId}/submit`, { method: "POST" });
        finished.current = true;
        // Limpiar respaldos locales tras entrega confirmada
        if (currentData.questions) {
          for (const q of currentData.questions) {
            if (q.questionType === "WRITTEN") {
              try {
                localStorage.removeItem(`ccg_written_backup_${assignmentId}_${q.id}`);
              } catch {}
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
    [assignmentId, flush, isMock, mockExamId, router]
  );

  const handleRecalculateMockWithOpenPoints = useCallback(async () => {
    if (!isMock || !mockExamId) return;
    setRegradingMock(true);
    try {
      const awardedPoints: Record<number, number> = {};
      for (const [qIdStr, valStr] of Object.entries(mockOpenPoints)) {
        if (valStr.trim() !== "") {
          const num = Number(valStr);
          if (!Number.isNaN(num)) awardedPoints[Number(qIdStr)] = num;
        }
      }
      const updated = await apiFetch<MockGradeResult>(`/admin/exams/${mockExamId}/mock-grade`, {
        method: "POST",
        body: { answers: answersRef.current, awardedPoints },
      });
      setMockResult(updated);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Error al recalcular puntajes");
    } finally {
      setRegradingMock(false);
    }
  }, [isMock, mockExamId, mockOpenPoints]);

  // --- Temporizador basado en la hora del servidor ---
  useEffect(() => {
    if (!data || mockResult) return;
    const deadline = new Date(data.deadline).getTime();
    const tick = () => {
      const left = deadline - (Date.now() + clockOffset.current);
      setRemaining(left);
      if (left <= 0 && !finished.current) submitExam(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data, mockResult, submitExam]);

  // Aviso al cerrar la pestaña si hay respuestas sin guardar (solo modo real)
  useEffect(() => {
    if (isMock) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current.size && !finished.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isMock]);

  const pdfVersion = data?.exam?.pdfVersion || "";

  // El objeto file debe ser estable para que react-pdf no recargue el PDF en cada render
  const pdfFile = useMemo(
    () => {
      if (isMock && mockExamId) {
        return {
          url: pdfVersion
            ? `/api/exams/${mockExamId}/pdf?v=${encodeURIComponent(pdfVersion)}`
            : `/api/exams/${mockExamId}/pdf`,
          httpHeaders: authHeaders(),
        };
      }
      return {
        url: pdfVersion
          ? `/api/student/assignments/${assignmentId}/pdf?v=${encodeURIComponent(pdfVersion)}`
          : `/api/student/assignments/${assignmentId}/pdf`,
        httpHeaders: authHeaders(),
      };
    },
    [assignmentId, isMock, mockExamId, pdfVersion]
  );

  // --- Pantallas tempranas (SIEMPRE después de todos los hooks) ---
  if (fatal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white border rounded-xl p-8 max-w-md text-center shadow-sm">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-gray-800 font-semibold mb-4">{fatal}</p>
          <Link href={isMock ? "/admin/exams" : "/student"} className="text-blue-600 font-medium hover:underline">
            {isMock ? "Volver al catálogo" : "Volver a mis ensayos"}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 animate-pulse">
        {isMock ? "Preparando Mocktest…" : "Preparando ensayo…"}
      </div>
    );
  }

  // --- Pantalla de Resultados del Mocktest (aislada, sin impacto en BD) ---
  if (isMock && mockResult) {
    const hasOpenQuestions = (mockResult.perQuestion || []).some(
      (q) => q.questionType === "WRITTEN" || q.questionType === "ORAL"
    );
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Barra Superior Mocktest */}
        <div className="bg-slate-900 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 shadow-sm">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-emerald-500 text-slate-950 font-black text-[11px] px-2.5 py-1 rounded-full uppercase tracking-wider">
              <FlaskConical className="w-3.5 h-3.5" /> Mocktest Finalizado
            </span>
            <span className="text-xs text-slate-200 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <strong>{data.mockStudent?.name || "Estudiante Simulado"}</strong>
              <span className="text-slate-400">({data.mockStudent?.rut || "99.999.999-K"})</span>
            </span>
            <span className="text-[11px] bg-slate-800 text-amber-300 border border-slate-700 px-2 py-0.5 rounded-md font-semibold">
              Simulación aislada: no guarda datos en estadísticas reales
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetMock}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Volver a rendir Mocktest
            </button>
            <Link
              href="/admin/exams"
              className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Catálogo
            </Link>
            <button
              type="button"
              onClick={handleCloseMockTab}
              className="inline-flex items-center gap-1 bg-slate-800 hover:bg-rose-700 text-slate-200 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cerrar pestaña
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 max-w-5xl w-full mx-auto space-y-6">
          {/* Resumen Vista Estudiante */}
          <div className="bg-white border rounded-2xl p-6 sm:p-8 shadow-sm text-center">
            <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full mb-3">
              Resultado Simulado (Vista del Estudiante)
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{mockResult.exam.title}</h1>
            <p className="text-gray-500 text-sm mb-6">
              {mockResult.exam.subject} · Simulado el {new Date(mockResult.submittedAt).toLocaleString()}
            </p>

            {mockResult.gradingMode === "NORMAL" && (
              <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-xl px-4 py-2 text-xs font-bold mb-6">
                <span>
                  Escala Prueba Normal (1,0 a 7,0) · Exigencia {mockResult.passThresholdPercent ?? mockResult.exam?.passThresholdPercent ?? 60}% para nota 4,0
                </span>
              </div>
            )}

            {mockResult.simceScore != null && mockResult.gradingMode !== "NORMAL" ? (
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-6 mb-6 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-left">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                    Resultado Estandarizado Simulado
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-4xl font-extrabold">{mockResult.simceScore}</span>
                    <span className="text-lg font-medium text-blue-200">
                      {isPruebas ? "puntos" : "puntos SIMCE"}
                    </span>
                  </div>
                  <p className="text-xs text-blue-100 mt-1">
                    Calculado con el motor real TRI 3PL (theta: {mockResult.theta?.toFixed(2)}).
                  </p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-5 py-3 text-center">
                  <span className="text-[11px] uppercase tracking-wider text-blue-200 block">
                    Estándar de Aprendizaje
                  </span>
                  <span className="text-xl font-bold text-white block mt-0.5">
                    {mockResult.achievementLevel || "N/A"}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-sm text-blue-600 font-medium mb-1">Nota Escolar</p>
                <p className="text-3xl font-bold text-blue-900">{mockResult.grade?.toFixed(1)}</p>
                <p className="text-[11px] text-blue-600/80 font-medium mt-0.5">
                  Exigencia {mockResult.passThresholdPercent ?? mockResult.exam?.passThresholdPercent ?? 60}%
                </p>
              </div>
              <div className="bg-purple-50 rounded-xl p-4">
                <p className="text-sm text-purple-600 font-medium mb-1">Logro</p>
                <p className="text-2xl font-bold text-purple-900 leading-tight">
                  {mockResult.achievementLevel || "N/A"}
                </p>
              </div>
              {(() => {
                const showAsPoints = Boolean(
                  mockResult.hasWeightedPoints ||
                  mockResult.gradingMode === "NORMAL" ||
                  mockResult.maxPoints !== mockResult.total
                );
                return (
                  <div className="bg-green-50 rounded-xl p-4">
                    <p className="text-sm text-green-600 font-medium mb-1">
                      {showAsPoints ? "Puntaje" : "Correctas"}
                    </p>
                    <p className="text-3xl font-bold text-green-900">
                      {showAsPoints
                        ? `${mockResult.earnedPoints} / ${mockResult.maxPoints}`
                        : `${mockResult.correctCount} / ${mockResult.total}`}
                    </p>
                    {showAsPoints && (
                      <p className="text-[11px] text-green-600/80 font-medium mt-0.5">
                        puntos ({(mockResult.perQuestion || []).filter((p) => p.isCorrect).length}/{mockResult.questionCount ?? (mockResult.perQuestion || []).length} buenas)
                      </p>
                    )}
                  </div>
                );
              })()}
              <div className="bg-orange-50 rounded-xl p-4">
                <p className="text-sm text-orange-600 font-medium mb-1">% de Logro</p>
                <p className="text-3xl font-bold text-orange-900">{Math.round(mockResult.percent)}%</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-500" /> Logro por Habilidad
              </h2>
              <div className="space-y-4">
                {!mockResult.bySkill || mockResult.bySkill.length === 0 ? (
                  <p className="text-gray-500 text-sm">No hay habilidades registradas.</p>
                ) : (
                  mockResult.bySkill.map((item) => {
                    const pct = Math.round(item.percent ?? 0);
                    return (
                      <div key={item.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{item.name}</span>
                          <span className="text-gray-500">
                            {item.correct}/{item.total} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-purple-500" /> Logro por Eje Temático
              </h2>
              <div className="space-y-4">
                {!mockResult.byAxis || mockResult.byAxis.length === 0 ? (
                  <p className="text-gray-500 text-sm">No hay ejes registrados.</p>
                ) : (
                  mockResult.byAxis.map((item) => {
                    const pct = Math.round(item.percent ?? 0);
                    return (
                      <div key={item.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{item.name}</span>
                          <span className="text-gray-500">
                            {item.correct}/{item.total} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
                            }`}
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

          {/* Auditoría de pauta para Admin */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  Auditoría de Pauta y Preguntas (Vista Admin Mocktest)
                </h3>
                <p className="text-xs text-slate-500">
                  Verifica pregunta a pregunta cómo responde la corrección oficial frente a tus respuestas simuladas.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasOpenQuestions && (
                  <button
                    type="button"
                    onClick={handleRecalculateMockWithOpenPoints}
                    disabled={regradingMock}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {regradingMock ? "Recalculando..." : "Simular puntaje desarrollo"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAuditTable((v) => !v)}
                  className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                >
                  {showAuditTable ? "Ocultar detalle" : "Ver detalle por pregunta"}
                </button>
              </div>
            </div>

            {showAuditTable && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[11px]">
                    <tr>
                      <th className="p-3 text-center w-12">N°</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Respuesta Simulada</th>
                      <th className="p-3">Pauta Oficial</th>
                      <th className="p-3">Eje / Habilidad / OA</th>
                      <th className="p-3 text-center">Puntaje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(mockResult.perQuestion || []).map((q) => {
                      const isOpen = q.questionType === "WRITTEN" || q.questionType === "ORAL";
                      return (
                        <tr key={q.questionId} className="hover:bg-slate-50/70">
                          <td className="p-3 text-center font-bold text-slate-800">{q.questionNumber}</td>
                          <td className="p-3 font-semibold text-slate-700">
                            {q.questionType === "WRITTEN"
                              ? "📝 Desarrollo"
                              : q.questionType === "ORAL"
                              ? "🗣️ Oral"
                              : "🔘 Alternativa"}
                          </td>
                          <td className="p-3 max-w-xs">
                            {q.selected ? (
                              <span className="font-mono font-bold text-slate-900 break-words whitespace-pre-wrap">
                                {q.selected}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Sin responder</span>
                            )}
                          </td>
                          <td className="p-3 font-mono font-bold text-blue-700">{q.correctAnswer || "-"}</td>
                          <td className="p-3 text-slate-600">
                            {[q.axis, q.skill, q.learningObjective].filter(Boolean).join(" · ") || "-"}
                          </td>
                          <td className="p-3 text-center">
                            {isOpen ? (
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={q.maxPoints}
                                  step={0.5}
                                  placeholder="0"
                                  value={mockOpenPoints[q.questionId] ?? ""}
                                  onChange={(e) =>
                                    setMockOpenPoints((prev) => ({
                                      ...prev,
                                      [q.questionId]: e.target.value,
                                    }))
                                  }
                                  className="w-14 border border-amber-300 rounded px-1.5 py-0.5 text-center font-bold text-slate-900 bg-amber-50"
                                />
                                <span className="text-slate-500 font-semibold">/ {q.maxPoints}</span>
                              </div>
                            ) : q.isCorrect ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                ✓ {q.awardedPoints}/{q.maxPoints}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                                ✗ 0/{q.maxPoints}
                              </span>
                            )}
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
      </div>
    );
  }

  const options = ALL_OPTIONS.slice(0, data.exam.optionsCount);
  const answerableQuestions = data.questions.filter((q) => q.questionType !== "ORAL");
  const answeredCount = answerableQuestions.filter((q) => Boolean(answers[q.id]?.trim())).length;
  const progress = answerableQuestions.length ? Math.round((answeredCount / answerableQuestions.length) * 100) : 100;
  const lowTime = remaining !== null && remaining < 5 * 60 * 1000;

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      {/* Banner superior exclusivo en modo Mocktest */}
      {isMock && (
        <div className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 z-30 shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap text-xs">
            <span className="inline-flex items-center gap-1 bg-emerald-500 text-slate-950 font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider text-[11px]">
              <FlaskConical className="w-3.5 h-3.5" /> Modo Mocktest
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Estudiante falso: <strong className="text-white">{data.mockStudent?.name || "Sofía Mocktest"}</strong>{" "}
                <span className="text-slate-400">({data.mockStudent?.courseName || "Simulación"})</span>
              </span>
            </span>
            <span className="hidden lg:inline-block text-[11px] text-amber-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
              No guarda datos reales ni afecta reportes
            </span>
            <span className="text-[11px] bg-indigo-950 text-indigo-200 border border-indigo-800 px-2 py-0.5 rounded font-semibold">
              {data.exam.gradingMode === "NORMAL"
                ? `Prueba normal · Exig. ${data.exam.passThresholdPercent ?? 60}%`
                : `SIMCE TRI · Exig. ${data.exam.passThresholdPercent ?? 60}%`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {data.questions.length > 0 && (
              <button
                type="button"
                onClick={handleFillMockRandom}
                className="inline-flex items-center gap-1 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-md transition cursor-pointer"
                title="Completar respuestas simuladas aleatoriamente para verificar corrección rápida"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Simular respuestas (QA)</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleResetMock}
              className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-md transition cursor-pointer"
              title="Reiniciar intento simulado y borrar respuestas temporales"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reiniciar</span>
            </button>
            <button
              type="button"
              onClick={handleCloseMockTab}
              className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-800 hover:bg-rose-700 text-slate-200 hover:text-white border border-slate-700 px-2.5 py-1 rounded-md transition cursor-pointer"
              title="Cerrar pestaña de Mocktest"
            >
              <X className="w-3 h-3" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Panel izquierdo: PDF */}
        <div className="flex-1 flex flex-col border-r border-gray-300 bg-white relative min-w-0">
          <div className="h-14 flex items-center justify-between px-4 border-b bg-white shadow-sm z-10">
            <div className="min-w-0">
              <p className="text-xs text-blue-600 font-semibold uppercase">{data.exam.subject}</p>
              <h1 className="text-base font-bold text-gray-800 truncate">{data.exam.title}</h1>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <SaveIndicator state={saveState} isMock={isMock} />
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
            {isMock && data.exam.hasPdfFile === false ? (
              <div className="my-auto bg-white border border-amber-300 rounded-2xl p-6 max-w-md text-center shadow-sm space-y-3">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                <h3 className="font-bold text-gray-900">PDF no encontrado en el servidor</h3>
                <p className="text-xs text-gray-600">
                  Esta evaluación no tiene su archivo PDF disponible actualmente. Puedes asignarle un nuevo PDF desde el catálogo y luego recargar esta pestaña.
                </p>
                <Link
                  href={`/admin/exams/${mockExamId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                >
                  Ir a asignar PDF
                </Link>
              </div>
            ) : (
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
            )}
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
          <div className={`h-14 flex items-center px-6 border-b text-white ${isMock ? "bg-indigo-700" : "bg-blue-600"}`}>
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
            {data.questions.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 text-center font-medium">
                Esta evaluación aún no tiene preguntas registradas en su pauta.
              </div>
            ) : null}

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
                      mockExamId={isMock ? mockExamId : undefined}
                      mockResetKey={mockResetKey}
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-gray-700">{q.questionNumber}.</span>
                        {q.maxPoints !== undefined && Math.abs(Number(q.maxPoints) - 1) > 1e-6 && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                            {q.maxPoints} pts
                          </span>
                        )}
                      </div>
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
              className={`w-full text-white font-bold py-3 px-4 rounded-lg shadow transition-colors disabled:opacity-50 cursor-pointer ${
                isMock ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isMock
                ? "Finalizar y Evaluar Mocktest"
                : isPruebas
                ? "Finalizar Prueba"
                : "Finalizar Ensayo"}
            </button>
          </div>
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
                      <span className="font-semibold text-emerald-100">
                        {isMock ? "Guardado en sesión Mock" : "Todo guardado"}
                      </span>
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
                  {isMock
                    ? "Vista simulada de desarrollo: en un estudiante real, cada palabra se guarda continuamente en el servidor y navegador."
                    : <>Escribe con tranquilidad tu desarrollo completo. <strong>Cada palabra se guarda continuamente</strong> en el servidor y en la memoria de este computador para que nunca pierdas nada.</>}
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
                  {isMock ? "Respaldo de sesión Mock" : "Respaldo continuo activo"}
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
                  title="Guardar de inmediato"
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
                  <span>Listo, volver a la evaluación</span>
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
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {isMock ? "¿Finalizar Mocktest y ver corrección?" : `¿Entregar ${isPruebas ? "la prueba" : "el ensayo"}?`}
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              Respondiste <b>{answeredCount}</b> de <b>{answerableQuestions.length}</b> preguntas.
            </p>
            {answeredCount < answerableQuestions.length && (
              <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded mt-2">
                Tienes {answerableQuestions.length - answeredCount} pregunta(s) sin responder.
              </p>
            )}
            <p className="text-sm text-gray-600 mt-3">
              {isMock
                ? "Se calcularán los resultados simulados sin registrar datos en el historial del colegio."
                : "Una vez entregado no podrás modificar tus respuestas."}
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="flex-1 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Seguir respondiendo
              </button>
              <button
                onClick={() => submitExam(false)}
                disabled={submitting}
                className={`flex-1 py-2 rounded-lg text-white font-semibold disabled:opacity-50 cursor-pointer ${
                  isMock ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {submitting ? "Evaluando…" : isMock ? "Evaluar Mock" : "Entregar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {submitting && !confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 flex items-center">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {isMock ? "Evaluando Mocktest…" : "Entregando ensayo…"}
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state, isMock }: { state: SaveState; isMock?: boolean }) {
  if (state === "saving")
    return (
      <span className="flex items-center text-gray-500">
        <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Guardando…
      </span>
    );
  if (state === "saved")
    return (
      <span className="flex items-center text-green-600">
        <Check className="w-4 h-4 mr-1" /> {isMock ? "Guardado (Mock)" : "Guardado"}
      </span>
    );
  if (state === "offline")
    return (
      <span className="flex items-center text-amber-600" title="Sin conexión; se reintentará automáticamente">
        <CloudOff className="w-4 h-4 mr-1" /> Sin conexión (reintentando)
      </span>
    );
  return null;
}
