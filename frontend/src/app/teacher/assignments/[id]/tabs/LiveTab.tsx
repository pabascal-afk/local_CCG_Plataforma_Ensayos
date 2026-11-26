"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { 
  CheckCircle2, Clock, AlertCircle, RefreshCw, Zap, Plus, 
  RotateCcw, Sparkles, Check, ChevronRight, ShieldCheck,
  Headphones, ShieldAlert, Undo2, Lock
} from "lucide-react";
import ReactivateStudentModal from "@/components/ReactivateStudentModal";
import ReactivateCourseModal from "@/components/ReactivateCourseModal";
import ExcludeStudentModal from "@/components/ExcludeStudentModal";
import { useIsPruebas } from "@/lib/useIsPruebas";

export default function LiveTab({ id, apiEndpointPrefix = "/teacher" }: { id: number; apiEndpointPrefix?: string }) {
  const isPruebas = useIsPruebas();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [extendingMins, setExtendingMins] = useState<number | null>(null);
  const [grantingRoomAudio, setGrantingRoomAudio] = useState(false);
  const [grantingStudentAudioRut, setGrantingStudentAudioRut] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modales
  const [selectedReactivateStudent, setSelectedReactivateStudent] = useState<any>(null);
  const [showReactivateCourseModal, setShowReactivateCourseModal] = useState(false);
  const [selectedExcludeStudent, setSelectedExcludeStudent] = useState<any>(null);

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
      await apiFetch<any>(`${apiEndpointPrefix}/assignments/${id}/quick-extend`, {
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

  // +1 Escucha a toda la sala (solo audios agotados)
  const handleRoomExtraAudio = async () => {
    if (!confirm("¿Deseas otorgar +1 escucha a todos los audios agotados para los alumnos de la sala?")) return;
    setGrantingRoomAudio(true);
    try {
      const res = await apiFetch<any>(`${apiEndpointPrefix}/assignments/${id}/audio-extra-play/room`, {
        method: "POST"
      });
      setSuccessToast(
        res.affectedStudentsCount > 0
          ? `¡Se otorgó +1 escucha a audios agotados a ${res.affectedStudentsCount} estudiante(s)!`
          : "Ningún estudiante tiene audios con reproducciones agotadas en este momento."
      );
      setTimeout(() => setSuccessToast(null), 4000);
      await load();
    } catch (err: any) {
      alert("Error al otorgar escuchas de audio: " + (err.message || "Error"));
    } finally {
      setGrantingRoomAudio(false);
    }
  };

  // +1 Escucha individual a audios agotados
  const handleStudentExtraAudio = async (st: any) => {
    setGrantingStudentAudioRut(st.rut);
    try {
      const res = await apiFetch<any>(`${apiEndpointPrefix}/assignments/${id}/students/${st.rut}/audio-extra-play`, {
        method: "POST"
      });
      setSuccessToast(`¡+1 escucha otorgada a ${st.name}!`);
      setTimeout(() => setSuccessToast(null), 3500);
      await load();
    } catch (err: any) {
      alert(err.message || "No se pudo otorgar la escucha extra.");
    } finally {
      setGrantingStudentAudioRut(null);
    }
  };

  // Reintegrar estudiante excluido
  const handleUnexclude = async (st: any) => {
    if (!confirm(`¿Deseas reintegrar a ${st.name} a los informes y estadísticas de la evaluación?`)) return;
    try {
      await apiFetch<any>(`${apiEndpointPrefix}/assignments/${id}/students/${st.rut}/unexclude`, {
        method: "POST"
      });
      setSuccessToast(`¡${st.name} ha sido reintegrado a los informes!`);
      setTimeout(() => setSuccessToast(null), 3500);
      await load();
    } catch (err: any) {
      alert("Error al reintegrar: " + (err.message || "Error"));
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
          {/* +1 Escucha a Toda la Sala */}
          {data.hasAudios && data.limitedAudioClipsCount > 0 && (
            <button
              type="button"
              disabled={grantingRoomAudio}
              onClick={handleRoomExtraAudio}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Otorgar +1 escucha a audios agotados para toda la sala"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{grantingRoomAudio ? "Concediendo..." : "+1 Escucha Sala"}</span>
            </button>
          )}

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
          if (st.isExcluded) badge = { cls: "bg-slate-100 text-slate-700 border-slate-300", icon: ShieldAlert, label: "Excluido" };
          else if (st.state === "IN_PROGRESS") badge = { cls: "bg-amber-50/60 text-amber-900 border-amber-200", icon: Clock, label: "Rindiendo" };
          else if (st.state === "SUBMITTED") badge = { cls: "bg-emerald-50/60 text-emerald-900 border-emerald-200", icon: CheckCircle2, label: "Entregado" };
          
          const Icon = badge.icon;
          const pct = Math.round((st.answersCount / (data.questionCount || 1)) * 100);

          return (
            <div 
              key={st.rut} 
              className={`border rounded-2xl p-4 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all ${st.isExcluded ? "bg-slate-50/90 border-slate-300 opacity-90" : badge.cls}`}
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

                {st.isExcluded && (
                  <div className="mb-2 p-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 space-y-0.5">
                    <div className="flex items-center gap-1 font-bold text-slate-800">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Excluido de informes:</span>
                    </div>
                    <p className="text-[11px] text-slate-600 italic pl-4.5">"{st.exclusionReason}"</p>
                    {st.exclusionDetails && (
                      <p className="text-[10px] text-slate-500 pl-4.5">{st.exclusionDetails}</p>
                    )}
                  </div>
                )}

                {st.isExtended && !st.isExcluded && (
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                      ⚡ Plazo extendido: {new Date(st.extendedDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                
                {!st.isExcluded && (
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
                )}
              </div>

              {/* Acciones de Aula */}
              <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between gap-2 flex-wrap">
                {st.isExcluded ? (
                  <button
                    type="button"
                    onClick={() => handleUnexclude(st)}
                    className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                    title="Reintegrar estudiante a las estadísticas y promedios de la evaluación"
                  >
                    <Undo2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>Reintegrar a informes</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedExcludeStudent(st)}
                      className="text-[11px] font-semibold text-gray-500 hover:text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
                      title="Excluir de informes con justificación pedagógica"
                    >
                      <ShieldAlert className="w-3 h-3 text-amber-600" />
                      <span>Excluir</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {st.hasExhaustedAudios && (
                        <button
                          type="button"
                          disabled={grantingStudentAudioRut === st.rut}
                          onClick={() => handleStudentExtraAudio(st)}
                          className="flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                          title="Otorgar +1 escucha a audios agotados de este estudiante"
                        >
                          <Headphones className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{grantingStudentAudioRut === st.rut ? "Concediendo..." : "+1 Escucha"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedReactivateStudent(st)}
                        className="flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs transition-colors cursor-pointer"
                      >
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span>{st.state === "SUBMITTED" ? "Reabrir" : "Prórroga"}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal de Exclusión Individual */}
      {selectedExcludeStudent && (
        <ExcludeStudentModal
          isOpen={true}
          onClose={() => setSelectedExcludeStudent(null)}
          assignmentId={id}
          student={{
            rut: selectedExcludeStudent.rut,
            name: selectedExcludeStudent.name
          }}
          onSuccess={async () => {
            setSelectedExcludeStudent(null);
            setSuccessToast(`Estudiante excluido de informes exitosamente.`);
            setTimeout(() => setSuccessToast(null), 3500);
            await load();
          }}
        />
      )}

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
