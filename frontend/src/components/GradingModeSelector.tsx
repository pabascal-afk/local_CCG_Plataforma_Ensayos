"use client";

import { useEffect, useState } from "react";
import { Calculator, SlidersHorizontal, Sparkles } from "lucide-react";

export type GradingMode = "SIMCE" | "NORMAL";

interface GradingModeSelectorProps {
  gradingMode: GradingMode;
  onGradingModeChange: (mode: GradingMode) => void;
  passThresholdPercent: number;
  onPassThresholdPercentChange: (pct: number) => void;
  totalPoints?: number;
  variant?: "full" | "compact";
  disabled?: boolean;
}

const PRESETS = [50, 60, 70];

function formatPointValue(val: number) {
  const rounded = Math.round(val * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
}

export default function GradingModeSelector({
  gradingMode,
  onGradingModeChange,
  passThresholdPercent,
  onPassThresholdPercentChange,
  totalPoints,
  variant = "full",
  disabled = false,
}: GradingModeSelectorProps) {
  const safePercent = Math.min(99, Math.max(1, Math.round(Number(passThresholdPercent) || 60)));
  const [inputText, setInputText] = useState(String(safePercent));

  useEffect(() => {
    setInputText(String(safePercent));
  }, [safePercent]);

  const handlePercentChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, "");
    setInputText(cleaned);
    if (!cleaned) return;
    const parsed = parseInt(cleaned, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 99) {
      onPassThresholdPercentChange(parsed);
    }
  };

  const handlePercentBlur = () => {
    if (!inputText.trim()) {
      setInputText(String(safePercent));
      return;
    }
    const parsed = parseInt(inputText, 10);
    if (Number.isNaN(parsed)) {
      setInputText(String(safePercent));
      return;
    }
    const clamped = Math.min(99, Math.max(1, parsed));
    setInputText(String(clamped));
    if (clamped !== safePercent) {
      onPassThresholdPercentChange(clamped);
    }
  };

  const isNormal = gradingMode === "NORMAL";
  const hasPoints = typeof totalPoints === "number" && totalPoints > 0;
  const minPassPoints = hasPoints ? (totalPoints * safePercent) / 100 : null;

  if (variant === "compact") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Modalidad de calificación
          </label>
          <select
            value={gradingMode}
            disabled={disabled}
            onChange={(e) => onGradingModeChange(e.target.value === "NORMAL" ? "NORMAL" : "SIMCE")}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
          >
            <option value="SIMCE">Como ahora (Escala SIMCE / TRI)</option>
            <option value="NORMAL">Prueba normal (% de exigencia)</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-xs font-bold text-slate-700">
              Exigencia para nota 4,0 (%)
            </label>
            <div className="flex items-center gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPassThresholdPercentChange(p)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer disabled:opacity-50 ${
                    safePercent === p
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={99}
              step={1}
              disabled={disabled}
              value={inputText}
              onChange={(e) => handlePercentChange(e.target.value)}
              onBlur={handlePercentBlur}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 pr-8 text-sm font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              %
            </span>
          </div>
        </div>

        <div
          className={`rounded-lg border p-2.5 text-[11px] leading-relaxed ${
            isNormal
              ? "bg-indigo-50/80 border-indigo-200 text-indigo-950"
              : "bg-blue-50/70 border-blue-200 text-blue-950"
          }`}
        >
          <p className="font-bold flex items-center gap-1 mb-0.5">
            <Calculator className="w-3.5 h-3.5 shrink-0" />
            {isNormal ? "Escala Normal Chilena (1,0 – 7,0)" : "Escala SIMCE TRI + Nota Escolar"}
          </p>
          {isNormal ? (
            <p className="text-indigo-800">
              Nota directa según <strong>{safePercent}%</strong> de exigencia, asignando puntaje individual por pregunta (sin escala SIMCE ni TRI).
              {minPassPoints !== null && (
                <> Nota 4,0 desde <strong>{formatPointValue(minPassPoints)}</strong> / {totalPoints} pts.</>
              )}
            </p>
          ) : (
            <p className="text-blue-800">
              Puntaje <strong>100–400 (TRI 3PL)</strong> y cortes 241/284. Nota 4,0 al{" "}
              <strong>{safePercent}%</strong>
              {minPassPoints !== null && (
                <> ({formatPointValue(minPassPoints)} / {totalPoints} pts)</>
              )}
              .
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Sistema de Calificación y Exigencia</h3>
            <p className="text-xs text-slate-500">
              Elige entre escala estandarizada SIMCE (TRI) o evaluación normal con porcentaje editable.
            </p>
          </div>
        </div>
        <span
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
            isNormal
              ? "bg-indigo-100 text-indigo-800 border-indigo-200"
              : "bg-blue-100 text-blue-800 border-blue-200"
          }`}
        >
          {isNormal ? `Normal · ${safePercent}%` : `SIMCE TRI · ${safePercent}%`}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Modalidad de calificación
          </label>
          <select
            value={gradingMode}
            disabled={disabled}
            onChange={(e) => onGradingModeChange(e.target.value === "NORMAL" ? "NORMAL" : "SIMCE")}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
          >
            <option value="SIMCE">Como ahora (Escala SIMCE / TRI)</option>
            <option value="NORMAL">Prueba normal (% de exigencia)</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">
              Exigencia para nota 4,0 (%)
            </label>
            <div className="flex items-center gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPassThresholdPercentChange(p)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer disabled:opacity-50 ${
                    safePercent === p
                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={99}
              step={1}
              disabled={disabled}
              value={inputText}
              onChange={(e) => handlePercentChange(e.target.value)}
              onBlur={handlePercentBlur}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-9 text-sm font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              %
            </span>
          </div>
        </div>
      </div>

      <div
        className={`rounded-lg border p-3 text-xs flex items-start gap-2.5 ${
          isNormal
            ? "bg-indigo-50 border-indigo-200 text-indigo-950"
            : "bg-blue-50 border-blue-200 text-blue-950"
        }`}
      >
        <Sparkles className={`w-4 h-4 shrink-0 mt-0.5 ${isNormal ? "text-indigo-600" : "text-blue-600"}`} />
        <div className="space-y-0.5">
          {isNormal ? (
            <>
              <p className="font-bold">
                Evaluación Normal (Nota 1,0 a 7,0 con {safePercent}% de exigencia)
              </p>
              <p className="text-indigo-800">
                Calcula la nota chilena directamente desde el porcentaje de logro obtenido según el puntaje que asignes a cada pregunta (en vez de la escala TRI / SIMCE).
                {minPassPoints !== null && (
                  <>
                    {" "}
                    Con <strong>{totalPoints}</strong> puntos totales, la nota 4,0 se alcanza desde{" "}
                    <strong>{formatPointValue(minPassPoints)} pts</strong>.
                  </>
                )}{" "}
                Niveles: Insuficiente (&lt; 4,0), Elemental (4,0–5,9) y Adecuado (≥ 6,0).
              </p>
            </>
          ) : (
            <>
              <p className="font-bold">
                Ensayo SIMCE (Escala estandarizada TRI 100–400 + Nota 1,0 a 7,0 al {safePercent}%)
              </p>
              <p className="text-blue-800">
                Mantiene el motor TRI 3PL actual (cortes SIMCE 241 Elemental / 284 Adecuado) y calcula la nota escolar 1,0–7,0 con exigencia del{" "}
                <strong>{safePercent}%</strong>
                {minPassPoints !== null && (
                  <> ({formatPointValue(minPassPoints)} / {totalPoints} pts para 4,0)</>
                )}
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
