import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function SkillsTab({ id }: { id: number }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/teacher/assignments/${id}/skills`)
      .then(setData)
      .catch((e: any) => setError(e.message));
  }, [id]);

  if (error) return <div className="text-red-500">{error}</div>;
  if (!data) return <div className="animate-pulse">Cargando habilidades...</div>;

  const renderBars = (items: any[]) => {
    if (items.length === 0) return <p className="text-gray-500 italic">No hay datos registrados.</p>;
    
    return items.map((item, i) => {
      const pct = Math.round(item.percent * 100);
      return (
        <div key={i} className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-gray-700">{item.name}</span>
            <span className="text-gray-500">{pct}% ({item.correct}/{item.total})</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div 
              className={`h-3 rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} 
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    });
  };

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-6 border-b pb-2">Logro por Habilidad</h3>
        {renderBars(data.skills)}
      </div>
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-6 border-b pb-2">Logro por Eje Temático</h3>
        {renderBars(data.axes)}
      </div>
    </div>
  );
}
