export type ExamTypeOption = {
  value: string;
  label: string;
  badgeLabel: string;
  badgeClassName: string;
  description: string;
};

export const EXAM_TYPE_VALUES = [
  "ENSAYO",
  "ENSAYO_LARGO",
  "QUIZ",
  "DIAGNOSTICO",
  "REMEDIAL",
  "PRUEBA_UNIDAD",
  "CONOCIMIENTOS_GENERALES",
] as const;

export function getExamTypeMeta(type: string | undefined | null, isPruebas: boolean): ExamTypeOption {
  const t = (type || "ENSAYO").trim().toUpperCase();

  switch (t) {
    case "QUIZ":
      return {
        value: "QUIZ",
        label: isPruebas ? "Quiz / Control Rápido" : "Quiz (Corto)",
        badgeLabel: "QUIZ",
        badgeClassName: "bg-emerald-100 text-emerald-800 border-emerald-200",
        description: "Evaluación breve o control rápido; también disponible como opción remedial.",
      };
    case "REMEDIAL":
      return {
        value: "REMEDIAL",
        label: isPruebas ? "Evaluación Remedial" : "Remedial",
        badgeLabel: "REMEDIAL",
        badgeClassName: "bg-amber-100 text-amber-800 border-amber-200",
        description: "Instrumento de reforzamiento asignable a estudiantes con alerta remedial.",
      };
    case "DIAGNOSTICO":
      return {
        value: "DIAGNOSTICO",
        label: isPruebas ? "Evaluación Diagnóstica" : "Diagnóstico",
        badgeLabel: "DIAGNÓSTICO",
        badgeClassName: "bg-purple-100 text-purple-800 border-purple-200",
        description: "Evaluación inicial para diagnosticar aprendizajes previos.",
      };
    case "ENSAYO_LARGO":
      return {
        value: "ENSAYO_LARGO",
        label: isPruebas ? "Evaluación Extendida / Semestral" : "Ensayo Largo",
        badgeLabel: "EXTENDIDO",
        badgeClassName: "bg-rose-100 text-rose-800 border-rose-200",
        description: "Evaluación extensa de cobertura amplia o cierre de período.",
      };
    case "PRUEBA_UNIDAD":
      return {
        value: "PRUEBA_UNIDAD",
        label: "Prueba de Unidad",
        badgeLabel: "UNIDAD",
        badgeClassName: "bg-cyan-100 text-cyan-800 border-cyan-200",
        description: "Evaluación enfocada en una unidad curricular específica.",
      };
    case "CONOCIMIENTOS_GENERALES":
      return {
        value: "CONOCIMIENTOS_GENERALES",
        label: "Conocimientos Generales",
        badgeLabel: "CONOC. GRALES.",
        badgeClassName: "bg-indigo-100 text-indigo-800 border-indigo-200",
        description: "Evaluación transversal de conocimientos generales de la asignatura.",
      };
    case "ENSAYO":
    default:
      return {
        value: t || "ENSAYO",
        label: isPruebas ? "Evaluación Sumativa Regular" : "Ensayo Normal (SIMCE)",
        badgeLabel: isPruebas ? "PRUEBA" : "ENSAYO",
        badgeClassName: "bg-blue-100 text-blue-800 border-blue-200",
        description: isPruebas
          ? "Evaluación sumativa regular estándar."
          : "Ensayo SIMCE regular; participa en el monitoreo y alertas remediales.",
      };
  }
}

export function getExamTypeOptions(isPruebas: boolean): ExamTypeOption[] {
  const orderedKeys = isPruebas
    ? [
        "PRUEBA_UNIDAD",
        "QUIZ",
        "CONOCIMIENTOS_GENERALES",
        "DIAGNOSTICO",
        "ENSAYO",
        "ENSAYO_LARGO",
        "REMEDIAL",
      ]
    : [
        "ENSAYO",
        "ENSAYO_LARGO",
        "QUIZ",
        "DIAGNOSTICO",
        "REMEDIAL",
        "PRUEBA_UNIDAD",
        "CONOCIMIENTOS_GENERALES",
      ];

  return orderedKeys.map((key) => getExamTypeMeta(key, isPruebas));
}
