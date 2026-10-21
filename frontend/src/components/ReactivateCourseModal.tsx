"use client";

import { useState, useEffect } from "react";
import { X, Zap, Clock, Users, Calendar, AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useIsPruebas } from "@/lib/useIsPruebas";

interface ReactivateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: number;
  currentClosesAt?: string;
  examTitle?: string;
  courseName?: string;
  onSuccess: () => void;
  apiEndpointPrefix?: string; // default "/teacher"
}

export default function ReactivateCourseModal({
  isOpen,
  onClose,
  assignmentId,
  currentClosesAt,
  examTitle,
  courseName,
  onSuccess,
  apiEndpointPrefix = "/teacher"
}: ReactivateCourseModalProps) {
  const isPruebas = useIsPruebas();
  const [closesAtInput, setClosesAtInput] = useState("");
  const [scope, setScope] = useState<"PENDING_ONLY" | "ALL_STUDENTS">("PENDING_ONLY");
  const [resetMode, setResetMode] = useState<"KEEP_ANSWERS" | "CLEAR_ANSWERS">("KEEP_ANSWERS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Helper para formatear Date a formato YYYY-MM-DDTHH:mm para input datetime-local
  const toLocalIso = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Inicializar con +2 horas por defecto
  useEffect(() => {
    if (isOpen) {
      const defaultDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      setClosesAtInput(toLocalIso(defaultDate));
      setScope("PENDING_ONLY");
      setResetMode("KEEP_ANSWERS");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const setPreset = (type: "1h" | "2h" | "today_end" | "tomorrow_18") => {
    const now = new Date();
    let target = new Date();
    if (type === "1h") {
      target = new Date(now.getTime() + 60 * 60 * 1000);
    } else if (type === "2h") {
      target = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    } else if (type === "today_end") {
      target.setHours(23, 59, 0, 0);
    } else if (type === "tomorrow_18") {
      target.setDate(target.getDate() + 1);
      target.setHours(18, 0, 0, 0);
    }
    setClosesAtInput(toLocalIso(target));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closesAtInput) {
      setError("Debes indicar una fecha y hora de cierre válida");
      return;
    }

    const selectedDate = new Date(closesAtInput);
    if (isNaN(selectedDate.getTime()) || selectedDate <= new Date()) {
      setError("La fecha de cierre debe ser en el futuro");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await apiFetch(`${apiEndpointPrefix}/assignments/${assignmentId}/reactivate`, {
        method: "POST",
        body: {
          closesAt: selectedDate.toISOString(),
          scope,
          resetMode
        }
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Error al reactivar la evaluación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight">
                {isPruebas ? "Reactivar Prueba para el Curso" : "Reactivar Ensayo para el Curso"}
              </h3>
              <p className="text-amber-100 text-xs">
                Extiende el plazo de entrega y reabre el acceso a los estudiantes
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Info Card */}
          {(examTitle || courseName) && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-700 space-y-1">
              {courseName && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Curso:</span>
                  <span className="font-extrabold text-slate-900">{courseName}</span>
                </div>
              )}
              {examTitle && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Evaluación:</span>
                  <span className="font-semibold text-slate-800 line-clamp-1">{examTitle}</span>
                </div>
              )}
              {currentClosesAt && (
                <div className="flex items-center gap-2 text-slate-500 pt-1 border-t border-slate-200/60 mt-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Cierre registrado: {new Date(currentClosesAt).toLocaleString("es-CL")}</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Nuevo Plazo de Cierre */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              1. Nuevo Plazo de Cierre de la Evaluación
            </label>

            {/* Presets Rápidos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setPreset("1h")}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
              >
                +1 Hora
              </button>
              <button
                type="button"
                onClick={() => setPreset("2h")}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
              >
                +2 Horas
              </button>
              <button
                type="button"
                onClick={() => setPreset("today_end")}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
              >
                Hoy 23:59
              </button>
              <button
                type="button"
                onClick={() => setPreset("tomorrow_18")}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
              >
                Mañana 18:00
              </button>
            </div>

            {/* Datetime input */}
            <div className="relative">
              <input
                type="datetime-local"
                value={closesAtInput}
                onChange={(e) => setClosesAtInput(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition shadow-2xs"
              />
            </div>
          </div>

          {/* Selector de Alcance */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              2. ¿A quiénes aplica la reactivación?
            </label>
            <div className="space-y-2.5">
              <label 
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  scope === "PENDING_ONLY" 
                    ? "bg-amber-50/60 border-amber-400 ring-1 ring-amber-400/40" 
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="PENDING_ONLY"
                  checked={scope === "PENDING_ONLY"}
                  onChange={() => setScope("PENDING_ONLY")}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block">
                    Solo Estudiantes Pendientes y Ausentes (Recomendado)
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-relaxed mt-0.5">
                    Habilita la prueba únicamente a quienes no la han rendido o quedaron a medias. Las notas y entregas ya finalizadas se mantienen intactas.
                  </span>
                </div>
              </label>

              <label 
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  scope === "ALL_STUDENTS" 
                    ? "bg-amber-50/60 border-amber-400 ring-1 ring-amber-400/40" 
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="ALL_STUDENTS"
                  checked={scope === "ALL_STUDENTS"}
                  onChange={() => setScope("ALL_STUDENTS")}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block">
                    Reactivar a Todos los Estudiantes del Curso
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-relaxed mt-0.5">
                    Reabre la prueba para todos, permitiendo que quienes ya habían entregado puedan volver a ingresar.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Sub-opción: Modo de Respuestas si se reactiva a todos */}
          {scope === "ALL_STUDENTS" && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 animate-in fade-in duration-150">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                ¿Qué hacer con las respuestas de quienes ya entregaron?
              </span>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="resetMode"
                    value="KEEP_ANSWERS"
                    checked={resetMode === "KEEP_ANSWERS"}
                    onChange={() => setResetMode("KEEP_ANSWERS")}
                    className="text-amber-600 focus:ring-amber-500"
                  />
                  <span>Conservar respuestas previas (continúan donde quedaron)</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="resetMode"
                    value="CLEAR_ANSWERS"
                    checked={resetMode === "CLEAR_ANSWERS"}
                    onChange={() => setResetMode("CLEAR_ANSWERS")}
                    className="text-amber-600 focus:ring-amber-500"
                  />
                  <span>Reiniciar en blanco (borrar respuestas anteriores)</span>
                </label>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-black px-5 py-2 rounded-xl text-xs shadow-md shadow-amber-500/20 transition cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{loading ? "Reactivando..." : "Confirmar Reactivación"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
