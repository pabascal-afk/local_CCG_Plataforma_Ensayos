import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function SummaryTab({ id }: { id: number }) {
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

  const ranges = [
    { label: "6.0 - 7.0", count: data.gradeRanges['6.0-7.0'] || 0 },
    { label: "5.0 - 5.9", count: data.gradeRanges['5.0-5.9'] || 0 },
    { label: "4.0 - 4.9", count: data.gradeRanges['4.0-4.9'] || 0 },
    { label: "1.0 - 3.9", count: data.gradeRanges['1.0-3.9'] || 0 },
  ];

  const maxLevelCount = Math.max(...levels.map(l => l.count), 1);
  const maxRangeCount = Math.max(...ranges.map(r => r.count), 1);

  return (
    <div className="space-y-8">
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
          <p className="text-sm text-emerald-600 font-medium mb-1">Puntaje SIMCE Promedio</p>
          <p className="text-3xl font-bold text-emerald-900">
            {data.averageSimceScore ? `${data.averageSimceScore} pts` : "N/A"}
          </p>
          <p className="text-xs text-emerald-600 mt-1">Escala 200 - 350 pts</p>
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
