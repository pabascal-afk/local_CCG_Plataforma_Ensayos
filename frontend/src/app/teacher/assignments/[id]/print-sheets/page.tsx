"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import RequireRole from "@/components/RequireRole";
import QRCode from "qrcode";
import { Printer, ArrowLeft, Check, Users, FileText, CheckCircle2, AlertCircle } from "lucide-react";

type Question = {
  id: number;
  questionNumber: number;
  correctAnswer: string;
};

type Student = {
  rut: string;
  name: string;
};

type SheetData = {
  assignment: {
    id: number;
    opensAt: string;
    closesAt: string;
    dynamicPassword?: string;
  };
  exam: {
    id: number;
    title: string;
    subject: string;
    level: string;
    optionsCount: number;
    questionCount: number;
    questions: Question[];
  };
  course: {
    id: number;
    level: string;
    letter: string;
    year: number;
    fullName: string;
  };
  students: Student[];
};

export default function PrintSheetsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Opciones de impresión
  const [printMode, setPrintMode] = useState<"ALL" | "SINGLE" | "BLANK" | "KEY">("ALL");
  const [selectedStudentRut, setSelectedStudentRut] = useState<string>("");
  const [blankCount, setBlankCount] = useState<number>(5);

  // Cache de códigos QR generados en DataURL
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    apiFetch<SheetData>(`/teacher/assignments/${id}/printable-sheet-data`)
      .then(async (res) => {
        setData(res);
        if (res.students && res.students.length > 0) {
          setSelectedStudentRut(res.students[0].rut);
        }

        // Generar códigos QR para cada alumno
        const qrs: Record<string, string> = {};
        for (const st of res.students) {
          const payload = JSON.stringify({
            aid: res.assignment.id,
            rut: st.rut,
            eid: res.exam.id,
            qc: res.exam.questionCount,
            oc: res.exam.optionsCount || 4,
          });
          try {
            qrs[st.rut] = await QRCode.toDataURL(payload, {
              width: 140,
              margin: 1,
              errorCorrectionLevel: "M",
              color: { dark: "#000000", light: "#ffffff" },
            });
          } catch (e) {
            console.error("Error generando QR:", e);
          }
        }

        // QR para hoja en blanco genérica (rut vacío)
        const blankPayload = JSON.stringify({
          aid: res.assignment.id,
          rut: "GENERICO",
          eid: res.exam.id,
          qc: res.exam.questionCount,
          oc: res.exam.optionsCount || 4,
        });
        qrs["GENERICO"] = await QRCode.toDataURL(blankPayload, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        });

        setQrCodes(qrs);
      })
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const studentsToRender = useMemo(() => {
    if (!data) return [];
    if (printMode === "ALL") return data.students;
    if (printMode === "SINGLE") {
      const found = data.students.find((s) => s.rut === selectedStudentRut);
      return found ? [found] : [];
    }
    if (printMode === "BLANK") {
      return Array.from({ length: blankCount }, (_, i) => ({
        rut: "",
        name: "",
        isManualBlank: true,
        index: i + 1,
      }));
    }
    if (printMode === "KEY") {
      return [
        {
          rut: "00.000.000-0",
          name: "PAUTA OFICIAL DEL PROFESOR / UTP",
          isTeacherKey: true,
        },
      ];
    }
    return [];
  }, [data, printMode, selectedStudentRut, blankCount]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-600">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="font-semibold text-sm">Generando hojas de respuestas personalizadas...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-200 text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">No se pudo cargar la información</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">{error || "Error al cargar la asignación"}</p>
          <button
            onClick={() => router.back()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  const { exam, course, assignment } = data;
  const optCount = exam.optionsCount || 4;
  const options = ["A", "B", "C", "D", "E"].slice(0, optCount);

  // Columnas de la grilla de respuestas (dividir en 2 o 3 columnas de max 15 o 20 preguntas)
  const qCount = exam.questionCount;
  const columnsCount = qCount > 30 ? 3 : 2;
  const perCol = Math.ceil(qCount / columnsCount);

  const columns: Question[][] = [];
  for (let c = 0; c < columnsCount; c++) {
    const colQuestions = exam.questions.slice(c * perCol, (c + 1) * perCol);
    if (colQuestions.length > 0) columns.push(colQuestions);
  }

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR", "TEACHER"]}>
      {() => (
        <div className="min-h-screen bg-slate-100 text-slate-900">
          {/* BARRA SUPERIOR DE CONTROL (OCULTA AL IMPRIMIR) */}
          <div className="print:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-4 shadow-sm">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                  title="Volver"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-base font-bold text-slate-800 leading-tight">
                    Impresión de Hojas de Respuestas OMR
                  </h1>
                  <p className="text-xs text-slate-500">
                    {exam.title} &bull; <span className="font-semibold text-blue-700">{course.fullName}</span> &bull; {data.students.length} estudiantes
                  </p>
                </div>
              </div>

              {/* Selector de Modo */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
                  <button
                    onClick={() => setPrintMode("ALL")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      printMode === "ALL" ? "bg-white text-blue-700 shadow-xs" : "hover:text-slate-900"
                    }`}
                  >
                    Todo el Curso ({data.students.length})
                  </button>
                  <button
                    onClick={() => setPrintMode("SINGLE")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      printMode === "SINGLE" ? "bg-white text-blue-700 shadow-xs" : "hover:text-slate-900"
                    }`}
                  >
                    Alumno Específico
                  </button>
                  <button
                    onClick={() => setPrintMode("BLANK")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      printMode === "BLANK" ? "bg-white text-blue-700 shadow-xs" : "hover:text-slate-900"
                    }`}
                  >
                    En Blanco (Fotocopias)
                  </button>
                  <button
                    onClick={() => setPrintMode("KEY")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      printMode === "KEY" ? "bg-white text-emerald-700 shadow-xs" : "hover:text-slate-900"
                    }`}
                  >
                    Pauta Docente
                  </button>
                </div>

                {printMode === "SINGLE" && (
                  <select
                    value={selectedStudentRut}
                    onChange={(e) => setSelectedStudentRut(e.target.value)}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium max-w-[200px]"
                  >
                    {data.students.map((st) => (
                      <option key={st.rut} value={st.rut}>
                        {st.name} ({st.rut})
                      </option>
                    ))}
                  </select>
                )}

                {printMode === "BLANK" && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span>Cantidad:</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={blankCount}
                      onChange={(e) => setBlankCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-center font-bold"
                    />
                  </div>
                )}

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-colors"
                >
                  <Printer className="w-4 h-4" /> Imprimir ({studentsToRender.length} hoja{studentsToRender.length > 1 ? "s" : ""})
                </button>
              </div>
            </div>
          </div>

          {/* ÁREA DE IMPRESIÓN (CADA HOJA OCUPA EXACTAMENTE 1 PÁGINA) */}
          <div className="print:p-0 p-6 flex flex-col items-center">
            {studentsToRender.map((studentItem: any, index) => {
              const isTeacherKey = Boolean(studentItem.isTeacherKey);
              const isBlank = Boolean(studentItem.isManualBlank);
              const qrSrc = isBlank
                ? qrCodes["GENERICO"]
                : qrCodes[studentItem.rut] || qrCodes["GENERICO"];

              return (
                <div
                  key={isBlank ? `blank-${index}` : studentItem.rut || index}
                  className="omr-sheet-page bg-white shadow-lg print:shadow-none mx-auto mb-8 print:mb-0 relative box-border"
                  style={{
                    width: "216mm",
                    minHeight: "279mm",
                    maxHeight: "279mm",
                    padding: "10mm 12mm",
                    pageBreakAfter: "always",
                  }}
                >
                  {/* MARCADORES FIDUCIALES EN LAS 4 ESQUINAS (CALIBRACIÓN OMR) */}
                  <div className="absolute top-[8mm] left-[8mm] w-[14mm] h-[14mm] bg-black"></div>
                  <div className="absolute top-[8mm] right-[8mm] w-[14mm] h-[14mm] bg-black"></div>
                  <div className="absolute bottom-[8mm] left-[8mm] w-[14mm] h-[14mm] bg-black"></div>
                  <div className="absolute bottom-[8mm] right-[8mm] w-[14mm] h-[14mm] bg-black"></div>

                  {/* CONTENEDOR PRINCIPAL DENTRO DE LOS MARCADORES */}
                  <div className="flex flex-col h-full justify-between pt-[8mm] px-[6mm] pb-[8mm]">
                    
                    {/* CABECERA: LOGO + TITULO + QR */}
                    <div className="border-b-2 border-black pb-3 mb-3 flex items-start justify-between gap-4">
                      {/* Lado izquierdo: Identificación Institucional */}
                      <div className="flex items-center gap-3">
                        <img
                          src="/CCG-logo-300x300.png"
                          alt="Logo CCG"
                          className="w-14 h-14 object-contain filter grayscale contrast-200"
                        />
                        <div>
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-700">
                            Colegio Cerro Grande &bull; Plataforma SIMCE
                          </div>
                          <h2 className="text-base font-extrabold uppercase text-black leading-tight">
                            HOJA DE RESPUESTAS OFICIAL
                          </h2>
                          <div className="text-xs font-semibold text-black mt-0.5">
                            {exam.title} &bull; <span className="underline">{exam.subject}</span>
                          </div>
                        </div>
                      </div>

                      {/* Lado derecho: Código QR de lectura OMR */}
                      <div className="flex flex-col items-center">
                        {qrSrc ? (
                          <img
                            src={qrSrc}
                            alt="QR OMR"
                            className="w-[28mm] h-[28mm] object-contain border border-black p-0.5"
                          />
                        ) : (
                          <div className="w-[28mm] h-[28mm] border border-black flex items-center justify-center text-[9px] font-mono">
                            QR OMR
                          </div>
                        )}
                        <span className="text-[8px] font-mono tracking-tighter text-slate-700 mt-0.5">
                          ID:{assignment.id} | Q:{exam.questionCount}
                        </span>
                      </div>
                    </div>

                    {/* BLOQUE DE DATOS DEL ESTUDIANTE */}
                    <div className="border-2 border-black rounded-lg p-2.5 mb-3 bg-slate-50/50 print:bg-transparent">
                      {isTeacherKey ? (
                        <div className="bg-black text-white text-center py-2 font-black text-sm uppercase tracking-widest rounded">
                          PAUTA OFICIAL DE CORRECCIÓN (USO EXCLUSIVO DOCENTE / UTP)
                        </div>
                      ) : (
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-8">
                            <div className="text-[9px] font-bold uppercase text-slate-600">Nombre del Estudiante:</div>
                            {isBlank ? (
                              <div className="border-b border-dotted border-black h-6 mt-1 flex items-end text-xs font-serif text-slate-400">
                                (Escriba nombre y apellidos con letra imprenta clara)
                              </div>
                            ) : (
                              <div className="text-sm font-black uppercase text-black tracking-tight truncate mt-0.5">
                                {studentItem.name}
                              </div>
                            )}
                          </div>

                          <div className="col-span-4 border-l-2 border-black pl-3">
                            <div className="text-[9px] font-bold uppercase text-slate-600">RUT:</div>
                            {isBlank ? (
                              <div className="border-b border-dotted border-black h-6 mt-1 flex items-end text-xs font-mono text-slate-400">
                                __.___.___-_
                              </div>
                            ) : (
                              <div className="text-sm font-mono font-black text-black mt-0.5">
                                {studentItem.rut}
                              </div>
                            )}
                          </div>

                          <div className="col-span-6 border-t border-slate-300 pt-1.5">
                            <span className="text-[9px] font-bold uppercase text-slate-600">Curso: </span>
                            <span className="text-xs font-bold text-black">{course.fullName}</span>
                          </div>

                          <div className="col-span-6 border-t border-slate-300 pt-1.5 text-right">
                            <span className="text-[9px] font-bold uppercase text-slate-600">Fecha Aplicación: </span>
                            <span className="text-xs font-mono font-semibold text-black">
                              {new Date().toLocaleDateString("es-CL")}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* INSTRUCCIONES DE LLENADO SIMCE */}
                    <div className="border border-black rounded px-3 py-1.5 mb-3 text-[9px] leading-tight flex items-center justify-between bg-white">
                      <div>
                        <span className="font-bold text-black uppercase">Instrucciones: </span>
                        <span>Rellene completamente el círculo con lápiz grafito o pasta oscuro. No doble ni ensucie esta hoja.</span>
                      </div>
                      <div className="flex items-center gap-2 pl-3 border-l border-slate-300 shrink-0 font-mono font-bold">
                        <span className="flex items-center gap-1">
                          Correcto: <span className="inline-block w-3.5 h-3.5 bg-black rounded-full"></span>
                        </span>
                        <span className="text-slate-400">|</span>
                        <span className="flex items-center gap-1 text-slate-500">
                          Incorrecto: <span className="inline-block w-3.5 h-3.5 border border-black rounded-full text-center leading-3 text-[10px]">✕</span>
                        </span>
                      </div>
                    </div>

                    {/* GRILLA DE BURBUJAS OMR (COLUMNAS BALANCEADAS) */}
                    <div className="flex-1 flex gap-4 justify-between border-2 border-black rounded-xl p-3 bg-white">
                      {columns.map((colQuestions, colIdx) => (
                        <div
                          key={colIdx}
                          className={`flex-1 flex flex-col justify-between ${
                            colIdx < columns.length - 1 ? "border-r border-slate-300 pr-3" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between pb-1 mb-1 border-b border-black text-[9px] font-black text-slate-700">
                            <span>N°</span>
                            <div className="flex gap-2.5 pr-1">
                              {options.map((opt) => (
                                <span key={opt} className="w-5 text-center font-bold">
                                  {opt}
                                </span>
                              ))}
                            </div>
                          </div>

                          {colQuestions.map((q) => {
                            const correctOpt = isTeacherKey ? q.correctAnswer : null;

                            return (
                              <div
                                key={q.id}
                                className="flex items-center justify-between py-[1.5px] border-b border-slate-100 last:border-b-0"
                              >
                                {/* Número de pregunta */}
                                <span className="text-xs font-mono font-bold w-6 text-slate-800">
                                  {String(q.questionNumber).padStart(2, "0")}
                                </span>

                                {/* Burbujas de respuestas */}
                                <div className="flex gap-2.5 pr-1">
                                  {options.map((opt) => {
                                    const isCorrect = correctOpt === opt;

                                    return (
                                      <div
                                        key={opt}
                                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono transition-all ${
                                          isCorrect
                                            ? "bg-black text-white ring-2 ring-black"
                                            : "border-2 border-black text-black bg-white"
                                        }`}
                                      >
                                        {opt}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* PIE DE HOJA: CONTROL DE FIRMA Y REGISTRO */}
                    <div className="mt-3 pt-2 border-t border-black flex items-center justify-between text-[9px] text-slate-600 font-mono">
                      <span>Colegio Cerro Grande &bull; Sistema Oficial de Ensayos SIMCE</span>
                      <span>Hoja diseñada para procesamiento y escaneo OMR automatizado</span>
                      <span>Pág. 1 de 1</span>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {/* ESTILOS CSS PARA IMPRESIÓN (@media print) */}
          <style jsx global>{`
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              @page {
                size: letter portrait;
                margin: 0;
              }
              .omr-sheet-page {
                box-shadow: none !important;
                margin: 0 !important;
                page-break-after: always !important;
                break-after: page !important;
                width: 216mm !important;
                height: 279mm !important;
                min-height: 279mm !important;
                max-height: 279mm !important;
              }
            }
          `}</style>
        </div>
      )}
    </RequireRole>
  );
}
