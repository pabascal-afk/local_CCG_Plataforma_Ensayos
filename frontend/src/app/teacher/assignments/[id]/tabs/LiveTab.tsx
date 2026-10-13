import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CheckCircle2, Clock, AlertCircle, RefreshCw } from "lucide-react";

export default function LiveTab({ id }: { id: number }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch(`/teacher/assignments/${id}/live`);
      setData(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [id]);

  if (error) return <div className="text-red-500">{error}</div>;
  if (!data) return <div className="animate-pulse">Cargando monitor en vivo...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-gray-800">Monitor en Vivo</h2>
        <button 
          onClick={load} 
          disabled={refreshing}
          className="flex items-center text-sm text-gray-500 hover:text-blue-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Actualizar (15s)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.students.map((st: any) => {
          let badge = { cls: "bg-gray-100 text-gray-600 border-gray-200", icon: AlertCircle, label: "No ha entrado" };
          if (st.state === "IN_PROGRESS") badge = { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock, label: "Rindiendo" };
          if (st.state === "SUBMITTED") badge = { cls: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2, label: "Entregado" };
          
          const Icon = badge.icon;
          const pct = Math.round((st.answersCount / (data.questionCount || 1)) * 100);

          return (
            <div key={st.rut} className={`border rounded-lg p-4 flex flex-col justify-between ${badge.cls}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold">{st.name}</p>
                  <p className="text-xs opacity-75">{st.rut}</p>
                </div>
                <Icon className="w-5 h-5 opacity-50" />
              </div>
              
              <div className="mt-2 text-sm font-medium">
                {st.state === "NOT_STARTED" && "Sin registro"}
                {st.state === "IN_PROGRESS" && (
                  <>
                    <div className="flex justify-between mb-1 text-xs">
                      <span>Progreso</span>
                      <span>{st.answersCount} / {data.questionCount}</span>
                    </div>
                    <div className="w-full bg-white/50 rounded-full h-1.5">
                      <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </>
                )}
                {st.state === "SUBMITTED" && (
                  <div className="text-sm">
                    Entregado el {new Date(st.submittedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
