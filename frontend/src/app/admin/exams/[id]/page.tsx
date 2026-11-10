"use client";

import { useEffect, useState } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { 
  ArrowLeft, Save, Upload, Check, FileSpreadsheet, Download, 
  Sparkles, Headphones, Scissors, Plus, Trash2, ListPlus,
  FileText, Eye, RefreshCw, Play, Calculator, AlertTriangle, CheckCircle2, X,
  SlidersHorizontal
} from "lucide-react";
import { getToken } from "@/lib/session";
import AiPromptModal from "@/components/AiPromptModal";
import AudioCutterModal from "@/components/AudioCutterModal";
import ReplaceExamPdfModal, { formatFileSize } from "@/components/ReplaceExamPdfModal";
import GradingModeSelector, { GradingMode } from "@/components/GradingModeSelector";
import { useIsPruebas } from "@/lib/useIsPruebas";

export default function AnswerKeyPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const isPruebas = useIsPruebas();
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfModalPreview, setPdfModalPreview] = useState(false);
  
  const [answerKey, setAnswerKey] = useState<Record<string, string>>({});
  const [questionTypesKeys, setQuestionTypesKeys] = useState<Record<string, string>>({});
  const [maxPointsKeys, setMaxPointsKeys] = useState<Record<string, number>>({});
  const [skillsKeys, setSkillsKeys] = useState<Record<string, string>>({});
  const [axesKeys, setAxesKeys] = useState<Record<string, string>>({});
  const [learningObjectivesKeys, setLearningObjectivesKeys] = useState<Record<string, string>>({});
  const [difficultiesKeys, setDifficultiesKeys] = useState<Record<string, string>>({});
  const [gradingMode, setGradingMode] = useState<GradingMode>("SIMCE");
  const [passThresholdPercent, setPassThresholdPercent] = useState<number>(60);

  const [customQuestionCount, setCustomQuestionCount] = useState<number | null>(null);
  const [customAddAmount, setCustomAddAmount] = useState<number>(2);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showRecalcModal, setShowRecalcModal] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<any>(null);
  const [recalcError, setRecalcError] = useState("");

  const normalizeDifficultySelectValue = (raw: any): string => {
    if (raw === undefined || raw === null || raw === "") return "0.0";
    const num = parseFloat(String(raw).replace(",", "."));
    if (isNaN(num)) return "0.0";
    if (num < -0.4) return "-1.5";
    if (num > 0.4) return "1.5";
    return "0.0";
  };

  const applyExamState = (e: any) => {
    setExam(e);
    const ak: Record<string, string> = { ...(e.answerKey || {}) };
    const qtk: Record<string, string> = { ...(e.questionTypesKeys || {}) };
    const mpk: Record<string, number> = {};
    if (e.maxPointsKeys) {
      Object.entries(e.maxPointsKeys).forEach(([k, v]) => {
        mpk[k] = Number(v) || 1;
      });
    }
    Object.entries(qtk).forEach(([qNum, qType]) => {
      if (qType === "WRITTEN") ak[qNum] = "DESARROLLO";
      else if (qType === "ORAL") ak[qNum] = "ORAL";
    });
    const dk: Record<string, string> = {};
    if (e.difficultiesKeys) {
      Object.entries(e.difficultiesKeys).forEach(([k, v]) => {
        dk[k] = normalizeDifficultySelectValue(v);
      });
    }
    setAnswerKey(ak);
    setQuestionTypesKeys(qtk);
    setMaxPointsKeys(mpk);
    setSkillsKeys(e.skillsKeys || {});
    setAxesKeys(e.axesKeys || {});
    setLearningObjectivesKeys(e.learningObjectivesKeys || {});
    setDifficultiesKeys(dk);
    setGradingMode(e.gradingMode === "NORMAL" ? "NORMAL" : "SIMCE");
    const rawPct =
      e.passThresholdPercent !== undefined && e.passThresholdPercent !== null
        ? Number(e.passThresholdPercent)
        : e.passThreshold !== undefined && e.passThreshold !== null
        ? Math.round(Number(e.passThreshold) * 1000) / 10
        : 60;
    setPassThresholdPercent(Math.min(99, Math.max(1, Math.round(rawPct) || 60)));

    const initialCount = e.questions?.length || e.questionCount || Object.keys(e.answerKey || {}).length || 45;
    setCustomQuestionCount(initialCount);
    setIsDirty(false);
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = getToken();
      const res = await fetch("/api/admin/templates/exam_questions.xlsx", {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Error al descargar plantilla");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Formato_Pauta_Ensayo.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const loadExam = async () => {
    try {
      const e = await apiFetch<any>(`/admin/exams/${id}`);
      if (!e) throw new Error("Ensayo no encontrado");
      applyExamState(e);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExam();
  }, [id]);

  const maxQ = Math.max(
    customQuestionCount ?? (exam?.questionCount || 45),
    ...Object.keys(answerKey).map(Number).filter(n => !isNaN(n))
  );
  const questions = Array.from({ length: maxQ }, (_, i) => String(i + 1));
  const totalMaxPoints =
    Math.round(
      questions.reduce((sum, qNum) => {
        const currentKey = answerKey[qNum] || "";
        const qType =
          questionTypesKeys[qNum] ||
          (currentKey === "DESARROLLO" ? "WRITTEN" : currentKey === "ORAL" ? "ORAL" : "MULTIPLE_CHOICE");
        if (qType === "WRITTEN" || qType === "ORAL") {
          const pts = maxPointsKeys[qNum] ?? (qType === "ORAL" ? 4 : 5);
          return sum + Math.max(0.5, Number(pts) || 1);
        }
        return sum + 1;
      }, 0) * 10
    ) / 10;

  const handleAddQuestions = (count: number = 1) => {
    const safeCount = Math.max(1, count);
    const currentTotal = maxQ;
    const newTotal = currentTotal + safeCount;
    setCustomQuestionCount(newTotal);
    setIsDirty(true);

    setAnswerKey(prev => {
      const next = { ...prev };
      for (let i = currentTotal + 1; i <= newTotal; i++) {
        if (!next[String(i)]) next[String(i)] = "A";
      }
      return next;
    });

    setQuestionTypesKeys(prev => {
      const next = { ...prev };
      for (let i = currentTotal + 1; i <= newTotal; i++) {
        if (!next[String(i)]) next[String(i)] = "MULTIPLE_CHOICE";
      }
      return next;
    });

    setMaxPointsKeys(prev => {
      const next = { ...prev };
      for (let i = currentTotal + 1; i <= newTotal; i++) {
        if (next[String(i)] === undefined) next[String(i)] = 1;
      }
      return next;
    });

    setDifficultiesKeys(prev => {
      const next = { ...prev };
      for (let i = currentTotal + 1; i <= newTotal; i++) {
        if (next[String(i)] === undefined) next[String(i)] = "0.0";
      }
      return next;
    });
  };

  const handleRemoveLastQuestion = () => {
    if (maxQ <= 1) return;
    const qToRemove = String(maxQ);
    const newTotal = maxQ - 1;
    setCustomQuestionCount(newTotal);
    setIsDirty(true);

    setAnswerKey(prev => {
      const next = { ...prev };
      delete next[qToRemove];
      return next;
    });
    setQuestionTypesKeys(prev => {
      const next = { ...prev };
      delete next[qToRemove];
      return next;
    });
    setMaxPointsKeys(prev => {
      const next = { ...prev };
      delete next[qToRemove];
      return next;
    });
    setDifficultiesKeys(prev => {
      const next = { ...prev };
      delete next[qToRemove];
      return next;
    });
    setSkillsKeys(prev => {
      const next = { ...prev };
      delete next[qToRemove];
      return next;
    });
    setAxesKeys(prev => {
      const next = { ...prev };
      delete next[qToRemove];
      return next;
    });
    setLearningObjectivesKeys(prev => {
      const next = { ...prev };
      delete next[qToRemove];
      return next;
    });
  };

  const saveAnswerKey = async (silent: boolean = false): Promise<boolean> => {
    setSaving(true);
    const safePct = Math.min(99, Math.max(1, Math.round(Number(passThresholdPercent) || 60)));
    const normalizedPassThreshold = Number((safePct / 100).toFixed(4));
    try {
      await apiFetch(`/admin/exams/${id}/answer-key`, {
        method: "PUT",
        body: {
          totalQuestions: maxQ,
          gradingMode,
          passThresholdPercent: safePct,
          passThreshold: normalizedPassThreshold,
          answerKey,
          questionTypesKeys,
          maxPointsKeys,
          skillsKeys,
          axesKeys,
          learningObjectivesKeys,
          difficultiesKeys
        }
      });
      setExam((prev: any) => ({
        ...prev,
        questionCount: maxQ,
        gradingMode,
        passThreshold: normalizedPassThreshold,
        passThresholdPercent: safePct,
      }));
      setIsDirty(false);
      if (!silent) {
        alert("Pauta guardada correctamente (" + maxQ + " preguntas registradas)");
      }
      return true;
    } catch (err: any) {
      alert(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    await saveAnswerKey(false);
  };

  const handleConfirmRecalculate = async () => {
    setRecalcError("");
    setRecalculating(true);
    try {
      if (isDirty) {
        const savedOk = await saveAnswerKey(true);
        if (!savedOk) {
          setRecalculating(false);
          return;
        }
      }
      const data = await apiFetch<any>(`/admin/exams/${id}/recalculate-grades`, {
        method: "POST",
        body: {}
      });
      setRecalcResult(data);
      setShowRecalcModal(false);
      await loadExam();
    } catch (err: any) {
      setRecalcError(err.message || "No se pudieron recalcular las notas");
    } finally {
      setRecalculating(false);
    }
  };

  const handleImportQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const res = await fetch(`/api/admin/exams/${id}/import-questions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getToken()}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al importar pauta");

      alert(`Pauta importada con éxito. Preguntas procesadas: ${data.imported}. Errores: ${data.errors.length}`);
      setImportFile(null);
      const eData = await apiFetch<any>(`/admin/exams/${id}`);
      if (eData) {
        applyExamState(eData);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
    }
  };

  const applyPaste = () => {
    const letters = pasteText.replace(/[^A-E]/gi, "").toUpperCase();
    const newKey = { ...answerKey };
    const newTypes = { ...questionTypesKeys };
    for (let i = 0; i < letters.length; i++) {
      const qNum = String(i + 1);
      if (newTypes[qNum] === "WRITTEN" || newTypes[qNum] === "ORAL") continue;
      if (i < 150) {
        newKey[qNum] = letters[i];
        newTypes[qNum] = "MULTIPLE_CHOICE";
      }
    }
    setAnswerKey(newKey);
    setQuestionTypesKeys(newTypes);
    setIsDirty(true);
    setShowPaste(false);
    setPasteText("");
  };

  const [selectedAudioQuestion, setSelectedAudioQuestion] = useState<number | null>(null);

  const handleTypeChange = (qNum: string, newType: string) => {
    setIsDirty(true);
    setQuestionTypesKeys(prev => ({ ...prev, [qNum]: newType }));
    if (newType === "WRITTEN") {
      setAnswerKey(prev => ({ ...prev, [qNum]: "DESARROLLO" }));
      setMaxPointsKeys(prev => ({ ...prev, [qNum]: prev[qNum] && prev[qNum] > 1 ? prev[qNum] : 5 }));
    } else if (newType === "ORAL") {
      setAnswerKey(prev => ({ ...prev, [qNum]: "ORAL" }));
      setMaxPointsKeys(prev => ({ ...prev, [qNum]: prev[qNum] && prev[qNum] > 1 ? prev[qNum] : 4 }));
    } else {
      setAnswerKey(prev => {
        const curr = prev[qNum];
        const defaultLetter = (curr && curr !== "DESARROLLO" && curr !== "ORAL") ? curr : "A";
        return { ...prev, [qNum]: defaultLetter };
      });
      setMaxPointsKeys(prev => ({ ...prev, [qNum]: 1 }));
    }
  };

  const handleKeyChange = (qNum: string, newKey: string) => {
    setIsDirty(true);
    setAnswerKey(prev => ({ ...prev, [qNum]: newKey }));
  };

  const openAudioModalForQuestion = (qNum: number) => {
    setSelectedAudioQuestion(qNum);
    setShowAudioModal(true);
  };

  if (loading) return <div className="p-8">Cargando...</div>;
  if (!exam) return <div className="p-8">Error al cargar el ensayo.</div>;

  const audioQuestionsSet = new Set<number>();
  if (exam?.audioQuestionNumbers && Array.isArray(exam.audioQuestionNumbers)) {
    exam.audioQuestionNumbers.forEach((n: number) => audioQuestionsSet.add(n));
  } else if (exam?.audioClips && Array.isArray(exam.audioClips)) {
    exam.audioClips.forEach((c: any) => {
      try {
        const parsed = JSON.parse(c.questionNumbers);
        if (Array.isArray(parsed)) parsed.forEach((n: number) => audioQuestionsSet.add(n));
      } catch {
        String(c.questionNumbers || "").split(",").forEach((n: string) => {
          const num = parseInt(n.trim(), 10);
          if (!isNaN(num)) audioQuestionsSet.add(num);
        });
      }
    });
  }

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-7xl mx-auto">
            {/* Cabecera Principal con Botones de Acción Directos */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <div>
                <Link href="/admin/exams" className="text-blue-600 hover:underline flex items-center gap-1 inline-flex mb-1.5 text-xs font-semibold">
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver al catálogo de {isPruebas ? "Pruebas" : "Ensayos"}
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">
                    {isPruebas ? "Prueba" : "Pauta"}: {exam.title}
                  </h1>
                  <span className="bg-blue-100 text-blue-800 font-black text-xs px-2.5 py-0.5 rounded-full border border-blue-200">
                    {maxQ} preguntas
                  </span>
                  <span
                    className={`font-black text-xs px-2.5 py-0.5 rounded-full border ${
                      gradingMode === "NORMAL"
                        ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {gradingMode === "NORMAL"
                      ? `Prueba normal · Exig. ${passThresholdPercent}%`
                      : `Escala SIMCE TRI · ${passThresholdPercent}%`}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Agrega preguntas, edita las respuestas correctas o configura preguntas abiertas y audios.
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {/* Controles de adición directa de preguntas en la cabecera */}
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 gap-1">
                  <span className="text-xs font-bold text-gray-600 px-1.5 hidden sm:inline">Preguntas:</span>
                  <button
                    type="button"
                    onClick={() => handleAddQuestions(1)}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded border border-blue-200 shadow-2xs transition flex items-center gap-1 cursor-pointer"
                    title="Sumar 1 pregunta más a esta evaluación"
                  >
                    <Plus className="w-3.5 h-3.5" /> +1 Pregunta
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddQuestions(5)}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded border border-blue-200 shadow-2xs transition flex items-center gap-1 cursor-pointer"
                    title="Sumar 5 preguntas más a esta evaluación"
                  >
                    <Plus className="w-3.5 h-3.5" /> +5
                  </button>
                  {maxQ > 1 && (
                    <button
                      type="button"
                      onClick={handleRemoveLastQuestion}
                      className="px-2 py-1.5 text-red-600 hover:bg-red-50 font-bold text-xs rounded border border-transparent hover:border-red-200 transition flex items-center gap-1 cursor-pointer"
                      title={`Quitar última pregunta (#${maxQ})`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> -1
                    </button>
                  )}
                </div>

                <a
                  href={`/admin/exams/${exam.id}/mock`}
                  target="_blank"
                  rel="opener"
                  className="px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center gap-1.5 border bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 shadow-2xs transition cursor-pointer"
                  title="Rendir Mocktest en otra pestaña con un estudiante falso"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Mocktest</span>
                </a>

                {user.role === "ADMIN" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPdfModalPreview(false);
                      setShowPdfModal(true);
                    }}
                    className={`px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center gap-1.5 border shadow-2xs transition cursor-pointer ${
                      exam?.hasPdfFile === false
                        ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300"
                        : "bg-white hover:bg-slate-50 text-slate-700 border-slate-300"
                    }`}
                    title="Ver o asignar un nuevo archivo PDF"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>{exam?.hasPdfFile === false ? "Asignar PDF" : "Cambiar PDF"}</span>
                  </button>
                )}

                {user.role === "ADMIN" && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecalcError("");
                      setShowRecalcModal(true);
                    }}
                    disabled={recalculating}
                    className="px-3 py-2 rounded-lg font-bold text-xs md:text-sm flex items-center gap-1.5 border bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-300 shadow-2xs transition cursor-pointer disabled:opacity-50"
                    title="Reevaluar todas las entregas finalizadas (SUBMITTED) con la pauta actual"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Recalcular notas con la pauta actual</span>
                  </button>
                )}

                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xs md:text-sm hover:bg-blue-700 flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer relative"
                >
                  {saving ? "Guardando..." : <><Save className="w-4 h-4" /> Guardar Pauta ({maxQ} preg){isDirty ? " *" : ""}</>}
                </button>
              </div>
            </div>

            {isDirty && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Tienes cambios sin guardar en la pauta. Haz clic en <strong>Guardar Pauta</strong> (o se guardarán automáticamente si recalculas notas).
                  </span>
                </div>
              </div>
            )}

            {recalcResult && (
              <div className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs md:text-sm flex items-start justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-emerald-900">{recalcResult.message}</div>
                    <div className="text-xs text-emerald-800 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Entregas evaluadas: <strong>{recalcResult.evaluatedCount}</strong></span>
                      <span>Con cambios: <strong>{recalcResult.updatedCount}</strong></span>
                      <span>Notas recalculadas: <strong>{recalcResult.updatedGradesCount}</strong></span>
                      <span>Cursos afectados: <strong>{recalcResult.assignmentsAffected}</strong></span>
                      {recalcResult.avgGradeBefore != null && recalcResult.avgGradeAfter != null && (
                        <span>
                          Promedio general: <strong>{Number(recalcResult.avgGradeBefore).toFixed(1)} → {Number(recalcResult.avgGradeAfter).toFixed(1)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRecalcResult(null)}
                  className="text-emerald-700 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-100 cursor-pointer"
                  aria-label="Cerrar resumen de recálculo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              {/* Sidebar herramientas */}
              <div className="md:col-span-1 space-y-4">

                {/* Card Sistema de Calificación y Exigencia */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                      <span>Calificación</span>
                    </h3>
                    <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                      {totalMaxPoints} pts
                    </span>
                  </div>
                  <GradingModeSelector
                    variant="compact"
                    gradingMode={gradingMode}
                    onGradingModeChange={(mode) => {
                      setGradingMode(mode);
                      setIsDirty(true);
                    }}
                    passThresholdPercent={passThresholdPercent}
                    onPassThresholdPercentChange={(pct) => {
                      setPassThresholdPercent(pct);
                      setIsDirty(true);
                    }}
                    totalPoints={totalMaxPoints}
                  />
                </div>

                {/* Card Recalcular Notas Post-Rendición */}
                {user.role === "ADMIN" && (
                  <div className="bg-indigo-50/80 border border-indigo-200 p-4 rounded-xl shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm text-indigo-950 flex items-center gap-1.5">
                        <Calculator className="w-4 h-4 text-indigo-600" />
                        <span>Recálculo Post-Rendición</span>
                      </h3>
                      <span className="bg-indigo-100 text-indigo-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full border border-indigo-200">
                        {exam.submittedCount ?? 0} rendidas
                      </span>
                    </div>
                    <p className="text-xs text-indigo-900/80 leading-snug">
                      Si corregiste una clave o puntaje después de que los cursos entregaron, reevalúa las entregas finalizadas (<code className="font-mono text-[11px]">SUBMITTED</code>) sin alterar intentos en curso.
                    </p>
                    {Boolean(exam.inProgressCount && exam.inProgressCount > 0) && (
                      <p className="text-[11px] text-indigo-800 font-medium">
                        • {exam.inProgressCount} intento(s) en curso no se verán afectados.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRecalcError("");
                        setShowRecalcModal(true);
                      }}
                      disabled={recalculating}
                      className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      <span>Recalcular notas con la pauta actual</span>
                    </button>
                  </div>
                )}

                {/* Card Cuadernillo PDF */}
                <div className={`p-4 rounded-xl border shadow-sm space-y-2.5 ${
                  exam?.hasPdfFile === false
                    ? "bg-amber-50/80 border-amber-200"
                    : "bg-white border-gray-200"
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                      <FileText className={`w-4 h-4 ${exam?.hasPdfFile === false ? "text-amber-600" : "text-blue-600"}`} />
                      <span>Archivo PDF</span>
                    </h3>
                    {exam?.hasPdfFile === false ? (
                      <span className="bg-amber-100 text-amber-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full border border-amber-200">
                        Sin archivo
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-700 font-extrabold text-[10px] px-2 py-0.5 rounded-full border border-emerald-200">
                        {exam?.pdfFileSize ? formatFileSize(exam.pdfFileSize) : "Cargado"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-snug">
                    {exam?.hasPdfFile === false
                      ? `Este ${isPruebas ? "instrumento" : "ensayo"} no tiene PDF disponible en el servidor. Sube uno nuevo aquí.`
                      : `Puedes previsualizar el PDF actual o asignar uno nuevo sin perder la pauta ni los audios.`}
                  </p>
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    {exam?.hasPdfFile !== false && (
                      <button
                        type="button"
                        onClick={() => {
                          setPdfModalPreview(true);
                          setShowPdfModal(true);
                        }}
                        className="w-full px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-600" />
                        <span>Ver PDF actual</span>
                      </button>
                    )}
                    {user.role === "ADMIN" && (
                      <button
                        type="button"
                        onClick={() => {
                          setPdfModalPreview(false);
                          setShowPdfModal(true);
                        }}
                        className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{exam?.hasPdfFile === false ? "Asignar PDF" : "Asignar Nuevo PDF"}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Cantidad de Preguntas */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                      <ListPlus className="w-4 h-4 text-blue-600" /> Cantidad de Preguntas
                    </h3>
                    <span className="bg-blue-50 text-blue-700 font-black text-xs px-2.5 py-0.5 rounded-full border border-blue-200">
                      {maxQ}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-snug">
                    ¿Necesitas más preguntas en este {isPruebas ? "instrumento" : "ensayo"}? Agrega preguntas adicionales o remueve la última.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddQuestions(1)}
                      className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
                      title="Agregar 1 pregunta más"
                    >
                      <Plus className="w-3.5 h-3.5" /> +1 Pregunta
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddQuestions(5)}
                      className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
                      title="Agregar 5 preguntas más"
                    >
                      <Plus className="w-3.5 h-3.5" /> +5 Preguntas
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                      <span>Sumar</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={customAddAmount}
                        onChange={(e) => setCustomAddAmount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-12 border rounded px-1.5 py-1 text-center font-bold text-gray-800"
                      />
                      <span>más:</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddQuestions(customAddAmount)}
                      className="flex-1 py-1 px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg text-xs transition cursor-pointer"
                    >
                      + Agregar
                    </button>
                  </div>

                  {maxQ > 1 && (
                    <button
                      type="button"
                      onClick={handleRemoveLastQuestion}
                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer border border-transparent hover:border-red-200"
                      title={`Eliminar la última pregunta (Nº ${maxQ})`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Quitar última pregunta (#{maxQ})
                    </button>
                  )}
                </div>

                <div className="bg-white p-4 rounded-xl border shadow-sm">
                  <h3 className="font-semibold mb-2">Pegar Pauta Rápida</h3>
                  <p className="text-sm text-gray-500 mb-3">Pega una cadena de letras (ej: ABDCA...) para llenar las claves al instante.</p>
                  {showPaste ? (
                    <div className="space-y-2">
                      <textarea 
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                        className="w-full border rounded p-2 text-sm font-mono h-24"
                        placeholder="Pegar aquí..."
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setShowPaste(false)} className="flex-1 px-3 py-1.5 bg-gray-100 rounded text-sm font-medium">Cancelar</button>
                        <button onClick={applyPaste} className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">Aplicar</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowPaste(true)} className="w-full px-4 py-2 border border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50">
                      Pegar Texto
                    </button>
                  )}
                </div>

                {/* Card Audios por Pregunta / Cortador */}
                <div className="bg-purple-50/90 border border-purple-200 text-purple-950 p-4 rounded-xl shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm flex items-center gap-1.5 text-purple-900">
                      <Headphones className="w-4 h-4 text-purple-700" /> Audios por Pregunta
                    </h3>
                    {exam?.audioClipsCount ? (
                      <span className="bg-purple-200 text-purple-900 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                        {exam.audioClipsCount} pista(s)
                      </span>
                    ) : (
                      <span className="bg-gray-200/80 text-gray-600 font-bold text-[10px] px-2 py-0.5 rounded-full">
                        0 audios
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-purple-800 leading-snug">
                    Sube audios para comprensión auditiva, córtalos con el visor de onda y asígnalos a preguntas específicas.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAudioModal(true)}
                    className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>{exam?.audioClipsCount ? "Gestionar / Cortar Audios" : "Agregar Pistas de Audio"}</span>
                  </button>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl shadow-sm">
                  <h3 className="font-semibold mb-1 flex items-center gap-2 text-emerald-800">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Importar Pauta
                  </h3>
                  <p className="text-xs text-emerald-700 mb-3">
                    Sube la pauta en Excel (.xlsx) o CSV con claves (A-E, DESARROLLO, ORAL), habilidades, ejes, OAs y dificultad TRI.
                  </p>
                  <form onSubmit={handleImportQuestions} className="space-y-2">
                    <input 
                      type="file" 
                      accept=".xlsx,.csv" 
                      onChange={e => setImportFile(e.target.files?.[0] || null)}
                      className="w-full text-xs border border-emerald-300 rounded p-1.5 bg-white"
                    />
                    <button 
                      type="submit" 
                      disabled={!importFile || importing}
                      className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 text-white py-2 rounded-lg font-medium text-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <Upload className="w-3.5 h-3.5" /> {importing ? "Importando Pauta..." : "Importar Pauta"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="block w-full text-center text-xs text-blue-700 hover:underline pt-1 font-medium cursor-pointer"
                    >
                      Descargar Formato Pauta (.xlsx)
                    </button>

                    <div className="pt-2 border-t border-emerald-200">
                      <button
                        type="button"
                        onClick={() => setShowAiModal(true)}
                        className="w-full py-2 px-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Generar Pauta con IA</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Editor principal */}
              <div className="md:col-span-3">
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b text-gray-600 text-xs">
                      <tr>
                        <th className="p-3 font-bold w-12 text-center">Nº</th>
                        <th className="p-3 font-bold w-44">Tipo de Pregunta</th>
                        <th className="p-3 font-bold w-36">Clave / Puntaje</th>
                        <th className="p-3 font-bold w-36">Audio (Listening)</th>
                        <th className="p-3 font-bold">Eje / Tema</th>
                        <th className="p-3 font-bold w-20">OA</th>
                        <th className="p-3 font-bold">Habilidad Cognitiva</th>
                        <th className="p-3 font-bold w-32">
                          Dificultad (TRI)
                          {gradingMode === "NORMAL" && (
                            <span className="block text-[10px] font-medium text-gray-400 normal-case">
                              (Solo SIMCE TRI)
                            </span>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {questions.map((qNum) => {
                        const currentKey = answerKey[qNum] || "";
                        const qType = questionTypesKeys[qNum] || (currentKey === "DESARROLLO" ? "WRITTEN" : currentKey === "ORAL" ? "ORAL" : "MULTIPLE_CHOICE");
                        const isOpen = qType === "WRITTEN" || qType === "ORAL";
                        const maxPts = maxPointsKeys[qNum] ?? (qType === "ORAL" ? 4 : qType === "WRITTEN" ? 5 : 1);
                        const hasAudioClip = audioQuestionsSet.has(Number(qNum));

                        return (
                          <tr key={qNum} className={`hover:bg-blue-50/30 transition-colors ${isOpen ? "bg-amber-50/15" : ""}`}>
                            <td className="p-3 text-center font-bold text-gray-700">
                              {qNum}
                            </td>

                            {/* 1. Tipo de Pregunta */}
                            <td className="p-3">
                              <select
                                value={qType}
                                onChange={e => handleTypeChange(qNum, e.target.value)}
                                className={`w-full border rounded-lg px-2 py-1.5 font-bold focus:ring-2 focus:ring-blue-500 outline-none text-xs transition ${
                                  qType === "WRITTEN"
                                    ? "bg-amber-50 border-amber-300 text-amber-900"
                                    : qType === "ORAL"
                                    ? "bg-purple-50 border-purple-300 text-purple-900"
                                    : "bg-white border-gray-300 text-gray-800"
                                }`}
                              >
                                <option value="MULTIPLE_CHOICE">🔘 Selección Múltiple</option>
                                <option value="WRITTEN">📝 Desarrollo Escrito</option>
                                <option value="ORAL">🗣️ Respuesta Oral</option>
                              </select>
                            </td>

                            {/* 2. Clave o Puntaje */}
                            <td className="p-3">
                              {qType === "MULTIPLE_CHOICE" ? (
                                <select
                                  value={(currentKey && currentKey !== "DESARROLLO" && currentKey !== "ORAL") ? currentKey : ""}
                                  onChange={e => handleKeyChange(qNum, e.target.value)}
                                  className={`w-full border rounded-lg px-2 py-1.5 font-bold focus:ring-2 focus:ring-blue-500 outline-none text-xs ${
                                    currentKey && currentKey !== "DESARROLLO" && currentKey !== "ORAL"
                                      ? "bg-blue-50 border-blue-300 text-blue-900"
                                      : "bg-white border-gray-300 text-gray-500"
                                  }`}
                                >
                                  <option value="">Clave: -</option>
                                  {Array.from({ length: exam.optionsCount || 4 }, (_, i) => String.fromCharCode(65 + i)).map(opt => (
                                    <option key={opt} value={opt}>Alternativa {opt}</option>
                                  ))}
                                </select>
                              ) : (
                                  <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1" title="Puntaje máximo de esta pregunta">
                                  <input
                                    type="number"
                                    min={0.5}
                                    max={100}
                                    step={0.5}
                                    value={maxPts}
                                    onChange={e => {
                                      setIsDirty(true);
                                      setMaxPointsKeys(prev => ({ ...prev, [qNum]: Math.max(0.5, parseFloat(e.target.value) || 1) }));
                                    }}
                                    className="w-12 text-center font-black text-xs text-slate-900 outline-none"
                                  />
                                  <span className="text-[11px] font-bold text-slate-500">pts</span>
                                </div>
                              )}
                            </td>

                            {/* 3. Audio (Listening) */}
                            <td className="p-3">
                              {hasAudioClip ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                    <Headphones className="w-3 h-3 text-purple-700" />
                                    Con Audio
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openAudioModalForQuestion(Number(qNum))}
                                    className="text-purple-600 hover:text-purple-800 text-[11px] font-bold underline cursor-pointer"
                                    title="Editar pista de audio para esta pregunta"
                                  >
                                    Editar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openAudioModalForQuestion(Number(qNum))}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-purple-700 hover:bg-purple-50 border border-dashed border-gray-300 hover:border-purple-300 px-2 py-1 rounded-md transition cursor-pointer"
                                  title={`Asignar audio para la pregunta ${qNum}`}
                                >
                                  <Headphones className="w-3 h-3 text-gray-400" />
                                  <span>+ Asignar Audio</span>
                                </button>
                              )}
                            </td>

                            {/* 4. Eje / Tema */}
                            <td className="p-3">
                              <input 
                                type="text" 
                                value={axesKeys[qNum] || ""} 
                                onChange={e => {
                                  setIsDirty(true);
                                  setAxesKeys({ ...axesKeys, [qNum]: e.target.value });
                                }}
                                placeholder="Ej: Geometría"
                                className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                              />
                            </td>

                            {/* 5. OA */}
                            <td className="p-3">
                              <input 
                                type="text" 
                                value={learningObjectivesKeys[qNum] || ""} 
                                onChange={e => {
                                  setIsDirty(true);
                                  setLearningObjectivesKeys({ ...learningObjectivesKeys, [qNum]: e.target.value });
                                }}
                                placeholder="OA 14"
                                className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                              />
                            </td>

                            {/* 6. Habilidad */}
                            <td className="p-3">
                              <input 
                                type="text" 
                                value={skillsKeys[qNum] || ""} 
                                onChange={e => {
                                  setIsDirty(true);
                                  setSkillsKeys({ ...skillsKeys, [qNum]: e.target.value });
                                }}
                                placeholder="Ej: Argumentar"
                                className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                              />
                            </td>

                            {/* 7. Dificultad (TRI) */}
                            <td className="p-3">
                              <select
                                value={normalizeDifficultySelectValue(difficultiesKeys[qNum])}
                                onChange={e => {
                                  setIsDirty(true);
                                  setDifficultiesKeys({ ...difficultiesKeys, [qNum]: e.target.value });
                                }}
                                title={gradingMode === "NORMAL" ? "En modo Prueba normal no se calcula TRI" : "Dificultad TRI"}
                                className={`border rounded px-2 py-1.5 w-full text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500 outline-none ${
                                  gradingMode === "NORMAL" ? "opacity-55 text-gray-500" : ""
                                }`}
                              >
                                <option value="-1.5">Fácil (-1.5)</option>
                                <option value="0.0">Media (0.0)</option>
                                <option value="1.5">Difícil (+1.5)</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Pie de tabla con acciones de agregación rápida */}
                  <div className="p-3.5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-gray-600 font-medium flex items-center gap-2">
                      <span className="font-bold text-gray-900">Total: {maxQ} preguntas</span>
                      <span className="text-gray-400">•</span>
                      <span>Al guardar la pauta se actualizará el instrumento con este total de preguntas.</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {maxQ > 1 && (
                        <button
                          type="button"
                          onClick={handleRemoveLastQuestion}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                          title={`Eliminar pregunta Nº ${maxQ}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Quitar última (#{maxQ})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAddQuestions(1)}
                        className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" /> Agregar Pregunta (#{maxQ + 1})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddQuestions(5)}
                        className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" /> +5 Preguntas
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
            </div>
          </div>

          {/* Modal Asistente Prompts IA */}
          <AiPromptModal 
            isOpen={showAiModal} 
            onClose={() => setShowAiModal(false)} 
            defaultMode="EXAM_XLSX"
            initialLevel={exam?.level}
            initialSubject={exam?.subject}
            initialExamTitle={exam?.title}
          />

          {/* Modal Cortador de Audio por Pregunta */}
          <AudioCutterModal
            isOpen={showAudioModal}
            onClose={() => {
              setShowAudioModal(false);
              setSelectedAudioQuestion(null);
            }}
            examId={exam?.id}
            examTitle={exam?.title}
            questionCount={maxQ}
            initialQuestionNumber={selectedAudioQuestion}
            onClipsUpdated={loadExam}
          />

          {/* Modal Reemplazar / Asignar Nuevo PDF */}
          <ReplaceExamPdfModal
            isOpen={showPdfModal}
            onClose={() => setShowPdfModal(false)}
            exam={exam ? {
              id: exam.id,
              title: exam.title,
              subject: exam.subject,
              level: exam.level,
              pdfPath: exam.pdfPath,
              hasPdfFile: exam.hasPdfFile,
              pdfFileSize: exam.pdfFileSize,
            } : null}
            canReplace={user.role === "ADMIN"}
            initialPreview={pdfModalPreview}
            onPdfUpdated={(updated) => {
              setExam((prev: any) =>
                prev
                  ? {
                      ...prev,
                      pdfPath: updated.pdfPath,
                      hasPdfFile: updated.hasPdfFile ?? true,
                      pdfFileSize: updated.pdfFileSize,
                    }
                  : prev
              );
            }}
          />

          {/* Modal Confirmación Recalcular Notas */}
          {showRecalcModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-50/70">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-600 text-white">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Recalcular notas con la pauta actual</h3>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{exam.title}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => !recalculating && setShowRecalcModal(false)}
                    disabled={recalculating}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-3 text-xs text-slate-700 leading-relaxed">
                  {isDirty && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Hay cambios sin guardar en el editor.</strong> Al confirmar, primero se guardará la pauta actual ({maxQ} preguntas) y luego se recalcularán las entregas.
                      </div>
                    </div>
                  )}

                  <p>
                    Se reevaluarán <strong>{exam.submittedCount ?? 0} entrega(s) finalizada(s)</strong> (<code className="font-mono">SUBMITTED</code>) asociadas a esta evaluación usando la pauta vigente.
                  </p>

                  <ul className="space-y-1 text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <li>
                      •{" "}
                      {gradingMode === "NORMAL"
                        ? `Modo Prueba normal (${passThresholdPercent}% exigencia): actualizará nota 1,0–7,0, porcentaje, nivel de logro y aciertos (sin puntaje SIMCE/TRI).`
                        : `Modo Escala SIMCE TRI (${passThresholdPercent}% exigencia para nota 4,0): actualizará nota, porcentaje, nivel de logro, puntaje SIMCE/TRI y aciertos.`}
                    </li>
                    <li>• Se conservarán intactos los intentos <code className="font-mono">IN_PROGRESS</code>.</li>
                    <li>• Se respetará el puntaje manual ya otorgado en preguntas de desarrollo/oral.</li>
                  </ul>

                  {recalcError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                      {recalcError}
                    </div>
                  )}
                </div>

                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRecalcModal(false)}
                    disabled={recalculating}
                    className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRecalculate}
                    disabled={recalculating}
                    className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? "animate-spin" : ""}`} />
                    <span>
                      {recalculating
                        ? "Recalculando..."
                        : isDirty
                        ? "Guardar pauta y recalcular notas"
                        : "Confirmar recálculo"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </AppShell>
      )}
    </RequireRole>
  );
}
