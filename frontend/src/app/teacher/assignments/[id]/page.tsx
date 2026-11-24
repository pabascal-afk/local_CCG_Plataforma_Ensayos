"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart2,
  Target,
  CheckSquare,
  Users,
  Download,
  LockOpen,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  History,
  FileText,
  Radio,
} from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import AiPromptModal from "@/components/AiPromptModal";

// Sub-components for report tabs
import SummaryTab from "./tabs/SummaryTab";
import SkillsTab from "./tabs/SkillsTab";
import ItemsTab from "./tabs/ItemsTab";
import StudentsTab from "./tabs/StudentsTab";
import RemedialTab from "./tabs/RemedialTab";
import EvolutionTab from "./tabs/EvolutionTab";
import LogsTab from "./tabs/LogsTab";

export default function TeacherAssignmentPage() {
  const { id } = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("summary");
  const [assignment, setAssignment] = useState<any>(null);
  const [error, setError] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);

  const loadBase = () => {
    apiFetch(`/teacher/assignments`)
      .then((data) => {
        const found = (data as any[]).find((a) => a.id === Number(id));
        if (found) {
          setAssignment(found);
        } else {
          setError("Asignación no encontrada");
        }
      })
      .catch((e) => setError(e.message));
  };

  const handleToggleMode = async () => {
    if (!assignment) return;
    const currentMode = assignment.applicationMode === "PRINTED" ? "PRINTED" : "DIGITAL";
    const nextMode = currentMode === "PRINTED" ? "DIGITAL" : "PRINTED";
    const msg = nextMode === "DIGITAL"
      ? "¿Deseas cambiar el formato general a DIGITAL? Los estudiantes podrán ingresar y rendir la prueba desde sus cuentas en pantalla."
      : "¿Deseas cambiar el formato general a PAPEL? Los estudiantes no podrán rendir en línea (quedarán en espera de hoja de respuestas impresa).";
    if (!confirm(msg)) return;

    setTogglingMode(true);
    try {
      await apiFetch(`/teacher/assignments/${id}/mode`, {
        method: "PATCH",
        body: { applicationMode: nextMode }
      });
      setAssignment((prev: any) => ({ ...prev, applicationMode: nextMode }));
    } catch (e: any) {
      alert(e.message || "Error al cambiar la modalidad");
    } finally {
      setTogglingMode(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "live") {
        router.replace(`/teacher/live/${id}`);
        return;
      }
      if (tabParam) {
        setActiveTab(tabParam);
      }
    }
    loadBase();
  }, [id, router]);

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

  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!assignment) return <div className="p-8">Cargando datos...</div>;

  const tabs = [
    { id: "summary", label: "Resumen", icon: BarChart2 },
    { id: "skills", label: "Habilidades", icon: Target },
    { id: "items", label: "Preguntas", icon: CheckSquare },
    { id: "students", label: "Estudiantes", icon: Users },
    { id: "remedial", label: "Acción Remedial", icon: AlertTriangle },
    { id: "evolution", label: "Evolución", icon: TrendingUp },
    { id: "logs", label: "Historial y Logs", icon: History },
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
                  <ArrowLeft className="w-4 h-4" /> Volver a Reportes
                </Link>
                <h1 className="text-2xl font-bold flex flex-wrap items-center gap-2.5 text-gray-800">
                  <span>{assignment.title || assignment.Exam?.title}</span>
                  {assignment.applicationMode === "PRINTED" ? (
                    <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-full flex items-center gap-1 border border-amber-200 font-bold">
                      📄 Modalidad Papel
                    </span>
                  ) : (
                    <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full flex items-center gap-1 border border-blue-200 font-bold">
                      💻 Modalidad Digital
                    </span>
                  )}
                  {assignment.released && (
                    <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-200 font-bold">
                      <LockOpen className="w-3.5 h-3.5" /> Resultados Liberados
                    </span>
                  )}
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
                  onClick={() => setShowAiModal(true)}
                  className="p-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg shadow-xs transition-all cursor-pointer"
                  title="Asistente de Prompts para Agentes de IA: Generar Taller de Refuerzo o Guía de Aula"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </button>
                <Link
                  href={`/teacher/live/${id}`}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg shadow-xs font-bold text-xs flex items-center gap-1.5 transition-colors"
                  title="Abrir Monitor de Sala y Control En Vivo para este curso"
                >
                  <Radio className="w-4 h-4 text-emerald-600" />
                  <span>Monitor En Vivo</span>
                </Link>
                <button
                  type="button"
                  onClick={handleToggleMode}
                  disabled={togglingMode}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg shadow-xs font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Cambiar formato general de la evaluación (Papel ↔ Digital)"
                >
                  {assignment.applicationMode === "PRINTED" ? (
                    <>
                      <span>💻</span>
                      <span>{togglingMode ? "Cambiando..." : "Pasar a Digital"}</span>
                    </>
                  ) : (
                    <>
                      <span>📄</span>
                      <span>{togglingMode ? "Cambiando..." : "Pasar a Papel"}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  className="p-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg shadow-xs transition-colors cursor-pointer"
                  title="Exportar Resultados del Curso a Excel (.xlsx)"
                >
                  <Download className="w-4 h-4" />
                </button>
                <Link
                  href={`/teacher/assignments/${id}/report`}
                  target="_blank"
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Generar e imprimir Informe Pedagógico de la Prueba en PDF"
                >
                  <FileText className="w-4 h-4" />
                  <span>Informe PDF</span>
                </Link>
                {!assignment.released && (
                  <button
                    onClick={handleRelease}
                    className="bg-emerald-600 text-white px-3.5 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs text-xs cursor-pointer"
                  >
                    <LockOpen className="w-3.5 h-3.5" /> Liberar Resultados
                  </button>
                )}
              </div>
            </div>

            <div className="border-b border-gray-200 mb-6 flex overflow-x-auto">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2 px-6 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
                      active
                        ? "border-blue-600 text-blue-600 font-bold"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {t.label}
                  </button>
                );
              })}
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 min-h-[500px]">
              {activeTab === "summary" && <SummaryTab id={Number(id)} />}
              {activeTab === "skills" && <SkillsTab id={Number(id)} />}
              {activeTab === "items" && <ItemsTab id={Number(id)} />}
              {activeTab === "students" && <StudentsTab id={Number(id)} />}
              {activeTab === "remedial" && <RemedialTab assignmentId={id as string} />}
              {activeTab === "evolution" && <EvolutionTab assignmentId={Number(id)} />}
              {activeTab === "logs" && <LogsTab id={Number(id)} />}
            </div>
          </div>

          {/* Modal Asistente Prompts IA */}
          <AiPromptModal
            isOpen={showAiModal}
            onClose={() => setShowAiModal(false)}
            defaultMode="CLASS_WORKSHOP"
            initialLevel={assignment?.Course?.level}
            initialSubject={assignment?.subject || assignment?.Exam?.subject}
            initialCourseName={
              assignment?.courseName ||
              (assignment?.Course
                ? `${assignment.Course.level?.replace("B", "° Básico").replace("M", "° Medio")} ${assignment.Course.letter}`
                : "Curso")
            }
            initialExamTitle={assignment?.title || assignment?.Exam?.title}
          />
        </AppShell>
      )}
    </RequireRole>
  );
}
