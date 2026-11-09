"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Headphones, Lock } from "lucide-react";

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
  mockExamId?: number;
  mockResetKey?: number;
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
  mockExamId,
  mockResetKey = 0,
}: StudentQuestionAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [clipCurrentTime, setClipCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playCount, setPlayCount] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasStartedThisPlayRef = useRef(false);
  const playCountRef = useRef(0);

  const startSec = clip.startSec || 0;
  const rawEnd = clip.endSec;
  const clipDuration = rawEnd !== null && rawEnd !== undefined && rawEnd > startSec ? rawEnd - startSec : 0;

  const lastAllowedTimeRef = useRef<number>(startSec);
  const programmaticTargetRef = useRef<number | null>(null);

  const isMock = Boolean(mockExamId);
  // En modo Mocktest se usa sessionStorage para no afectar ni persistir escuchas reales
  const storageKey = isMock
    ? `ccg_mock_audio_plays_${mockExamId}_${clip.id}`
    : `ccg_audio_plays_${assignmentId}_${clip.id}`;

  const savePlayCount = (nextCount: number) => {
    try {
      const store = isMock ? sessionStorage : localStorage;
      store.setItem(storageKey, String(nextCount));
    } catch {}
  };

  const seekProgrammatic = (audio: HTMLAudioElement, targetSec: number) => {
    lastAllowedTimeRef.current = targetSec;
    if (Math.abs(audio.currentTime - targetSec) <= 0.05) {
      programmaticTargetRef.current = null;
      return;
    }
    programmaticTargetRef.current = targetSec;
    audio.currentTime = targetSec;
  };

  useEffect(() => {
    let initialCount = 0;
    try {
      const store = isMock ? sessionStorage : localStorage;
      const stored = store.getItem(storageKey);
      initialCount = stored ? parseInt(stored, 10) || 0 : 0;
    } catch {}
    playCountRef.current = initialCount;
    setPlayCount(initialCount);

    // Reiniciar estado del reproductor al cambiar de audio o reiniciar Mocktest
    hasStartedThisPlayRef.current = false;
    setIsPlaying(false);
    setClipCurrentTime(0);
    lastAllowedTimeRef.current = startSec;
    programmaticTargetRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      setMediaDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
      if (audio.readyState >= 1 && Math.abs(audio.currentTime - startSec) > 0.05) {
        programmaticTargetRef.current = startSec;
        audio.currentTime = startSec;
      }
    } else {
      setMediaDuration(0);
    }
  }, [storageKey, isMock, mockResetKey, startSec]);

  const maxPlays = clip.maxPlays;
  const hasPlayLimit = maxPlays !== null && maxPlays !== undefined;
  const isLimitReached = hasPlayLimit && playCount >= maxPlays;
  const remainingPlays = hasPlayLimit ? Math.max(0, maxPlays - playCount) : null;

  const audioSrc = isMock
    ? `/api/admin/exams/${mockExamId}/audios/${clip.id}/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`
    : `/api/student/assignments/${assignmentId}/audios/${clip.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  const registerCompletedPlay = () => {
    if (!hasStartedThisPlayRef.current) return;
    hasStartedThisPlayRef.current = false;
    const nextCount = playCountRef.current + 1;
    playCountRef.current = nextCount;
    setPlayCount(nextCount);
    savePlayCount(nextCount);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const actual = audio.currentTime;

    // Si empezó antes del startSec, forzar a startSec
    if (actual < startSec - 0.05) {
      seekProgrammatic(audio, startSec);
      setClipCurrentTime(0);
      return;
    }

    // Guardia en audio limitado: evitar retroceso directo mediante DevTools o atajos del navegador
    if (hasPlayLimit && programmaticTargetRef.current === null && actual < lastAllowedTimeRef.current - 0.5) {
      const safeTime = Math.max(startSec, lastAllowedTimeRef.current);
      seekProgrammatic(audio, safeTime);
      setClipCurrentTime(Math.max(0, safeTime - startSec));
      return;
    }

    // Si sobrepasa el endSec del corte, pausar y registrar fin de reproducción
    if (rawEnd !== null && rawEnd !== undefined && actual >= rawEnd) {
      audio.pause();
      seekProgrammatic(audio, startSec);
      setIsPlaying(false);
      setClipCurrentTime(0);
      registerCompletedPlay();
      return;
    }

    if (programmaticTargetRef.current !== null && Math.abs(actual - programmaticTargetRef.current) <= 0.75) {
      programmaticTargetRef.current = null;
    }

    lastAllowedTimeRef.current = Math.max(startSec, actual);
    setClipCurrentTime(Math.max(0, actual - startSec));
  };

  const handleSeeking = () => {
    const audio = audioRef.current;
    if (!audio || !hasPlayLimit) return;

    const expected = programmaticTargetRef.current;
    if (expected !== null && Math.abs(audio.currentTime - expected) <= 0.75) {
      return;
    }

    const safeTime = Math.max(startSec, lastAllowedTimeRef.current);
    seekProgrammatic(audio, safeTime);
    setClipCurrentTime(Math.max(0, safeTime - startSec));
  };

  const handleSeeked = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const expected = programmaticTargetRef.current;
    if (expected !== null && Math.abs(audio.currentTime - expected) <= 0.75) {
      programmaticTargetRef.current = null;
      lastAllowedTimeRef.current = Math.max(startSec, audio.currentTime);
      setClipCurrentTime(Math.max(0, audio.currentTime - startSec));
      return;
    }

    if (hasPlayLimit) {
      const safeTime = Math.max(startSec, lastAllowedTimeRef.current);
      seekProgrammatic(audio, safeTime);
      setClipCurrentTime(Math.max(0, safeTime - startSec));
    } else {
      programmaticTargetRef.current = null;
      lastAllowedTimeRef.current = Math.max(startSec, audio.currentTime);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying || !audio.paused) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (isLimitReached) return;

      if (hasPlayLimit && audio.playbackRate !== 1) {
        audio.playbackRate = 1;
      }

      // Si estaba en el inicio, finalizado o fuera de rango, colocar en startSec
      const isAtEnd =
        audio.ended ||
        (rawEnd !== null && rawEnd !== undefined && audio.currentTime >= rawEnd - 0.05) ||
        (clipDuration === 0 && mediaDuration > startSec && audio.currentTime >= mediaDuration - 0.1);

      if (audio.currentTime < startSec || isAtEnd) {
        seekProgrammatic(audio, startSec);
        setClipCurrentTime(0);
      } else {
        lastAllowedTimeRef.current = Math.max(startSec, audio.currentTime);
      }

      hasStartedThisPlayRef.current = true;
      setIsPlaying(true);
      audio.play().catch(() => {
        setIsPlaying(false);
      });
    }
  };

  const seekRelative = (delta: number) => {
    if (hasPlayLimit || isLimitReached) return;
    const audio = audioRef.current;
    if (!audio) return;
    const target = audio.currentTime + delta;
    const minBound = startSec;
    const maxBound = rawEnd !== null && rawEnd !== undefined ? rawEnd : audio.duration || minBound + 60;
    const clamped = Math.max(minBound, Math.min(maxBound, target));
    seekProgrammatic(audio, clamped);
    setClipCurrentTime(Math.max(0, clamped - startSec));
  };

  const handleProgressBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (hasPlayLimit || isLimitReached) return;
    const audio = audioRef.current;
    if (!audio) return;
    const relSec = parseFloat(e.target.value) || 0;
    const target = startSec + relSec;
    seekProgrammatic(audio, target);
    setClipCurrentTime(relSec);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const totalEffectiveDuration =
    clipDuration > 0
      ? clipDuration
      : mediaDuration > startSec
      ? Math.max(1, mediaDuration - startSec)
      : 30;
  const progressPercent = Math.min(100, Math.max(0, (clipCurrentTime / totalEffectiveDuration) * 100));

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50/70 border-2 border-blue-200 rounded-xl p-3 shadow-xs space-y-2 mb-2 animate-in fade-in">
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onSeeked={handleSeeked}
        onPlay={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (isLimitReached) {
            audio.pause();
            setIsPlaying(false);
            return;
          }
          if (hasPlayLimit && audio.playbackRate !== 1) {
            audio.playbackRate = 1;
          }
          hasStartedThisPlayRef.current = true;
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        onRateChange={() => {
          const audio = audioRef.current;
          if (audio && hasPlayLimit && audio.playbackRate !== 1) {
            audio.playbackRate = 1;
          }
        }}
        onDurationChange={() => {
          const audio = audioRef.current;
          if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
            setMediaDuration(audio.duration);
          }
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setMediaDuration(audio.duration);
          }
          if (startSec > 0 && audio.currentTime < startSec - 0.05) {
            seekProgrammatic(audio, startSec);
          }
        }}
        onEnded={() => {
          const audio = audioRef.current;
          setIsPlaying(false);
          setClipCurrentTime(0);
          if (audio) {
            seekProgrammatic(audio, startSec);
          } else {
            lastAllowedTimeRef.current = startSec;
            programmaticTargetRef.current = null;
          }
          registerCompletedPlay();
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

        {hasPlayLimit ? (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1 ${
              isLimitReached
                ? "bg-rose-100 text-rose-800 border border-rose-300"
                : "bg-purple-100 text-purple-800 border border-purple-200"
            }`}
            title="Audio con escuchas limitadas: no permite adelantar ni retroceder"
          >
            <Lock className="w-2.5 h-2.5" />
            <span>{isLimitReached ? "Escuchas agotadas" : `${remainingPlays} de ${maxPlays} escuchas`}</span>
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
          title={isLimitReached ? "Ya utilizaste todas tus reproducciones" : isPlaying ? "Detener / Pausar" : "Reproducir"}
          aria-label={isLimitReached ? "Escuchas agotadas" : isPlaying ? "Detener o pausar audio" : "Reproducir audio"}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        {/* Botones -5s / +5s (solo en escucha libre sin límite) */}
        {!hasPlayLimit && (
          <>
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
          </>
        )}

        {/* Barra de progreso (solo lectura cuando hay límite de escuchas) */}
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          {hasPlayLimit ? (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalEffectiveDuration)}
              aria-valuenow={Math.round(clipCurrentTime)}
              aria-label="Progreso de reproducción (no modificable)"
              title="No es posible adelantar ni retroceder este audio"
              className="w-full h-2 bg-blue-200/80 rounded-full overflow-hidden pointer-events-none select-none"
            >
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-150"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          ) : (
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
          )}
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

      {hasPlayLimit && !isLimitReached && (
        <p className="text-[10px] text-purple-800/85 flex items-center gap-1 font-medium">
          <Lock className="w-2.5 h-2.5 shrink-0" />
          <span>Puedes pausar y reanudar libremente, sin adelantar ni retroceder.</span>
        </p>
      )}

      {isLimitReached && (
        <p className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-1 text-center font-semibold">
          Has completado las {maxPlays} reproducciones permitidas para este audio.
        </p>
      )}
    </div>
  );
}
