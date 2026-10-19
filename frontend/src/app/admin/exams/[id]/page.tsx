"use client";

import { useEffect, useState } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, Save, Upload, Check, FileSpreadsheet, Download, Sparkles } from "lucide-react";
import { getToken } from "@/lib/session";
import AiPromptModal from "@/components/AiPromptModal";

export default function AnswerKeyPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  
  const [answerKey, setAnswerKey] = useState<Record<string, string>>({});
  const [skillsKeys, setSkillsKeys] = useState<Record<string, string>>({});
  const [axesKeys, setAxesKeys] = useState<Record<string, string>>({});
  const [learningObjectivesKeys, setLearningObjectivesKeys] = useState<Record<string, string>>({});
  const [difficultiesKeys, setDifficultiesKeys] = useState<Record<string, string>>({});

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);

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

  useEffect(() => {
    const load = async () => {
      try {
        const e = await apiFetch<any>(`/admin/exams/${id}`);
        if (!e) throw new Error("Ensayo no encontrado");
        setExam(e);
        setAnswerKey(e.answerKey || {});
        setSkillsKeys(e.skillsKeys || {});
        setAxesKeys(e.axesKeys || {});
        setLearningObjectivesKeys(e.learningObjectivesKeys || {});
        setDifficultiesKeys(e.difficultiesKeys || {});
      } catch (err: any) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/exams/${id}/answer-key`, {
        method: "PUT",
        body: { answerKey, skillsKeys, axesKeys, learningObjectivesKeys, difficultiesKeys }
      });
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
        setExam(eData);
        setAnswerKey(eData.answerKey || {});
        setSkillsKeys(eData.skillsKeys || {});
        setAxesKeys(eData.axesKeys || {});
        setLearningObjectivesKeys(eData.learningObjectivesKeys || {});
        setDifficultiesKeys(eData.difficultiesKeys || {});
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
    for (let i = 0; i < letters.length; i++) {
      if (i < 45) { // asumiendo max 45
        newKey[String(i + 1)] = letters[i];
      }
    }
    setAnswerKey(newKey);
    setShowPaste(false);
    setPasteText("");
  };

  if (loading) return <div className="p-8">Cargando...</div>;
  if (!exam) return <div className="p-8">Error al cargar el ensayo.</div>;

  const maxQ = Math.max(exam.questionCount || 45, ...Object.keys(answerKey).map(Number).filter(n => !isNaN(n)));
  const questions = Array.from({ length: maxQ }, (_, i) => String(i + 1));

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-6xl mx-auto">
            <div className="mb-6 flex justify-between items-end">
              <div>
                <Link href="/admin/exams" className="text-blue-600 hover:underline flex items-center gap-1 inline-flex mb-2">
                  <ArrowLeft className="w-4 h-4" /> Volver a Ensayos
                </Link>
                <h1 className="text-2xl font-bold">Pauta: {exam.title}</h1>
                <p className="text-gray-500">Completa las respuestas correctas, ejes, OAs y habilidades.</p>
              </div>
              
              <button 
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {saving ? "Guardando..." : <><Save className="w-5 h-5" /> Guardar Pauta</>}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              {/* Sidebar herramientas */}
              <div className="md:col-span-1 space-y-4">
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

                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl shadow-sm">
                  <h3 className="font-semibold mb-1 flex items-center gap-2 text-emerald-800">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Importar Pauta
                  </h3>
                  <p className="text-xs text-emerald-700 mb-3">
                    Sube la pauta en Excel (.xlsx) o CSV con claves, habilidades, ejes, OAs y dificultad TRI.
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
                    <thead className="bg-gray-50 border-b text-gray-600">
                      <tr>
                        <th className="p-3 font-semibold w-12 text-center">Nº</th>
                        <th className="p-3 font-semibold w-24">Clave</th>
                        <th className="p-3 font-semibold">Eje / Tema</th>
                        <th className="p-3 font-semibold w-20">OA</th>
                        <th className="p-3 font-semibold">Habilidad Cognitiva</th>
                        <th className="p-3 font-semibold w-32">Dificultad (TRI)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {questions.map((qNum) => (
                        <tr key={qNum} className="hover:bg-blue-50/30 transition-colors">
                          <td className="p-3 text-center font-bold text-gray-500">{qNum}</td>
                          <td className="p-3">
                            <select
                              value={answerKey[qNum] || ""}
                              onChange={e => setAnswerKey({ ...answerKey, [qNum]: e.target.value })}
                              className={`border rounded px-2 py-1.5 w-full font-bold focus:ring-2 focus:ring-blue-500 outline-none ${answerKey[qNum] ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white'}`}
                            >
                              <option value="">-</option>
                              {Array.from({length: exam.optionsCount || 4}, (_, i) => String.fromCharCode(65 + i)).map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3">
                            <input 
                              type="text" 
                              value={axesKeys[qNum] || ""} 
                              onChange={e => setAxesKeys({ ...axesKeys, [qNum]: e.target.value })}
                              placeholder="Ej: Geometría"
                              className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="p-3">
                            <input 
                              type="text" 
                              value={learningObjectivesKeys[qNum] || ""} 
                              onChange={e => setLearningObjectivesKeys({ ...learningObjectivesKeys, [qNum]: e.target.value })}
                              placeholder="OA 14"
                              className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="p-3">
                            <input 
                              type="text" 
                              value={skillsKeys[qNum] || ""} 
                              onChange={e => setSkillsKeys({ ...skillsKeys, [qNum]: e.target.value })}
                              placeholder="Ej: Argumentar y comunicar"
                              className="border rounded px-2 py-1.5 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="p-3">
                            <select
                              value={difficultiesKeys[qNum] !== undefined ? String(difficultiesKeys[qNum]) : "0.0"}
                              onChange={e => setDifficultiesKeys({ ...difficultiesKeys, [qNum]: e.target.value })}
                              className="border rounded px-2 py-1.5 w-full text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                              <option value="-1.5">Fácil (-1.5)</option>
                              <option value="0.0">Media (0.0)</option>
                              <option value="1.5">Difícil (+1.5)</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
        </AppShell>
      )}
    </RequireRole>
  );
}
