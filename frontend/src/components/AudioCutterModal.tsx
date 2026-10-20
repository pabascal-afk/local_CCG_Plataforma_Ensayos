"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Scissors,
  Trash2,
  Volume2,
  Check,
  AlertCircle,
  Clock,
  ListMusic,
  Loader2,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";

export interface AudioClipItem {
  id: number;
  examId: number;
  title: string;
  audioPath: string;
  fileSize: number;
  startSec: number | null;
  endSec: number | null;
  questionNumbers: number[];
  maxPlays: number | null;
  orderIndex: number;
  createdAt: string;
}

interface AudioCutterModalProps {
  isOpen: boolean;
  onClose: () => void;
  examId?: number;
  assignmentId?: number;
  examTitle?: string;
  questionCount: number;
  onClipsUpdated?: () => void;
  initialQuestionNumber?: number | null;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00.0";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

export default function AudioCutterModal({
  isOpen,
  onClose,
  examId,
  assignmentId,
  examTitle,
  questionCount,
  onClipsUpdated,
  initialQuestionNumber,
}: AudioCutterModalProps) {
  const [existingClips, setExistingClips] = useState<AudioClipItem[]>([]);
  const [loadingClips, setLoadingClips] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Estado del archivo en edición
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [serverAudioPath, setServerAudioPath] = useState<string>("");
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isDecoding, setIsDecoding] = useState<boolean>(false);

  // Puntos de corte
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(0);
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [clipTitle, setClipTitle] = useState<string>("");
  const [maxPlays, setMaxPlays] = useState<number | "">("");

  // Reproductor
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoopingPreview, setIsLoopingPreview] = useState(false);
  const [savingClip, setSavingClip] = useState(false);

  // Audio HTML y Canvas de Onda
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<"start" | "end" | "seek" | null>(null);

  const apiBasePath = assignmentId
    ? `/teacher/assignments/${assignmentId}/audios`
    : examId
    ? `/admin/exams/${examId}/audios`
    : "";

  // 1. Cargar fragmentos existentes al abrir
  const loadClips = useCallback(async () => {
    if (!apiBasePath) return;
    setLoadingClips(true);
    setErrorMsg("");
    try {
      const data = await apiFetch<AudioClipItem[]>(apiBasePath);
      setExistingClips(data || []);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al cargar audios de la evaluación");
    } finally {
      setLoadingClips(false);
    }
  }, [apiBasePath]);

  useEffect(() => {
    if (isOpen) {
      loadClips();
      if (initialQuestionNumber) {
        setSelectedQuestions([initialQuestionNumber]);
        setClipTitle(`Audio Pregunta ${initialQuestionNumber}`);
      } else {
        setSelectedQuestions([1]);
        setClipTitle("Audio Pregunta 1");
      }
    } else {
      // Limpiar al cerrar
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioFile(null);
      setAudioUrl("");
      setServerAudioPath("");
      setAudioBuffer(null);
      setDuration(0);
      setIsPlaying(false);
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [isOpen, loadClips, initialQuestionNumber]);

  // 2. Procesar nuevo archivo de audio subido por el usuario
  const handleFileSelected = async (file: File) => {
    setErrorMsg("");
    setSuccessMsg("");
    setServerAudioPath("");

    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg("El archivo excede el tamaño máximo permitido de 15 MB.");
      return;
    }
    const ext = file.name.toLowerCase();
    if (ext.endsWith(".wav")) {
      setErrorMsg(
        "Los archivos .wav no están permitidos para evitar saturar la red local. Por favor sube el audio comprimido en formato MP3 o M4A."
      );
      return;
    }

    setIsDecoding(true);
    try {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setAudioFile(file);

      // Decodificar con Web Audio API para dibujar la onda
      const arrayBuffer = await file.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
      const totalDur = decoded.duration;
      setDuration(totalDur);
      setStartSec(0);
      setEndSec(totalDur);
      if (initialQuestionNumber) {
        setSelectedQuestions([initialQuestionNumber]);
        setClipTitle(`Audio Pregunta ${initialQuestionNumber}`);
      } else {
        setSelectedQuestions([1]);
        setClipTitle(`Audio Pregunta 1`);
      }
    } catch (err: any) {
      setErrorMsg("Error al procesar el archivo de audio: " + (err.message || "Formato no legible"));
    } finally {
      setIsDecoding(false);
    }
  };

  // 3. Dibujar la onda en el Canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Fondo
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    const rawData = audioBuffer.getChannelData(0);
    const step = Math.ceil(rawData.length / width);
    const amp = height / 2;

    // Zona recortada (resaltar área seleccionada [startSec, endSec])
    const startX = (startSec / duration) * width;
    const endX = (endSec / duration) * width;

    // Sombra fuera de la selección
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Resaltado de la selección activa
    ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
    ctx.fillRect(startX, 0, endX - startX, height);

    // Dibujar barras de onda
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = rawData[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const inSelection = i >= startX && i <= endX;
      ctx.fillStyle = inSelection ? "#60a5fa" : "#475569";
      const barHeight = Math.max(2, (max - min) * amp * 0.9);
      ctx.fillRect(i, (height - barHeight) / 2, 1, barHeight);
    }

    // Línea de cabezal de reproducción (currentTime)
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(playheadX - 1, 0, 2, height);
    }

    // Marcador Inicio (Verde)
    ctx.fillStyle = "#10b981";
    ctx.fillRect(startX - 2, 0, 4, height);
    ctx.font = "bold 10px monospace";
    ctx.fillText("INICIO", Math.max(4, startX - 20), 14);

    // Marcador Fin (Rojo)
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(endX - 2, 0, 4, height);
    ctx.fillText("FIN", Math.min(width - 25, endX - 4), 14);
  }, [audioBuffer, currentTime, duration, endSec, startSec]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Actualizar tiempo de reproducción
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    setCurrentTime(cur);

    // Si estamos en modo prueba de corte y llegamos a endSec, pausar
    if (isLoopingPreview && cur >= endSec) {
      audioRef.current.pause();
      audioRef.current.currentTime = startSec;
      setIsPlaying(false);
      setIsLoopingPreview(false);
    }
  };

  // 4. Controles de Reproducción
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setIsLoopingPreview(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const playCutPreview = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = startSec;
    setIsLoopingPreview(true);
    audioRef.current.play();
    setIsPlaying(true);
  };

  const setStartToCurrent = () => {
    const nextStart = Math.min(currentTime, endSec - 0.5);
    setStartSec(Math.max(0, nextStart));
  };

  const setEndToCurrent = () => {
    const nextEnd = Math.max(currentTime, startSec + 0.5);
    setEndSec(Math.min(duration, nextEnd));
  };

  // Interacción clic / arrastre en el canvas de onda
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickRatio = x / rect.width;
    const clickSec = clickRatio * duration;

    const startX = (startSec / duration) * rect.width;
    const endX = (endSec / duration) * rect.width;

    if (Math.abs(x - startX) < 12) {
      isDraggingRef.current = "start";
    } else if (Math.abs(x - endX) < 12) {
      isDraggingRef.current = "end";
    } else {
      isDraggingRef.current = "seek";
      if (audioRef.current) {
        audioRef.current.currentTime = clickSec;
        setCurrentTime(clickSec);
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const sec = (x / rect.width) * duration;

    if (isDraggingRef.current === "start") {
      setStartSec(Math.max(0, Math.min(sec, endSec - 0.2)));
    } else if (isDraggingRef.current === "end") {
      setEndSec(Math.min(duration, Math.max(sec, startSec + 0.2)));
    } else if (isDraggingRef.current === "seek") {
      if (audioRef.current) {
        audioRef.current.currentTime = sec;
        setCurrentTime(sec);
      }
    }
  };

  const handleCanvasMouseUp = () => {
    isDraggingRef.current = null;
  };

  // 5. Manejo de preguntas seleccionadas
  const toggleQuestionSelection = (qNum: number) => {
    setSelectedQuestions((prev) => {
      if (prev.includes(qNum)) {
        return prev.filter((n) => n !== qNum);
      } else {
        return [...prev, qNum].sort((a, b) => a - b);
      }
    });
  };

  // Auto-ajustar título si el usuario no ha puesto uno personalizado
  useEffect(() => {
    if (selectedQuestions.length === 1) {
      setClipTitle(`Audio Pregunta ${selectedQuestions[0]}`);
    } else if (selectedQuestions.length > 1) {
      setClipTitle(`Audio Preguntas ${selectedQuestions.join(", ")}`);
    }
  }, [selectedQuestions]);

  // 6. Guardar fragmento en el servidor
  const handleSaveClip = async () => {
    if (!apiBasePath) return;
    if (!audioFile && !audioUrl) {
      setErrorMsg("Primero debes subir un archivo de audio para cortarlo.");
      return;
    }
    if (selectedQuestions.length === 0) {
      setErrorMsg("Selecciona al menos una pregunta para asociarle este fragmento de audio.");
      return;
    }

    setSavingClip(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (!serverAudioPath && !audioFile) {
        setErrorMsg("Debes seleccionar o cargar un archivo de audio antes de guardar el fragmento.");
        setSavingClip(false);
        return;
      }

      const formData = new FormData();
      if (serverAudioPath) {
        formData.append("existingAudioPath", serverAudioPath);
      } else if (audioFile) {
        formData.append("audio", audioFile);
      }

      const clipPayload = {
        title: clipTitle.trim() || `Audio Preguntas ${selectedQuestions.join(", ")}`,
        startSec: Number(startSec.toFixed(2)),
        endSec: Number(endSec.toFixed(2)),
        questionNumbers: selectedQuestions,
        maxPlays: maxPlays ? parseInt(String(maxPlays), 10) : null,
      };

      formData.append("clips", JSON.stringify([clipPayload]));

      const token = getToken();
      const res = await fetch(`/api${apiBasePath}`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const resData = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(resData?.error || `Error ${res.status}: no se pudo guardar el fragmento`);
      }

      if (resData?.clips?.[0]?.audioPath) {
        setServerAudioPath(resData.clips[0].audioPath);
      }

      setSuccessMsg(`¡Fragmento guardado exitosamente para la(s) pregunta(s) ${selectedQuestions.join(", ")}!`);
      await loadClips();
      if (onClipsUpdated) onClipsUpdated();

      // Preparar selección para el siguiente corte (avanzar a la siguiente pregunta)
      const maxQ = Math.max(...selectedQuestions);
      if (maxQ < questionCount) {
        setSelectedQuestions([maxQ + 1]);
        setStartSec(Math.min(duration, endSec));
        setEndSec(Math.min(duration, endSec + 30));
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al guardar el fragmento de audio");
    } finally {
      setSavingClip(false);
    }
  };

  // 7. Eliminar fragmento
  const handleDeleteClip = async (clipId: number) => {
    if (!confirm("¿Seguro que deseas eliminar este fragmento de audio?")) return;
    setErrorMsg("");
    try {
      await apiFetch(`${apiBasePath}/${clipId}`, { method: "DELETE" });
      await loadClips();
      if (onClipsUpdated) onClipsUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al eliminar el fragmento");
    }
  };

  if (!isOpen) return null;

  // Mapa de qué preguntas ya tienen audio
  const assignedQuestionsSet = new Set<number>();
  existingClips.forEach((c) => {
    c.questionNumbers?.forEach((n) => assignedQuestionsSet.add(n));
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Encabezado */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white p-4 px-6 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <Scissors className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Gestor y Cortador de Audios por Pregunta</h2>
              <p className="text-xs text-blue-200">
                {examTitle ? `${examTitle} • ` : ""}
                Asigna audios completos o recorta fragmentos exactos para cada pregunta
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

        {/* Notificaciones */}
        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-200 p-3 px-6 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 p-3 px-6 text-xs text-emerald-800 font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Contenido Principal con Scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Zona 1: Subida de Archivo Maestro / Audio */}
          <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase text-gray-700 tracking-wider flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>1. Subir Archivo de Audio Maestro</span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Sube el audio de la prueba (.mp3, .m4a, .ogg — máx. 15 MB). Puedes cortarlo en múltiples preguntas.
                </p>
              </div>

              {audioFile && (
                <span className="text-[11px] bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-full font-mono">
                  {(audioFile.size / (1024 * 1024)).toFixed(2)} MB • {formatTime(duration)}
                </span>
              )}
            </div>

            <input
              type="file"
              accept=".mp3,.m4a,.aac,.ogg,.webm,audio/*"
              id="audio-file-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelected(e.target.files[0]);
                }
              }}
            />

            {!audioUrl ? (
              <label
                htmlFor="audio-file-input"
                className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/50 transition group"
              >
                <Upload className="w-8 h-8 text-gray-400 group-hover:text-blue-600 mb-2 transition" />
                <span className="text-xs font-bold text-gray-700 group-hover:text-blue-700">
                  Haz clic para seleccionar o arrastra un archivo de audio (.mp3 o .m4a)
                </span>
                <span className="text-[11px] text-gray-400 mt-1">
                  Formatos recomendados: MP3 estéreo 128 kbps o M4A voz (consumo mínimo en red local)
                </span>
              </label>
            ) : (
              <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-gray-800 truncate">{audioFile?.name || "Audio cargado"}</p>
                    <p className="text-[11px] text-gray-500 font-mono">
                      Duración total: {formatTime(duration)} • {duration.toFixed(1)} segundos
                    </p>
                  </div>
                </div>

                <label
                  htmlFor="audio-file-input"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-bold cursor-pointer shrink-0 ml-3"
                >
                  Cambiar archivo
                </label>
              </div>
            )}
          </div>

          {/* Zona 2: Cortador Interactivo de Onda (Waveform) */}
          {audioUrl && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase text-gray-700 tracking-wider flex items-center gap-1.5">
                    <Scissors className="w-4 h-4 text-indigo-600" />
                    <span>2. Cortar Fragmento con Onda Visual</span>
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Arrastra los límites verde [INICIO] y rojo [FIN], o marca con los botones mientras escuchas.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={playCutPreview}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition"
                    title="Reproducir estrictamente el fragmento seleccionado"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Probar Corte</span>
                  </button>
                </div>
              </div>

              {/* Elemento de Audio Oculto */}
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="auto"
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
                  setIsPlaying(false);
                  setIsLoopingPreview(false);
                }}
              />

              {/* Canvas de Onda de Sonido */}
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 select-none">
                {isDecoding && (
                  <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center text-xs text-blue-300 font-bold gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generando onda de audio...</span>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={110}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  className="w-full h-28 cursor-crosshair block"
                />
              </div>

              {/* Controles de Reproducción y Marcas de Tiempo */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-gray-200">
                {/* Botón Play / Pausa general */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow transition"
                    title={isPlaying ? "Pausar" : "Reproducir"}
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>
                  <span className="font-mono text-xs font-bold text-gray-700">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Marcadores de Inicio y Fin rápidos */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={setStartToCurrent}
                    className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1.5 rounded-lg transition"
                    title="Establecer el punto de inicio en el segundo actual"
                  >
                    ⏱ Marcar Inicio aquí ({formatTime(currentTime)})
                  </button>
                  <button
                    type="button"
                    onClick={setEndToCurrent}
                    className="text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 px-2.5 py-1.5 rounded-lg transition"
                    title="Establecer el punto de fin en el segundo actual"
                  >
                    ⏱ Marcar Fin aquí ({formatTime(currentTime)})
                  </button>
                </div>

                {/* Inputs de precisión manual */}
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 font-bold">Desde:</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={duration}
                      value={startSec}
                      onChange={(e) => setStartSec(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-16 p-1 border rounded text-center font-mono font-bold text-xs"
                    />
                    <span className="text-gray-400">s</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 font-bold">Hasta:</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={duration}
                      value={endSec}
                      onChange={(e) => setEndSec(Math.min(duration, parseFloat(e.target.value) || duration))}
                      className="w-16 p-1 border rounded text-center font-mono font-bold text-xs"
                    />
                    <span className="text-gray-400">s</span>
                  </div>

                  <span className="font-bold text-blue-700 font-mono ml-1">
                    ({(endSec - startSec).toFixed(1)}s de corte)
                  </span>
                </div>
              </div>

              {/* Zona 3: Asignar Preguntas y Límite de Reproducción para este corte */}
              <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex-1 min-w-[220px]">
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Título o Etiqueta del Fragmento:
                    </label>
                    <input
                      type="text"
                      value={clipTitle}
                      onChange={(e) => setClipTitle(e.target.value)}
                      placeholder="Ej: Listening Part 1 o Diálogo 1"
                      className="w-full text-xs border border-gray-300 rounded-lg p-2 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="w-48">
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Límite de Reproducciones:
                    </label>
                    <select
                      value={maxPlays}
                      onChange={(e) => setMaxPlays(e.target.value ? Number(e.target.value) : "")}
                      className="w-full text-xs border border-gray-300 rounded-lg p-2 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Ilimitado (Libre)</option>
                      <option value="1">Máximo 1 reproducción</option>
                      <option value="2">Máximo 2 reproducciones</option>
                      <option value="3">Máximo 3 reproducciones</option>
                    </select>
                  </div>
                </div>

                {/* Selector de Preguntas */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-gray-700">
                      Preguntas asociadas a este fragmento:
                    </label>
                    <span className="text-[11px] text-gray-500">
                      {selectedQuestions.length > 0
                        ? `Asignado a: Pregunta(s) ${selectedQuestions.join(", ")}`
                        : "Ninguna pregunta seleccionada"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200">
                    {Array.from({ length: questionCount || 30 }, (_, i) => i + 1).map((qNum) => {
                      const isSelected = selectedQuestions.includes(qNum);
                      const hasExisting = assignedQuestionsSet.has(qNum);
                      return (
                        <button
                          key={qNum}
                          type="button"
                          onClick={() => toggleQuestionSelection(qNum)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold font-mono transition flex items-center justify-center ${
                            isSelected
                              ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-300"
                              : hasExisting
                              ? "bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                              : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                          }`}
                          title={`Pregunta ${qNum} ${hasExisting ? "(Ya tiene audio asociado)" : ""}`}
                        >
                          {qNum}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Botón de Guardado del Fragmento */}
                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveClip}
                    disabled={savingClip}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow flex items-center gap-2 transition cursor-pointer"
                  >
                    {savingClip ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Guardando Fragmento...</span>
                      </>
                    ) : (
                      <>
                        <Scissors className="w-4 h-4" />
                        <span>✂️ Guardar Fragmento para Pregunta(s) {selectedQuestions.join(", ")}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Zona 4: Lista de Fragmentos ya Creados en la Evaluación */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-gray-700 tracking-wider flex items-center gap-1.5">
                <ListMusic className="w-4 h-4 text-purple-600" />
                <span>Fragmentos y Pistas Guardadas ({existingClips.length})</span>
              </h3>
              {loadingClips && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>

            {existingClips.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-xs text-gray-500">
                Esta evaluación aún no tiene audios configurados. Sube un archivo arriba para comenzar.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {existingClips.map((clip) => {
                  const qLabel =
                    clip.questionNumbers && clip.questionNumbers.length > 0
                      ? `Pregunta(s) ${clip.questionNumbers.join(", ")}`
                      : "Audio general";
                  const durLabel =
                    clip.startSec !== null && clip.endSec !== null
                      ? `${formatTime(clip.startSec)} a ${formatTime(clip.endSec)} (${(clip.endSec - clip.startSec).toFixed(1)}s)`
                      : "Pista completa";

                  return (
                    <div
                      key={clip.id}
                      className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs flex items-center justify-between gap-3 hover:border-gray-300 transition"
                    >
                      <div className="overflow-hidden space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-gray-900 truncate">{clip.title}</span>
                          <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {qLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2">
                          <span className="font-mono">{durLabel}</span>
                          <span>•</span>
                          <span className="text-purple-700 font-semibold">
                            {clip.maxPlays ? `Máx. ${clip.maxPlays} escuchas` : "Ilimitado"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteClip(clip.id)}
                          className="text-gray-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition"
                          title="Eliminar este fragmento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 bg-slate-100 border-t border-gray-200 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-500">
            Los cortes no duplican espacio en disco (0 bytes extra). Los estudiantes solo escucharán el fragmento asignado.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow"
          >
            Listo / Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
