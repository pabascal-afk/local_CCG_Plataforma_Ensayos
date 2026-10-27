"use client";

import { useEffect, useState } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { 
  ArrowLeft, Save, Upload, Check, FileSpreadsheet, Download, 
  Sparkles, Headphones, Scissors, Plus, Trash2, ListPlus 
} from "lucide-react";
import { getToken } from "@/lib/session";
import AiPromptModal from "@/components/AiPromptModal";
import AudioCutterModal from "@/components/AudioCutterModal";
import { useIsPruebas } from "@/lib/useIsPruebas";

export default function AnswerKeyPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const isPruebas = useIsPruebas();
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  
  const [answerKey, setAnswerKey] = useState<Record<string, string>>({});
  const [questionTypesKeys, setQuestionTypesKeys] = useState<Record<string, string>>({});
  const [maxPointsKeys, setMaxPointsKeys] = useState<Record<string, number>>({});
  const [skillsKeys, setSkillsKeys] = useState<Record<string, string>>({});
  const [axesKeys, setAxesKeys] = useState<Record<string, string>>({});
  const [learningObjectivesKeys, setLearningObjectivesKeys] = useState<Record<string, string>>({});
  const [difficultiesKeys, setDifficultiesKeys] = useState<Record<string, string>>({});

  const [customQuestionCount, setCustomQuestionCount] = useState<number | null>(null);
  const [customAddAmount, setCustomAddAmount] = useState<number>(2);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);

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

    const initialCount = e.questions?.length || e.questionCount || Object.keys(e.answerKey || {}).length || 45;
    setCustomQuestionCount(initialCount);
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

  const handleAddQuestions = (count: number = 1) => {
    const safeCount = Math.max(1, count);
    const currentTotal = maxQ;
    const newTotal = currentTotal + safeCount;
    setCustomQuestionCount(newTotal);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/exams/${id}/answer-key`, {
        method: "PUT",
        body: {
          totalQuestions: maxQ,
          answerKey,
          questionTypesKeys,
          maxPointsKeys,
          skillsKeys,
          axesKeys,
          learningObjectivesKeys,
          difficultiesKeys
        }
      });
      setExam((prev: any) => ({ ...prev, questionCount: maxQ }));
      alert("Pauta guardada correctamente");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
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
    setShowPaste(false);
    setPasteText("");
  };

  const [selectedAudioQuestion, setSelectedAudioQuestion] = useState<number | null>(null);

  const handleTypeChange = (qNum: string, newType: string) => {
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
            <div className="mb-6 flex justify-between items-end">
              <div>
                <Link href="/admin/exams" className="text-blue-600 hover:underline flex items-center gap-1 inline-flex mb-2 text-xs font-semibold">
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver a {isPruebas ? "Pruebas" : "Ensayos"}
                </Link>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-black text-gray-900 tracking-tight">Pauta: {exam.title}</h1>
                  <span className="bg-blue-100 text-blue-800 font-extrabold text-xs px-2.5 py-1 rounded-full">
                    {maxQ} preguntas
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Completa las respuestas correctas o marca preguntas de Desarrollo Escrito / Respuesta Oral con su puntaje máximo.
                </p>
              </div>
              
              <button 
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Guardando..." : <><Save className="w-5 h-5" /> Guardar Pauta</>}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              {/* Sidebar herramientas */}
              <div className="md:col-span-1 space-y-4">

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
                        <th className="p-3 font-bold w-28">Dificultad (TRI)</th>
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
                                    onChange={e => setMaxPointsKeys(prev => ({ ...prev, [qNum]: Math.max(0.5, parseFloat(e.target.value) || 1) }))}
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
                                onChange={e => setAxesKeys({ ...axesKeys, [qNum]: e.target.value })}
                                placeholder="Ej: Geometría"
                                className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                              />
                            </td>

                            {/* 5. OA */}
                            <td className="p-3">
                              <input 
                                type="text" 
                                value={learningObjectivesKeys[qNum] || ""} 
                                onChange={e => setLearningObjectivesKeys({ ...learningObjectivesKeys, [qNum]: e.target.value })}
                                placeholder="OA 14"
                                className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                              />
                            </td>

                            {/* 6. Habilidad */}
                            <td className="p-3">
                              <input 
                                type="text" 
                                value={skillsKeys[qNum] || ""} 
                                onChange={e => setSkillsKeys({ ...skillsKeys, [qNum]: e.target.value })}
                                placeholder="Ej: Argumentar"
                                className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                              />
                            </td>

                            {/* 7. Dificultad (TRI) */}
                            <td className="p-3">
                              <select
                                value={normalizeDifficultySelectValue(difficultiesKeys[qNum])}
                                onChange={e => setDifficultiesKeys({ ...difficultiesKeys, [qNum]: e.target.value })}
                                className="border rounded px-2 py-1.5 w-full text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500 outline-none"
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
        </AppShell>
      )}
    </RequireRole>
  );
}
