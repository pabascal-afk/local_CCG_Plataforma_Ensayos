import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";
import Link from "next/link";
import { ChevronRight, Upload, FileSpreadsheet, Download } from "lucide-react";

export default function StudentsTab({ id }: { id: number }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [importingAnswers, setImportingAnswers] = useState(false);

  useEffect(() => {
    apiFetch(`/teacher/assignments/${id}/live`)
      .then(setData)
      .catch((e: any) => setError(e.message));
  }, [id]);

  const handleImportAnswers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerFile) return;

    setImportingAnswers(true);
    const formData = new FormData();
    formData.append("file", answerFile);

    try {
      const res = await fetch(`/api/teacher/assignments/${id}/import-answers`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getToken()}`
        },
        body: formData
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Error al importar respuestas");

      alert(`Respuestas procesadas y corregidas con éxito: ${resData.imported} alumnos. Errores: ${resData.errors.length}`);
      setAnswerFile(null);
      const refreshed = await apiFetch(`/teacher/assignments/${id}/live`);
      setData(refreshed);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImportingAnswers(false);
    }
  };

  if (error) return <div className="text-red-500">{error}</div>;
  if (!data) return <div className="animate-pulse">Cargando estudiantes...</div>;

  const students = data.students.filter((s: any) => s.state === "SUBMITTED").sort((a: any, b: any) => (b.grade || 0) - (a.grade || 0));
  const pending = data.students.filter((s: any) => s.state !== "SUBMITTED");

  return (
    <div>
      {/* Bloque Carga Masiva Escáner / Papel */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-blue-900 flex items-center gap-2 mb-1">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              Carga Masiva de Respuestas (Papel / Escáner OMR)
            </h4>
            <p className="text-xs text-blue-700 max-w-xl">
              Si aplicaste este ensayo en papel o con hojas de respuestas ópticas, sube la planilla con las respuestas de cada alumno para corregir y estimar los puntajes SIMCE automáticamente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/api/teacher/assignments/${id}/template-answers.xlsx?token=${typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : ""}`}
              download={`Formato_Respuestas_Ensayo_${id}.xlsx`}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
              title="Descargar plantilla Excel vacía con las columnas P1 a Pn de este ensayo"
            >
              <Download className="w-4 h-4 text-emerald-600" /> Formato Vacío (.xlsx)
            </a>

            <form onSubmit={handleImportAnswers} className="flex items-center gap-2 bg-white p-1.5 border border-blue-200 rounded-lg shadow-sm">
              <input 
                type="file" 
                accept=".xlsx,.csv" 
                onChange={e => setAnswerFile(e.target.files?.[0] || null)}
                className="text-xs max-w-[180px]"
              />
              <button 
                type="submit" 
                disabled={!answerFile || importingAnswers}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" /> {importingAnswers ? "Procesando..." : "Cargar y Corregir"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <h3 className="text-lg font-bold text-gray-800 mb-4">Estudiantes que Entregaron ({students.length})</h3>
      <div className="overflow-x-auto border rounded-lg mb-8">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
            <tr>
              <th className="p-4">RUT</th>
              <th className="p-4">Nombre</th>
              <th className="p-4 text-center">Nota</th>
              <th className="p-4 text-center">Puntaje SIMCE</th>
              <th className="p-4">Nivel de Logro</th>
              <th className="p-4">Entrega</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-gray-500">Nadie ha entregado aún.</td></tr>}
            {students.map((st: any) => {
              const g = st.grade || 0;
              const level = st.achievementLevel || (g >= 6.0 ? "ADECUADO" : g >= 4.0 ? "ELEMENTAL" : "INSUFICIENTE");
              return (
                <tr key={st.rut} className="hover:bg-gray-50">
                  <td className="p-4 font-mono text-gray-600">{st.rut}</td>
                  <td className="p-4 font-bold text-gray-900">{st.name}</td>
                  <td className="p-4 text-center font-bold text-blue-600">{g.toFixed(1)}</td>
                  <td className="p-4 text-center font-bold text-emerald-700">
                    {st.simceScore ? `${st.simceScore} pts` : "-"}
                  </td>
                  <td className="p-4">
                    {level === "ADECUADO" ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Adecuado</span> :
                     level === "ELEMENTAL" ? <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold">Elemental</span> :
                     <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Insuficiente</span>}
                  </td>
                  <td className="p-4 text-gray-500 text-xs">{new Date(st.submittedAt).toLocaleString()}</td>
                  <td className="p-4 text-right">
                    <Link href={`/teacher/students/${st.rut}`} className="inline-flex items-center text-blue-600 hover:underline font-medium text-xs">
                      Ver Ficha <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="text-lg font-bold text-gray-800 mb-4">Pendientes ({pending.length})</h3>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
            <tr>
              <th className="p-4">RUT</th>
              <th className="p-4">Nombre</th>
              <th className="p-4">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pending.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-500">Todos han entregado.</td></tr>}
            {pending.map((st: any) => (
              <tr key={st.rut} className="hover:bg-gray-50 text-gray-500">
                <td className="p-4 font-mono">{st.rut}</td>
                <td className="p-4">{st.name}</td>
                <td className="p-4">
                  {st.state === "NOT_STARTED" ? "Sin comenzar" : `En curso (${st.answersCount} resp.)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
