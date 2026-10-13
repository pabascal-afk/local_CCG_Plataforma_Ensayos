"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  PlayCircle, 
  BarChart2, 
  Target, 
  CheckSquare, 
  Users, 
  Download, 
  LockOpen, 
  AlertTriangle, 
  TrendingUp,
  KeyRound,
  Copy,
  Check,
  Sparkles,
  Tv
} from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useParams } from "next/navigation";
import AiPromptModal from "@/components/AiPromptModal";

// Sub-components for tabs
import LiveTab from "./tabs/LiveTab";
import SummaryTab from "./tabs/SummaryTab";
import SkillsTab from "./tabs/SkillsTab";
import ItemsTab from "./tabs/ItemsTab";
import StudentsTab from "./tabs/StudentsTab";
import RemedialTab from "./tabs/RemedialTab";
import EvolutionTab from "./tabs/EvolutionTab";

export default function TeacherAssignmentPage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("live");
  const [assignment, setAssignment] = useState<any>(null);
  const [error, setError] = useState("");

  // Estado para Contraseña Dinámica de Ensayo
  const [dynamicPassword, setDynamicPassword] = useState("");
  const [dynamicActive, setDynamicActive] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [showProjectorModal, setShowProjectorModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  const loadBase = () => {
    apiFetch(`/teacher/assignments`).then(data => {
      const found = (data as any[]).find(a => a.id === Number(id));
      if (found) {
        setAssignment(found);
        setDynamicPassword(found.dynamicPassword || "");
        setDynamicActive(Boolean(found.dynamicPasswordActive));
      } else {
        setError("Asignación no encontrada");
      }
    }).catch(e => setError(e.message));
  };

  useEffect(() => {
    loadBase();
  }, [id]);

  const handleRelease = async () => {
    if (!confirm("¿Seguro que quieres liberar los resultados? Los estudiantes podrán ver su nota, pauta y nivel de logro.")) return;
    try {
      await apiFetch(`/teacher/assignments/${id}/release`, { method: "POST" });
      alert("Resultados liberados exitosamente.");
      loadBase();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSaveDynamicPassword = async (newActiveState?: boolean, newPinVal?: string) => {
    setSavingPin(true);
    const activeToSave = newActiveState !== undefined ? newActiveState : dynamicActive;
    const pinToSave = (newPinVal !== undefined ? newPinVal : dynamicPassword).trim().toUpperCase();

    try {
      const res = await apiFetch<{ dynamicPassword: string; dynamicPasswordActive: boolean }>(
        `/teacher/assignments/${id}/dynamic-password`,
        {
          method: "POST",
          body: {
            dynamicPassword: pinToSave,
            dynamicPasswordActive: activeToSave
          }
        }
      );
      setDynamicPassword(res.dynamicPassword || "");
      setDynamicActive(res.dynamicPasswordActive);
      setAssignment((prev: any) => prev ? { ...prev, dynamicPassword: res.dynamicPassword, dynamicPasswordActive: res.dynamicPasswordActive } : prev);
    } catch (err: any) {
      alert(err.message || "Error al actualizar contraseña dinámica");
    } finally {
      setSavingPin(false);
    }
  };

  const generateRandomPin = () => {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const num = Math.floor(100 + Math.random() * 900);
    const letter = letters[Math.floor(Math.random() * letters.length)];
    const generated = `SIMCE-${num}${letter}`;
    setDynamicPassword(generated);
    handleSaveDynamicPassword(true, generated);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!assignment) return <div className="p-8">Cargando datos...</div>;

  const tabs = [
    { id: "live", label: "En vivo", icon: PlayCircle },
    { id: "summary", label: "Resumen", icon: BarChart2 },
    { id: "skills", label: "Habilidades", icon: Target },
    { id: "items", label: "Preguntas", icon: CheckSquare },
    { id: "students", label: "Estudiantes", icon: Users },
    { id: "remedial", label: "Acción Remedial", icon: AlertTriangle },
    { id: "evolution", label: "Evolución", icon: TrendingUp },
  ];

  const handleExport = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
    window.location.href = `/api/teacher/assignments/${id}/export.xlsx?token=${token}`;
  };

  return (
    <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <Link href="/teacher" className="text-blue-600 hover:underline flex items-center gap-1 inline-flex mb-2">
                  <ArrowLeft className="w-4 h-4" /> Volver a Panel
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-3 text-gray-800">
                  {assignment.title || assignment.Exam?.title}
                  {assignment.released && (
                    <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-200">
                      <LockOpen className="w-3.5 h-3.5" /> Resultados Liberados
                    </span>
                  )}
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Curso: <span className="font-semibold text-gray-800">{assignment.courseName || `${assignment.Course?.level?.replace('B', '° Básico').replace('M', '° Medio')} ${assignment.Course?.letter}`}</span> · Asignatura: <span className="font-semibold text-gray-800">{assignment.subject || assignment.Exam?.subject}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <button 
                  type="button"
                  onClick={() => setShowAiModal(true)}
                  className="p-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg shadow-xs transition-all"
                  title="Asistente de Prompts para Agentes de IA: Generar Taller de Refuerzo o Guía de Aula"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </button>
                <button 
                  type="button"
                  onClick={handleExport}
                  className="p-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg shadow-xs transition-colors"
                  title="Exportar Resultados del Curso a Excel (.xlsx)"
                >
                  <Download className="w-4 h-4" />
                </button>
                {!assignment.released && (
                  <button 
                    onClick={handleRelease}
                    className="bg-emerald-600 text-white px-3.5 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs text-xs"
                  >
                    <LockOpen className="w-3.5 h-3.5" /> Liberar Resultados
                  </button>
                )}
              </div>
            </div>

            {/* Tarjeta de Contraseña Dinámica de Ensayo Compacta */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-xl p-3.5 mb-6 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-100 text-amber-800 p-1 rounded-md border border-amber-300">
                      <KeyRound className="w-3.5 h-3.5" />
                    </span>
                    <h3 className="font-bold text-gray-900 text-sm">
                      Contraseña Dinámica de Sala (PIN Temporal)
                    </h3>
                    <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase ${dynamicActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-gray-200 text-gray-700'}`}>
                      {dynamicActive ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600">
                    Acceso para estudiantes con RUT y PIN si olvidaron su clave personal.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-amber-300 shadow-inner">
                    <input
                      type="text"
                      placeholder="Ej: SIMCE2026"
                      value={dynamicPassword}
                      onChange={(e) => setDynamicPassword(e.target.value.toUpperCase())}
                      className="text-sm font-mono font-bold text-gray-800 tracking-wider uppercase w-32 focus:outline-none"
                    />
                    {dynamicPassword && (
                      <button
                        onClick={() => copyToClipboard(dynamicPassword)}
                        className="text-gray-400 hover:text-amber-600 p-1 transition-colors"
                        title="Copiar PIN"
                      >
                        {copiedPin ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  <button
                    onClick={generateRandomPin}
                    className="flex items-center gap-1.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    title="Generar PIN aleatorio simple"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Generar PIN
                  </button>

                  <button
                    onClick={() => handleSaveDynamicPassword(!dynamicActive)}
                    disabled={savingPin || (!dynamicActive && !dynamicPassword.trim())}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors ${
                      dynamicActive 
                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50'
                    }`}
                  >
                    {savingPin ? "Guardando..." : dynamicActive ? "Desactivar PIN" : "Activar PIN"}
                  </button>

                  {dynamicActive && dynamicPassword && (
                    <button
                      onClick={() => setShowProjectorModal(true)}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors"
                      title="Proyectar en pantalla gigante para la sala"
                    >
                      <Tv className="w-3.5 h-3.5" /> Proyectar en Sala
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal de Proyección en Sala de Clases */}
            {showProjectorModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-xs">
                <div className="bg-white rounded-3xl p-10 max-w-2xl w-full text-center shadow-2xl border-4 border-amber-400">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 text-amber-600 rounded-full mb-4">
                    <KeyRound className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-extrabold text-gray-800 uppercase tracking-wide">
                    Acceso al Ensayo SIMCE
                  </h2>
                  <p className="text-gray-600 mt-2 text-base">
                    Si olvidaste tu contraseña personal, ingresa con tu RUT y la siguiente clave:
                  </p>

                  <div className="my-8 bg-amber-50 border-2 border-dashed border-amber-400 rounded-2xl py-6 px-4">
                    <span className="text-xs uppercase font-bold text-amber-700 tracking-widest block mb-1">
                      Contraseña Temporal del Curso
                    </span>
                    <span className="text-5xl md:text-6xl font-black font-mono text-gray-900 tracking-widest selection:bg-amber-300">
                      {dynamicPassword}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 mb-6">
                    Esta clave es válida únicamente durante la rendición de este ensayo.
                  </p>

                  <button
                    onClick={() => setShowProjectorModal(false)}
                    className="bg-gray-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold text-base transition-colors shadow-md"
                  >
                    Cerrar Proyección
                  </button>
                </div>
              </div>
            )}

            <div className="border-b border-gray-200 mb-6 flex overflow-x-auto">
              {tabs.map(t => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2 px-6 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
                      active ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {t.label}
                  </button>
                );
              })}
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 min-h-[500px]">
              {activeTab === "live" && <LiveTab id={Number(id)} />}
              {activeTab === "summary" && <SummaryTab id={Number(id)} />}
              {activeTab === "skills" && <SkillsTab id={Number(id)} />}
              {activeTab === "items" && <ItemsTab id={Number(id)} />}
              {activeTab === "students" && <StudentsTab id={Number(id)} />}
              {activeTab === "remedial" && <RemedialTab assignmentId={id as string} />}
              {activeTab === "evolution" && <EvolutionTab assignmentId={Number(id)} />}
            </div>
          </div>

          {/* Modal Asistente Prompts IA */}
          <AiPromptModal
            isOpen={showAiModal}
            onClose={() => setShowAiModal(false)}
            defaultMode="CLASS_WORKSHOP"
            initialLevel={assignment?.Course?.level}
            initialSubject={assignment?.subject || assignment?.Exam?.subject}
            initialCourseName={assignment?.courseName || (assignment?.Course ? `${assignment.Course.level?.replace('B', '° Básico').replace('M', '° Medio')} ${assignment.Course.letter}` : "Curso")}
            initialExamTitle={assignment?.title || assignment?.Exam?.title}
          />
        </AppShell>
      )}
    </RequireRole>
  );
}
