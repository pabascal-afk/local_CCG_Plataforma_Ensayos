"use client";

import { useState, useEffect, useRef } from "react";
import { pdfjs } from "react-pdf";
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  Trash2,
  Loader2,
  RefreshCw,
  HelpCircle,
  Check,
  UserCheck,
  Camera,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { readOmrSheetFromCanvas, SheetReadResult } from "@/lib/omr/omrEngine";

// Configurar worker de pdfjs servido localmente desde public/pdf.worker.min.mjs
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface StudentOption {
  rut: string;
  name: string;
}

interface ProcessedSheetItem {
  id: string; // unique key
  pageIndex: number;
  fileName: string;
  result: SheetReadResult;
  selectedRut: string;
  studentName: string;
  answers: Record<number, string>;
  isReviewed: boolean;
}

interface OmrScannerModalProps {
  assignmentId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function OmrScannerModal({
  assignmentId,
  isOpen,
  onClose,
  onSuccess,
}: OmrScannerModalProps) {
  const [courseStudents, setCourseStudents] = useState<StudentOption[]>([]);
  const [examMeta, setExamMeta] = useState<{
    title: string;
    questionCount: number;
    optionsCount: number;
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingProgress, setProcessingProgress] = useState<{
    current: number;
    total: number;
    currentStudent?: string;
  } | null>(null);
  const [processedSheets, setProcessedSheets] = useState<ProcessedSheetItem[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [viewingFullImage, setViewingFullImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Cargar estudiantes del curso e información de la evaluación
  useEffect(() => {
    if (!isOpen) return;

    apiFetch<any>(`/teacher/assignments/${assignmentId}/printable-sheet-data`)
      .then((data: any) => {
        if (data && data.students) {
          setCourseStudents(
            data.students.map((s: any) => ({
              rut: s.rut,
              name: s.name,
            }))
          );
        }
        if (data && data.exam) {
          setExamMeta({
            title: data.exam.title,
            questionCount: data.questions?.length || data.exam.questionCount || 30,
            optionsCount: data.exam.optionsCount || 4,
          });
        }
      })
      .catch((err) => {
        console.error("Error cargando datos de hoja:", err);
      });
  }, [assignmentId, isOpen]);

  if (!isOpen) return null;

  // Procesar archivo PDF
  const processPdfFile = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const newItems: ProcessedSheetItem[] = [];

    for (let p = 1; p <= numPages; p++) {
      setProcessingProgress({ current: p, total: numPages, currentStudent: `Página ${p}...` });
      setProcessingStatus(`Leyendo página ${p} de ${numPages} del PDF "${file.name}"...`);

      const page = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: 2.0 }); // alta resolución para OMR
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        const omrResult = await readOmrSheetFromCanvas(canvas, p, assignmentId);

        // Asociar alumno
        let matchedRut = omrResult.studentRut || "";
        let matchedName = "";

        if (matchedRut) {
          const found = courseStudents.find(
            (s) => s.rut.replace(/[^0-9kK]/g, "").toUpperCase() === matchedRut.replace(/[^0-9kK]/g, "").toUpperCase()
          );
          if (found) {
            matchedName = found.name;
          }
        }

        const studentLabel = matchedName || (matchedRut ? `RUT: ${matchedRut}` : `Hoja #${p}`);
        setProcessingProgress({ current: p, total: numPages, currentStudent: studentLabel });
        setProcessingStatus(`Página ${p} de ${numPages} procesada: ${studentLabel}`);

        newItems.push({
          id: `${file.name}-p${p}-${Date.now()}-${Math.random()}`,
          pageIndex: p,
          fileName: file.name,
          result: omrResult,
          selectedRut: matchedRut,
          studentName: matchedName,
          answers: { ...omrResult.answers },
          isReviewed: false,
        });
      }
    }

    return newItems;
  };

  // Procesar archivo de imagen (JPG / PNG)
  const processImageFile = async (file: File) => {
    setProcessingStatus(`Procesando imagen "${file.name}"...`);

    const img = new Image();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    img.src = dataUrl;
    await new Promise((res) => {
      img.onload = res;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0);
    }

    const omrResult = await readOmrSheetFromCanvas(canvas, 1, assignmentId);

    let matchedRut = omrResult.studentRut || "";
    let matchedName = "";

    if (matchedRut) {
      const found = courseStudents.find(
        (s) => s.rut.replace(/[^0-9kK]/g, "").toUpperCase() === matchedRut.replace(/[^0-9kK]/g, "").toUpperCase()
      );
      if (found) {
        matchedName = found.name;
      }
    }

    return [
      {
        id: `${file.name}-img-${Date.now()}-${Math.random()}`,
        pageIndex: 1,
        fileName: file.name,
        result: omrResult,
        selectedRut: matchedRut,
        studentName: matchedName,
        answers: { ...omrResult.answers },
        isReviewed: false,
      },
    ];
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      let accumulated: ProcessedSheetItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
          const pdfItems = await processPdfFile(file);
          accumulated = accumulated.concat(pdfItems);
        } else if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)) {
          const imgItems = await processImageFile(file);
          accumulated = accumulated.concat(imgItems);
        }
      }

      setProcessedSheets((prev) => [...prev, ...accumulated]);
      if (accumulated.length > 0 && !selectedSheetId) {
        setSelectedSheetId(accumulated[0].id);
      }
    } catch (err: any) {
      console.error("Error al procesar archivos OMR:", err);
      setErrorMessage(err.message || "Ocurrió un error al analizar las hojas");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Cambiar manualmente el alumno asignado a una hoja
  const handleAssignStudent = (sheetId: string, rut: string) => {
    const found = courseStudents.find((s) => s.rut === rut);
    setProcessedSheets((prev) =>
      prev.map((item) =>
        item.id === sheetId
          ? {
              ...item,
              selectedRut: rut,
              studentName: found ? found.name : "",
            }
          : item
      )
    );
  };

  // Cambiar manualmente una respuesta leída
  const handleAnswerChange = (sheetId: string, qNum: number, option: string) => {
    setProcessedSheets((prev) =>
      prev.map((item) => {
        if (item.id !== sheetId) return item;
        const currentAns = item.answers[qNum];
        const newAns = currentAns === option ? "" : option; // toggle o desmarcar
        const updated = { ...item.answers };
        if (newAns) {
          updated[qNum] = newAns;
        } else {
          delete updated[qNum];
        }
        return {
          ...item,
          answers: updated,
          isReviewed: true,
        };
      })
    );
  };

  const handleRemoveSheet = (sheetId: string) => {
    setProcessedSheets((prev) => prev.filter((s) => s.id !== sheetId));
    if (selectedSheetId === sheetId) {
      const remaining = processedSheets.filter((s) => s.id !== sheetId);
      setSelectedSheetId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Guardar en la base de datos
  const handleConfirmAndSubmit = async () => {
    if (processedSheets.length === 0) return;

    // Verificar hojas sin alumno
    const unassigned = processedSheets.filter((s) => !s.selectedRut);
    if (unassigned.length > 0) {
      if (
        !confirm(
          `Hay ${unassigned.length} hoja(s) sin alumno asignado. ¿Deseas descartar esas hojas no identificadas y guardar el resto?`
        )
      ) {
        return;
      }
    }

    const validSubmissions = processedSheets
      .filter((s) => s.selectedRut)
      .map((s) => ({
        studentRut: s.selectedRut,
        answers: s.answers,
      }));

    if (validSubmissions.length === 0) {
      alert("No hay hojas válidas asociadas a un alumno para enviar.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await apiFetch<any>(`/teacher/assignments/${assignmentId}/omr-bulk-submit`, {
        method: "POST",
        body: { submissions: validSubmissions },
      });

      setSuccessMessage(
        `¡Éxito! Se guardaron y corrigieron ${response.savedCount} hojas de respuestas con cálculo de puntajes SIMCE y TRI.`
      );

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1800);
    } catch (err: any) {
      setErrorMessage(err.message || "Error al guardar las respuestas en el servidor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeSheet = processedSheets.find((s) => s.id === selectedSheetId);
  const qCount = examMeta?.questionCount || 30;
  const oCount = examMeta?.optionsCount || 4;
  const letters = ["A", "B", "C", "D", "E"].slice(0, oCount);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Encabezado */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white p-4 px-6 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <Upload className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Lector OMR de Hojas de Respuestas</h2>
              <p className="text-xs text-blue-200">
                {examMeta?.title ? `${examMeta.title} • ` : ""}
                Reconocimiento óptico de burbujas impresas por escáner o fotografía
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones de error o éxito */}
        {errorMessage && (
          <div className="bg-rose-50 border-b border-rose-200 p-3 px-6 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 p-3 px-6 text-xs text-emerald-800 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Zona de Subida / Acciones superiores */}
        <div className="p-4 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Input oculto para PDF multipágina */}
            <input
              type="file"
              ref={pdfInputRef}
              accept=".pdf"
              onChange={handleFilesSelected}
              className="hidden"
            />
            {/* Input oculto para Fotos / Imágenes */}
            <input
              type="file"
              ref={imageInputRef}
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
            {/* Input genérico fallback */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,image/png,image/jpeg,image/webp"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />

            {/* Botón 1: PDF Multipágina */}
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition"
            >
              <FileText className="w-4 h-4" />
              <span>Subir PDF Multipágina (Todo el Curso)</span>
            </button>

            {/* Botón 2: Fotos Sueltas */}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-sm transition"
            >
              <Camera className="w-4 h-4" />
              <span>Subir Fotos Sueltas (JPG/PNG)</span>
            </button>
          </div>

          {processedSheets.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
                {processedSheets.length} hoja(s) analizada(s)
              </span>
              <button
                type="button"
                onClick={() => setProcessedSheets([])}
                className="text-xs text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200 font-semibold transition"
              >
                Limpiar lista
              </button>
            </div>
          )}
        </div>

        {/* Barra de progreso y estado en procesamiento */}
        {isProcessing && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 px-6 transition">
            <div className="flex items-center justify-between text-xs text-amber-900 font-semibold mb-1.5">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                <span>{processingStatus || "Procesando hojas de respuestas..."}</span>
                {processingProgress?.currentStudent && (
                  <span className="text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded text-[11px] font-mono">
                    Detectado: {processingProgress.currentStudent}
                  </span>
                )}
              </div>
              {processingProgress && (
                <span className="font-mono font-bold text-amber-800">
                  {Math.round((processingProgress.current / (processingProgress.total || 1)) * 100)}% ({processingProgress.current}/{processingProgress.total})
                </span>
              )}
            </div>
            {processingProgress && (
              <div className="w-full bg-amber-200/60 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((processingProgress.current / (processingProgress.total || 1)) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Contenido Principal: 2 columnas (Lista a la izquierda, Detalle a la derecha) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Columna Izquierda: Lista de Hojas procesadas */}
          <div className="w-full md:w-5/12 border-r border-gray-200 flex flex-col bg-slate-50/40">
            <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Hojas Detectadas ({processedSheets.length})
              </span>
              <span className="text-[11px] text-gray-400">
                Clic para inspeccionar
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {processedSheets.length === 0 && !isProcessing && (
                <div className="h-full flex flex-col items-center justify-center p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                    Selecciona una forma de carga
                  </p>
                  
                  {/* Opción 1: PDF multipágina */}
                  <div
                    onClick={() => pdfInputRef.current?.click()}
                    className="w-full p-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-500 transition cursor-pointer text-center group"
                  >
                    <FileText className="w-8 h-8 mx-auto mb-2 text-emerald-600 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-emerald-900">
                      Subir PDF Multipágina (Recomendado)
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-1 leading-snug">
                      Escanea todas las hojas del curso juntas en una sola pasada y sube el archivo PDF.
                    </p>
                  </div>

                  {/* Opción 2: Fotos sueltas */}
                  <div
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full p-4 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-500 transition cursor-pointer text-center group"
                  >
                    <Camera className="w-8 h-8 mx-auto mb-2 text-blue-600 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-blue-900">
                      Subir Fotos Sueltas (JPG/PNG)
                    </p>
                    <p className="text-[11px] text-blue-700 mt-1 leading-snug">
                      Sube fotos tomadas con teléfono celular o imágenes individuales de hojas.
                    </p>
                  </div>
                </div>
              )}

              {processedSheets.map((item, idx) => {
                const isSelected = item.id === selectedSheetId;
                const hasRut = !!item.selectedRut;
                const answeredCount = Object.keys(item.answers).length;
                const hasAmbiguity = item.result.hasUncertainOrDouble;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedSheetId(item.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-blue-50/80 border-blue-500 shadow-sm ring-1 ring-blue-500"
                        : "bg-white border-gray-200 hover:border-gray-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {/* Miniatura o Ícono */}
                      {item.result.thumbnailDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.result.thumbnailDataUrl}
                          alt="Thumbnail"
                          className="w-10 h-14 object-cover rounded border border-gray-300 shrink-0 bg-white"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-gray-100 rounded border border-gray-300 flex items-center justify-center shrink-0 text-gray-400 text-xs font-mono">
                          #{idx + 1}
                        </div>
                      )}

                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gray-900 truncate">
                            {item.studentName || (hasRut ? item.selectedRut : "Alumno No Identificado")}
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-gray-600">{item.selectedRut || "Sin RUT"}</span>
                          <span>•</span>
                          <span className="text-blue-700 font-semibold">{answeredCount}/{qCount} resp.</span>
                        </div>

                        {/* Badges de calidad */}
                        <div className="flex items-center gap-1 mt-1.5">
                          {hasAmbiguity && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" /> Revisar marcas
                            </span>
                          )}
                          {!hasRut && (
                            <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                              <AlertCircle className="w-2.5 h-2.5" /> Asignar alumno
                            </span>
                          )}
                          {hasRut && !hasAmbiguity && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> {item.result.confidenceAvg}% conf.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSheet(item.id);
                      }}
                      className="text-gray-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition shrink-0"
                      title="Eliminar esta hoja"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Columna Derecha: Detalle e Inspección de la Hoja Seleccionada */}
          <div className="hidden md:flex flex-1 flex-col bg-white overflow-hidden">
            {activeSheet ? (
              <div className="h-full flex flex-col">
                {/* Cabecera del Alumno y Asignación */}
                <div className="p-4 bg-slate-50 border-b border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        Inspección de Hoja
                      </span>
                      <h3 className="text-base font-bold text-gray-900">
                        {activeSheet.studentName || "Asigna el alumno para guardar su puntaje"}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-md text-gray-600 font-mono">
                        Página {activeSheet.pageIndex} ({activeSheet.fileName})
                      </span>
                    </div>
                  </div>

                  {/* Selector de Alumno (en caso de que el QR no se haya detectado o sea hoja en blanco) */}
                  <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-gray-200">
                    <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <label className="text-xs font-bold text-gray-700 whitespace-nowrap">
                      Alumno del curso:
                    </label>
                    <select
                      value={activeSheet.selectedRut}
                      onChange={(e) => handleAssignStudent(activeSheet.id, e.target.value)}
                      className="flex-1 text-xs border border-gray-300 rounded-lg p-1.5 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Seleccionar de la lista del curso --</option>
                      {courseStudents.map((st) => (
                        <option key={st.rut} value={st.rut}>
                          {st.name} ({st.rut})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Grilla de Respuestas Detectadas */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-gray-700">
                      Alternativas Detectadas ({Object.keys(activeSheet.answers).length} de {qCount} contestadas):
                    </p>
                    <span className="text-[11px] text-gray-400">
                      Haz clic en cualquier letra para cambiarla o desmarcarla
                    </span>
                  </div>

                  {/* Distribución en Columnas Verticales Idéntica a la Hoja Física */}
                  {(() => {
                    const modalColumnsCount = qCount > 30 ? 3 : 2;
                    const perColModal = Math.ceil(qCount / modalColumnsCount);

                    const modalColumns: number[][] = [];
                    for (let c = 0; c < modalColumnsCount; c++) {
                      const col: number[] = [];
                      for (let r = 0; r < perColModal; r++) {
                        const qNum = c * perColModal + r + 1;
                        if (qNum <= qCount) {
                          col.push(qNum);
                        }
                      }
                      if (col.length > 0) modalColumns.push(col);
                    }

                    return (
                      <div className={`flex gap-3 items-start ${modalColumnsCount > 2 ? "flex-col lg:flex-row" : "flex-col sm:flex-row"}`}>
                        {modalColumns.map((colQuestions, cIdx) => (
                          <div
                            key={cIdx}
                            className="flex-1 w-full bg-slate-50/70 rounded-xl border border-gray-200 p-2.5 space-y-1.5 shadow-xs"
                          >
                            {/* Cabecera idéntica a la hoja física */}
                            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-gray-300 text-[11px] font-bold text-gray-700 px-1">
                              <span className="w-7 font-mono">N°</span>
                              <div className="flex items-center gap-1.5 pr-1">
                                {letters.map((letra) => (
                                  <span key={letra} className="w-6 text-center font-bold font-mono">
                                    {letra}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Filas de preguntas en orden vertical descendente (01..10, 11..20, etc.) */}
                            {colQuestions.map((qNum) => {
                              const selected = activeSheet.answers[qNum];
                              const detail = activeSheet.result.questionsDetail?.find(
                                (d) => d.questionNumber === qNum
                              );

                              const isDouble = detail?.status === "DOUBLE_MARK";
                              const isUncertain = detail?.status === "UNCERTAIN";

                              return (
                                <div
                                  key={qNum}
                                  className={`p-1.5 px-2 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                                    isDouble
                                      ? "bg-rose-50 border-rose-300"
                                      : isUncertain
                                      ? "bg-amber-50 border-amber-300"
                                      : selected
                                      ? "bg-white border-blue-200 shadow-xs"
                                      : "bg-white/60 border-dashed border-gray-200 text-gray-400"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-gray-700 w-6 font-mono text-[11px]">
                                      {String(qNum).padStart(2, "0")}
                                    </span>
                                    {isDouble && (
                                      <span title="Doble marca detectada" className="text-rose-600 font-bold text-xs">
                                        ⚠
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {letters.map((letra) => {
                                      const isChecked = selected === letra;
                                      return (
                                        <button
                                          key={letra}
                                          type="button"
                                          onClick={() => handleAnswerChange(activeSheet.id, qNum, letra)}
                                          className={`w-6 h-6 rounded-full font-bold text-[11px] font-mono transition flex items-center justify-center ${
                                            isChecked
                                              ? "bg-blue-600 text-white shadow-xs ring-2 ring-blue-300"
                                              : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400"
                                          }`}
                                        >
                                          {letra}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Footer de la columna derecha con miniatura de la hoja completa */}
                {(activeSheet.result.fullImageDataUrl || activeSheet.result.thumbnailDataUrl) && (
                  <div className="p-3 bg-slate-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="text-[11px]">
                      Hoja escaneada #{activeSheet.pageIndex} procesada automáticamente con OMR.
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setViewingFullImage(
                            activeSheet.result.fullImageDataUrl || activeSheet.result.thumbnailDataUrl || null
                          )
                        }
                        className="text-blue-600 hover:text-blue-800 hover:underline font-bold flex items-center gap-1.5 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition"
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver imagen original (Alta Resolución)
                      </button>
                      <a
                        href={activeSheet.result.fullImageDataUrl || activeSheet.result.thumbnailDataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1 text-[11px]"
                        title="Abrir en pestaña nueva del navegador"
                      >
                        <ExternalLink className="w-3 h-3" /> Nueva pestaña
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center p-6 text-gray-400">
                <p className="text-sm">Selecciona una hoja a la izquierda para inspeccionar sus alternativas.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Inferior General */}
        <div className="p-4 px-6 bg-slate-100 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:inline">
              Al guardar, el sistema calificará las respuestas y calculará el puntaje SIMCE con Teoría de Respuesta al Ítem (TRI).
            </span>

            <button
              type="button"
              disabled={processedSheets.length === 0 || isSubmitting || isProcessing}
              onClick={handleConfirmAndSubmit}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando y Calculando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Guardar y Corregir {processedSheets.filter((s) => s.selectedRut).length} Hoja(s)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal Lightbox de Vista en Alta Resolución */}
        {viewingFullImage && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-3 sm:p-6 animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
              <div className="p-3 px-4 bg-slate-100 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-gray-800">
                    Vista en Alta Resolución &bull; Hoja #{activeSheet?.pageIndex}{" "}
                    {activeSheet?.studentName ? `(${activeSheet.studentName})` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={viewingFullImage}
                    target="_blank"
                    rel="noreferrer"
                    download={`hoja_omr_p${activeSheet?.pageIndex || 1}.jpg`}
                    className="text-xs font-semibold bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir / Descargar
                  </a>
                  <button
                    type="button"
                    onClick={() => setViewingFullImage(null)}
                    className="p-1 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-900/5 min-h-[400px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewingFullImage}
                  alt="Hoja OMR original en alta resolución"
                  className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-md border border-gray-300 bg-white"
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
