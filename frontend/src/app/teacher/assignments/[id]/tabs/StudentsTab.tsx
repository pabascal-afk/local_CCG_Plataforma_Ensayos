import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";
import Link from "next/link";
import { ChevronRight, Upload, FileSpreadsheet, Download, Printer, ScanLine, Keyboard, Sparkles, Monitor, Check, PenTool, Zap, CheckSquare, Square } from "lucide-react";
import OmrScannerModal from "@/components/OmrScannerModal";
import FastDigitizerModal from "@/components/FastDigitizerModal";
import OpenQuestionsGradingModal from "@/components/OpenQuestionsGradingModal";
import ReactivateCourseModal from "@/components/ReactivateCourseModal";
import ReactivateStudentModal from "@/components/ReactivateStudentModal";
import ReactivateBulkStudentsModal from "@/components/ReactivateBulkStudentsModal";
import { useIsPruebas } from "@/lib/useIsPruebas";

export default function StudentsTab({ id }: { id: number }) {
  const isPruebas = useIsPruebas();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [importingAnswers, setImportingAnswers] = useState(false);
  const [showOmrModal, setShowOmrModal] = useState(false);
  const [showDigitizerModal, setShowDigitizerModal] = useState(false);
  const [showOpenGradingModal, setShowOpenGradingModal] = useState(false);
  const [selectedGradingRut, setSelectedGradingRut] = useState<string | null>(null);
  const [showModeConfirmModal, setShowModeConfirmModal] = useState(false);
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const [showReactivateCourseModal, setShowReactivateCourseModal] = useState(false);
  const [selectedReactivateStudent, setSelectedReactivateStudent] = useState<any>(null);
  const [selectedRuts, setSelectedRuts] = useState<string[]>([]);
  const [showBulkReactivateModal, setShowBulkReactivateModal] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const token = getToken();
      const res = await fetch(`/api/teacher/assignments/${id}/template-answers.xlsx`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Error al descargar planilla del curso");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Plantilla_Alumnos_Ensayo_${id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const refreshData = async () => {
    try {
      const refreshed = await apiFetch(`/teacher/assignments/${id}/live`);
      setData(refreshed);
    } catch (err: any) {
      console.error("Error al refrescar datos:", err);
    }
  };

  const handleToggleMode = async () => {
    if (!data) return;
    const targetMode = data.applicationMode === "PRINTED" ? "DIGITAL" : "PRINTED";
    setIsUpdatingMode(true);
    try {
      await apiFetch(`/teacher/assignments/${id}/mode`, {
        method: "PATCH",
        body: { applicationMode: targetMode },
      });
      setShowModeConfirmModal(false);
      await refreshData();
    } catch (err: any) {
      alert(err.message || "Error al actualizar la modalidad");
    } finally {
      setIsUpdatingMode(false);
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
  const openQuestions = data.openQuestions || [];
  const hasOpenQuestions = openQuestions.length > 0;

  const selectedStudentObjects = useMemo(() => {
    if (!data?.students) return [];
    return data.students
      .filter((s: any) => selectedRuts.includes(s.rut))
      .map((s: any) => ({ rut: s.rut, name: s.name }));
  }, [data?.students, selectedRuts]);

  const toggleSelectRut = (rut: string) => {
    setSelectedRuts(prev => prev.includes(rut) ? prev.filter(r => r !== rut) : [...prev, rut]);
  };

  return (
    <div>
      {/* Modales OMR, Digitador y Calificador Desarrollo/Oral */}
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
      <OpenQuestionsGradingModal
        assignmentId={id}
        isOpen={showOpenGradingModal}
        onClose={() => setShowOpenGradingModal(false)}
        openQuestions={openQuestions}
        students={data.students || []}
        initialStudentRut={selectedGradingRut}
        onSuccess={refreshData}
      />

      {/* Modal Confirmación de Cambio de Modalidad */}
      {showModeConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                data.applicationMode === "PRINTED" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
              }`}>
                {data.applicationMode === "PRINTED" ? <Monitor className="w-5 h-5" /> : <Printer className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  Cambiar Modalidad de Rendición
                </h3>
                <p className="text-xs text-gray-500">
                  {data.course?.name || "Curso"} • {data.exam?.title || "Evaluación"}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-gray-700 space-y-2">
              <p>
                ¿Deseas cambiar esta evaluación a modalidad{" "}
                <strong className={data.applicationMode === "PRINTED" ? "text-blue-700 font-bold" : "text-emerald-700 font-bold"}>
                  {data.applicationMode === "PRINTED" ? "DIGITAL (En línea)" : "IMPRESA (Papel / OMR)"}
                </strong>?
              </p>
              {data.applicationMode === "PRINTED" ? (
                <p className="text-gray-500">
                  Los estudiantes podrán iniciar la prueba online desde sus computadores o tablets en la plataforma durante el horario activo.
                </p>
              ) : (
                <p className="text-gray-500">
                  Los estudiantes no podrán responder en línea. Deberás imprimir las hojas con código QR para que respondan en papel y luego escanearlas o subir un PDF multipágina con las respuestas.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModeConfirmModal(false)}
                disabled={isUpdatingMode}
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleToggleMode}
                disabled={isUpdatingMode}
                className={`px-5 py-2 rounded-xl text-white text-xs font-black shadow-sm transition disabled:opacity-50 flex items-center gap-2 ${
                  data.applicationMode === "PRINTED"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isUpdatingMode ? (
                  <span>Guardando...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar Cambio</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bloque Aplicación Impresa y Carga Masiva OMR */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-5 mb-8 shadow-md border border-indigo-900">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {data.applicationMode === "PRINTED" ? (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase flex items-center gap-1.5">
                  <Printer className="w-3 h-3 text-emerald-300" /> Modalidad: Impresa (Papel / OMR)
                </span>
              ) : (
                <span className="bg-blue-500/20 text-blue-300 border border-blue-400/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase flex items-center gap-1.5">
                  <Monitor className="w-3 h-3 text-blue-300" /> Modalidad: Digital (En Línea)
                </span>
              )}

              <button
                type="button"
                onClick={() => setShowModeConfirmModal(true)}
                className="text-[10px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/30 px-2 py-0.5 rounded-lg transition"
              >
                Cambiar a {data.applicationMode === "PRINTED" ? "Digital" : "Impreso"}
              </button>

              <span className="text-xs text-indigo-300 font-medium flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {isPruebas ? "Corrección instantánea automatizada" : "Corrección instantánea con TRI SIMCE"}
              </span>
            </div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              Impresión y Digitalización de Hojas de Respuestas
            </h4>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Imprime las hojas con QR personalizado por alumno y luego digitalízalas escaneando el documento, tomando fotos con tu celular, subiendo un PDF multipágina con todo el curso o usando el digitador de teclado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Botón Reactivar Curso */}
            <button
              type="button"
              onClick={() => setShowReactivateCourseModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 px-3.5 py-2.5 rounded-xl text-xs font-black shadow transition cursor-pointer"
              title="Reactivar evaluación para el curso completo o extender el plazo"
            >
              <Zap className="w-4 h-4 fill-current" /> Reactivar Evaluación
            </button>

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

            {/* Botón Revisar Desarrollo / Oral */}
            {hasOpenQuestions && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGradingRut(null);
                  setShowOpenGradingModal(true);
                }}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-2.5 rounded-xl text-xs font-black shadow transition"
                title="Ingresar puntaje de preguntas de Desarrollo Escrito y Respuesta Oral por estudiante"
              >
                <PenTool className="w-4 h-4" /> Calificar Desarrollo / Oral ({openQuestions.length})
              </button>
            )}
          </div>
        </div>

        {/* Sub-barra: Planilla Excel con lista precargada */}
        <div className="mt-4 pt-4 border-t border-indigo-900/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>¿Prefieres Excel? Descarga la planilla con la lista oficial del curso o sube tus respuestas tabuladas:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
              title="Descargar planilla Excel con la lista de alumnos precargada"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" /> Descargar Planilla Curso (.xlsx)
            </button>

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

      {/* Barra de Selección Rápida Masiva */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Selección Masiva:</span>
          <button
            type="button"
            onClick={() => {
              if (selectedRuts.length === data.students.length) {
                setSelectedRuts([]);
              } else {
                setSelectedRuts(data.students.map((s: any) => s.rut));
              }
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 transition"
          >
            {selectedRuts.length === data.students.length ? "Deseleccionar Todos" : `Seleccionar Todos (${data.students.length})`}
          </button>
          <button
            type="button"
            onClick={() => setSelectedRuts(pending.map((s: any) => s.rut))}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 transition"
          >
            Solo Pendientes / Ausentes ({pending.length})
          </button>
          {selectedRuts.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedRuts([])}
              className="text-xs text-gray-500 hover:text-gray-800 underline px-1"
            >
              Limpiar ({selectedRuts.length})
            </button>
          )}
        </div>

        {selectedRuts.length > 0 && (
          <button
            type="button"
            onClick={() => setShowBulkReactivateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" /> Reactivar Seleccionados ({selectedRuts.length})
          </button>
        )}
      </div>

      <h3 className="text-lg font-bold text-gray-800 mb-4">Estudiantes que Entregaron ({students.length})</h3>
      <div className="overflow-x-auto border rounded-lg mb-8">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
            <tr>
              <th className="p-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={students.length > 0 && students.every((s: any) => selectedRuts.includes(s.rut))}
                  onChange={() => {
                    const allSubmittedRuts: string[] = students.map((s: any) => String(s.rut));
                    const allSelected = allSubmittedRuts.every((r: string) => selectedRuts.includes(r));
                    if (allSelected) {
                      setSelectedRuts(prev => prev.filter((r: string) => !allSubmittedRuts.includes(r)));
                    } else {
                      setSelectedRuts(prev => Array.from(new Set([...prev, ...allSubmittedRuts])));
                    }
                  }}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </th>
              <th className="p-4">RUT</th>
              <th className="p-4">Nombre</th>
              <th className="p-4 text-center">Nota</th>
              <th className="p-4 text-center">{isPruebas ? "Puntaje" : "Puntaje SIMCE"}</th>
              {hasOpenQuestions && <th className="p-4 text-center">Desarrollo / Oral</th>}
              <th className="p-4">Nivel de Logro</th>
              <th className="p-4">Entrega</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.length === 0 && (
              <tr>
                <td colSpan={hasOpenQuestions ? 9 : 8} className="p-4 text-center text-gray-500">
                  Nadie ha entregado aún.
                </td>
              </tr>
            )}
            {students.map((st: any) => {
              const g = st.grade || 0;
              const level = st.achievementLevel || (g >= 6.0 ? "ADECUADO" : g >= 4.0 ? "ELEMENTAL" : "INSUFICIENTE");
              const openGraded = st.openGradedCount || 0;
              const openTotal = openQuestions.length;
              const isSelected = selectedRuts.includes(st.rut);

              return (
                <tr key={st.rut} className={`hover:bg-gray-50 ${isSelected ? "bg-blue-50/40" : ""}`}>
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectRut(st.rut)}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                  </td>
                  <td className="p-4 font-mono text-gray-600">{st.rut}</td>
                  <td className="p-4 font-bold text-gray-900">{st.name}</td>
                  <td className="p-4 text-center font-bold text-blue-600">{g.toFixed(1)}</td>
                  <td className="p-4 text-center font-bold text-emerald-700">
                    {st.simceScore ? `${st.simceScore} pts` : "-"}
                  </td>
                  {hasOpenQuestions && (
                    <td className="p-4 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGradingRut(st.rut);
                          setShowOpenGradingModal(true);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold border transition ${
                          openGraded >= openTotal
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                            : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                        }`}
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>
                          {openGraded >= openTotal
                            ? `Calificado (${openGraded}/${openTotal})`
                            : `Calificar (${openGraded}/${openTotal})`}
                        </span>
                      </button>
                    </td>
                  )}
                  <td className="p-4">
                    {level === "ADECUADO" ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Adecuado</span> :
                     level === "ELEMENTAL" ? <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold">Elemental</span> :
                     <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Insuficiente</span>}
                  </td>
                  <td className="p-4 text-gray-500 text-xs">{new Date(st.submittedAt).toLocaleString()}</td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedReactivateStudent(st)}
                      className="inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold transition mr-2 cursor-pointer shadow-2xs"
                      title="Reactivar intento para este alumno (conservar o reiniciar respuestas)"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-600 fill-current" /> Reactivar
                    </button>
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
              <th className="p-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={pending.length > 0 && pending.every((s: any) => selectedRuts.includes(s.rut))}
                  onChange={() => {
                    const allPendingRuts: string[] = pending.map((s: any) => String(s.rut));
                    const allSelected = allPendingRuts.every((r: string) => selectedRuts.includes(r));
                    if (allSelected) {
                      setSelectedRuts(prev => prev.filter((r: string) => !allPendingRuts.includes(r)));
                    } else {
                      setSelectedRuts(prev => Array.from(new Set([...prev, ...allPendingRuts])));
                    }
                  }}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </th>
              <th className="p-4">RUT</th>
              <th className="p-4">Nombre</th>
              <th className="p-4">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pending.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  Todos han entregado.
                </td>
              </tr>
            )}
            {pending.map((st: any) => {
              const isSelected = selectedRuts.includes(st.rut);
              return (
                <tr key={st.rut} className={`hover:bg-gray-50 text-gray-500 ${isSelected ? "bg-blue-50/40" : ""}`}>
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectRut(st.rut)}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                  </td>
                  <td className="p-4 font-mono">{st.rut}</td>
                  <td className="p-4">
                    <span className="font-bold text-gray-800 block">{st.name}</span>
                    {st.isExtended && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md mt-0.5">
                        <Zap className="w-3 h-3 text-indigo-600 fill-current" />
                        Plazo individual: {new Date(st.extendedDeadline).toLocaleDateString([], { day: "2-digit", month: "short" })} {new Date(st.extendedDeadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {st.state === "NOT_STARTED" ? (
                      <span className="text-gray-500">Sin comenzar</span>
                    ) : (
                      <span className="text-amber-700 font-semibold">En curso ({st.answersCount} resp.)</span>
                    )}
                  </td>
                  <td className="p-4 text-right whitespace-nowrap space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedReactivateStudent(st)}
                      className="inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                      title="Otorgar plazo individual a este alumno"
                    >
                      <Zap className="w-3.5 h-3.5 text-blue-600 fill-current" /> Habilitar Plazo
                    </button>
                    {hasOpenQuestions && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGradingRut(st.rut);
                          setShowOpenGradingModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition"
                      >
                        <PenTool className="w-3 h-3" /> Puntaje Desarrollo
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating Selection Action Bar */}
      {selectedRuts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900/95 text-white backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl border border-gray-700 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="text-sm">
            <span className="font-extrabold text-blue-400">{selectedRuts.length}</span> estudiante{selectedRuts.length > 1 ? "s" : ""} seleccionado{selectedRuts.length > 1 ? "s" : ""}
          </div>
          <div className="h-4 w-px bg-gray-700" />
          <button
            type="button"
            onClick={() => setShowBulkReactivateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
          >
            <Zap className="w-4 h-4 text-amber-300 fill-current" />
            Reactivar / Habilitar Plazo Masivo
          </button>
          <button
            type="button"
            onClick={() => setSelectedRuts([])}
            className="text-xs text-gray-400 hover:text-white transition px-2 py-1"
          >
            Limpiar
          </button>
        </div>
      )}

      {/* Modal Reactivar Curso */}
      <ReactivateCourseModal
        isOpen={showReactivateCourseModal}
        onClose={() => setShowReactivateCourseModal(false)}
        assignmentId={id}
        currentClosesAt={data?.assignment?.closesAt}
        examTitle={data?.exam?.title}
        courseName={data?.course?.fullName}
        onSuccess={refreshData}
      />

      {/* Modal Reactivar Estudiante */}
      <ReactivateStudentModal
        isOpen={Boolean(selectedReactivateStudent)}
        onClose={() => setSelectedReactivateStudent(null)}
        assignmentId={id}
        student={selectedReactivateStudent}
        examDurationMinutes={data?.assignment?.durationMinutes}
        onSuccess={refreshData}
      />

      {/* Modal Reactivar Masivo */}
      <ReactivateBulkStudentsModal
        isOpen={showBulkReactivateModal}
        onClose={() => setShowBulkReactivateModal(false)}
        assignmentId={id}
        selectedStudents={selectedStudentObjects}
        onSuccess={() => {
          setSelectedRuts([]);
          refreshData();
        }}
      />
    </div>
  );
}
