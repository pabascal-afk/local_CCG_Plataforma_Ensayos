"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { 
  AlertTriangle, BookOpen, PenTool, Bot, Copy, CheckCircle2, 
  Calendar, Clock, Send, Check, X, ShieldAlert, Sparkles, TrendingUp, ChevronRight
} from "lucide-react";

type Cluster = {
  axis: string;
  oa: string;
  skill: string;
  correct: number;
  total: number;
  percentage: number;
  questionsCount: number;
};

type RemedialProposalItem = {
  id: number;
  suggestedDate: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNotes?: string | null;
  createdAt: string;
  remedialExam?: {
    id: number;
    title: string;
    examType: string;
    subject: string;
  } | null;
  teacher?: {
    name: string;
    rut: string;
  } | null;
};

type RemedialExamItem = {
  id: number;
  title: string;
  examType: string;
  subject: string;
  level: string;
  durationMinutes?: number | null;
  orderNumber: number;
};

type RemedialImpactData = {
  hasRemedial: boolean;
  originExamTitle?: string;
  remedialExamTitle?: string;
  remedialOpensAt?: string;
  comparison?: Array<{
    oa: string;
    originPct: number;
    remedialPct: number | null;
    delta: number | null;
  }>;
};

type RemedialReport = {
  weakestClusters: Cluster[];
  reportText: string;
  quizSuggestion: string;
  proposals?: RemedialProposalItem[];
  activeRemedialAssignment?: any;
  availableRemedialExams?: RemedialExamItem[];
  alertNoRemedial?: boolean;
  hasSubmissions?: boolean;
};

export default function RemedialTab({ assignmentId }: { assignmentId: string }) {
  const [report, setReport] = useState<RemedialReport | null>(null);
  const [impactData, setImpactData] = useState<RemedialImpactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Formulario de propuesta para el profesor
  const [suggestedDate, setSuggestedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0];
  });
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("09:30");
  const [selectedRemedialExamId, setSelectedRemedialExamId] = useState<string>("");
  const [proposalNotes, setProposalNotes] = useState("");
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [proposalSuccess, setProposalSuccess] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      const data = await apiFetch<RemedialReport>(`/teacher/assignments/${assignmentId}/remedial`);
      setReport(data);

      if (data.availableRemedialExams && data.availableRemedialExams.length > 0 && !selectedRemedialExamId) {
        setSelectedRemedialExamId(data.availableRemedialExams[0].id.toString());
      }

      // Intentar cargar impacto si existe remedial activa
      if (data.activeRemedialAssignment) {
        const imp = await apiFetch<RemedialImpactData>(`/teacher/assignments/${assignmentId}/remedial-impact`).catch(() => null);
        if (imp) setImpactData(imp);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [assignmentId]);

  const handleProposeRemedial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestedDate) return;

    setSubmittingProposal(true);
    setProposalSuccess(null);

    try {
      await apiFetch(`/teacher/assignments/${assignmentId}/propose-remedial`, {
        method: "POST",
        body: {
          suggestedDate,
          startTime,
          endTime,
          remedialExamId: selectedRemedialExamId ? parseInt(selectedRemedialExamId, 10) : null,
          notes: proposalNotes,
        }
      });

      setProposalSuccess("¡Propuesta enviada exitosamente a UTP para revisión y aprobación!");
      setProposalNotes("");
      await fetchReport();
    } catch (err: any) {
      alert(err.message || "Error al enviar propuesta");
    } finally {
      setSubmittingProposal(false);
    }
  };

  if (loading) return <div className="text-gray-500 py-8 text-center animate-pulse">Analizando focos de aprendizaje y estado remedial...</div>;
  if (!report) return <div className="text-red-500 py-8 text-center">Error al cargar reporte.</div>;

  const generatePrompt = () => {
    if (!report.weakestClusters.length) return "";
    const oas = report.weakestClusters.map(c => `"${c.oa}" (${c.axis} - Habilidad: ${c.skill})`).join(", ");
    return `He detectado que mi curso presenta un déficit crítico de aprendizaje en los siguientes focos:
${oas}

Por favor, genera para mí:
1. Una GUÍA PRÁCTICA (formato taller) que aborde estos aprendizajes desde lo más básico hasta la complejidad requerida, incluyendo explicaciones breves, 3 ejemplos resueltos paso a paso y 5 ejercicios de práctica para los alumnos.
2. Un QUIZ DE SALIDA (Ticket de Salida) de 10 preguntas de selección múltiple enfocadas EXCLUSIVAMENTE en evaluar estos aprendizajes descendidos, indicando al final la tabla con la pauta de corrección.`;
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(generatePrompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="space-y-6">

      {/* ================= ALERTA CRÍTICA: PRUEBA SIN REMEDIAL ================= */}
      {report.alertNoRemedial && (
        <div className="bg-gradient-to-r from-rose-500 to-amber-600 rounded-2xl p-5 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Alerta del Sistema UTP
                </span>
                <span className="text-xs font-bold text-rose-100">Sin Acción Remedial</span>
              </div>
              <h3 className="text-base font-black tracking-tight mt-1">
                Esta evaluación fue rendida pero aún no cuenta con plan remedial programado
              </h3>
              <p className="text-xs text-rose-100 mt-0.5 max-w-2xl leading-relaxed">
                El sistema detectó debilidades en los OAs evaluados. Para cerrar brechas de aprendizaje, 
                sugiere una fecha y horario a continuación para que la Unidad Técnico Pedagógica (UTP) apruebe y agende formalmente la remedial.
              </p>
            </div>
          </div>

          <a 
            href="#formulario-remedial"
            className="self-start sm:self-auto px-4 py-2 bg-white text-rose-700 hover:bg-rose-50 active:bg-rose-100 rounded-xl font-black text-xs shadow-sm transition whitespace-nowrap"
          >
            Sugerir Fecha a UTP ➜
          </a>
        </div>
      )}

      {/* Focos Críticos de Aprendizaje */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-black text-amber-950 flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-600" /> 
          Diagnóstico de Focos Críticos de Aprendizaje
        </h2>
        <p className="text-amber-900/90 mb-5 text-xs leading-relaxed font-medium">
          {report.reportText}
        </p>

        {report.weakestClusters.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {report.weakestClusters.map((c, i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-amber-200/60 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${c.percentage < 40 ? 'bg-red-500' : 'bg-amber-400'}`}></div>
                <div className="font-black text-gray-900 text-xs mb-1 line-clamp-2">{c.oa}</div>
                <div className="text-[11px] text-gray-500 mb-2 font-medium">{c.axis} • {c.skill}</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-2 rounded-full ${c.percentage < 40 ? 'bg-red-500' : 'bg-amber-500'}`} 
                      style={{ width: `${c.percentage}%` }}
                    ></div>
                  </div>
                  <span className="font-black text-xs text-gray-800">{c.percentage}%</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-2 text-right font-medium">Evaluado en {c.questionsCount} pregunta(s)</div>
              </div>
            ))}
          </div>
        )}

        {report.quizSuggestion && (
          <div className="bg-white border-l-4 border-l-blue-600 p-4 rounded-xl shadow-xs">
            <h3 className="font-bold text-blue-950 flex items-center gap-2 mb-1 text-xs">
              <PenTool className="w-4 h-4 text-blue-600" /> Acción Sugerida (Evaluación Formativa de Salida)
            </h3>
            <p className="text-gray-700 text-xs italic leading-relaxed">
              "{report.quizSuggestion}"
            </p>
          </div>
        )}
      </div>

      {/* ================= SECCIÓN DE IMPACTO REMEDIAL (SI YA SE RINDIÓ) ================= */}
      {impactData && impactData.comparison && impactData.comparison.length > 0 && (
        <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900">
                  Efectividad de la Acción Remedial (Antes vs. Después)
                </h3>
                <p className="text-xs text-gray-500">
                  Comparativa de logro por OA entre el ensayo origen y la evaluación remedial aplicada.
                </p>
              </div>
            </div>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full">
              Remedial Aplicada
            </span>
          </div>

          <div className="space-y-3">
            {impactData.comparison.map((item, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="font-bold text-gray-800 flex-1">
                  {item.oa}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <span className="text-[10px] text-gray-400 block font-semibold">Ensayo Origen</span>
                    <span className="font-black text-gray-700">{item.originPct}%</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                  <div className="text-center">
                    <span className="text-[10px] text-gray-400 block font-semibold">Remedial</span>
                    <span className="font-black text-emerald-700">{item.remedialPct ?? "-"}%</span>
                  </div>
                  {item.delta !== null && (
                    <div className={`px-2.5 py-1 rounded-lg font-black text-xs ${
                      item.delta >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                    }`}>
                      {item.delta >= 0 ? `+${item.delta}% Logro` : `${item.delta}% Logro`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= FLUJO HÍBRIDO: FORMULARIO DEL PROFESOR Y PROPUESTAS A UTP ================= */}
      <div id="formulario-remedial" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Formulario para Sugerir Fecha a UTP */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <h3 className="font-black text-base text-gray-900">Sugerir Fecha de Remedial a UTP</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Como docente, puedes solicitar una fecha y horario para rendir la evaluación remedial de este curso. 
              UTP revisará y validará la calendarización para evitar topes con otras asignaturas.
            </p>

            {proposalSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs font-bold mb-4 flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{proposalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleProposeRemedial} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Evaluación Remedial o Quiz de Salida
                </label>
                <select
                  value={selectedRemedialExamId}
                  onChange={(e) => setSelectedRemedialExamId(e.target.value)}
                  className="w-full text-xs bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {(report.availableRemedialExams || []).map(re => (
                    <option key={re.id} value={re.id}>
                      [{re.examType}] {re.title} ({re.durationMinutes ? `${re.durationMinutes}m` : "Libre"})
                    </option>
                  ))}
                  {(!report.availableRemedialExams || report.availableRemedialExams.length === 0) && (
                    <option value="">(No hay remediales registradas en catálogo - UTP asignará una)</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Día Sugerido</label>
                  <input
                    type="date"
                    required
                    value={suggestedDate}
                    onChange={(e) => setSuggestedDate(e.target.value)}
                    className="w-full text-xs bg-gray-50 border border-gray-300 rounded-xl px-2.5 py-2 font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full text-xs bg-gray-50 border border-gray-300 rounded-xl px-2.5 py-2 font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Hora Cierre</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full text-xs bg-gray-50 border border-gray-300 rounded-xl px-2.5 py-2 font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Justificación / Notas Pedagógicas para UTP (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={proposalNotes}
                  onChange={(e) => setProposalNotes(e.target.value)}
                  placeholder="Ej: Se aplicará en el primer bloque tras el repaso de fracciones..."
                  className="w-full text-xs bg-gray-50 border border-gray-300 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingProposal}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submittingProposal ? (
                  <span>Enviando propuesta...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar Sugerencia de Remedial a UTP</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Estado de Propuestas Enviadas y Respuestas de UTP */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-sm text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" />
              Estado de Propuestas ante UTP
            </h3>
            <span className="bg-purple-100 text-purple-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {(report.proposals || []).length} registradas
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-72">
            {(report.proposals || []).map((prop) => (
              <div 
                key={prop.id}
                className="bg-white border rounded-xl p-3 text-xs shadow-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">
                    {new Date(prop.suggestedDate).toLocaleDateString()} ({prop.startTime} - {prop.endTime})
                  </span>
                  {prop.status === "PENDING" && (
                    <span className="bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded text-[10px]">
                      PENDIENTE UTP
                    </span>
                  )}
                  {prop.status === "APPROVED" && (
                    <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                      <Check className="w-3 h-3" /> APROBADA
                    </span>
                  )}
                  {prop.status === "REJECTED" && (
                    <span className="bg-rose-100 text-rose-800 font-extrabold px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                      <X className="w-3 h-3" /> RECHAZADA
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-gray-600">
                  <strong>Evaluación:</strong> {prop.remedialExam?.title || "Remedial sugerida"}
                </div>

                {prop.notes && (
                  <p className="text-[11px] text-gray-500 italic bg-gray-50 p-1.5 rounded">
                    "{prop.notes}"
                  </p>
                )}

                {prop.reviewNotes && (
                  <div className="text-[10px] text-indigo-700 bg-indigo-50/70 p-1.5 rounded font-semibold">
                    <strong>Respuesta UTP:</strong> {prop.reviewNotes}
                  </div>
                )}
              </div>
            ))}

            {(!report.proposals || report.proposals.length === 0) && (
              <div className="text-center py-10 text-gray-400 text-xs font-semibold">
                No has enviado propuestas de remedial para esta prueba todavía.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Plan de Mejora Recomendado y Generador con IA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-sm">
            <BookOpen className="w-4 h-4 text-emerald-600" /> Protocolo de Acción Remedial
          </h3>
          <ul className="list-disc list-inside text-xs text-gray-600 space-y-2.5">
            <li><strong>Paso 1 (Focalización):</strong> Identifica a los alumnos con nivel "Insuficiente" en la pestaña de Estudiantes.</li>
            <li><strong>Paso 2 (Taller de Aula):</strong> Aplica una guía práctica de 20 minutos orientada al modelamiento de los OAs débiles.</li>
            <li><strong>Paso 3 (Validación de Logro):</strong> Sugiere a UTP la fecha para rendir el Quiz Remedial y verifica el porcentaje de recuperación.</li>
          </ul>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-indigo-950 mb-1 flex items-center gap-2 text-sm">
              <Bot className="w-4 h-4 text-indigo-600" /> Asistente IA para Material Pedagógico
            </h3>
            <p className="text-xs text-indigo-900/80 mb-4 leading-relaxed">
              Copia el prompt dinámico con los parámetros exactos de este reporte y pégalo en tu asistente IA (Gemini, ChatGPT) para redactar la guía de aula y el quiz formativo al instante.
            </p>
          </div>
          <button 
            onClick={handleCopyPrompt}
            className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              copied 
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
            }`}
          >
            {copied ? (
              <><CheckCircle2 className="w-4 h-4" /> ¡Prompt Copiado al Portapapeles!</>
            ) : (
              <><Copy className="w-4 h-4" /> Copiar Prompt para IA</>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
