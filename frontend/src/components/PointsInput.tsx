"use client";

import { useEffect, useState } from "react";

interface PointsInputProps {
  value: number;
  onChange: (nextVal: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

export function normalizePointsValue(val: number, min = 0.1, max = 1000): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return min;
  const clamped = Math.min(max, Math.max(min, num));
  return Math.round(clamped * 100) / 100;
}

export default function PointsInput({
  value,
  onChange,
  min = 0.1,
  max = 1000,
  disabled = false,
  className = "",
  title = "Puntaje máximo de la pregunta",
  ariaLabel,
}: PointsInputProps) {
  const safeValue = normalizePointsValue(value, min, max);
  const [draft, setDraft] = useState(String(safeValue));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(safeValue));
    }
  }, [safeValue, focused]);

  const handleChange = (raw: string) => {
    const sanitized = raw.replace(/[^0-9.,]/g, "");
    setDraft(sanitized);
    if (!sanitized.trim()) return;
    const parsed = parseFloat(sanitized.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      onChange(Math.round(parsed * 100) / 100);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(String(safeValue));
      return;
    }
    const clamped = normalizePointsValue(parsed, min, max);
    setDraft(String(clamped));
    if (clamped !== safeValue) {
      onChange(clamped);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      className={className}
    />
  );
}
