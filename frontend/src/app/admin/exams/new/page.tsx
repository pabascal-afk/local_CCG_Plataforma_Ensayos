"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Sparkles, Plus, Trash2, PenTool, Mic, ChevronDown, ChevronUp } from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import AiPromptModal from "@/components/AiPromptModal";
import GradingModeSelector, { GradingMode } from "@/components/GradingModeSelector";
import PointsInput from "@/components/PointsInput";
import { getToken } from "@/lib/session";
import { useIsPruebas } from "@/lib/useIsPruebas";
import { getExamTypeOptions } from "@/lib/examTypes";

interface OpenQuestionItem {
  questionNumber: number;
  questionType: "WRITTEN" | "ORAL";
  maxPoints: number;
}

export default function NewExamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("4B");
  const [questionCount, setQuestionCount] = useState(30);
  const [optionCount, setOptionCount] = useState(4);
  const [orderNumber, setOrderNumber] = useState(1);
  const [examType, setExamType] = useState("ENSAYO");
  const [gradingMode, setGradingMode] = useState<GradingMode>("SIMCE");
  const [passThresholdPercent, setPassThresholdPercent] = useState<number>(60);
  const [defaultMcPoints, setDefaultMcPoints] = useState<number>(1);
  const [questionPointsMap, setQuestionPointsMap] = useState<Record<string, number>>({});
  const [showPerQuestionPoints, setShowPerQuestionPoints] = useState<boolean>(false);
  const [openQuestions, setOpenQuestions] = useState<OpenQuestionItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);

  const addOpenQuestion = (type: "WRITTEN" | "ORAL") => {
    const usedNums = new Set(openQuestions.map((q) => q.questionNumber));
    let suggestedNum = questionCount;
    while (usedNums.has(suggestedNum) && suggestedNum > 1) {
      suggestedNum--;
    }
    if (usedNums.has(suggestedNum)) {
      suggestedNum = Math.min(100, Math.max(...Array.from(usedNums), questionCount) + 1);
    }
    setOpenQuestions((prev) =>
      [...prev, { questionNumber: suggestedNum, questionType: type, maxPoints: type === "WRITTEN" ? 5 : 4 }].sort(
        (a, b) => a.questionNumber - b.questionNumber
      )
    );
  };

  const updateOpenQuestion = (idx: number, patch: Partial<OpenQuestionItem>) => {
    setOpenQuestions((prev) => {
      const target = prev[idx];
      if (target && patch.maxPoints !== undefined) {
        setQuestionPointsMap((pm) => {
          const next = { ...pm };
          delete next[String(patch.questionNumber ?? target.questionNumber)];
          return next;
        });
      }
      return prev.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    });
  };

  const removeOpenQuestion = (idx: number) => {
    const target = openQuestions[idx];
    if (target) {
      setQuestionPointsMap((pm) => {
        const next = { ...pm };
        delete next[String(target.questionNumber)];
        return next;
      });
    }
    setOpenQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Debes seleccionar un archivo PDF.");
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Tu sesión ha expirado o no estás autenticado. Por favor inicia sesión nuevamente.");
      return;
    }

    setSaving(true);
    setError("");
    const safePercent = Math.min(99, Math.max(1, Math.round(Number(passThresholdPercent) || 60)));
    const formData = new FormData();
    formData.append("title", title);
    formData.append("subject", subject);
    formData.append("level", level);
    formData.append("questionCount", questionCount.toString());
    formData.append("optionsCount", optionCount.toString());
    formData.append("orderNumber", orderNumber.toString());
    formData.append("examType", examType);
    formData.append("gradingMode", gradingMode);
    formData.append("passThresholdPercent", String(safePercent));
    formData.append("passThreshold", (safePercent / 100).toFixed(4));
    if (gradingMode === "NORMAL") {
      formData.append("defaultMcPoints", String(defaultMcPoints));
      const customPointsPayload: Record<string, number> = {};
      for (let i = 1; i <= questionCount; i++) {
        const k = String(i);
        const val = questionPointsMap[k];
        if (val !== undefined && val > 0) {
          customPointsPayload[k] = val;
        }
      }
      if (Object.keys(customPointsPayload).length > 0) {
        formData.append("questionPoints", JSON.stringify(customPointsPayload));
      }
    }
    if (openQuestions.length > 0) {
      const openMap: Record<number, { questionType: string; maxPoints: number }> = {};
      openQuestions.forEach((oq) => {
        if (oq.questionNumber >= 1 && oq.questionNumber <= questionCount) {
          openMap[oq.questionNumber] = {
            questionType: oq.questionType,
            maxPoints: Math.max(0.5, Number(oq.maxPoints) || 1),
          };
        }
      });
      formData.append("openQuestions", JSON.stringify(openMap));
    }
    formData.append("pdf", file);

    try {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || `Error ${res.status}: no se pudo crear el ensayo`);
      }
      
      const newExam = await res.json();
      router.push(`/admin/exams/${newExam.id}`);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  const isPruebas = useIsPruebas();
  const openMapForEstimate = new Map<number, OpenQuestionItem>();
  openQuestions.forEach((oq) => {
    if (oq.questionNumber >= 1 && oq.questionNumber <= questionCount) {
      openMapForEstimate.set(oq.questionNumber, oq);
    }
  });
  let totalPointsEstimateSum = 0;
  for (let i = 1; i <= questionCount; i++) {
    const k = String(i);
    const oq = openMapForEstimate.get(i);
    if (oq) {
      const override = questionPointsMap[k];
      totalPointsEstimateSum +=
        gradingMode === "NORMAL" && override !== undefined && override > 0
          ? override
          : Math.max(0.5, Number(oq.maxPoints) || 1);
    } else if (gradingMode === "NORMAL") {
      const override = questionPointsMap[k];
      totalPointsEstimateSum += override !== undefined && override > 0 ? override : defaultMcPoints;
    } else {
      totalPointsEstimateSum += 1;
    }
  }
  const estimatedTotalPoints = Math.round(totalPointsEstimateSum * 10) / 10;

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-2xl mx-auto">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <button onClick={() => router.back()} className="text-blue-600 hover:underline flex items-center gap-1 text-sm font-medium mb-2">
                  <ArrowLeft className="w-4 h-4" /> Volver
                </button>
                <h1 className="text-3xl font-bold text-gray-900">
                  {isPruebas ? "Nueva Evaluación / Prueba Regular" : "Nuevo Ensayo"}
                </h1>
                <p className="text-gray-500 mt-1">
                  {isPruebas 
                    ? "Sube el PDF de la prueba y configura los parámetros base. En el siguiente paso podrás ingresar la pauta, preguntas de desarrollo y subir/cortar audios con el visor de onda." 
                    : "Sube el PDF y configura los parámetros base. En el siguiente paso podrás editar la pauta, preguntas de desarrollo y subir/cortar audios para listening."}
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex items-center shadow-sm">
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* Banner Asistente IA */}
            <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-indigo-950">
                    {isPruebas ? "¿Necesitas crear esta prueba con Inteligencia Artificial?" : "¿Necesitas crear este ensayo con Inteligencia Artificial?"}
                  </h3>
                  <p className="text-xs text-indigo-800 font-medium mt-0.5">
                    {isPruebas
                      ? "Genera prompts especializados por OA, conocimientos matemáticos generales (ej. 5° Básico), quizzes de inglés (ej. 3° Medio) y más en Excel (.xlsx)."
                      : "Genera el prompt para que un Agente IA (ChatGPT, Claude, Gemini) elabore las preguntas y la pauta oficial en Excel (.xlsx)."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="whitespace-nowrap px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Generar Prompt IA</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border space-y-6">
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    {isPruebas ? "Título de la Evaluación" : "Título del Ensayo"}
                  </label>
                  <input 
                    type="text" required value={title} onChange={e=>setTitle(e.target.value)}
                    placeholder={isPruebas ? "Ej: Prueba Matemática Unidad 1 - 5° Básico" : "Ej: Ensayo Matemática 4° Básico"}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">N° de Orden de Lista</label>
                  <input 
                    type="number" required min="1" value={orderNumber} onChange={e=>setOrderNumber(parseInt(e.target.value))}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Asignatura</label>
                  <select required value={subject} onChange={e=>setSubject(e.target.value)} className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    <option value="">Selecciona...</option>
                    <option value="Matemática">Matemática</option>
                    <option value="Lenguaje">Lenguaje / Lengua y Lit.</option>
                    <option value="Inglés">Inglés</option>
                    <option value="Ciencias Naturales">Ciencias Naturales</option>
                    <option value="Historia">Historia y Geografía</option>
                    <option value="Biología">Biología</option>
                    <option value="Física">Física</option>
                    <option value="Química">Química</option>
                    <option value="Educación Ciudadana">Educación Ciudadana</option>
                    <option value="Tecnología">Tecnología</option>
                    <option value="Artes">Artes Visuales / Música</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Nivel</label>
                  <select value={level} onChange={e=>setLevel(e.target.value)} className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    <option value="1B">1° Básico</option>
                    <option value="2B">2° Básico</option>
                    <option value="3B">3° Básico</option>
                    <option value="4B">4° Básico</option>
                    <option value="5B">5° Básico</option>
                    <option value="6B">6° Básico</option>
                    <option value="7B">7° Básico</option>
                    <option value="8B">8° Básico</option>
                    <option value="1M">1° Medio</option>
                    <option value="2M">2° Medio</option>
                    <option value="3M">3° Medio</option>
                    <option value="4M">4° Medio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de Evaluación (Tag)</label>
                  <select value={examType} onChange={e=>setExamType(e.target.value)} className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    {getExamTypeOptions(isPruebas).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Cantidad Total de Preguntas</label>
                  <input 
                    type="number" required min="1" max="100" value={questionCount} onChange={e=>setQuestionCount(parseInt(e.target.value) || 1)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Alternativas (Selección Múltiple)</label>
                  <select value={optionCount} onChange={e=>setOptionCount(parseInt(e.target.value))} className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    <option value={4}>4 (A, B, C, D)</option>
                    <option value={5}>5 (A, B, C, D, E)</option>
                  </select>
                </div>
              </div>

              <GradingModeSelector
                variant="full"
                gradingMode={gradingMode}
                onGradingModeChange={setGradingMode}
                passThresholdPercent={passThresholdPercent}
                onPassThresholdPercentChange={setPassThresholdPercent}
                totalPoints={estimatedTotalPoints}
              />

              {gradingMode === "NORMAL" && (
                <div className="border border-indigo-200 bg-indigo-50/45 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-indigo-950">
                        Puntaje por pregunta (en vez de escala TRI)
                      </h3>
                      <p className="text-xs text-indigo-800 mt-0.5">
                        Define el puntaje base de las preguntas de Selección Múltiple o personaliza cada pregunta por separado.
                      </p>
                    </div>
                    <span className="text-xs font-black bg-indigo-100 text-indigo-900 border border-indigo-200 px-3 py-1 rounded-full self-start sm:self-auto shrink-0">
                      Total: {estimatedTotalPoints} pts
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-indigo-100 rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">
                        Puntaje base (Sel. Múltiple):
                      </span>
                      <div className="flex items-center gap-1 border border-indigo-300 rounded-lg px-2 py-1 bg-indigo-50/40">
                        <PointsInput
                          value={defaultMcPoints}
                          min={0.1}
                          max={1000}
                          ariaLabel="Puntaje base preguntas de selección múltiple"
                          onChange={(val) => setDefaultMcPoints(val)}
                          className="w-12 text-center text-xs font-black text-indigo-950 outline-none bg-transparent"
                        />
                        <span className="text-xs font-bold text-indigo-500">pts</span>
                      </div>
                      {[1, 2, 3].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDefaultMcPoints(preset)}
                          className={`px-2 py-1 rounded-md text-xs font-bold border transition cursor-pointer ${
                            defaultMcPoints === preset
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {preset} pt{preset === 1 ? "" : "s"}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowPerQuestionPoints((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      {showPerQuestionPoints ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Ocultar detalle por pregunta</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>Personalizar puntaje por pregunta ({questionCount})</span>
                        </>
                      )}
                    </button>
                  </div>

                  {showPerQuestionPoints && (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-indigo-900">
                        <span>Asigna puntajes individuales (también puedes editarlos luego en la pauta):</span>
                        {Object.keys(questionPointsMap).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setQuestionPointsMap({})}
                            className="font-bold text-indigo-700 hover:underline cursor-pointer"
                          >
                            Restablecer al base
                          </button>
                        )}
                      </div>
                      <div className="max-h-56 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {Array.from({ length: Math.max(1, questionCount) }, (_, idx) => idx + 1).map((qNum) => {
                          const k = String(qNum);
                          const oq = openMapForEstimate.get(qNum);
                          const currentVal =
                            questionPointsMap[k] !== undefined && questionPointsMap[k] > 0
                              ? questionPointsMap[k]
                              : oq
                              ? Math.max(0.5, Number(oq.maxPoints) || 1)
                              : defaultMcPoints;
                          return (
                            <div
                              key={k}
                              className="flex items-center justify-between gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5"
                            >
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-xs font-black text-slate-700">P{qNum}</span>
                                {oq?.questionType === "WRITTEN" && (
                                  <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded">
                                    Esc.
                                  </span>
                                )}
                                {oq?.questionType === "ORAL" && (
                                  <span className="text-[9px] font-bold bg-purple-100 text-purple-800 px-1 rounded">
                                    Oral
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <PointsInput
                                  value={currentVal}
                                  min={0.1}
                                  max={1000}
                                  ariaLabel={`Puntaje pregunta ${qNum}`}
                                  onChange={(val) => {
                                    setQuestionPointsMap((prev) => ({ ...prev, [k]: val }));
                                    if (oq) {
                                      setOpenQuestions((prev) =>
                                        prev.map((item) =>
                                          item.questionNumber === qNum ? { ...item, maxPoints: val } : item
                                        )
                                      );
                                    }
                                  }}
                                  className="w-11 border border-indigo-200 rounded px-1 py-0.5 text-center text-xs font-black text-indigo-950 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <span className="text-[10px] font-bold text-slate-400">p</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Preguntas de Desarrollo Escrito / Respuesta Oral */}
              <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                      <PenTool className="w-4 h-4 text-amber-600" />
                      Preguntas de Desarrollo Escrito y Respuesta Oral (Opcional)
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Marca aquí las preguntas que el profesor revisará a posteriori asignando puntaje manual (ej: Pregunta 28 Desarrollo Escrito 7 pts, Pregunta 29 Desarrollo Oral 5 pts).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addOpenQuestion("WRITTEN")}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>📝 Desarrollo Escrito</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => addOpenQuestion("ORAL")}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>🗣️ Desarrollo Oral</span>
                    </button>
                  </div>
                </div>

                {openQuestions.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-amber-200/80">
                    {openQuestions.map((oq, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-600">Pregunta N°:</span>
                          <input
                            type="number"
                            min={1}
                            max={questionCount}
                            value={oq.questionNumber}
                            onChange={(e) =>
                              updateOpenQuestion(idx, { questionNumber: Math.max(1, Math.min(questionCount, parseInt(e.target.value) || 1)) })
                            }
                            className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs font-black text-center text-slate-900"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-600">Clasificación:</span>
                          <select
                            value={oq.questionType}
                            onChange={(e) => updateOpenQuestion(idx, { questionType: e.target.value as "WRITTEN" | "ORAL" })}
                            className={`border rounded-md px-2.5 py-1 text-xs font-bold ${
                              oq.questionType === "ORAL"
                                ? "bg-purple-50 border-purple-300 text-purple-900"
                                : "bg-amber-50 border-amber-300 text-amber-900"
                            }`}
                          >
                            <option value="WRITTEN">📝 Desarrollo Escrito</option>
                            <option value="ORAL">🗣️ Desarrollo Oral</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-600">Puntaje Máx:</span>
                          <input
                            type="number"
                            min={0.5}
                            max={100}
                            step="0.5"
                            value={oq.maxPoints}
                            onChange={(e) => updateOpenQuestion(idx, { maxPoints: Math.max(0.5, parseFloat(e.target.value) || 1) })}
                            className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs font-black text-center text-slate-900"
                          />
                          <span className="text-xs font-semibold text-slate-500">pts</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeOpenQuestion(idx)}
                          className="ml-auto p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition"
                          title="Quitar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Archivo PDF</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-blue-500 transition-colors bg-gray-50">
                  <div className="space-y-1 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-gray-600 justify-center">
                      <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 px-1">
                        <span>Sube un archivo PDF</span>
                        <input type="file" required accept=".pdf" className="sr-only" onChange={e => setFile(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">
                      {file ? file.name : "Solo formato .pdf"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <button 
                  type="submit" 
                  disabled={saving}
                  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Creando y procesando PDF..." : <><Save className="w-5 h-5 mr-2" /> {isPruebas ? "Crear Evaluación y Cargar Pauta" : "Crear Ensayo y Cargar Pauta"}</>}
                </button>
              </div>
            </form>
          </div>

          {/* Modal Asistente Prompts IA */}
          <AiPromptModal 
            isOpen={showAiModal} 
            onClose={() => setShowAiModal(false)} 
            defaultMode="EXAM_XLSX"
            initialLevel={level}
            initialSubject={subject || "Matemática"}
          />
        </AppShell>
      )}
    </RequireRole>
  );
}
