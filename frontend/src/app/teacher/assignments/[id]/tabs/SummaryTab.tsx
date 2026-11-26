import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useIsPruebas } from "@/lib/useIsPruebas";
import { FileText, Printer } from "lucide-react";

export default function SummaryTab({ id }: { id: number }) {
  const isPruebas = useIsPruebas();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/teacher/assignments/${id}/summary`)
      .then(setData)
      .catch((e: any) => setError(e.message));
  }, [id]);

  if (error) return <div className="text-red-500">{error}</div>;
  if (!data) return <div className="animate-pulse">Cargando resumen...</div>;

  const participation = data.totalStudents > 0 ? (data.submittedCount / data.totalStudents) * 100 : 0;
  const avgPct = data.averagePercent > 1 ? data.averagePercent : data.averagePercent * 100;
  
  const levels = [
    { label: "Adecuado", count: data.levelCounts.ADECUADO || 0, color: "bg-green-500" },
    { label: "Elemental", count: data.levelCounts.ELEMENTAL || 0, color: "bg-amber-500" },
    { label: "Insuficiente", count: data.levelCounts.INSUFICIENTE || 0, color: "bg-red-500" },
  ];

  const isBasic = Boolean(data.isBasicLevel || data.minGrade === 2.0);
  const minGradeLabel = isBasic ? "2.0 - 3.9" : "1.0 - 3.9";
  const minGradeCount = (data.gradeRanges?.['2.0-3.9'] ?? data.gradeRanges?.['1.0-3.9']) || 0;

  const ranges = [
    { label: "6.0 - 7.0", count: data.gradeRanges['6.0-7.0'] || 0 },
    { label: "5.0 - 5.9", count: data.gradeRanges['5.0-5.9'] || 0 },
    { label: "4.0 - 4.9", count: data.gradeRanges['4.0-4.9'] || 0 },
    { label: minGradeLabel, count: minGradeCount },
  ];

  const maxLevelCount = Math.max(...levels.map(l => l.count), 1);
  const maxRangeCount = Math.max(...ranges.map(r => r.count), 1);

  return (
    <div className="space-y-8">
      {/* Banner de Acceso Rápido al Informe PDF */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-xl shadow-xs">
        <div>
          <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-rose-400" />
            Informe Pedagógico Oficial en PDF
          </h4>
          <p className="text-xs text-slate-300 mt-0.5">
            Genera e imprime el reporte consolidado del curso con estadísticas, habilidades, ítems críticos y nómina completa.
          </p>
        </div>
        <Link
          href={`/teacher/assignments/${id}/report`}
          target="_blank"
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer self-start sm:self-center"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Ver / Imprimir PDF</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-sm text-blue-600 font-medium mb-1">Participación</p>
          <p className="text-3xl font-bold text-blue-900">{data.submittedCount} <span className="text-lg text-blue-700 font-normal">/ {data.totalStudents}</span></p>
          <p className="text-xs text-blue-500 mt-1">{Math.round(participation)}%</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 text-center">
          <p className="text-sm text-purple-600 font-medium mb-1">Nota Promedio</p>
          <p className="text-3xl font-bold text-purple-900">{data.averageGrade.toFixed(1)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 text-center">
          <p className="text-sm text-orange-600 font-medium mb-1">% de Logro Promedio</p>
          <p className="text-3xl font-bold text-orange-900">{Math.round(avgPct)}%</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center">
          {data.gradingMode === "NORMAL" ? (
            <>
              <p className="text-sm text-emerald-600 font-medium mb-1">Escala / Exigencia</p>
              <p className="text-2xl font-bold text-emerald-900">Prueba Normal</p>
              <p className="text-xs text-emerald-700 mt-1">
                Exigencia {data.passThresholdPercent ?? 60}% (Nota 4,0)
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-emerald-600 font-medium mb-1">
                {isPruebas ? "Puntaje Promedio" : "Puntaje SIMCE Promedio"}
              </p>
              <p className="text-3xl font-bold text-emerald-900">
                {data.averageSimceScore != null ? `${data.averageSimceScore} pts` : "N/A"}
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                Escala 100 - 400 pts · Exig. {data.passThresholdPercent ?? 60}%
              </p>
            </>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-4">Niveles de Logro</h3>
          <div className="space-y-4">
            {levels.map(l => (
              <div key={l.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{l.label}</span>
                  <span className="text-gray-500">{l.count} est.</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4">
                  <div className={`h-4 rounded-full ${l.color}`} style={{ width: `${(l.count / maxLevelCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-4">Distribución de Notas</h3>
          <div className="space-y-4">
            {ranges.map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{r.label}</span>
                  <span className="text-gray-500">{r.count} est.</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4">
                  <div className="h-4 rounded-full bg-blue-500" style={{ width: `${(r.count / maxRangeCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
