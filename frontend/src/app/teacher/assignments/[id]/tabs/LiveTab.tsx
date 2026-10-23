"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { 
  CheckCircle2, Clock, AlertCircle, RefreshCw, Zap, Plus, 
  RotateCcw, Sparkles, Check, ChevronRight, ShieldCheck 
} from "lucide-react";
import ReactivateStudentModal from "@/components/ReactivateStudentModal";
import ReactivateCourseModal from "@/components/ReactivateCourseModal";
import { useIsPruebas } from "@/lib/useIsPruebas";

export default function LiveTab({ id, apiEndpointPrefix = "/teacher" }: { id: number; apiEndpointPrefix?: string }) {
  const isPruebas = useIsPruebas();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [extendingMins, setExtendingMins] = useState<number | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modales
  const [selectedReactivateStudent, setSelectedReactivateStudent] = useState<any>(null);
  const [showReactivateCourseModal, setShowReactivateCourseModal] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch<any>(`${apiEndpointPrefix}/assignments/${id}/live`);
      setData(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 12000);
    return () => clearInterval(interval);
  }, [id, apiEndpointPrefix]);

  // Prórroga rápida (+15 min o +30 min)
  const handleQuickExtend = async (minutes: number) => {
    setExtendingMins(minutes);
    try {
      const res = await apiFetch<any>(`${apiEndpointPrefix}/assignments/${id}/quick-extend`, {
        method: "PATCH",
        body: { minutes }
      });
      setSuccessToast(`¡Plazo extendido en +${minutes} minutos exitosamente!`);
      setTimeout(() => setSuccessToast(null), 3500);
      await load();
    } catch (err: any) {
      alert("Error al extender plazo: " + (err.message || "Error"));
    } finally {
      setExtendingMins(null);
    }
  };

  if (error) return <div className="text-red-500 p-4">{error}</div>;
  if (!data) return <div className="animate-pulse p-4">Cargando monitor en vivo...</div>;

  return (
    <div className="space-y-6">

      {/* Banner de Feedback Rápido */}
      {successToast && (
        <div className="p-3 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center justify-between shadow-md animate-in slide-in-from-top-2 duration-150">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-200" /> {successToast}
          </span>
          <button onClick={() => setSuccessToast(null)} className="text-white/80 hover:text-white">✕</button>
        </div>
      )}

      {/* Barra de Herramientas y Acciones en Caliente */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-gradient-to-r from-gray-50 to-blue-50/40 border border-blue-100 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900">Monitor en Vivo de Aula</h2>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <p className="text-xs text-gray-500">
            Cierre general del curso: <strong className="text-gray-800">{data.closesAt ? new Date(data.closesAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "No configurado"}</strong>
          </p>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Prórroga Rápida +15 min */}
          <button
            type="button"
            disabled={extendingMins !== null}
            onClick={() => handleQuickExtend(15)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Extender 15 minutos más a todos los alumnos del curso"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{extendingMins === 15 ? "Extendiendo..." : "+15 min al curso"}</span>
          </button>

          {/* Prórroga Rápida +30 min */}
          <button
            type="button"
            disabled={extendingMins !== null}
            onClick={() => handleQuickExtend(30)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Extender 30 minutos más a todos los alumnos del curso"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{extendingMins === 30 ? "Extendiendo..." : "+30 min al curso"}</span>
          </button>

          {/* Reactivar Curso Completo */}
          <button
            type="button"
            onClick={() => setShowReactivateCourseModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Reactivar Curso</span>
          </button>

          {/* Botón Refrescar */}
          <button 
            type="button"
            onClick={load} 
            disabled={refreshing}
            className="p-1.5 border border-gray-200 bg-white text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-xl disabled:opacity-50 transition-colors"
            title="Actualizar ahora"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Grilla de Estudiantes en Vivo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.students.map((st: any) => {
          let badge = { cls: "bg-gray-50 text-gray-600 border-gray-200", icon: AlertCircle, label: "No ha entrado" };
          if (st.state === "IN_PROGRESS") badge = { cls: "bg-amber-50/60 text-amber-900 border-amber-200", icon: Clock, label: "Rindiendo" };
          if (st.state === "SUBMITTED") badge = { cls: "bg-emerald-50/60 text-emerald-900 border-emerald-200", icon: CheckCircle2, label: "Entregado" };
          
          const Icon = badge.icon;
          const pct = Math.round((st.answersCount / (data.questionCount || 1)) * 100);

          return (
            <div 
              key={st.rut} 
              className={`border rounded-2xl p-4 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all ${badge.cls}`}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <div className="pr-2">
                    <p className="font-bold text-sm text-gray-900 leading-tight">{st.name}</p>
                    <p className="text-[11px] font-mono text-gray-400 mt-0.5">{st.rut}</p>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/80 border border-current shadow-2xs shrink-0">
                    <Icon className="w-3.5 h-3.5" /> {badge.label}
                  </span>
                </div>

                {st.isExtended && (
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                      ⚡ Plazo extendido: {new Date(st.extendedDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                
                <div className="mt-3 text-xs">
                  {st.state === "NOT_STARTED" && (
                    <span className="text-gray-400 italic">Esperando ingreso del estudiante...</span>
                  )}

                  {st.state === "IN_PROGRESS" && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-gray-600">
                        <span>Progreso respondido</span>
                        <span>{st.answersCount} / {data.questionCount} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-white/70 rounded-full h-2 border border-amber-200/50 overflow-hidden">
                        <div className="bg-amber-500 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  {st.state === "SUBMITTED" && (
                    <div className="text-xs text-gray-600 font-medium">
                      Entregado a las {new Date(st.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>

              {/* Botón de Prórroga / Reactivación Directa */}
              <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between">
                <span className="text-[10px] text-gray-400 font-medium">Acción de Aula:</span>
                <button
                  type="button"
                  onClick={() => setSelectedReactivateStudent(st)}
                  className="flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs transition-colors"
                >
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span>{st.state === "SUBMITTED" ? "Reabrir Entrega" : "Dar Prórroga"}</span>
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal de Reactivación Individual */}
      {selectedReactivateStudent && (
        <ReactivateStudentModal
          isOpen={true}
          onClose={() => setSelectedReactivateStudent(null)}
          assignmentId={id}
          student={{
            rut: selectedReactivateStudent.rut,
            name: selectedReactivateStudent.name,
            state: selectedReactivateStudent.state
          }}
          examDurationMinutes={data?.durationMinutes}
          onSuccess={async () => {
            setSelectedReactivateStudent(null);
            await load();
          }}
          apiEndpointPrefix={apiEndpointPrefix}
        />
      )}

      {/* Modal de Reactivación de Curso */}
      <ReactivateCourseModal
        isOpen={showReactivateCourseModal}
        onClose={() => setShowReactivateCourseModal(false)}
        assignmentId={id}
        currentClosesAt={data.closesAt}
        onSuccess={async () => {
          setShowReactivateCourseModal(false);
          await load();
        }}
        apiEndpointPrefix={apiEndpointPrefix}
      />

    </div>
  );
}
