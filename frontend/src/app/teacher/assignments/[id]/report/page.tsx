"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import RequireRole from "@/components/RequireRole";
import { 
  Printer, 
  ArrowLeft, 
  Award, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle, 
  Users, 
  BookOpen, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  HelpCircle,
  Clock,
  Layers,
  BarChart3
} from "lucide-react";
import { useIsPruebas } from "@/lib/useIsPruebas";

type ReportData = {
  institution: {
    name: string;
    department: string;
    systemName: string;
  };
  assignment: {
    id: number;
    opensAt: string;
    closesAt: string;
    released: boolean;
  };
  exam: {
    id: number;
    title: string;
    subject: string;
    level: string;
    examType: string;
    gradingMode: string;
    passThreshold: number;
    passThresholdPercent: number;
    totalQuestions: number;
    maxTotalPoints: number;
    hasWeightedPoints: boolean;
    minGrade?: number;
    isBasicLevel?: boolean;
  };
  course: {
    id: number;
    level: string;
    letter: string;
    year: number;
    fullName: string;
  };
  teacher: {
    name: string;
    rut: string;
  };
  summary: {
    totalStudents: number;
    excludedCount?: number;
    validEnrolled?: number;
    submittedCount: number;
    pendingCount: number;
    participationPercent: number;
    averageGrade: number;
    averagePercent: number;
    averageSimceScore: number | null;
    approvedCount: number;
    failedCount: number;
    approvalPercent: number;
    levelCounts: {
      ADECUADO: number;
      ELEMENTAL: number;
      INSUFICIENTE: number;
    };
    gradeRanges: {
      "1.0-3.9"?: number;
      "2.0-3.9"?: number;
      "4.0-4.9": number;
      "5.0-5.9": number;
      "6.0-7.0": number;
    };
    minGrade?: number;
    isBasicLevel?: boolean;
  };
  excludedStudents?: Array<{
    rut: string;
    name: string;
    reason: string;
    details: string | null;
    excludedAt: string;
  }>;
  exclusionsCount?: number;
  skills: Array<{
    name: string;
    correct: number;
    total: number;
    questionCount: number;
    percent: number;
  }>;
  axes: Array<{
    name: string;
    correct: number;
    total: number;
    questionCount: number;
    percent: number;
  }>;
  criticalQuestions: Array<{
    id: number;
    questionNumber: number;
    questionType: string;
    maxPoints: number;
    skill: string;
    axis: string;
    correctAnswer: string;
    correctCount: number;
    omittedCount: number;
    percent: number;
    omittedPercent: number;
    isCritical: boolean;
  }>;
  allQuestions: Array<{
    id: number;
    questionNumber: number;
    questionType: string;
    maxPoints: number;
    skill: string;
    axis: string;
    correctAnswer: string;
    correctCount: number;
    omittedCount: number;
    percent: number;
    omittedPercent: number;
  }>;
  students: Array<{
    index: number;
    rut: string;
    name: string;
    state: string;
    isExcluded?: boolean;
    exclusionReason?: string | null;
    exclusionDetails?: string | null;
    grade: number | null;
    percent: number | null;
    simceScore: number | null;
    achievementLevel: string | null;
    correctCount: number | null;
    earnedPoints: number | null;
    submittedAt: string | null;
  }>;
  generatedAt: string;
};

export default function AssignmentReportPdfPage() {
  const { id } = useParams();
  const router = useRouter();
  const isPruebas = useIsPruebas();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    apiFetch<ReportData>(`/teacher/assignments/${id}/report-data`)
      .then(setData)
      .catch((err) => setError(err.message || "Error al cargar los datos del informe"))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border rounded-xl p-8 max-w-sm w-full text-center shadow-sm">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="font-bold text-slate-800 text-lg">Generando Informe Pedagógico...</h2>
          <p className="text-xs text-slate-500 mt-1">Calculando métricas, distribución y nómina del curso.</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="font-bold text-red-800 text-lg">Error al cargar el informe</h2>
          <p className="text-xs text-slate-600 mt-2 mb-4">{error || "No se encontraron datos para esta evaluación."}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 transition-colors"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  const { exam, course, teacher, summary, skills, axes, criticalQuestions, students } = data;
  const isNormalMode = exam.gradingMode === "NORMAL";

  const totalSubmittedOrMax = Math.max(summary.submittedCount, 1);
  const maxSkillPercent = 100;

  return (
    <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
      {() => (
        <div className="min-h-screen bg-slate-100 text-slate-900 print:bg-white print:p-0">
          {/* Estilos específicos de impresión */}
          <style jsx global>{`
            @media print {
              @page {
                size: letter;
                margin: 12mm 14mm 14mm 14mm;
              }
              body {
                background: white !important;
                color: #0f172a !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .page-break-before {
                page-break-before: always;
                break-before: page;
              }
              .avoid-break {
                page-break-inside: avoid;
                break-inside: avoid;
              }
            }
          `}</style>

          {/* Barra Superior en Pantalla (Oculta al imprimir) */}
          <header className="sticky top-0 z-30 bg-slate-900 text-white px-6 py-3.5 shadow-md flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-1 text-slate-300 hover:text-white text-xs font-semibold bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Volver a Evaluación
              </button>
              <div className="h-4 w-px bg-slate-700" />
              <div>
                <span className="text-xs font-bold text-slate-100 block">{exam.title}</span>
                <span className="text-[11px] text-slate-400">
                  {course.fullName} · {exam.subject}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Tip: Selecciona <strong>Guardar como PDF</strong> y activa <strong>Gráficos de fondo</strong></span>
              </div>

              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir / Guardar como PDF</span>
              </button>
            </div>
          </header>

          {/* Documento Imprimible */}
          <main className="max-w-4xl mx-auto my-6 bg-white p-8 md:p-12 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none">
            
            {/* 1. Encabezado Institucional */}
            <div className="border-b-2 border-slate-900 pb-5 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-800">
                    {data.institution.name}
                  </h3>
                  <p className="text-[11px] text-slate-600 font-medium">
                    {data.institution.department}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {data.institution.systemName}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block bg-slate-100 text-slate-800 text-[10px] font-mono px-2.5 py-1 rounded border border-slate-300 font-bold uppercase tracking-wider">
                    {exam.examType.replace(/_/g, " ")}
                  </span>
                  <p className="text-[10px] text-slate-500 mt-1">
                    ID Evaluación: #{data.assignment.id}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 text-center">
                <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">
                  INFORME PEDAGÓGICO DE RESULTADOS
                </h1>
                <p className="text-sm font-semibold text-blue-700 mt-0.5">
                  {exam.title}
                </p>
              </div>

              {/* Ficha Técnica */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Curso</span>
                  <span className="font-extrabold text-slate-900">{course.fullName}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Asignatura</span>
                  <span className="font-extrabold text-slate-900">{exam.subject}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Docente Responsable</span>
                  <span className="font-semibold text-slate-900">{teacher.name}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Año Escolar</span>
                  <span className="font-bold text-slate-900">{course.year}</span>
                </div>
              </div>
            </div>

            {/* 2. Resumen Ejecutivo (KPIs) */}
            <section className="mb-6 avoid-break">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-2.5">
                <Award className="w-3.5 h-3.5 text-blue-600" />
                1. Resumen Ejecutivo e Indicadores Clave
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {/* Asistencia / Participación */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Participación</span>
                  <div className="text-2xl font-black text-slate-900 mt-0.5">
                    {summary.submittedCount} <span className="text-xs font-semibold text-slate-500">/ {summary.validEnrolled ?? (summary.totalStudents - (summary.excludedCount || 0))}</span>
                  </div>
                  <span className="text-[11px] font-bold text-blue-700 block mt-0.5">
                    {summary.participationPercent}% Asistencia
                  </span>
                  {summary.excludedCount && summary.excludedCount > 0 ? (
                    <span className="text-[10px] font-semibold text-amber-700 block mt-0.5">
                      ({summary.excludedCount} justificado{summary.excludedCount > 1 ? "s" : ""})
                    </span>
                  ) : null}
                </div>

                {/* Nota Promedio */}
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3">
                  <span className="text-[10px] font-bold text-blue-700 uppercase block">Nota Promedio</span>
                  <div className={`text-2xl font-black mt-0.5 ${summary.averageGrade >= 4.0 ? "text-blue-900" : "text-red-700"}`}>
                    {summary.averageGrade.toFixed(1)}
                  </div>
                  <span className="text-[10px] font-medium text-blue-800 block mt-0.5">
                    Exigencia {exam.passThresholdPercent}%
                  </span>
                </div>

                {/* Porcentaje de Logro */}
                <div className="bg-purple-50/70 border border-purple-200 rounded-lg p-3">
                  <span className="text-[10px] font-bold text-purple-700 uppercase block">% Logro Promedio</span>
                  <div className="text-2xl font-black text-purple-900 mt-0.5">
                    {Math.round(summary.averagePercent)}%
                  </div>
                  <span className="text-[10px] font-medium text-purple-800 block mt-0.5">
                    {summary.averagePercent >= 60 ? "Logro Satisfactorio" : "Requiere Refuerzo"}
                  </span>
                </div>

                {/* Aprobación o Puntaje SIMCE */}
                {isNormalMode || summary.averageSimceScore == null ? (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block">Aprobación</span>
                    <div className="text-2xl font-black text-emerald-900 mt-0.5">
                      {summary.approvalPercent}%
                    </div>
                    <span className="text-[10px] font-medium text-emerald-800 block mt-0.5">
                      {summary.approvedCount} Aprob. · {summary.failedCount} Reprob.
                    </span>
                  </div>
                ) : (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block">Puntaje SIMCE Promedio</span>
                    <div className="text-2xl font-black text-emerald-900 mt-0.5">
                      {summary.averageSimceScore} <span className="text-xs font-semibold text-emerald-700">pts</span>
                    </div>
                    <span className="text-[10px] font-medium text-emerald-800 block mt-0.5">
                      Escala 100 - 400 pts (TRI)
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* 3. Distribución de Desempeño: Niveles de Logro y Calificaciones */}
            <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 avoid-break">
              {/* Niveles de Logro */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/40">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                  Niveles de Aprendizaje
                </h3>
                <div className="space-y-2.5 text-xs">
                  {/* Adecuado */}
                  <div>
                    <div className="flex justify-between font-semibold mb-1">
                      <span className="text-emerald-800 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Adecuado
                      </span>
                      <span className="text-slate-600">
                        {summary.levelCounts.ADECUADO} est. ({Math.round((summary.levelCounts.ADECUADO / totalSubmittedOrMax) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-2.5 rounded-full"
                        style={{ width: `${(summary.levelCounts.ADECUADO / totalSubmittedOrMax) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Elemental */}
                  <div>
                    <div className="flex justify-between font-semibold mb-1">
                      <span className="text-amber-800 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span> Elemental
                      </span>
                      <span className="text-slate-600">
                        {summary.levelCounts.ELEMENTAL} est. ({Math.round((summary.levelCounts.ELEMENTAL / totalSubmittedOrMax) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-amber-500 h-2.5 rounded-full"
                        style={{ width: `${(summary.levelCounts.ELEMENTAL / totalSubmittedOrMax) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Insuficiente */}
                  <div>
                    <div className="flex justify-between font-semibold mb-1">
                      <span className="text-rose-800 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-rose-600"></span> Insuficiente
                      </span>
                      <span className="text-slate-600">
                        {summary.levelCounts.INSUFICIENTE} est. ({Math.round((summary.levelCounts.INSUFICIENTE / totalSubmittedOrMax) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-rose-600 h-2.5 rounded-full"
                        style={{ width: `${(summary.levelCounts.INSUFICIENTE / totalSubmittedOrMax) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Distribución de Notas */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/40">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                  Distribución de Calificaciones
                </h3>
                <div className="space-y-2 text-xs">
                  {(() => {
                    const isBasicCourse = Boolean(
                      summary.isBasicLevel ||
                      exam?.minGrade === 2.0 ||
                      /^[1-8]B$/i.test(course?.level || '') ||
                      /[1-8].*(BÁSIC|BASIC)/i.test(course?.fullName || course?.level || '')
                    );
                    const minRangeLabel = isBasicCourse ? "2.0 - 3.9" : "1.0 - 3.9";
                    const minRangeCount = summary.gradeRanges["2.0-3.9"] ?? summary.gradeRanges["1.0-3.9"] ?? 0;
                    return [
                      { range: "6.0 - 7.0", label: "Sobresaliente", count: summary.gradeRanges["6.0-7.0"] || 0, color: "bg-emerald-600" },
                      { range: "5.0 - 5.9", label: "Bueno", count: summary.gradeRanges["5.0-5.9"] || 0, color: "bg-blue-600" },
                      { range: "4.0 - 4.9", label: "Suficiente", count: summary.gradeRanges["4.0-4.9"] || 0, color: "bg-amber-500" },
                      { range: minRangeLabel, label: "Insuficiente", count: minRangeCount, color: "bg-rose-600" },
                    ];
                  })().map((r) => {
                    const pct = Math.round((r.count / totalSubmittedOrMax) * 100);
                    return (
                      <div key={r.range} className="flex items-center gap-2">
                        <span className="w-20 font-mono font-semibold text-slate-700 text-[11px] shrink-0">{r.range}</span>
                        <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full ${r.color}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-14 text-right text-[11px] font-medium text-slate-600 shrink-0">
                          {r.count} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 4. Análisis por Habilidades y Ejes Temáticos */}
            <section className="mb-6 avoid-break">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-2.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                2. Rendimiento por Habilidades y Ejes Temáticos
              </h2>

              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Habilidad / Eje Temático</th>
                      <th className="py-2 px-3 text-center w-24">Preguntas</th>
                      <th className="py-2 px-3 text-center w-28">Puntos Obtenidos</th>
                      <th className="py-2 px-3 text-center w-28">% Logro</th>
                      <th className="py-2 px-3 w-40">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {skills.length === 0 && axes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-3 px-3 text-center text-slate-400 italic">
                          No hay habilidades ni ejes clasificados para esta evaluación.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {skills.map((s) => (
                          <tr key={`skill-${s.name}`} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              <span className="text-[10px] font-bold text-blue-600 uppercase mr-1.5 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">
                                Habilidad
                              </span>
                              {s.name}
                            </td>
                            <td className="py-2 px-3 text-center text-slate-600">{s.questionCount}</td>
                            <td className="py-2 px-3 text-center text-slate-600">
                              {s.correct} / {s.total}
                            </td>
                            <td className="py-2 px-3 text-center font-bold text-slate-900">
                              {s.percent}%
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                                  <div
                                    className={`h-2 rounded-full ${s.percent >= 60 ? "bg-emerald-600" : s.percent >= 40 ? "bg-amber-500" : "bg-rose-600"}`}
                                    style={{ width: `${Math.min(100, s.percent)}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] font-bold ${s.percent >= 60 ? "text-emerald-700" : s.percent >= 40 ? "text-amber-700" : "text-rose-700"}`}>
                                  {s.percent >= 60 ? "Adecuado" : s.percent >= 40 ? "Elemental" : "Insuficiente"}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {axes.map((a) => (
                          <tr key={`axis-${a.name}`} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              <span className="text-[10px] font-bold text-purple-600 uppercase mr-1.5 bg-purple-50 px-1 py-0.2 rounded border border-purple-200">
                                Eje
                              </span>
                              {a.name}
                            </td>
                            <td className="py-2 px-3 text-center text-slate-600">{a.questionCount}</td>
                            <td className="py-2 px-3 text-center text-slate-600">
                              {a.correct} / {a.total}
                            </td>
                            <td className="py-2 px-3 text-center font-bold text-slate-900">
                              {a.percent}%
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                                  <div
                                    className={`h-2 rounded-full ${a.percent >= 60 ? "bg-emerald-600" : a.percent >= 40 ? "bg-amber-500" : "bg-rose-600"}`}
                                    style={{ width: `${Math.min(100, a.percent)}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] font-bold ${a.percent >= 60 ? "text-emerald-700" : a.percent >= 40 ? "text-amber-700" : "text-rose-700"}`}>
                                  {a.percent >= 60 ? "Adecuado" : a.percent >= 40 ? "Elemental" : "Insuficiente"}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 5. Ítems Críticos (Foco de Refuerzo Pedagógico) */}
            {criticalQuestions.length > 0 && (
              <section className="mb-6 avoid-break">
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-xs font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    3. Ítems Críticos (Foco de Refuerzo Pedagógico Prioritario)
                  </h2>
                  <span className="text-[10px] text-slate-500">Preguntas con logro inferior al 60%</span>
                </div>

                <div className="border border-rose-200 bg-rose-50/20 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-rose-100/60 text-rose-900 text-[10px] uppercase font-bold border-b border-rose-200">
                      <tr>
                        <th className="py-1.5 px-3 text-center w-16">Ítem N°</th>
                        <th className="py-1.5 px-2 text-center w-20">Clave</th>
                        <th className="py-1.5 px-3">Habilidad / Eje</th>
                        <th className="py-1.5 px-3 text-center w-24">Acierto (%)</th>
                        <th className="py-1.5 px-3 text-center w-24">Omisión (%)</th>
                        <th className="py-1.5 px-3">Recomendación de Aula</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100">
                      {criticalQuestions.map((q) => (
                        <tr key={`crit-${q.id}`} className="hover:bg-rose-50/50">
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                            #{q.questionNumber}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className="font-mono font-black text-rose-900 bg-white px-2 py-0.5 rounded border border-rose-200 text-xs">
                              {q.correctAnswer}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            <span className="font-semibold block">{q.skill}</span>
                            <span className="text-[10px] text-slate-500">{q.axis}</span>
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-rose-700">
                            {q.percent}%
                          </td>
                          <td className="py-2 px-3 text-center text-slate-600">
                            {q.omittedPercent}%
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-600">
                            {q.percent < 30 ? (
                              <span className="text-rose-700 font-semibold">Refuerzo conceptual urgente</span>
                            ) : (
                              <span>Revisión de distractores y modelamiento</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 6. Nómina y Resultados Detallados de Estudiantes (con salto de página al imprimir) */}
            <section className="mb-6 page-break-before">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  4. Nómina y Resultados Consolidados de Estudiantes
                </h2>
                <span className="text-[10px] text-slate-500">
                  Total de alumnos: {students.length} · Rendidos: {summary.submittedCount}
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5 text-center w-10">N°</th>
                      <th className="py-2 px-3 w-28">RUT</th>
                      <th className="py-2 px-3">Nombre del Estudiante</th>
                      <th className="py-2 px-3 text-center w-24">Estado</th>
                      <th className="py-2 px-3 text-center w-24">Puntaje</th>
                      <th className="py-2 px-3 text-center w-20">% Logro</th>
                      <th className="py-2 px-3 text-center w-16">Nota</th>
                      {!isNormalMode && <th className="py-2 px-3 text-center w-24">Puntaje SIMCE</th>}
                      <th className="py-2 px-3 text-center w-28">Nivel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((st) => {
                      const isExcluded = Boolean(st.isExcluded || st.state === "EXCLUIDO");
                      const isSubmitted = st.state === "SUBMITTED" && !isExcluded;
                      const isPassed = (st.grade ?? 0) >= 4.0;
                      return (
                        <tr
                          key={st.rut}
                          className={`hover:bg-slate-50/60 ${
                            isExcluded
                              ? "bg-slate-50/50 text-slate-500"
                              : !isSubmitted
                              ? "bg-slate-50/30 text-slate-400"
                              : ""
                          }`}
                        >
                          <td className="py-1.5 px-2.5 text-center font-mono text-[11px] text-slate-500">
                            {st.index}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-[11px] text-slate-600">
                            {st.rut}
                          </td>
                          <td className="py-1.5 px-3 font-semibold text-slate-900 text-xs">
                            {st.name}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            {isExcluded ? (
                              <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full inline-block" title={st.exclusionReason || undefined}>
                                Excluido
                              </span>
                            ) : isSubmitted ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-block">
                                Rendido
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full inline-block">
                                Ausente
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono text-xs text-slate-700">
                            {isSubmitted ? `${st.earnedPoints ?? "-"} / ${exam.maxTotalPoints}` : "-"}
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono font-semibold text-xs text-slate-800">
                            {isSubmitted ? `${Math.round(st.percent ?? 0)}%` : "-"}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            {isSubmitted && st.grade != null ? (
                              <span className={`font-mono font-black text-sm ${isPassed ? "text-blue-900" : "text-rose-700"}`}>
                                {st.grade.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono">-</span>
                            )}
                          </td>
                          {!isNormalMode && (
                            <td className="py-1.5 px-3 text-center font-mono font-bold text-xs text-slate-900">
                              {isSubmitted && st.simceScore != null ? `${st.simceScore} pts` : "-"}
                            </td>
                          )}
                          <td className="py-1.5 px-3 text-center">
                            {isExcluded ? (
                              <span
                                className="text-[9px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded block truncate max-w-[120px] mx-auto"
                                title={st.exclusionReason || undefined}
                              >
                                {st.exclusionReason || "Excluido"}
                              </span>
                            ) : isSubmitted && st.achievementLevel ? (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${
                                  st.achievementLevel === "ADECUADO"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : st.achievementLevel === "ELEMENTAL"
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : "bg-rose-50 text-rose-800 border-rose-200"
                                }`}
                              >
                                {st.achievementLevel}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Registro de Estudiantes Excluidos / Justificados */}
              {data.excludedStudents && data.excludedStudents.length > 0 && (
                <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs avoid-break">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-1.5">
                    <span className="text-amber-600">ℹ️</span>
                    <span>Estudiantes Justificados / Excluidos de Informes ({data.excludedStudents.length})</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2 leading-relaxed">
                    Los siguientes estudiantes cuentan con justificación formal registrada y fueron omitidos del cómputo de promedios, porcentajes de logro y estadísticas del curso:
                  </p>
                  <div className="divide-y divide-slate-200/60 bg-white rounded border border-slate-200/80">
                    {data.excludedStudents.map((ex) => (
                      <div key={ex.rut} className="p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                        <div>
                          <strong className="text-slate-900">{ex.name}</strong> <span className="font-mono text-slate-500">({ex.rut})</span>
                        </div>
                        <div className="text-slate-600 italic">
                          Motivo: <span className="font-medium text-slate-800">{ex.reason}</span>
                          {ex.details && <span className="text-slate-500 ml-1">· {ex.details}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

          </main>
        </div>
      )}
    </RequireRole>
  );
}
