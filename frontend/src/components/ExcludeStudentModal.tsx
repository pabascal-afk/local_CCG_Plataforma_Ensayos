"use client";

import { useState } from "react";
import { AlertTriangle, X, Check, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface ExcludeStudentModalProps {
  assignmentId: number;
  student: {
    rut: string;
    name: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_REASONS = [
  "No alcanzó a rendirlo",
  "Se negó a rendirlo",
  "Licencia médica / Justificativo",
  "Problemas de conectividad / fuerza mayor",
  "Rendición en fecha especial / reprogramado",
  "Otro motivo pedagógico",
];

export default function ExcludeStudentModal({
  assignmentId,
  student,
  isOpen,
  onClose,
  onSuccess,
}: ExcludeStudentModalProps) {
  const [selectedPreset, setSelectedPreset] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = selectedPreset === "Otro motivo pedagógico"
      ? customReason.trim()
      : selectedPreset;

    if (!finalReason) {
      setError("Debes indicar una razón válida para la exclusión.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await apiFetch(`/teacher/assignments/${assignmentId}/students/${student.rut}/exclude`, {
        method: "POST",
        body: {
          reason: finalReason,
          details: details.trim() || undefined,
        },
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error al excluir al estudiante.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200">
        <div className="bg-amber-500 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6" />
            <h3 className="font-bold text-lg">Excluir Estudiante de Informes</h3>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-white/80 hover:text-white rounded-lg p-1 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {student.name} ({student.rut})
              </p>
              <p className="mt-0.5 leading-relaxed">
                El estudiante será excluido del cómputo de notas, promedios de curso, porcentajes de logro y reportes pedagógicos de esta evaluación. Quedará registro formal del motivo.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Motivo o Justificación Obligatoria
            </label>
            <div className="space-y-1.5">
              {PRESET_REASONS.map((preset) => (
                <label
                  key={preset}
                  className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                    selectedPreset === preset
                      ? "bg-amber-50/80 border-amber-400 font-semibold text-amber-950"
                      : "bg-gray-50/50 border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="reasonPreset"
                    value={preset}
                    checked={selectedPreset === preset}
                    onChange={() => setSelectedPreset(preset)}
                    className="accent-amber-600"
                  />
                  <span>{preset}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedPreset === "Otro motivo pedagógico" && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Especifica el motivo *
              </label>
              <input
                type="text"
                required
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Ej: Retirado antes de iniciar por malestar..."
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Observaciones o antecedentes adicionales (opcional)
            </label>
            <textarea
              rows={2}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Detalles adicionales para UTP o registro del colegio..."
              className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-lg font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? "Guardando..." : "Confirmar Exclusión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
