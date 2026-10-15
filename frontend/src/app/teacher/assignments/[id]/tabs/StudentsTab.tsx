import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";
import Link from "next/link";
import { ChevronRight, Upload, FileSpreadsheet, Download, Printer, ScanLine, Keyboard, Sparkles } from "lucide-react";
import OmrScannerModal from "@/components/OmrScannerModal";
import FastDigitizerModal from "@/components/FastDigitizerModal";

export default function StudentsTab({ id }: { id: number }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [importingAnswers, setImportingAnswers] = useState(false);
  const [showOmrModal, setShowOmrModal] = useState(false);
  const [showDigitizerModal, setShowDigitizerModal] = useState(false);

  const refreshData = async () => {
    try {
      const refreshed = await apiFetch(`/teacher/assignments/${id}/live`);
      setData(refreshed);
    } catch (err: any) {
      console.error("Error al refrescar datos:", err);
    }
  };

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
      await refreshData();
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
      {/* Modales OMR y Digitador */}
      <OmrScannerModal
        assignmentId={id}
        isOpen={showOmrModal}
        onClose={() => setShowOmrModal(false)}
        onSuccess={refreshData}
      />
      <FastDigitizerModal
        assignmentId={id}
        isOpen={showDigitizerModal}
        onClose={() => setShowDigitizerModal(false)}
        onSuccess={refreshData}
      />

      {/* Bloque Aplicación Impresa y Carga Masiva OMR */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-5 mb-8 shadow-md border border-indigo-900">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                Evaluación Híbrida / Papel
              </span>
              <span className="text-xs text-indigo-300 font-medium flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Corrección instantánea con TRI SIMCE
              </span>
            </div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              Impresión y Digitalización de Hojas de Respuestas
            </h4>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Imprime las hojas con QR personalizado por alumno y luego digitalízalas escaneando el documento, tomando fotos con tu celular, usando el digitador ultra-rápido de teclado o subiendo la planilla Excel del curso.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Botón Imprimir Hojas */}
            <Link
              href={`/teacher/assignments/${id}/print-sheets`}
              target="_blank"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold shadow transition"
              title="Generar e imprimir hojas de respuestas personalizadas con QR y lista del curso"
            >
              <Printer className="w-4 h-4 text-indigo-200" /> Imprimir Hojas (PDF)
            </Link>

            {/* Botón Escanear OMR */}
            <button
              type="button"
              onClick={() => setShowOmrModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold shadow transition"
              title="Subir archivo PDF escaneado o fotografías para corrección automática por burbujas"
            >
              <ScanLine className="w-4 h-4 text-blue-200" /> Escanear OMR (PDF/Fotos)
            </button>

            {/* Botón Digitador Rápido */}
            <button
              type="button"
              onClick={() => setShowDigitizerModal(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold shadow transition"
              title="Digitar respuestas rápidamente con las teclas A, B, C, D del teclado físico"
            >
              <Keyboard className="w-4 h-4 text-purple-200" /> Digitador Teclado
            </button>
          </div>
        </div>

        {/* Sub-barra: Planilla Excel con lista precargada */}
        <div className="mt-4 pt-4 border-t border-indigo-900/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>¿Prefieres Excel? Descarga la planilla con la lista oficial del curso o sube tus respuestas tabuladas:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/teacher/assignments/${id}/template-answers.xlsx?token=${typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : ""}`}
              download={`Plantilla_Alumnos_Ensayo_${id}.xlsx`}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
              title="Descargar planilla Excel con la lista de alumnos precargada"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" /> Descargar Planilla Curso (.xlsx)
            </a>

            <form onSubmit={handleImportAnswers} className="flex items-center gap-1.5 bg-slate-800 p-1 border border-slate-700 rounded-lg">
              <input 
                type="file" 
                accept=".xlsx,.csv" 
                onChange={e => setAnswerFile(e.target.files?.[0] || null)}
                className="text-[11px] max-w-[170px] text-slate-300 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-slate-700 file:text-white"
              />
              <button 
                type="submit" 
                disabled={!answerFile || importingAnswers}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded text-xs font-bold disabled:opacity-40 transition whitespace-nowrap"
              >
                <Upload className="w-3 h-3" /> {importingAnswers ? "Cargando..." : "Cargar Excel"}
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
