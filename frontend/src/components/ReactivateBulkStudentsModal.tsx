"use client";

import { useState } from "react";
import { 
  X, Zap, Clock, AlertTriangle, CheckCircle2, RotateCcw, 
  Calendar, Users, Check 
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useIsPruebas } from "@/lib/useIsPruebas";

interface ReactivateBulkStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: number;
  selectedStudents: { rut: string; name: string }[];
  onSuccess: () => void;
  apiEndpointPrefix?: string;
}

export default function ReactivateBulkStudentsModal({
  isOpen,
  onClose,
  assignmentId,
  selectedStudents,
  onSuccess,
  apiEndpointPrefix = "/teacher"
}: ReactivateBulkStudentsModalProps) {
  const isPruebas = useIsPruebas();

  // Presets de tiempo
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const plus90MinStr = new Date(now.getTime() + 90 * 60000).toISOString().slice(0, 16);
  const plus2HoursStr = new Date(now.getTime() + 120 * 60000).toISOString().slice(0, 16);
  const todayEndStr = `${todayStr}T23:59`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowEndStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T18:00`;

  const [selectedPreset, setSelectedPreset] = useState<string>("PLUS_90M");
  const [customDeadline, setCustomDeadline] = useState<string>(plus90MinStr);
  const [resetMode, setResetMode] = useState<"KEEP_ANSWERS" | "CLEAR_ANSWERS">("KEEP_ANSWERS");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handlePresetSelect = (preset: string, dateVal: string) => {
    setSelectedPreset(preset);
    setCustomDeadline(dateVal);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDeadline) {
      setError("Debes especificar la fecha y hora límite");
      return;
    }

    const d = new Date(customDeadline);
    if (isNaN(d.getTime()) || d <= new Date()) {
      setError("El nuevo plazo debe ser en el futuro");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await apiFetch(`${apiEndpointPrefix}/assignments/${assignmentId}/students/bulk-reactivate`, {
        method: "POST",
        body: {
          ruts: selectedStudents.map(s => s.rut),
          deadline: d.toISOString(),
          resetMode,
          note: note.trim() || undefined
        }
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : (err.message || "Error al reactivar estudiantes"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-gray-100 overflow-hidden flex flex-col">
        
        {/* Cabecera */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-700 to-indigo-800 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                Reactivación Masiva de Estudiantes
              </h2>
              <p className="text-xs text-blue-100">
                Habilitar plazo común a {selectedStudents.length} estudiantes seleccionados
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Lista de estudiantes seleccionados */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" /> Estudiantes seleccionados ({selectedStudents.length})
              </span>
            </div>
            <div className="max-h-24 overflow-y-auto p-2 bg-gray-50 border border-gray-200 rounded-xl flex flex-wrap gap-1.5">
              {selectedStudents.map(st => (
                <span key={st.rut} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white border border-gray-200 px-2 py-0.5 rounded-md text-gray-700">
                  <span>{st.name}</span>
                  <span className="text-[10px] text-gray-400 font-mono">({st.rut})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Atajos Rápidos de Plazo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              Nuevo Plazo Individual para los Seleccionados
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "PLUS_90M", label: "90 Minutos", val: plus90MinStr, desc: "Desde ahora" },
                { id: "PLUS_2H", label: "+2 Horas", val: plus2HoursStr, desc: "Desde ahora" },
                { id: "TODAY_NIGHT", label: "Hoy 23:59", val: todayEndStr, desc: "Fin del día" },
                { id: "TOMORROW_18", label: "Mañana 18:00", val: tomorrowEndStr, desc: "Día siguiente" },
              ].map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetSelect(preset.id, preset.val)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    selectedPreset === preset.id
                      ? "bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-600 shadow-2xs"
                      : "bg-white border-gray-200 hover:border-blue-300 text-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{preset.label}</span>
                    {selectedPreset === preset.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <span className="text-[10px] text-gray-400 block mt-0.5">{preset.desc}</span>
                </button>
              ))}
            </div>

            {/* Fecha / Hora Personalizada */}
            <div className="mt-2.5">
              <input
                type="datetime-local"
                value={customDeadline}
                onChange={(e) => {
                  setCustomDeadline(e.target.value);
                  setSelectedPreset("CUSTOM");
                }}
                className="w-full text-xs font-semibold border border-gray-200 rounded-xl p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden"
                required
              />
            </div>
          </div>

          {/* Tratamiento de Respuestas Anteriores */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              Tratamiento de Respuestas Anteriores
            </label>
            <div className="space-y-2">
              <label 
                onClick={() => setResetMode("KEEP_ANSWERS")}
                className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-all ${
                  resetMode === "KEEP_ANSWERS"
                    ? "bg-blue-50/70 border-blue-500 text-blue-950 ring-1 ring-blue-500"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="bulkResetMode"
                  checked={resetMode === "KEEP_ANSWERS"}
                  onChange={() => setResetMode("KEEP_ANSWERS")}
                  className="mt-0.5 w-4 h-4 text-blue-600"
                />
                <div>
                  <span className="text-xs font-bold block">Conservar respuestas (Continuar donde quedaron)</span>
                  <span className="text-[11px] text-gray-500">
                    Recomendado ante desconexiones, cortes de luz o entregas accidentales.
                  </span>
                </div>
              </label>

              <label 
                onClick={() => setResetMode("CLEAR_ANSWERS")}
                className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-all ${
                  resetMode === "CLEAR_ANSWERS"
                    ? "bg-rose-50/70 border-rose-500 text-rose-950 ring-1 ring-rose-500"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="bulkResetMode"
                  checked={resetMode === "CLEAR_ANSWERS"}
                  onChange={() => setResetMode("CLEAR_ANSWERS")}
                  className="mt-0.5 w-4 h-4 text-rose-600"
                />
                <div>
                  <span className="text-xs font-bold block text-rose-800">Reiniciar examen en blanco (Borrar respuestas)</span>
                  <span className="text-[11px] text-rose-600">
                    Elimina respuestas previas para permitir re-evaluación formal completa.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Motivo o Justificación */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Motivo o Justificación para la Bitácora (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Ausencia justificada por enfermedad / Problemas de conectividad en aula"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-xl p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          {/* Botones de Acción */}
          <div className="pt-2 flex items-center justify-between border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{submitting ? "Reactivando..." : `Reactivar a los ${selectedStudents.length} Alumnos`}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
