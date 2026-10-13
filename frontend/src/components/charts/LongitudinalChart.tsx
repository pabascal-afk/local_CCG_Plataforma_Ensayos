"use client";

import React, { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Award, Calendar } from "lucide-react";

export type DataPoint = {
  id?: number | string;
  title: string;
  date: string | Date;
  simceScore: number;
  grade?: number;
  percent?: number;
  level?: string;
};

interface LongitudinalChartProps {
  data: DataPoint[];
  cutElemental?: number; // default 241
  cutAdecuado?: number;  // default 284
  minScore?: number;     // default 150
  maxScore?: number;     // default 350
  height?: number;
}

export default function LongitudinalChart({
  data,
  cutElemental = 241,
  cutAdecuado = 284,
  minScore = 160,
  maxScore = 360,
  height = 280,
}: LongitudinalChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-sm">
        No hay datos suficientes de evaluaciones para trazar la trayectoria.
      </div>
    );
  }

  // Filtrar y ordenar por fecha ascendente
  const validData = data
    .filter((d) => d.simceScore && !isNaN(d.simceScore))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (validData.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-sm">
        No hay puntajes SIMCE registrados para esta serie.
      </div>
    );
  }

  // Cálculo de variación delta
  const firstScore = validData[0].simceScore;
  const lastScore = validData[validData.length - 1].simceScore;
  const delta = lastScore - firstScore;

  // Geometría del gráfico SVG
  const width = 700;
  const paddingLeft = 55;
  const paddingRight = 35;
  const paddingTop = 25;
  const paddingBottom = 45;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const getY = (score: number) => {
    const clamped = Math.max(minScore, Math.min(maxScore, score));
    const ratio = (clamped - minScore) / (maxScore - minScore);
    return paddingTop + chartH * (1 - ratio);
  };

  const getX = (idx: number) => {
    if (validData.length === 1) return paddingLeft + chartW / 2;
    return paddingLeft + (idx / (validData.length - 1)) * chartW;
  };

  // Coordenadas de líneas de corte
  const yAdecuado = getY(cutAdecuado);
  const yElemental = getY(cutElemental);

  // Construir puntos y polilínea SVG
  const points = validData.map((d, i) => `${getX(i)},${getY(d.simceScore)}`).join(" ");

  // Color de badge de nivel
  const getLevelColor = (score: number) => {
    if (score >= cutAdecuado) return "text-emerald-700 bg-emerald-100 border-emerald-300";
    if (score >= cutElemental) return "text-amber-700 bg-amber-100 border-amber-300";
    return "text-red-700 bg-red-100 border-red-300";
  };

  const hoveredItem = hoveredIdx !== null ? validData[hoveredIdx] : null;

  return (
    <div className="w-full bg-white rounded-xl border shadow-sm p-5 space-y-4">
      {/* Encabezado con Delta y Resumen */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-600" />
            Trayectoria y Puntaje SIMCE
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Evolución estandarizada en escala oficial (100 a 400 puntos)
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold block">Último Ensayo</span>
            <span className="text-xl font-extrabold text-gray-900">{lastScore} ptos</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${
              delta > 0
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : delta < 0
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-gray-50 text-gray-600 border-gray-200"
            }`}
          >
            {delta > 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            ) : delta < 0 ? (
              <TrendingDown className="w-4 h-4 text-red-600" />
            ) : (
              <Minus className="w-4 h-4 text-gray-500" />
            )}
            <span>
              {delta > 0 ? `+${delta}` : delta} ptos {validData.length > 1 ? "desde inicio" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Gráfico SVG */}
      <div className="relative overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          style={{ maxHeight: height }}
        >
          <defs>
            <linearGradient id="gradientAdecuado" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="gradientElemental" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="gradientInsuficiente" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Bandas de fondo por Nivel de Logro */}
          {/* Zona Adecuado */}
          <rect
            x={paddingLeft}
            y={paddingTop}
            width={chartW}
            height={Math.max(0, yAdecuado - paddingTop)}
            fill="url(#gradientAdecuado)"
          />
          {/* Zona Elemental */}
          <rect
            x={paddingLeft}
            y={yAdecuado}
            width={chartW}
            height={Math.max(0, yElemental - yAdecuado)}
            fill="url(#gradientElemental)"
          />
          {/* Zona Insuficiente */}
          <rect
            x={paddingLeft}
            y={yElemental}
            width={chartW}
            height={Math.max(0, paddingTop + chartH - yElemental)}
            fill="url(#gradientInsuficiente)"
          />

          {/* Líneas horizontales de corte */}
          <line
            x1={paddingLeft}
            y1={yAdecuado}
            x2={paddingLeft + chartW}
            y2={yAdecuado}
            stroke="#10b981"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
          <text
            x={paddingLeft + 6}
            y={yAdecuado - 5}
            fill="#059669"
            fontSize="10"
            fontWeight="bold"
          >
            Adecuado (≥ {cutAdecuado})
          </text>

          <line
            x1={paddingLeft}
            y1={yElemental}
            x2={paddingLeft + chartW}
            y2={yElemental}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
          <text
            x={paddingLeft + 6}
            y={yElemental - 5}
            fill="#d97706"
            fontSize="10"
            fontWeight="bold"
          >
            Elemental ({cutElemental} - {cutAdecuado - 1})
          </text>

          <text
            x={paddingLeft + 6}
            y={paddingTop + chartH - 8}
            fill="#dc2626"
            fontSize="10"
            fontWeight="bold"
          >
            Insuficiente (&lt; {cutElemental})
          </text>

          {/* Eje Y - Marcas de puntaje */}
          {[minScore, cutElemental, 250, cutAdecuado, maxScore].map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft - 4}
                  y1={y}
                  x2={paddingLeft}
                  y2={y}
                  stroke="#9ca3af"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize="10"
                  fontWeight="600"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Línea de tendencia (si hay más de 1 punto) */}
          {validData.length > 1 && (
            <polyline
              fill="none"
              stroke="#2563eb"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          )}

          {/* Puntos de datos */}
          {validData.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.simceScore);
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                className="cursor-pointer transition-transform"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Halo interactivo */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 16 : 10}
                  fill="#2563eb"
                  fillOpacity={isHovered ? 0.25 : 0.08}
                />
                {/* Punto exterior */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 7 : 5}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
                {/* Texto del puntaje arriba del punto */}
                <text
                  x={cx}
                  y={cy - 12}
                  textAnchor="middle"
                  fill="#1e293b"
                  fontSize="11"
                  fontWeight="bold"
                >
                  {d.simceScore}
                </text>

                {/* Etiqueta del eje X (Fecha/Ensayo) */}
                <text
                  x={cx}
                  y={paddingTop + chartH + 18}
                  textAnchor="middle"
                  fill="#4b5563"
                  fontSize="10.5"
                  fontWeight="600"
                >
                  {d.title.length > 16 ? `${d.title.slice(0, 15)}…` : d.title}
                </text>
                <text
                  x={cx}
                  y={paddingTop + chartH + 32}
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize="9.5"
                >
                  {new Date(d.date).toLocaleDateString("es-CL", { month: "short", day: "numeric" })}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip detalle si se posiciona el cursor */}
      {hoveredItem && (
        <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-lg flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div>
            <div className="font-bold text-white text-sm">{hoveredItem.title}</div>
            <div className="text-slate-400 flex items-center gap-1 mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(hoveredItem.date).toLocaleDateString("es-CL", { dateStyle: "long" })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase">Puntaje SIMCE</div>
              <div className="text-base font-extrabold text-blue-400">{hoveredItem.simceScore} ptos</div>
            </div>
            {hoveredItem.grade !== undefined && (
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase">Nota</div>
                <div className="text-base font-bold text-emerald-400">{hoveredItem.grade?.toFixed(1)}</div>
              </div>
            )}
            <div
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${getLevelColor(
                hoveredItem.simceScore
              )}`}
            >
              {hoveredItem.level ||
                (hoveredItem.simceScore >= cutAdecuado
                  ? "ADECUADO"
                  : hoveredItem.simceScore >= cutElemental
                  ? "ELEMENTAL"
                  : "INSUFICIENTE")}
            </div>
          </div>
        </div>
      )}

      {/* Leyenda al pie */}
      <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-xs text-gray-500 border-t">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
          Adecuado (≥ {cutAdecuado})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
          Elemental ({cutElemental} - {cutAdecuado - 1})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
          Insuficiente (&lt; {cutElemental})
        </span>
      </div>
    </div>
  );
}
