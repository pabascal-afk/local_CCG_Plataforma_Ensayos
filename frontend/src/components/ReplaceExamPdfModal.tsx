"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  FileText,
  Upload,
  Eye,
  EyeOff,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import { useIsPruebas } from "@/lib/useIsPruebas";

export interface PdfExamInfo {
  id: number;
  title: string;
  subject?: string;
  level?: string;
  pdfPath?: string | null;
  hasPdfFile?: boolean;
  pdfFileSize?: number | null;
}

interface ReplaceExamPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: PdfExamInfo | null;
  canReplace?: boolean;
  initialPreview?: boolean;
  onPdfUpdated?: (updatedExam: PdfExamInfo) => void;
}

const MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ReplaceExamPdfModal({
  isOpen,
  onClose,
  exam,
  canReplace = true,
  initialPreview = false,
  onPdfUpdated,
}: ReplaceExamPdfModalProps) {
  const isPruebas = useIsPruebas();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>("");
  const [serverPreviewUrl, setServerPreviewUrl] = useState<string>("");
  const [activePreviewMode, setActivePreviewMode] = useState<"none" | "current" | "selected">("none");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [currentPdfInfo, setCurrentPdfInfo] = useState<{
    hasPdfFile?: boolean;
    pdfFileSize?: number | null;
    pdfPath?: string | null;
  }>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localUrlRef = useRef<string>("");
  const serverUrlRef = useRef<string>("");

  const revokeLocalUrl = useCallback(() => {
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = "";
    }
    setLocalPreviewUrl("");
  }, []);

  const revokeServerUrl = useCallback(() => {
    if (serverUrlRef.current) {
      URL.revokeObjectURL(serverUrlRef.current);
      serverUrlRef.current = "";
    }
    setServerPreviewUrl("");
  }, []);

  const fetchCurrentPdfPreview = useCallback(
    async (examId: number) => {
      setLoadingPreview(true);
      setPreviewError("");
      try {
        const token = getToken();
        const res = await fetch(`/api/exams/${examId}/pdf?t=${Date.now()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (!res.ok) {
          let errText = `No se pudo cargar el PDF (${res.status})`;
          try {
            const j = await res.json();
            if (j?.error) errText = j.error;
          } catch {}
          throw new Error(errText);
        }
        const rawBlob = await res.blob();
        const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
        const nextUrl = URL.createObjectURL(pdfBlob);
        if (serverUrlRef.current) {
          URL.revokeObjectURL(serverUrlRef.current);
        }
        serverUrlRef.current = nextUrl;
        setServerPreviewUrl(nextUrl);
        setActivePreviewMode("current");
      } catch (err: any) {
        setPreviewError(err?.message || "No se pudo cargar la vista previa del PDF");
        setActivePreviewMode("none");
      } finally {
        setLoadingPreview(false);
      }
    },
    []
  );

  // Reiniciar estado al abrir o cambiar de evaluación
  useEffect(() => {
    if (!isOpen || !exam) {
      revokeLocalUrl();
      revokeServerUrl();
      setSelectedFile(null);
      setActivePreviewMode("none");
      setPreviewError("");
      setErrorMsg("");
      setSuccessMsg("");
      setIsDragging(false);
      return;
    }

    setCurrentPdfInfo({
      hasPdfFile: exam.hasPdfFile,
      pdfFileSize: exam.pdfFileSize,
      pdfPath: exam.pdfPath,
    });
    setSelectedFile(null);
    revokeLocalUrl();
    revokeServerUrl();
    setPreviewError("");
    setErrorMsg("");
    setSuccessMsg("");
    setActivePreviewMode("none");

    if (initialPreview) {
      fetchCurrentPdfPreview(exam.id);
    }
  }, [isOpen, exam?.id, initialPreview, revokeLocalUrl, revokeServerUrl, fetchCurrentPdfPreview]);

  // Limpiar blob URLs al desmontar
  useEffect(() => {
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
      if (serverUrlRef.current) URL.revokeObjectURL(serverUrlRef.current);
    };
  }, []);

  // Cerrar con Escape si no está subiendo
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, uploading, onClose]);

  const validateAndSelectFile = (file: File | null) => {
    setErrorMsg("");
    setSuccessMsg("");
    if (!file) return;

    const lowerName = (file.name || "").toLowerCase();
    const isPdf =
      lowerName.endsWith(".pdf") ||
      file.type === "application/pdf" ||
      file.type === "application/x-pdf";

    if (!isPdf) {
      setErrorMsg("Formato inválido. Solo se permiten documentos en formato PDF (.pdf).");
      return;
    }
    if (file.size <= 0) {
      setErrorMsg("El archivo PDF seleccionado está vacío.");
      return;
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      setErrorMsg(`El archivo (${formatFileSize(file.size)}) supera el límite máximo de 30 MB.`);
      return;
    }

    revokeLocalUrl();
    const url = URL.createObjectURL(file);
    localUrlRef.current = url;
    setLocalPreviewUrl(url);
    setSelectedFile(file);
  };

  const handleClearSelection = () => {
    setSelectedFile(null);
    revokeLocalUrl();
    if (activePreviewMode === "selected") {
      setActivePreviewMode("none");
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleToggleCurrentPreview = async () => {
    if (!exam) return;
    if (activePreviewMode === "current") {
      setActivePreviewMode("none");
      return;
    }
    if (serverPreviewUrl) {
      setActivePreviewMode("current");
      return;
    }
    await fetchCurrentPdfPreview(exam.id);
  };

  const handleToggleSelectedPreview = () => {
    if (!localPreviewUrl) return;
    setActivePreviewMode((prev) => (prev === "selected" ? "none" : "selected"));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exam || !selectedFile || !canReplace) return;

    setUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const formData = new FormData();
      formData.append("pdf", selectedFile);

      const res = await apiFetch<{ message: string; exam: PdfExamInfo }>(`/admin/exams/${exam.id}/pdf`, {
        method: "PUT",
        body: formData,
      });

      const updatedInfo = res.exam || {
        ...exam,
        hasPdfFile: true,
        pdfFileSize: selectedFile.size,
      };

      setCurrentPdfInfo({
        hasPdfFile: updatedInfo.hasPdfFile ?? true,
        pdfFileSize: updatedInfo.pdfFileSize ?? selectedFile.size,
        pdfPath: updatedInfo.pdfPath,
      });

      // Invalidar preview anterior para que al abrirlo cargue el nuevo archivo
      revokeServerUrl();
      revokeLocalUrl();
      setSelectedFile(null);
      setActivePreviewMode("none");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setSuccessMsg(res.message || "Nuevo PDF asignado correctamente.");
      onPdfUpdated?.(updatedInfo);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err?.message || "No se pudo subir el nuevo archivo PDF.");
      }
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen || !exam) return null;

  const activePreviewUrl =
    activePreviewMode === "current"
      ? serverPreviewUrl
      : activePreviewMode === "selected"
      ? localPreviewUrl
      : "";

  const downloadFileName =
    activePreviewMode === "selected" && selectedFile
      ? selectedFile.name
      : `${(exam.title || `evaluacion-${exam.id}`).replace(/[^a-zA-Z0-9._\-\s]/g, "_")}.pdf`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
      onClick={() => {
        if (!uploading) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/15 rounded-xl shrink-0">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold tracking-tight truncate">
                {canReplace
                  ? `Asignar nuevo PDF — ${isPruebas ? "Prueba" : "Ensayo"}`
                  : `Documento PDF — ${isPruebas ? "Prueba" : "Ensayo"}`}
              </h2>
              <p className="text-xs text-blue-100 truncate">
                {exam.title}
                {exam.subject ? ` · ${exam.subject}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!uploading) onClose();
            }}
            disabled={uploading}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition disabled:opacity-40 cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Estado actual del PDF */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              currentPdfInfo.hasPdfFile === false
                ? "bg-amber-50 border-amber-200"
                : "bg-slate-50 border-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  currentPdfInfo.hasPdfFile === false
                    ? "bg-amber-100 text-amber-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                  <span>
                    {currentPdfInfo.hasPdfFile === false
                      ? "Sin archivo PDF en el servidor"
                      : "PDF actual asignado"}
                  </span>
                  {currentPdfInfo.pdfFileSize ? (
                    <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-[11px] font-bold">
                      {formatFileSize(currentPdfInfo.pdfFileSize)}
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {currentPdfInfo.hasPdfFile === false
                    ? "Sube un nuevo PDF para que docentes y estudiantes puedan visualizar esta evaluación."
                    : "La pauta de preguntas, puntajes y pistas de audio se mantendrán intactos."}
                </p>
              </div>
            </div>

            {currentPdfInfo.hasPdfFile !== false && (
              <button
                type="button"
                onClick={handleToggleCurrentPreview}
                disabled={loadingPreview}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
              >
                {loadingPreview ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cargando...</span>
                  </>
                ) : activePreviewMode === "current" ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Ocultar PDF actual</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver PDF actual</span>
                  </>
                )}
              </button>
            )}
          </div>

          {previewError && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}

          {/* Visor embebido de vista previa */}
          {activePreviewUrl && (
            <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  {activePreviewMode === "selected"
                    ? `Vista previa del nuevo archivo (${selectedFile?.name})`
                    : "Vista previa del PDF actual"}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={activePreviewUrl}
                    download={downloadFileName}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-lg transition"
                  >
                    <Download className="w-3 h-3" /> Descargar
                  </a>
                  <a
                    href={activePreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg transition"
                  >
                    <ExternalLink className="w-3 h-3" /> Abrir en pestaña
                  </a>
                  <button
                    type="button"
                    onClick={() => setActivePreviewMode("none")}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-200/70 transition cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
              <iframe
                src={activePreviewUrl}
                title="Vista previa del cuadernillo PDF"
                className="w-full h-[360px] rounded-lg border border-slate-300 bg-white"
              />
            </div>
          )}

          {/* Mensajes de éxito / error */}
          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button
                type="button"
                onClick={handleToggleCurrentPreview}
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                Ver nuevo PDF
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Formulario de carga de nuevo PDF */}
          {canReplace && (
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                  Seleccionar nuevo archivo PDF (máx. 30 MB)
                </label>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!uploading) setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (uploading) return;
                    const droppedFile = e.dataTransfer.files?.[0] || null;
                    validateAndSelectFile(droppedFile);
                  }}
                  onClick={() => {
                    if (!uploading) fileInputRef.current?.click();
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
                    isDragging
                      ? "border-blue-500 bg-blue-50"
                      : selectedFile
                      ? "border-emerald-400 bg-emerald-50/40"
                      : "border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/40"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="sr-only"
                    onChange={(e) => validateAndSelectFile(e.target.files?.[0] || null)}
                  />

                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                        <FileText className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-extrabold text-slate-900 break-all">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs font-semibold text-emerald-700">
                        Tamaño: {formatFileSize(selectedFile.size)} · Listo para asignar
                      </p>
                      <div
                        className="flex items-center justify-center gap-2 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={handleToggleSelectedPreview}
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>
                            {activePreviewMode === "selected"
                              ? "Ocultar vista previa"
                              : "Previsualizar seleccionado"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          disabled={uploading}
                          className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Quitar</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-800">
                        Arrastra el nuevo PDF aquí o{" "}
                        <span className="text-blue-600 underline">haz clic para seleccionarlo</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Solo archivos .pdf · Tamaño máximo 30 MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (!uploading) onClose();
                  }}
                  disabled={uploading}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  {successMsg ? "Listo / Cerrar" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || uploading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Subiendo y asignando PDF...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Asignar Nuevo PDF</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
