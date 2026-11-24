"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart2,
  KeyRound,
  Copy,
  Check,
  Sparkles,
  Tv,
  Headphones,
  Zap,
  Radio,
} from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { copyToClipboard as safeCopyToClipboard } from "@/lib/clipboard";
import { useParams } from "next/navigation";
import AudioCutterModal from "@/components/AudioCutterModal";
import ReactivateCourseModal from "@/components/ReactivateCourseModal";
import { useIsPruebas } from "@/lib/useIsPruebas";
import LiveTab from "../../assignments/[id]/tabs/LiveTab";

export default function TeacherLiveDetailPage() {
  const { id } = useParams();
  const isPruebas = useIsPruebas();
  const [assignment, setAssignment] = useState<any>(null);
  const [error, setError] = useState("");

  // Estado para Contraseña Dinámica de Sala
  const [dynamicPassword, setDynamicPassword] = useState("");
  const [dynamicActive, setDynamicActive] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [showProjectorModal, setShowProjectorModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [extendingMinutes, setExtendingMinutes] = useState<number | null>(null);

  const loadBase = () => {
    apiFetch(`/teacher/assignments`)
      .then((data) => {
        const found = (data as any[]).find((a) => a.id === Number(id));
        if (found) {
          setAssignment(found);
          setDynamicPassword(found.dynamicPassword || "");
          setDynamicActive(Boolean(found.dynamicPasswordActive));
        } else {
          setError("Asignación no encontrada");
        }
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadBase();
  }, [id]);

  const handleQuickExtend = async (minutes: number) => {
    try {
      setExtendingMinutes(minutes);
      await apiFetch(`/teacher/assignments/${id}/quick-extend`, {
        method: "PATCH",
        body: { minutes, extendStudents: true },
      });
      loadBase();
    } catch (e: any) {
      alert(e.message || "Error al extender tiempo");
    } finally {
      setExtendingMinutes(null);
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
            dynamicPasswordActive: activeToSave,
          },
        }
      );
      setDynamicPassword(res.dynamicPassword || "");
      setDynamicActive(res.dynamicPasswordActive);
      setAssignment((prev: any) =>
        prev
          ? {
              ...prev,
              dynamicPassword: res.dynamicPassword,
              dynamicPasswordActive: res.dynamicPasswordActive,
            }
          : prev
      );
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
    const generated = `${isPruebas ? "PRUEBA" : "SIMCE"}-${num}${letter}`;
    setDynamicPassword(generated);
    handleSaveDynamicPassword(true, generated);
  };

  const copyToClipboard = async (text: string) => {
    await safeCopyToClipboard(text);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!assignment) return <div className="p-8">Cargando monitor en vivo...</div>;

  return (
    <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <Link
                  href="/teacher/live"
                  className="text-emerald-700 hover:underline flex items-center gap-1 inline-flex mb-2 font-medium text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver a En Vivo
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-3 text-gray-800">
                  <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full border border-emerald-200 font-bold uppercase tracking-wide">
                    <Radio className="w-3.5 h-3.5" /> En Vivo
                  </span>
                  <span>{assignment.title || assignment.Exam?.title}</span>
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Curso:{" "}
                  <span className="font-semibold text-gray-800">
                    {assignment.courseName ||
                      `${assignment.Course?.level?.replace("B", "° Básico").replace("M", "° Medio")} ${assignment.Course?.letter}`}
                  </span>{" "}
                  · Asignatura:{" "}
                  <span className="font-semibold text-gray-800">
                    {assignment.subject || assignment.Exam?.subject}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setShowAudioModal(true)}
                  className="px-3 py-2 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                  title="Gestionar y Recortar Audios por Pregunta"
                >
                  <Headphones className="w-4 h-4 text-purple-600" />
                  <span>Audios</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickExtend(15)}
                  disabled={extendingMinutes !== null}
                  className="px-2.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-lg shadow-xs transition-all flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
                  title="Añadir +15 minutos al plazo del curso y alumnos en curso"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-600 fill-current" />
                  <span>+15 min</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickExtend(30)}
                  disabled={extendingMinutes !== null}
                  className="px-2.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-lg shadow-xs transition-all flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
                  title="Añadir +30 minutos al plazo del curso y alumnos en curso"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-600 fill-current" />
                  <span>+30 min</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReactivateModal(true)}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-lg shadow-xs transition-all flex items-center gap-1.5 text-xs cursor-pointer"
                  title="Extender plazo de la evaluación o reactivar para el curso"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Reactivar</span>
                </button>
                <Link
                  href={`/teacher/assignments/${id}`}
                  className="px-3 py-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg shadow-xs font-bold text-xs flex items-center gap-1.5 transition-colors"
                  title="Ir al reporte detallado, resultados y análisis de esta evaluación"
                >
                  <BarChart2 className="w-4 h-4 text-blue-600" />
                  <span>Ver Reporte</span>
                </Link>
              </div>
            </div>

            {/* Tarjeta de Contraseña Dinámica de Sala */}
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
                    <span
                      className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase ${
                        dynamicActive
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
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
                      placeholder={isPruebas ? "Ej: PRUEBA2026" : "Ej: SIMCE2026"}
                      value={dynamicPassword}
                      onChange={(e) => setDynamicPassword(e.target.value.toUpperCase())}
                      className="text-sm font-mono font-bold text-gray-800 tracking-wider uppercase w-32 focus:outline-none"
                    />
                    {dynamicPassword && (
                      <button
                        onClick={() => copyToClipboard(dynamicPassword)}
                        className="text-gray-400 hover:text-amber-600 p-1 transition-colors cursor-pointer"
                        title="Copiar PIN"
                      >
                        {copiedPin ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  <button
                    onClick={generateRandomPin}
                    className="flex items-center gap-1.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    title="Generar PIN aleatorio simple"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Generar PIN
                  </button>

                  <button
                    onClick={() => handleSaveDynamicPassword(!dynamicActive)}
                    disabled={savingPin || (!dynamicActive && !dynamicPassword.trim())}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer ${
                      dynamicActive
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                    }`}
                  >
                    {savingPin ? "Guardando..." : dynamicActive ? "Desactivar PIN" : "Activar PIN"}
                  </button>

                  {dynamicActive && dynamicPassword && (
                    <button
                      onClick={() => setShowProjectorModal(true)}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
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
                    {isPruebas ? "Acceso a la Evaluación" : "Acceso al Ensayo SIMCE"}
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
                    {isPruebas
                      ? "Esta clave es válida únicamente durante la rendición de esta evaluación."
                      : "Esta clave es válida únicamente durante la rendición de este ensayo."}
                  </p>

                  <button
                    onClick={() => setShowProjectorModal(false)}
                    className="bg-gray-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold text-base transition-colors shadow-md cursor-pointer"
                  >
                    Cerrar Proyección
                  </button>
                </div>
              </div>
            )}

            {/* Monitor en Vivo de Sala */}
            <div className="bg-white rounded-xl shadow-sm border p-6 min-h-[500px]">
              <LiveTab id={Number(id)} />
            </div>
          </div>

          {/* Modal Recortador y Gestor de Audios */}
          {assignment && (
            <AudioCutterModal
              isOpen={showAudioModal}
              onClose={() => setShowAudioModal(false)}
              assignmentId={Number(id)}
              examId={assignment.examId || assignment.Exam?.id}
              examTitle={assignment.title || assignment.Exam?.title}
              questionCount={assignment.Exam?.questionCount || 30}
            />
          )}

          {/* Modal Reactivar Evaluación Curso */}
          {assignment && (
            <ReactivateCourseModal
              isOpen={showReactivateModal}
              onClose={() => setShowReactivateModal(false)}
              assignmentId={Number(id)}
              currentClosesAt={assignment.closesAt}
              examTitle={assignment.title || assignment.Exam?.title}
              courseName={
                assignment.courseName ||
                (assignment?.Course
                  ? `${assignment.Course.level?.replace("B", "° Básico").replace("M", "° Medio")} ${assignment.Course.letter}`
                  : undefined)
              }
              onSuccess={loadBase}
            />
          )}
        </AppShell>
      )}
    </RequireRole>
  );
}
