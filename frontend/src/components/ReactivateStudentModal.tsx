"use client";

import { useState, useEffect } from "react";
import { X, Zap, Clock, User, AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useIsPruebas } from "@/lib/useIsPruebas";

interface ReactivateStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: number;
  student: {
    rut: string;
    name: string;
    state?: string;
    grade?: number | null;
    extendedDeadline?: string | null;
  } | null;
  examDurationMinutes?: number | null;
  onSuccess: () => void;
  apiEndpointPrefix?: string; // default "/teacher"
}

export default function ReactivateStudentModal({
  isOpen,
  onClose,
  assignmentId,
  student,
  examDurationMinutes,
  onSuccess,
  apiEndpointPrefix = "/teacher"
}: ReactivateStudentModalProps) {
  const isPruebas = useIsPruebas();
  const [deadlineInput, setDeadlineInput] = useState("");
  const [resetMode, setResetMode] = useState<"KEEP_ANSWERS" | "CLEAR_ANSWERS">("KEEP_ANSWERS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toLocalIso = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    if (isOpen && student) {
      // Por defecto: hoy hasta fin del día, o +duración si es mayor
      const durationMs = (examDurationMinutes || 90) * 60 * 1000;
      const defaultDate = new Date(Date.now() + Math.max(durationMs, 2 * 60 * 60 * 1000));
      setDeadlineInput(toLocalIso(defaultDate));
      setResetMode("KEEP_ANSWERS");
      setError("");
    }
  }, [isOpen, student, examDurationMinutes]);

  if (!isOpen || !student) return null;

  const setPreset = (type: "duration" | "2h" | "today_end" | "tomorrow_18") => {
    const now = new Date();
    let target = new Date();
    if (type === "duration") {
      const minutes = examDurationMinutes || 90;
      target = new Date(now.getTime() + minutes * 60 * 1000);
    } else if (type === "2h") {
      target = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    } else if (type === "today_end") {
      target.setHours(23, 59, 0, 0);
    } else if (type === "tomorrow_18") {
      target.setDate(target.getDate() + 1);
      target.setHours(18, 0, 0, 0);
    }
    setDeadlineInput(toLocalIso(target));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deadlineInput) {
      setError("Debes indicar un plazo válido");
      return;
    }

    const selectedDate = new Date(deadlineInput);
    if (isNaN(selectedDate.getTime()) || selectedDate <= new Date()) {
      setError("El plazo debe ser posterior a la hora actual");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await apiFetch(`${apiEndpointPrefix}/assignments/${assignmentId}/students/${encodeURIComponent(student.rut)}/reactivate`, {
        method: "POST",
        body: {
          deadline: selectedDate.toISOString(),
          resetMode
        }
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Error al reactivar al estudiante");
    } finally {
      setLoading(false);
    }
  };

  const hasSubmitted = student.state === "SUBMITTED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-base tracking-tight">
                {isPruebas ? "Reactivar Prueba para Estudiante" : "Reactivar Ensayo para Estudiante"}
              </h3>
              <p className="text-blue-100 text-xs">
                Otorga un plazo individual exclusivo a este alumno
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Info Estudiante */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-700 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Estudiante:</span>
              <span className="font-mono text-slate-500 text-[11px]">{student.rut}</span>
            </div>
            <p className="font-extrabold text-slate-900 text-sm">{student.name}</p>
            <div className="flex items-center gap-2 text-slate-500 pt-1 border-t border-slate-200/60 mt-1">
              <span className="font-medium">Estado actual:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                hasSubmitted 
                  ? "bg-green-100 text-green-800" 
                  : student.state === "IN_PROGRESS" 
                  ? "bg-amber-100 text-amber-800" 
                  : "bg-slate-200 text-slate-700"
              }`}>
                {hasSubmitted ? `Entregado (Nota: ${student.grade?.toFixed(1) || "-"})` : student.state === "IN_PROGRESS" ? "En Curso" : "Sin Comenzar"}
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Plazo Individual */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              1. Plazo Límite Individual para este Alumno
            </label>

            {/* Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2.5">
              <button
                type="button"
                onClick={() => setPreset("duration")}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
              >
                {examDurationMinutes ? `${examDurationMinutes} min` : "90 min"}
              </button>
              <button
                type="button"
                onClick={() => setPreset("2h")}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
              >
                +2 Horas
              </button>
              <button
                type="button"
                onClick={() => setPreset("today_end")}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
              >
                Hoy 23:59
              </button>
              <button
                type="button"
                onClick={() => setPreset("tomorrow_18")}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
              >
                Mañana 18:00
              </button>
            </div>

            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={(e) => setDeadlineInput(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-2xs"
            />
          </div>

          {/* Modo de Respuestas */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              2. Modo de Respuestas
            </label>
            <div className="space-y-2">
              <label 
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                  resetMode === "KEEP_ANSWERS" 
                    ? "bg-blue-50/70 border-blue-400 ring-1 ring-blue-400/40" 
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="studentResetMode"
                  value="KEEP_ANSWERS"
                  checked={resetMode === "KEEP_ANSWERS"}
                  onChange={() => setResetMode("KEEP_ANSWERS")}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block">
                    Conservar respuestas anteriores (Recomendado)
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-relaxed mt-0.5">
                    El alumno retoma desde donde estaba. Ideal ante cortes de luz, desconexión o entregas involuntarias.
                  </span>
                </div>
              </label>

              <label 
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                  resetMode === "CLEAR_ANSWERS" 
                    ? "bg-blue-50/70 border-blue-400 ring-1 ring-blue-400/40" 
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="studentResetMode"
                  value="CLEAR_ANSWERS"
                  checked={resetMode === "CLEAR_ANSWERS"}
                  onChange={() => setResetMode("CLEAR_ANSWERS")}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-900 block">
                    Reiniciar desde cero en blanco
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-relaxed mt-0.5">
                    Se borran las respuestas anteriores para que rinda la evaluación en blanco como un nuevo intento.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Footer */}
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
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black px-5 py-2 rounded-xl text-xs shadow-md shadow-blue-600/20 transition cursor-pointer"
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
