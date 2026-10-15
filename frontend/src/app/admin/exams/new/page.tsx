"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import AiPromptModal from "@/components/AiPromptModal";
import { getToken } from "@/lib/session";

export default function NewExamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("4B");
  const [questionCount, setQuestionCount] = useState(30);
  const [optionCount, setOptionCount] = useState(4);
  const [orderNumber, setOrderNumber] = useState(1);
  const [examType, setExamType] = useState("ENSAYO");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);

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
    const formData = new FormData();
    formData.append("title", title);
    formData.append("subject", subject);
    formData.append("level", level);
    formData.append("questionCount", questionCount.toString());
    formData.append("optionsCount", optionCount.toString());
    formData.append("orderNumber", orderNumber.toString());
    formData.append("examType", examType);
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

  const isPruebas = typeof window !== "undefined" && (window.location.port === "3600" || window.location.hostname.includes("pruebas"));

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
                    ? "Sube el PDF de la prueba y configura los parámetros base. Luego podrás ingresar o importar la pauta de preguntas (.xlsx)." 
                    : "Sube el PDF y configura los parámetros base. Luego podrás editar la pauta correcta."}
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
                  <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de Evaluación</label>
                  <select value={examType} onChange={e=>setExamType(e.target.value)} className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    {isPruebas ? (
                      <>
                        <option value="PRUEBA_UNIDAD">Prueba de Unidad</option>
                        <option value="QUIZ">Quiz / Control Rápido</option>
                        <option value="CONOCIMIENTOS_GENERALES">Prueba de Conocimientos Generales</option>
                        <option value="DIAGNOSTICO">Evaluación Diagnóstica</option>
                        <option value="ENSAYO">Evaluación Sumativa Regular</option>
                      </>
                    ) : (
                      <>
                        <option value="QUIZ">Quiz (Corto)</option>
                        <option value="ENSAYO">Ensayo Normal</option>
                        <option value="ENSAYO_LARGO">Ensayo Largo</option>
                        <option value="DIAGNOSTICO">Diagnóstico</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Cantidad de Preguntas</label>
                  <input 
                    type="number" required min="1" max="100" value={questionCount} onChange={e=>setQuestionCount(parseInt(e.target.value))}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Alternativas</label>
                  <select value={optionCount} onChange={e=>setOptionCount(parseInt(e.target.value))} className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    <option value={4}>4 (A, B, C, D)</option>
                    <option value={5}>5 (A, B, C, D, E)</option>
                  </select>
                </div>
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
