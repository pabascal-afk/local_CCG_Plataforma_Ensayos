"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, AlertCircle, Headphones } from "lucide-react";

export interface StudentAudioClip {
  id: number;
  title: string;
  startSec: number | null;
  endSec: number | null;
  questionNumbers: number[];
  maxPlays: number | null;
}

interface StudentQuestionAudioPlayerProps {
  assignmentId: number;
  clip: StudentAudioClip;
  token?: string;
}

function fmtSec(sec: number): string {
  if (isNaN(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StudentQuestionAudioPlayer({
  assignmentId,
  clip,
  token,
}: StudentQuestionAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [clipCurrentTime, setClipCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playCount, setPlayCount] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasStartedThisPlayRef = useRef(false);

  const startSec = clip.startSec || 0;
  const rawEnd = clip.endSec;
  const clipDuration = rawEnd !== null && rawEnd !== undefined && rawEnd > startSec ? rawEnd - startSec : 0;

  // Clave en localStorage para recordar escuchas del alumno en esta estación
  const storageKey = `ccg_audio_plays_${assignmentId}_${clip.id}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setPlayCount(parseInt(stored, 10) || 0);
      }
    } catch {}
  }, [storageKey]);

  const maxPlays = clip.maxPlays;
  const isLimitReached = maxPlays !== null && maxPlays !== undefined && playCount >= maxPlays;
  const remainingPlays = maxPlays !== null && maxPlays !== undefined ? Math.max(0, maxPlays - playCount) : null;

  const audioSrc = `/api/student/assignments/${assignmentId}/audios/${clip.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const actual = audio.currentTime;

    // Si empezó antes del startSec, forzar a startSec
    if (actual < startSec) {
      audio.currentTime = startSec;
      return;
    }

    // Si sobrepasa el endSec del corte, pausar y registrar fin de reproducción
    if (rawEnd !== null && rawEnd !== undefined && actual >= rawEnd) {
      audio.pause();
      audio.currentTime = startSec;
      setIsPlaying(false);
      setClipCurrentTime(0);

      // Incrementar contador de reproducciones
      if (hasStartedThisPlayRef.current) {
        const nextCount = playCount + 1;
        setPlayCount(nextCount);
        try {
          localStorage.setItem(storageKey, String(nextCount));
        } catch {}
        hasStartedThisPlayRef.current = false;
      }
      return;
    }

    setClipCurrentTime(Math.max(0, actual - startSec));
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (isLimitReached) return;

      // Si estaba en el inicio o fuera de rango, colocar en startSec
      if (audio.currentTime < startSec || (rawEnd !== null && rawEnd !== undefined && audio.currentTime >= rawEnd)) {
        audio.currentTime = startSec;
      }

      hasStartedThisPlayRef.current = true;
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const seekRelative = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = audio.currentTime + delta;
    const minBound = startSec;
    const maxBound = rawEnd !== null && rawEnd !== undefined ? rawEnd : audio.duration || minBound + 60;
    audio.currentTime = Math.max(minBound, Math.min(maxBound, target));
  };

  const handleProgressBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const relSec = parseFloat(e.target.value) || 0;
    audio.currentTime = startSec + relSec;
    setClipCurrentTime(relSec);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const totalEffectiveDuration = clipDuration > 0 ? clipDuration : (audioRef.current?.duration ? Math.max(1, audioRef.current.duration - startSec) : 30);
  const progressPercent = Math.min(100, Math.max(0, (clipCurrentTime / totalEffectiveDuration) * 100));

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50/70 border-2 border-blue-200 rounded-xl p-3 shadow-xs space-y-2 mb-2 animate-in fade-in">
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (audioRef.current && startSec > 0) {
            audioRef.current.currentTime = startSec;
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setClipCurrentTime(0);
          if (hasStartedThisPlayRef.current) {
            const nextCount = playCount + 1;
            setPlayCount(nextCount);
            try {
              localStorage.setItem(storageKey, String(nextCount));
            } catch {}
            hasStartedThisPlayRef.current = false;
          }
        }}
      />

      {/* Título de la pista y estado de reproducciones */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Headphones className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs text-blue-950 truncate">
            {clip.title}
          </span>
        </div>

        {maxPlays !== null && maxPlays !== undefined ? (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
              isLimitReached
                ? "bg-rose-100 text-rose-800 border border-rose-300"
                : "bg-purple-100 text-purple-800 border border-purple-200"
            }`}
          >
            {isLimitReached ? "Escuchas agotadas" : `${remainingPlays} de ${maxPlays} escuchas`}
          </span>
        ) : (
          <span className="text-[10px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full shrink-0">
            Escucha Libre
          </span>
        )}
      </div>

      {/* Controles de reproducción interactivos */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          disabled={isLimitReached}
          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-sm transition shrink-0 ${
            isLimitReached
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : isPlaying
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
          title={isLimitReached ? "Ya utilizaste todas tus reproducciones" : isPlaying ? "Pausar" : "Reproducir"}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        {/* Botones -5s / +5s */}
        <button
          type="button"
          onClick={() => seekRelative(-5)}
          disabled={isLimitReached}
          className="text-[10px] font-bold bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 px-1.5 py-1 rounded transition shrink-0"
          title="Retroceder 5 segundos"
        >
          -5s
        </button>
        <button
          type="button"
          onClick={() => seekRelative(5)}
          disabled={isLimitReached}
          className="text-[10px] font-bold bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 px-1.5 py-1 rounded transition shrink-0"
          title="Avanzar 5 segundos"
        >
          +5s
        </button>

        {/* Barra de progreso */}
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <input
            type="range"
            min={0}
            max={totalEffectiveDuration}
            step={0.1}
            value={clipCurrentTime}
            onChange={handleProgressBarChange}
            disabled={isLimitReached}
            className="w-full h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        {/* Tiempo y Mute */}
        <span className="text-[10px] font-mono font-bold text-gray-600 shrink-0">
          {fmtSec(clipCurrentTime)} / {fmtSec(totalEffectiveDuration)}
        </span>

        <button
          type="button"
          onClick={toggleMute}
          className="text-gray-500 hover:text-gray-800 p-1 shrink-0"
          title={isMuted ? "Activar sonido" : "Silenciar"}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isLimitReached && (
        <p className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-1 text-center font-semibold">
          Has completado las {maxPlays} reproducciones permitidas para este audio.
        </p>
      )}
    </div>
  );
}
