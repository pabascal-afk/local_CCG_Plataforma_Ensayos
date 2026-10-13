import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function ItemsTab({ id }: { id: number }) {
  const [data, setData] = useState<any[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<any[]>(`/teacher/assignments/${id}/items`)
      .then(setData)
      .catch((e: any) => setError(e.message));
  }, [id]);

  if (error) return <div className="text-red-500">{error}</div>;
  if (!data) return <div className="animate-pulse">Cargando análisis por pregunta...</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
          <tr>
            <th className="p-3">N°</th>
            <th className="p-3">Eje / Habilidad</th>
            <th className="p-3">Correcta</th>
            <th className="p-3">% Acierto</th>
            <th className="p-3">A</th>
            <th className="p-3">B</th>
            <th className="p-3">C</th>
            <th className="p-3">D</th>
            <th className="p-3">E</th>
            <th className="p-3">Omitida</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((q) => {
            const pct = Math.round(q.percent * 100);
            return (
              <tr key={q.questionNumber} className="hover:bg-gray-50">
                <td className="p-3 font-bold text-gray-800">{q.questionNumber}</td>
                <td className="p-3">
                  <div className="font-medium text-gray-800">{q.axis || '-'}</div>
                  <div className="text-xs text-gray-500">{q.skill || '-'}</div>
                </td>
                <td className="p-3 font-bold text-blue-600">{q.correctAnswer}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${pct >= 75 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {pct}%
                  </span>
                </td>
                {['A', 'B', 'C', 'D', 'E'].map(opt => {
                  const isCorrect = opt === q.correctAnswer;
                  const count = q.options[opt];
                  if (count === undefined) return <td key={opt} className="p-3 text-gray-300">-</td>;
                  
                  return (
                    <td key={opt} className={`p-3 ${isCorrect ? 'bg-blue-50 font-bold' : ''}`}>
                      {count > 0 ? (
                        <span className={count > q.correctCount && !isCorrect ? 'text-red-600 font-bold' : ''}>
                          {Math.round((count / q.totalAnswers) * 100)}%
                        </span>
                      ) : '-'}
                    </td>
                  );
                })}
                <td className="p-3 text-gray-500">{q.omittedCount > 0 ? Math.round((q.omittedCount / q.totalAnswers) * 100) + '%' : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
