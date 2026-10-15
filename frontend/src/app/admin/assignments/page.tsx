"use client";

import { useEffect, useState, useMemo, FormEvent } from "react";
import Link from "next/link";
import { 
  ArrowLeft, Clock, Calendar, Check, Trash2, GripVertical, BookOpen, 
  User, Tag, Download, Upload, FileSpreadsheet, X, Search, Filter, 
  Timer, KeyRound, RotateCcw, Sparkles, CheckCircle2, ChevronRight,
  ShieldCheck, AlertTriangle, Layers, Copy, Inbox, CheckSquare,
  XCircle, MessageSquare, AlertCircle, Bot, ChevronDown, ChevronUp,
  Printer, ScanLine, FileText, Monitor, Laptop
} from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";
import { copyToClipboard } from "@/lib/clipboard";
import { useSchoolYear } from "@/context/SchoolYearContext";
import AiPromptModal, { AiPromptMode } from "@/components/AiPromptModal";
import OmrScannerModal from "@/components/OmrScannerModal";

type Exam = { 
  id: number; 
  title: string; 
  subject: string; 
  level: string; 
  examType: string; 
  orderNumber: number;
  durationMinutes?: number | null;
  questionCount?: number;
};

type Course = { 
  id: number; 
  level: string; 
  letter: string;
  year?: number;
};

type Teacher = { 
  rut: string; 
  name: string; 
};

type Assignment = { 
  id: number; 
  examId: number; 
  courseId: number; 
  opensAt: string; 
  closesAt: string; 
  durationMinutes?: number | null;
  dynamicPassword?: string | null;
  dynamicPasswordActive?: boolean;
  status?: string;
  applicationMode?: "DIGITAL" | "PRINTED";
  Exam: Exam; 
  Course: Course; 
  assignedTeacher?: { rut: string; name: string } | null;
};

type RemedialProposal = {
  id: number;
  originAssignmentId: number;
  remedialExamId?: number | null;
  courseId: number;
  teacherRut: string;
  suggestedDate: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedByRut?: string | null;
  reviewNotes?: string | null;
  createdAssignmentId?: number | null;
  createdAt: string;
  teacher?: { name: string; rut: string };
  course?: { id: number; level: string; letter: string; year: number };
  remedialExam?: { id: number; title: string; subject: string; level: string; examType: string };
  originAssignment?: {
    id: number;
    exam: { id: number; title: string; subject: string; level: string; examType: string };
    course: { id: number; level: string; letter: string };
  };
};

type RemedialAlert = {
  assignmentId: number;
  examId: number;
  examTitle: string;
  subject: string;
  level: string;
  courseId: number;
  courseName: string;
  year: number;
  submissionsCount: number;
  teacherName: string;
  teacherRut?: string;
  opensAt: string;
  alertMessage: string;
};

// Preset de fechas
type DatePreset = {
  id: string;
  label: string;
  sublabel: string;
  getDateRange: () => { dateStr: string; startTime: string; endTime: string };
};

const DATE_PRESETS: DatePreset[] = [
  {
    id: "today_full",
    label: "Hoy Completo",
    sublabel: "08:00 - 18:00 hrs",
    getDateRange: () => {
      const today = new Date().toISOString().split("T")[0];
      return { dateStr: today, startTime: "08:00", endTime: "18:00" };
    }
  },
  {
    id: "today_morning",
    label: "Hoy Turno Mañana",
    sublabel: "08:30 - 11:30 hrs",
    getDateRange: () => {
      const today = new Date().toISOString().split("T")[0];
      return { dateStr: today, startTime: "08:30", endTime: "11:30" };
    }
  },
  {
    id: "today_afternoon",
    label: "Hoy Turno Tarde",
    sublabel: "14:00 - 17:00 hrs",
    getDateRange: () => {
      const today = new Date().toISOString().split("T")[0];
      return { dateStr: today, startTime: "14:00", endTime: "17:00" };
    }
  },
  {
    id: "tomorrow_full",
    label: "Mañana Completo",
    sublabel: "08:00 - 18:00 hrs",
    getDateRange: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return { dateStr: d.toISOString().split("T")[0], startTime: "08:00", endTime: "18:00" };
    }
  },
  {
    id: "all_day",
    label: "Todo el Día (24 hrs)",
    sublabel: "00:01 - 23:59 hrs",
    getDateRange: () => {
      const today = new Date().toISOString().split("T")[0];
      return { dateStr: today, startTime: "00:01", endTime: "23:59" };
    }
  }
];

// Presets de cronómetros
type TimerPreset = {
  minutes: number | null; // null = sin cronómetro (libre)
  label: string;
  badge: string;
  desc: string;
};

const TIMER_PRESETS: TimerPreset[] = [
  { minutes: 90, label: "90 min", badge: "Estándar SIMCE", desc: "Tiempo oficial de prueba" },
  { minutes: 60, label: "60 min", badge: "Exprés", desc: "Ideal para quizes y diagnósticos" },
  { minutes: 45, label: "45 min", badge: "Módulo Pedagógico", desc: "1 bloque de clases" },
  { minutes: 120, label: "120 min", badge: "Extendido", desc: "Para ensayos largos" },
  { minutes: null, label: "Sin Límite", badge: "Libre", desc: "Sin cronómetro regresivo" },
];

const formatCourseLevel = (level?: string) => {
  if (!level) return "";
  return level.replace("B", "° Básico").replace("M", "° Medio");
};

const formatCourseName = (c?: { level?: string; letter?: string; year?: number } | null) => {
  if (!c || !c.level) return "Curso";
  const lvl = formatCourseLevel(c.level);
  return `${lvl} ${c.letter || ""}`.trim();
};

export default function AssignmentsDashboard() {
  const { selectedYear } = useSchoolYear();
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Filtros Superiores ---
  const [searchExam, setSearchExam] = useState("");
  const [examTypeFilter, setExamTypeFilter] = useState("TODOS");
  const [subjectFilter, setSubjectFilter] = useState("TODAS");
  const [courseFilter, setCourseFilter] = useState("TODOS");

  // --- Modo Enfoque (Workbench del Curso) ---
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusedCourse, setFocusedCourse] = useState<Course | null>(null);
  const [stagedExam, setStagedExam] = useState<Exam | null>(null);

  // Curso preseleccionado por clic para filtrar ensayos pendientes de ese nivel
  const [selectedCourseForFilter, setSelectedCourseForFilter] = useState<Course | null>(null);

  // Parámetros en preparación dentro del Modo Enfoque
  const [stagedDuration, setStagedDuration] = useState<number | null>(90);
  const [stagedDate, setStagedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [stagedStartTime, setStagedStartTime] = useState("08:00");
  const [stagedEndTime, setStagedEndTime] = useState("18:00");
  const [stagedTeacher, setStagedTeacher] = useState<Teacher | null>(null);
  const [stagedDynamicPin, setStagedDynamicPin] = useState("");
  const [stagedDynamicPinActive, setStagedDynamicPinActive] = useState(false);
  const [isSubmittingFocus, setIsSubmittingFocus] = useState(false);
  const [focusSuccessNotice, setFocusSuccessNotice] = useState<string | null>(null);
  const [stagedApplicationMode, setStagedApplicationMode] = useState<"DIGITAL" | "PRINTED">("DIGITAL");

  // Escaneo OMR directo y Cambio de Modalidad con Confirmación
  const [omrScanAssignmentId, setOmrScanAssignmentId] = useState<number | null>(null);
  const [modeChangeTarget, setModeChangeTarget] = useState<{
    assignment: Assignment;
    newMode: "DIGITAL" | "PRINTED";
  } | null>(null);
  const [isChangingMode, setIsChangingMode] = useState(false);

  // Estados para Drag and Drop reactivo y robusto
  const [draggedExam, setDraggedExam] = useState<Exam | null>(null);
  const [draggedTimer, setDraggedTimer] = useState<TimerPreset | null>(null);
  const [draggedDate, setDraggedDate] = useState<DatePreset | null>(null);
  const [draggedTeacher, setDraggedTeacher] = useState<Teacher | null>(null);
  const [draggedPin, setDraggedPin] = useState(false);
  const [dragOverCourseId, setDragOverCourseId] = useState<number | null>(null);
  const [dragOverAssignmentId, setDragOverAssignmentId] = useState<number | null>(null);
  const [assigningExamId, setAssigningExamId] = useState<number | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);

  // Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // --- Modal Asignaciones Activas (Filtro por Tag) ---
  const [showActiveAssignmentsModal, setShowActiveAssignmentsModal] = useState(false);
  const [tagFilterQuery, setTagFilterQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("TODOS");
  const [copiedPinId, setCopiedPinId] = useState<number | null>(null);

  // --- Modal Bandeja UTP de Remediales y Alertas ---
  const [showRemedialModal, setShowRemedialModal] = useState(false);
  const [remedialProposals, setRemedialProposals] = useState<RemedialProposal[]>([]);
  const [remedialAlerts, setRemedialAlerts] = useState<RemedialAlert[]>([]);
  const [remedialModalTab, setRemedialModalTab] = useState<"proposals" | "alerts">("proposals");
  const [proposalStatusFilter, setProposalStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [processingProposalId, setProcessingProposalId] = useState<number | null>(null);
  const [rejectingProposalId, setRejectingProposalId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [remedialSuccessNotice, setRemedialSuccessNotice] = useState<string | null>(null);

  // Modal de Asistente de Prompts IA
  const [showAiPromptModal, setShowAiPromptModal] = useState(false);
  const [aiPromptConfig, setAiPromptConfig] = useState<{
    mode: AiPromptMode;
    level?: string;
    subject?: string;
    courseName?: string;
    examTitle?: string;
    targetOa?: string;
  }>({ mode: "REMEDIAL" });

  // Búsqueda de profesores en toolbox
  const [searchTeacher, setSearchTeacher] = useState("");

  // Estados para tarjetas compactas por defecto (disclosure progresivo)
  const [expandedActiveAssignments, setExpandedActiveAssignments] = useState<Set<number>>(new Set());
  const [expandedProposals, setExpandedProposals] = useState<Set<number>>(new Set());
  const [expandedAlerts, setExpandedAlerts] = useState<Set<number>>(new Set());

  const toggleActiveAssignmentExpand = (id: number) => {
    setExpandedActiveAssignments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProposalExpand = (id: number) => {
    setExpandedProposals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAlertExpand = (id: number) => {
    setExpandedAlerts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadData = async () => {
    try {
      const [ex, co, as, us, props, alrts] = await Promise.all([
        apiFetch<Exam[]>("/admin/exams"),
        apiFetch<Course[]>(`/admin/courses?year=${selectedYear}`),
        apiFetch<Assignment[]>(`/admin/assignments?year=${selectedYear}`),
        apiFetch<Teacher[]>("/admin/users?role=TEACHER"),
        apiFetch<RemedialProposal[]>("/admin/remedial-proposals"),
        apiFetch<{ totalAlerts: number; alerts: RemedialAlert[] }>(`/admin/remedial-alerts?year=${selectedYear}`)
      ]);
      setExams(ex);
      setCourses(co);
      setAssignments(as);
      setTeachers(us);
      setRemedialProposals(props || []);
      setRemedialAlerts(alrts?.alerts || []);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  // Contadores para UTP
  const pendingProposalsCount = useMemo(() => {
    return remedialProposals.filter(p => p.status === "PENDING").length;
  }, [remedialProposals]);

  const activeAlertsCount = useMemo(() => {
    return remedialAlerts.length;
  }, [remedialAlerts]);

  const filteredProposals = useMemo(() => {
    if (proposalStatusFilter === "ALL") return remedialProposals;
    return remedialProposals.filter(p => p.status === proposalStatusFilter);
  }, [remedialProposals, proposalStatusFilter]);

  // Handlers para Bandeja UTP de Remediales
  const handleApproveProposal = async (proposal: RemedialProposal) => {
    setProcessingProposalId(proposal.id);
    setRemedialSuccessNotice(null);
    try {
      const res = await apiFetch<any>(`/admin/remedial-proposals/${proposal.id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({
          reviewNotes: "Aprobada por UTP. Asignación programada en calendario."
        })
      });
      setRemedialSuccessNotice(res.message || "Propuesta aprobada y asignación creada.");
      await loadData();
    } catch (err: any) {
      alert("Error al aprobar propuesta: " + err.message);
    } finally {
      setProcessingProposalId(null);
    }
  };

  const handleRejectProposal = async (proposalId: number) => {
    if (!rejectReason.trim()) {
      alert("Por favor ingresa un motivo u orientación pedagógica para el docente.");
      return;
    }
    setProcessingProposalId(proposalId);
    setRemedialSuccessNotice(null);
    try {
      const res = await apiFetch<any>(`/admin/remedial-proposals/${proposalId}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason: rejectReason.trim() })
      });
      setRemedialSuccessNotice(res.message || "Propuesta rechazada.");
      setRejectingProposalId(null);
      setRejectReason("");
      await loadData();
    } catch (err: any) {
      alert("Error al rechazar propuesta: " + err.message);
    } finally {
      setProcessingProposalId(null);
    }
  };

  const handleScheduleRemedialFromAlert = (alertItem: RemedialAlert) => {
    const targetCourse = courses.find(c => c.id === alertItem.courseId);
    if (targetCourse) {
      setSelectedCourseForFilter(targetCourse);
      setExamTypeFilter("REMEDIAL");
      setShowRemedialModal(false);
    } else {
      setShowRemedialModal(false);
    }
  };

  // Lista de materias únicas presentes
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    exams.forEach(e => { if (e.subject) set.add(e.subject); });
    return Array.from(set).sort();
  }, [exams]);

  // Exámenes filtrados
  const filteredExams = useMemo(() => {
    return exams.filter(e => {
      // Si se hizo clic en un curso específico antes que todo:
      if (selectedCourseForFilter) {
        // 1. Mostrar exclusivamente los ensayos de ese nivel (ej: 2M si es 2° Medio)
        if (e.level !== selectedCourseForFilter.level) return false;

        // 2. Filtrar también los ensayos que este año ya estén asignados o rendidos en ese curso
        const isAlreadyAssigned = assignments.some(a => a.courseId === selectedCourseForFilter.id && a.examId === e.id);
        if (isAlreadyAssigned) return false;
      }

      // Texto / búsqueda
      if (searchExam.trim()) {
        const q = searchExam.toLowerCase().trim();
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchOrder = `#${e.orderNumber}`.includes(q) || `${e.orderNumber}` === q;
        const matchSubj = e.subject?.toLowerCase().includes(q);
        if (!matchTitle && !matchOrder && !matchSubj) return false;
      }
      // Tipo de examen
      if (examTypeFilter !== "TODOS") {
        if (e.examType?.toUpperCase() !== examTypeFilter.toUpperCase()) return false;
      }
      // Asignatura
      if (subjectFilter !== "TODAS") {
        if (e.subject !== subjectFilter) return false;
      }
      // Filtro de curso/nivel general (solo cuando no hay curso seleccionado por clic directo)
      if (courseFilter !== "TODOS" && !selectedCourseForFilter) {
        const selectedC = courses.find(c => c.id.toString() === courseFilter);
        if (selectedC && e.level && e.level !== selectedC.level) {
          return false;
        }
      }
      return true;
    });
  }, [exams, searchExam, examTypeFilter, subjectFilter, courseFilter, courses, selectedCourseForFilter, assignments]);

  // Asignaciones ya registradas para el curso seleccionado (para estadísticas del banner)
  const alreadyAssignedToSelectedCourse = useMemo(() => {
    if (!selectedCourseForFilter) return [];
    return assignments.filter(a => a.courseId === selectedCourseForFilter.id);
  }, [selectedCourseForFilter, assignments]);

  // Cursos filtrados para la vista
  const visibleCourses = useMemo(() => {
    if (courseFilter === "TODOS") return courses;
    return courses.filter(c => c.id.toString() === courseFilter);
  }, [courses, courseFilter]);

  // Docentes filtrados en el toolbox
  const filteredTeachers = useMemo(() => {
    if (!searchTeacher.trim()) return teachers;
    const q = searchTeacher.toLowerCase();
    return teachers.filter(t => t.name.toLowerCase().includes(q) || t.rut.toLowerCase().includes(q));
  }, [teachers, searchTeacher]);

  // ================= SISTEMA DE TAGS PARA ASIGNACIONES =================
  const getAssignmentTags = (a: Assignment): string[] => {
    const tags: string[] = [];
    
    // 1. Tipo de Evaluación
    if (a.Exam?.examType) {
      tags.push(`#${a.Exam.examType.toUpperCase()}`);
    }
    
    // 2. Asignatura / Materia
    if (a.Exam?.subject) {
      tags.push(`#${a.Exam.subject.replace(/\s+/g, "")}`);
    }
    
    // 3. Nivel y Curso
    if (a.Course?.level) {
      const formattedLvl = a.Course.level.replace("B", "°Básico").replace("M", "°Medio");
      tags.push(`#${formattedLvl}`);
      if (a.Course.letter) {
        tags.push(`#${formattedLvl}-${a.Course.letter}`);
      }
    }

    // 4. Temporalidad y Estado
    const now = new Date();
    const opens = new Date(a.opensAt);
    const closes = new Date(a.closesAt);
    const todayStr = now.toISOString().split("T")[0];
    const opensStr = opens.toISOString().split("T")[0];

    if (opensStr === todayStr) {
      tags.push("#HOY");
    }
    if (now >= opens && now <= closes) {
      tags.push("#EN_CURSO");
    } else if (now < opens) {
      tags.push("#PROGRAMADA");
    } else {
      tags.push("#FINALIZADA");
    }

    // 5. Docente
    if (a.assignedTeacher) {
      tags.push("#CON_DOCENTE");
    } else {
      tags.push("#SIN_DOCENTE");
    }

    // 6. PIN de Clase
    if (a.dynamicPasswordActive) {
      tags.push("#CON_PIN");
    }

    // 7. Cronómetro
    if (a.durationMinutes && a.durationMinutes > 0) {
      tags.push("#CRONOMETRADA");
    } else {
      tags.push("#TIEMPO_LIBRE");
    }

    return tags;
  };

  // Nube de tags calculada con conteo de asignaciones activas
  const availableTagsList = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    assignments.forEach(a => {
      const tags = getAssignmentTags(a);
      tags.forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    // Ordenar: primero los más frecuentes
    const entries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    return entries;
  }, [assignments]);

  // Asignaciones filtradas en el Modal
  const modalFilteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      const tags = getAssignmentTags(a);
      
      // Filtro por tag seleccionado
      if (selectedTag !== "TODOS") {
        if (!tags.includes(selectedTag)) return false;
      }

      // Filtro por texto en el input de tags
      if (tagFilterQuery.trim()) {
        const q = tagFilterQuery.toLowerCase().trim();
        const matchTag = tags.some(t => t.toLowerCase().includes(q));
        const matchExam = a.Exam?.title.toLowerCase().includes(q) || `#${a.Exam?.orderNumber}`.includes(q);
        const matchCourse = `${formatCourseName(a.Course)} ${a.Course?.level || ""} ${a.Course?.letter || ""}`.toLowerCase().includes(q);
        const matchTeacher = a.assignedTeacher?.name.toLowerCase().includes(q) || false;
        const matchPin = a.dynamicPassword?.toLowerCase().includes(q) || false;

        if (!matchTag && !matchExam && !matchCourse && !matchTeacher && !matchPin) {
          return false;
        }
      }

      return true;
    });
  }, [assignments, selectedTag, tagFilterQuery]);

  const copyPinToClipboard = async (pin: string, assignmentId: number) => {
    await copyToClipboard(pin);
    setCopiedPinId(assignmentId);
    setTimeout(() => setCopiedPinId(null), 2000);
  };

  // ================= DRAG & DROP HANDLERS =================

  // Función unificada para entrar al Modo Enfoque con curso y examen
  const startFocusMode = (course: Course, exam: Exam) => {
    setFocusedCourse(course);
    setStagedExam(exam);
    setIsFocusMode(true);
    setFocusSuccessNotice(null);
    setAssigningExamId(null);
    setDragOverCourseId(null);

    // Inicializar valores sugeridos basados en el examen
    const initialDuration = exam.durationMinutes !== undefined && exam.durationMinutes !== null 
      ? exam.durationMinutes 
      : (exam.examType === "QUIZ" ? 60 : 90);
    setStagedDuration(initialDuration);

    const today = new Date().toISOString().split("T")[0];
    setStagedDate(today);
    setStagedStartTime("08:00");
    setStagedEndTime("18:00");
    setStagedTeacher(null);

    // Generar un PIN aleatorio sugerido
    const cleanLevel = course.level.replace(/[^0-9A-Z]/g, "");
    const cleanLetter = course.letter;
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    setStagedDynamicPin(`SIMCE${cleanLevel}${cleanLetter}${randomSuffix}`);
    setStagedDynamicPinActive(false);
    setStagedApplicationMode("DIGITAL");
  };

  // 1. Arrastrar Examen desde la izquierda
  const handleExamDragStart = (e: React.DragEvent, exam: Exam) => {
    setDraggedExam(exam);
    e.dataTransfer.effectAllowed = "copyMove";
    const payload = JSON.stringify({ type: "EXAM", examId: exam.id });
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.setData("application/json", payload);
    try {
      e.dataTransfer.setData("type", "EXAM");
      e.dataTransfer.setData("examId", exam.id.toString());
    } catch {}
  };

  // 2. Arrastrar Cronómetro desde el Toolbox
  const handleTimerDragStart = (e: React.DragEvent, preset: TimerPreset) => {
    setDraggedTimer(preset);
    e.dataTransfer.effectAllowed = "copyMove";
    const payload = JSON.stringify({ type: "TIMER", minutes: preset.minutes });
    e.dataTransfer.setData("text/plain", payload);
    try {
      e.dataTransfer.setData("type", "TIMER");
      e.dataTransfer.setData("minutes", preset.minutes !== null ? preset.minutes.toString() : "0");
    } catch {}
  };

  // 3. Arrastrar Fecha desde el Toolbox
  const handleDateDragStart = (e: React.DragEvent, preset: DatePreset) => {
    setDraggedDate(preset);
    const range = preset.getDateRange();
    e.dataTransfer.effectAllowed = "copyMove";
    const payload = JSON.stringify({ type: "DATETIME", ...range });
    e.dataTransfer.setData("text/plain", payload);
    try {
      e.dataTransfer.setData("type", "DATETIME");
      e.dataTransfer.setData("dateStr", range.dateStr);
      e.dataTransfer.setData("startTime", range.startTime);
      e.dataTransfer.setData("endTime", range.endTime);
    } catch {}
  };

  // 4. Arrastrar Profesor desde el Toolbox
  const handleTeacherDragStart = (e: React.DragEvent, teacher: Teacher) => {
    setDraggedTeacher(teacher);
    e.dataTransfer.effectAllowed = "copyMove";
    const payload = JSON.stringify({ type: "TEACHER", rut: teacher.rut, teacherName: teacher.name });
    e.dataTransfer.setData("text/plain", payload);
    try {
      e.dataTransfer.setData("type", "TEACHER");
      e.dataTransfer.setData("rut", teacher.rut);
      e.dataTransfer.setData("teacherName", teacher.name);
    } catch {}
  };

  // 5. Arrastrar PIN dinámico desde el Toolbox
  const handlePinDragStart = (e: React.DragEvent) => {
    setDraggedPin(true);
    e.dataTransfer.effectAllowed = "copyMove";
    const payload = JSON.stringify({ type: "PIN", activate: true });
    e.dataTransfer.setData("text/plain", payload);
    try {
      e.dataTransfer.setData("type", "PIN");
      e.dataTransfer.setData("activate", "true");
    } catch {}
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  // ================= SOLTAR EN UN CURSO (INICIA MODO ENFOQUE) =================
  const handleCourseDrop = (e: React.DragEvent, course: Course) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCourseId(null);

    let examToAssign: Exam | null = draggedExam;

    if (!examToAssign) {
      try {
        const examIdStr = e.dataTransfer.getData("examId");
        if (examIdStr) {
          const id = parseInt(examIdStr, 10);
          examToAssign = exams.find(ex => ex.id === id) || null;
        }
      } catch {}
    }

    if (!examToAssign) {
      try {
        const raw = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/json");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.examId) {
            const id = parseInt(parsed.examId, 10);
            examToAssign = exams.find(ex => ex.id === id) || null;
          }
        }
      } catch {}
    }

    if (!examToAssign) return;

    setDraggedExam(null);
    startFocusMode(course, examToAssign);
  };

  // ================= SOLTAR DENTRO DEL MODO ENFOQUE (DROP ZONES) =================

  // Drop Cronómetro
  const handleTimerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(null);

    if (draggedTimer) {
      setStagedDuration(draggedTimer.minutes);
      setDraggedTimer(null);
      return;
    }

    try {
      const minStr = e.dataTransfer.getData("minutes");
      if (minStr) {
        const mins = parseInt(minStr, 10);
        setStagedDuration(mins > 0 ? mins : null);
        return;
      }
      const raw = e.dataTransfer.getData("text/plain");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.type === "TIMER") {
          setStagedDuration(parsed.minutes !== null ? Number(parsed.minutes) : null);
        }
      }
    } catch {}
  };

  // Drop Fecha/Horario
  const handleDateDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(null);

    if (draggedDate) {
      const r = draggedDate.getDateRange();
      setStagedDate(r.dateStr);
      setStagedStartTime(r.startTime);
      setStagedEndTime(r.endTime);
      setDraggedDate(null);
      return;
    }

    try {
      const d = e.dataTransfer.getData("dateStr");
      const st = e.dataTransfer.getData("startTime");
      const et = e.dataTransfer.getData("endTime");
      if (d) setStagedDate(d);
      if (st) setStagedStartTime(st);
      if (et) setStagedEndTime(et);
      if (!d) {
        const raw = e.dataTransfer.getData("text/plain");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.type === "DATETIME") {
            if (parsed.dateStr) setStagedDate(parsed.dateStr);
            if (parsed.startTime) setStagedStartTime(parsed.startTime);
            if (parsed.endTime) setStagedEndTime(parsed.endTime);
          }
        }
      }
    } catch {}
  };

  // Drop Profesor
  const handleTeacherDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(null);

    if (draggedTeacher) {
      setStagedTeacher(draggedTeacher);
      setDraggedTeacher(null);
      return;
    }

    try {
      const rut = e.dataTransfer.getData("rut");
      let teacher = rut ? teachers.find(t => t.rut === rut) : null;
      if (!teacher) {
        const raw = e.dataTransfer.getData("text/plain");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.type === "TEACHER" && parsed.rut) {
            teacher = teachers.find(t => t.rut === parsed.rut) || null;
          }
        }
      }
      if (teacher) {
        setStagedTeacher(teacher);
      }
    } catch {}
  };

  // Drop PIN
  const handlePinDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(null);
    setStagedDynamicPinActive(true);
    setDraggedPin(false);
  };

  // ================= ASIGNACIÓN SOBRE ASIGNACIÓN EXISTENTE (DELEGAR PROFESOR) =================
  const handleAssignmentTeacherDrop = async (e: React.DragEvent, assignmentId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverAssignmentId(null);

    let rut = draggedTeacher?.rut;
    if (!rut) {
      try {
        rut = e.dataTransfer.getData("rut");
        if (!rut) {
          const raw = e.dataTransfer.getData("text/plain");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.type === "TEACHER" && parsed.rut) rut = parsed.rut;
          }
        }
      } catch {}
    }

    setDraggedTeacher(null);

    if (rut) {
      try {
        await apiFetch(`/admin/assignments/${assignmentId}/teacher`, {
          method: "PATCH",
          body: { assignedTeacherRut: rut }
        });
        loadData();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  // ================= GUARDAR ASIGNACIÓN EN MODO ENFOQUE =================
  const handleSaveFocusAssignment = async () => {
    if (!focusedCourse || !stagedExam) return;

    setIsSubmittingFocus(true);
    setFocusSuccessNotice(null);

    try {
      const opensAt = new Date(`${stagedDate}T${stagedStartTime}:00`);
      const closesAt = new Date(`${stagedDate}T${stagedEndTime}:00`);

      await apiFetch("/admin/assignments", {
        method: "POST",
        body: {
          examId: stagedExam.id,
          courseId: focusedCourse.id,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          assignedTeacherRut: stagedTeacher ? stagedTeacher.rut : null,
          durationMinutes: stagedDuration,
          dynamicPassword: stagedDynamicPinActive ? stagedDynamicPin : null,
          dynamicPasswordActive: stagedDynamicPinActive,
          applicationMode: stagedApplicationMode
        }
      });

      setFocusSuccessNotice(`¡Ensayo "${stagedExam.title}" asignado con éxito a ${formatCourseName(focusedCourse)}!`);
      await loadData();
      
      // Permanecer 1.5s mostrando feedback o permitir volver
      setTimeout(() => {
        setIsFocusMode(false);
        setFocusedCourse(null);
        setStagedExam(null);
      }, 1800);

    } catch (err: any) {
      alert(err.message || "Error al guardar la asignación");
    } finally {
      setIsSubmittingFocus(false);
    }
  };

  // Confirmar cambio de modalidad (Digital <-> Impreso)
  const handleConfirmModeChange = async () => {
    if (!modeChangeTarget) return;
    setIsChangingMode(true);
    try {
      await apiFetch(`/admin/assignments/${modeChangeTarget.assignment.id}/mode`, {
        method: "PATCH",
        body: { applicationMode: modeChangeTarget.newMode }
      });
      await loadData();
      setModeChangeTarget(null);
    } catch (err: any) {
      alert(err.message || "Error al cambiar la modalidad");
    } finally {
      setIsChangingMode(false);
    }
  };

  // Cancelar Modo Enfoque y volver a ver todos los cursos
  const handleExitFocusMode = () => {
    setIsFocusMode(false);
    setFocusedCourse(null);
    setStagedExam(null);
    setFocusSuccessNotice(null);
  };

  // Eliminar asignación
  const handleDelete = async (id: number) => {
    if (!confirm("¿Seguro que quieres eliminar esta asignación?")) return;
    try {
      await apiFetch(`/admin/assignments/${id}`, { method: "DELETE" });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Importar Excel masivo
  const handleImportAssignments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const res = await fetch("/api/admin/assignments/import", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getToken()}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al importar asignaciones");

      alert(`Asignaciones procesadas: ${data.imported}. Errores: ${data.errors.length}`);
      setImportFile(null);
      setShowImportModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
    }
  };

  const getExamTypeBadge = (type: string) => {
    const t = (type || "ENSAYO").toUpperCase();
    if (t === "QUIZ") return <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">QUIZ</span>;
    if (t === "REMEDIAL") return <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">REMEDIAL</span>;
    if (t === "DIAGNOSTICO") return <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">DIAGNÓSTICO</span>;
    if (t === "ENSAYO_LARGO") return <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">EXTENDIDO</span>;
    return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">ENSAYO</span>;
  };

  if (loading) {
    return <div className="p-8 text-gray-500 animate-pulse font-medium">Cargando tablero interactivo de asignaciones...</div>;
  }

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-6 h-[calc(100vh-64px)] flex flex-col gap-4 overflow-hidden">
            
            {/* Cabecera y Herramientas Globales */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-gray-200">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Link href="/admin/dashboard" className="text-blue-600 hover:underline flex items-center gap-1 text-xs font-semibold">
                    <ArrowLeft className="w-3.5 h-3.5" /> Volver al Dashboard
                  </Link>
                  {isFocusMode && (
                    <>
                      <span className="text-gray-300">/</span>
                      <button 
                        onClick={handleExitFocusMode}
                        className="text-amber-700 hover:text-amber-800 font-bold text-xs flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Salir de Modo Enfoque
                      </button>
                    </>
                  )}
                </div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
                  Asignación y Programación de Evaluaciones
                  {isFocusMode && focusedCourse && (
                    <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-1 rounded-full font-bold">
                      Modo Enfoque: {formatCourseName(focusedCourse)}
                    </span>
                  )}
                </h1>
                <p className="text-xs text-gray-500">
                  {isFocusMode 
                    ? "Configura cronómetro, fecha, docente y PIN dinámico arrastrándolos a la mesa o usando los botones rápidos." 
                    : "Toma un ensayo de la izquierda y arrástralo sobre un curso para iniciar la mesa de configuración focalizada."}
                </p>
              </div>

              {/* Botones de acción global */}
              <div className="flex flex-wrap gap-2 items-center">
                
                {/* BOTÓN: BANDEJA REMEDIALES (CON CONTADORES DE PENDIENTES Y ALERTAS) */}
                <button
                  onClick={() => setShowRemedialModal(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all relative ${
                    pendingProposalsCount > 0 || activeAlertsCount > 0
                      ? "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200"
                      : "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300"
                  }`}
                  title="Bandeja Remediales: Revisión y aprobación de propuestas remediales y alertas de ensayos sin remedial"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Bandeja Remediales</span>
                  {pendingProposalsCount > 0 && (
                    <span className="bg-white text-amber-900 px-1.5 py-0.5 rounded-full text-[10px] font-black shadow-xs">
                      {pendingProposalsCount} pend.
                    </span>
                  )}
                  {activeAlertsCount > 0 && (
                    <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-black shadow-xs">
                      {activeAlertsCount} alerta{activeAlertsCount > 1 ? "s" : ""}
                    </span>
                  )}
                </button>

                {/* BOTÓN: MODAL ASIGNACIONES ACTIVAS (CON TAGS) */}
                <button
                  onClick={() => setShowActiveAssignmentsModal(true)}
                  className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors"
                  title="Ver y filtrar todas las asignaciones activas por etiquetas (tags)"
                >
                  <Layers className="w-3.5 h-3.5" /> 
                  <span>Asignaciones Activas</span>
                  <span className="bg-purple-800 text-purple-100 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                    {assignments.length}
                  </span>
                </button>

                <Link
                  href="/admin/calendar"
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors"
                  title="Ver Calendario SIMCE institucional"
                >
                  <Calendar className="w-3.5 h-3.5" /> 
                  <span>Calendario</span>
                </Link>

                <div className="h-5 w-px bg-gray-200 mx-0.5" />

                {/* BOTÓN: ASISTENTE DE PROMPTS IA (ICONO CON TOOLTIP) */}
                <button
                  type="button"
                  onClick={() => {
                    setAiPromptConfig({ mode: "EXAM_XLSX" });
                    setShowAiPromptModal(true);
                  }}
                  className="p-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg shadow-xs transition-all"
                  title="Asistente de Prompts para Agentes de IA (Excel, Remediales y Reportes)"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </button>

                {/* BOTÓN: IMPORTAR (.XLSX) (ICONO CON TOOLTIP) */}
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors"
                  title="Importar asignaciones desde Excel (.xlsx)"
                >
                  <Upload className="w-4 h-4" />
                </button>

                {/* BOTÓN: DESCARGAR PLANTILLA (.XLSX) (ICONO CON TOOLTIP) */}
                <a
                  href={`/api/admin/templates/assignments.xlsx?token=${typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : ""}`}
                  download="Formato_Asignaciones.xlsx"
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors inline-flex items-center"
                  title="Descargar plantilla Excel vacía (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                </a>

                {/* BOTÓN: EXPORTAR (.XLSX) (ICONO CON TOOLTIP) */}
                <button
                  type="button"
                  onClick={() => {
                    const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
                    window.location.href = `/api/admin/assignments/export.xlsx?token=${token}`;
                  }}
                  className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-colors"
                  title="Exportar todas las asignaciones a Excel (.xlsx)"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Barra de Filtros de Selección y Búsqueda */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center gap-3">
              {/* Buscador de Ensayo */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input 
                  type="text"
                  placeholder="Filtrar ensayo por título o número (#1, #2...)"
                  value={searchExam}
                  onChange={(e) => setSearchExam(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 hover:bg-gray-100/60 focus:bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                {searchExam && (
                  <button 
                    onClick={() => setSearchExam("")} 
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Filtro por Tipo de Ensayo */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-gray-500 uppercase">Tipo:</span>
                <select
                  value={examTypeFilter}
                  onChange={(e) => setExamTypeFilter(e.target.value)}
                  className="text-xs bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="TODOS">Todos los tipos</option>
                  <option value="ENSAYO">Ensayo SIMCE</option>
                  <option value="QUIZ">Quiz / Rápido</option>
                  <option value="REMEDIAL">Remedial</option>
                  <option value="DIAGNOSTICO">Diagnóstico</option>
                  <option value="ENSAYO_LARGO">Ensayo Largo</option>
                </select>
              </div>

              {/* Filtro por Asignatura / Materia */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-gray-500 uppercase">Materia:</span>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="text-xs bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="TODAS">Todas las materias</option>
                  {availableSubjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Filtro por Curso */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-gray-500 uppercase">Curso:</span>
                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="text-xs bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="TODOS">Todos los cursos</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id.toString()}>
                      {formatCourseName(c)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset filtros si hay alguno activo */}
              {(searchExam || examTypeFilter !== "TODOS" || subjectFilter !== "TODAS" || courseFilter !== "TODOS") && (
                <button
                  onClick={() => {
                    setSearchExam("");
                    setExamTypeFilter("TODOS");
                    setSubjectFilter("TODAS");
                    setCourseFilter("TODOS");
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Grilla Principal de 3 Columnas */}
            <div className="flex-1 grid grid-cols-12 gap-5 min-h-0 overflow-hidden">
              
              {/* ================= COLUMNA IZQUIERDA: BANCO DE ENSAYOS ================= */}
              <div className="col-span-3 bg-white border border-gray-200 rounded-2xl flex flex-col shadow-sm overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-gray-200 font-bold text-gray-800 text-xs flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    <span>Banco de Ensayos</span>
                  </div>
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    {filteredExams.length}
                  </span>
                </div>

                {/* Banner de Filtro Activo por Curso Preseleccionado */}
                {selectedCourseForFilter && (
                  <div className="bg-indigo-50 border-b border-indigo-200 p-3 flex items-start justify-between text-xs animate-in fade-in">
                    <div>
                      <div className="flex items-center gap-1.5 font-black text-indigo-950">
                        <Filter className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                        <span>Ensayos para {formatCourseName(selectedCourseForFilter)}</span>
                      </div>
                      <p className="text-[11px] text-indigo-800 font-medium mt-1 leading-snug">
                        Mostrando solo nivel <strong>{formatCourseLevel(selectedCourseForFilter.level)}</strong> pendientes por asignar.
                      </p>
                      <p className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                        ({alreadyAssignedToSelectedCourse.length} ya asignados este año)
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedCourseForFilter(null)}
                      className="text-[10px] font-extrabold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 px-2 py-1 rounded shadow-xs hover:bg-indigo-100 transition whitespace-nowrap ml-2"
                      title="Quitar filtro de curso y ver todos los ensayos"
                    >
                      ✕ Ver todos
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {filteredExams.map(e => (
                    <div 
                      key={e.id}
                      draggable
                      onDragStart={(evt) => handleExamDragStart(evt, e)}
                      onDragEnd={() => { setDraggedExam(null); setDragOverCourseId(null); }}
                      className={`bg-white border rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-blue-500 hover:shadow-md transition-all group select-none ${
                        stagedExam?.id === e.id && isFocusMode 
                          ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/40" 
                          : selectedCourseForFilter
                            ? "border-indigo-200 hover:border-indigo-500 hover:bg-indigo-50/30"
                            : "border-gray-200"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-[11px] font-black text-gray-400 group-hover:text-blue-600 transition">
                          #{e.orderNumber}
                        </span>
                        {getExamTypeBadge(e.examType)}
                      </div>
                      
                      <h3 className="font-bold text-gray-900 text-xs leading-snug line-clamp-2">
                        {e.title}
                      </h3>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-gray-500 font-medium pt-2 border-t border-gray-100">
                        <span>{e.subject} • {formatCourseLevel(e.level)}</span>
                        <span className="flex items-center text-gray-400 font-semibold text-[10px]">
                          ⏱️ {e.durationMinutes ? `${e.durationMinutes}m` : "90m"}
                        </span>
                      </div>

                      {/* Botón de Asignación Rápida si hay curso preseleccionado */}
                      {selectedCourseForFilter && (
                        <button
                          type="button"
                          onClick={() => startFocusMode(selectedCourseForFilter, e)}
                          className="mt-2.5 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-extrabold text-[11px] transition flex items-center justify-center gap-1 shadow-xs"
                        >
                          <span>Asignar a {formatCourseName(selectedCourseForFilter)}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}

                      {/* Si no hay curso preseleccionado: Botón con selector rápido */}
                      {!selectedCourseForFilter && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          {assigningExamId === e.id ? (
                            <div className="bg-slate-50 p-2 rounded-xl border border-indigo-200 space-y-1.5 animate-in fade-in zoom-in-95">
                              <div className="flex items-center justify-between text-[10px] font-black text-indigo-900">
                                <span>Selecciona el curso:</span>
                                <button
                                  type="button"
                                  onClick={(ev) => { ev.stopPropagation(); setAssigningExamId(null); }}
                                  className="text-gray-400 hover:text-gray-700 font-bold px-1"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto pt-0.5">
                                {visibleCourses.map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      startFocusMode(c, e);
                                    }}
                                    className="text-[10px] font-extrabold bg-white hover:bg-indigo-600 hover:text-white text-indigo-800 border border-indigo-200 rounded px-1.5 py-1 text-center truncate transition shadow-2xs"
                                    title={`Asignar este ensayo a ${formatCourseName(c)}`}
                                  >
                                    {formatCourseName(c)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1 text-[10px] text-gray-500">
                              <span className="italic text-[10px]">Arrastra a un curso o:</span>
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setAssigningExamId(e.id);
                                }}
                                className="font-extrabold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-md transition"
                              >
                                Asignar a...
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Estado si ya rindió todos los ensayos de ese nivel */}
                  {selectedCourseForFilter && filteredExams.length === 0 && (
                    <div className="text-center py-10 px-4 text-gray-500 bg-slate-50 rounded-xl border border-dashed border-gray-200">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs font-black text-gray-800">
                        ¡Al día con {formatCourseName(selectedCourseForFilter)}!
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                        Todos los ensayos de nivel <strong>{formatCourseLevel(selectedCourseForFilter.level)}</strong> ya fueron asignados o rendidos este año por este curso.
                      </p>
                      <button 
                        onClick={() => setSelectedCourseForFilter(null)}
                        className="mt-3 text-xs text-indigo-600 font-bold hover:underline"
                      >
                        Ver catálogo completo de ensayos
                      </button>
                    </div>
                  )}

                  {!selectedCourseForFilter && filteredExams.length === 0 && (
                    <div className="text-center py-8 px-4 text-gray-400">
                      <p className="text-xs font-semibold">No se encontraron evaluaciones con los filtros actuales.</p>
                      <button 
                        onClick={() => { setSearchExam(""); setExamTypeFilter("TODOS"); setSubjectFilter("TODAS"); setCourseFilter("TODOS"); }}
                        className="mt-2 text-xs text-blue-600 font-bold hover:underline"
                      >
                        Restablecer filtros
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ================= COLUMNA CENTRAL: ZONA DE CURSOS O MESA DE ENFOQUE ================= */}
              <div className="col-span-6 bg-slate-50/60 border border-slate-200 rounded-2xl flex flex-col shadow-sm overflow-hidden">
                
                {/* SI NO ESTAMOS EN MODO ENFOQUE: SE VEN TODOS LOS CURSOS */}
                {!isFocusMode && (
                  <>
                    <div className="p-3.5 bg-white border-b border-gray-200 font-bold text-gray-800 text-xs flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <span>Cursos Disponibles (Haz clic para filtrar ensayos o arrastra uno aquí)</span>
                      </div>
                      <span className="text-[11px] text-gray-400 font-medium">
                        {visibleCourses.length} cursos listados
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 gap-4 auto-rows-max">
                      {visibleCourses.map(c => {
                        const courseAssignments = assignments.filter(a => a.courseId === c.id);
                        const isSelectedCourse = selectedCourseForFilter?.id === c.id;
                        const isDragOverThisCourse = dragOverCourseId === c.id;

                        return (
                          <div 
                            key={c.id}
                            onClick={() => {
                              if (selectedCourseForFilter?.id === c.id) {
                                setSelectedCourseForFilter(null);
                              } else {
                                setSelectedCourseForFilter(c);
                              }
                            }}
                            onDragOver={(e) => {
                              allowDrop(e);
                              if (dragOverCourseId !== c.id) setDragOverCourseId(c.id);
                            }}
                            onDragEnter={(e) => {
                              allowDrop(e);
                              setDragOverCourseId(c.id);
                            }}
                            onDragLeave={(e) => {
                              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                              setDragOverCourseId(null);
                            }}
                            onDrop={(evt) => {
                              setDragOverCourseId(null);
                              handleCourseDrop(evt, c);
                            }}
                            className={`rounded-2xl p-5 transition-all flex flex-col items-center justify-center min-h-[160px] text-center group cursor-pointer shadow-sm hover:shadow relative ${
                              isDragOverThisCourse 
                                ? "bg-indigo-100 border-2 border-indigo-600 ring-4 ring-indigo-300 shadow-xl scale-[1.03] border-solid" 
                                : isSelectedCourse 
                                  ? "bg-indigo-50/90 border-2 border-indigo-600 ring-4 ring-indigo-200/80 shadow-md" 
                                  : draggedExam
                                    ? "bg-indigo-50/40 border-2 border-dashed border-indigo-400 hover:border-indigo-600 hover:bg-indigo-100/60"
                                    : "bg-white border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50/60"
                            }`}
                          >
                            {/* Overlay de Soltar Ensayo cuando se arrastra por encima */}
                            {isDragOverThisCourse && (
                              <div className="absolute inset-0 bg-indigo-700 text-white rounded-2xl flex flex-col items-center justify-center p-4 z-20 animate-in fade-in zoom-in-95 pointer-events-none shadow-2xl">
                                <Sparkles className="w-8 h-8 text-amber-300 mb-1.5 animate-bounce" />
                                <span className="font-black text-sm uppercase tracking-wide">¡Suelta para Asignar!</span>
                                <span className="text-[11px] text-indigo-200 font-medium mt-0.5">Configurar en {formatCourseName(c)}</span>
                              </div>
                            )}

                            {isSelectedCourse && !isDragOverThisCourse && (
                              <div className="absolute top-2.5 right-2.5 bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs pointer-events-none">
                                <Check className="w-2.5 h-2.5" /> Filtrando Ensayos
                              </div>
                            )}

                            <div className="flex flex-col items-center justify-center pointer-events-none select-none">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm mb-2 transition ${
                                isSelectedCourse 
                                  ? "bg-indigo-600 text-white" 
                                  : "bg-slate-100 group-hover:bg-blue-100 text-slate-700 group-hover:text-blue-700"
                              }`}>
                                <BookOpen className="w-5 h-5" />
                              </div>
                              <h3 className={`font-black text-xl transition ${
                                isSelectedCourse ? "text-indigo-950" : "text-gray-900 group-hover:text-blue-700"
                              }`}>
                                {formatCourseName(c)}
                              </h3>
                              <p className={`text-xs font-semibold mt-1 ${
                                isSelectedCourse ? "text-indigo-700" : "text-gray-500"
                              }`}>
                                {courseAssignments.length === 1 ? "1 asignación activa" : `${courseAssignments.length} asignaciones activas`}
                              </p>
                              <div className={`mt-3 inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition ${
                                isSelectedCourse 
                                  ? "bg-indigo-600 text-white shadow-xs" 
                                  : "text-blue-600 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white"
                              }`}>
                                <span>{isSelectedCourse ? "✓ Curso Activo (Soltar Ensayo)" : "Clic para Filtrar / Soltar Ensayo"}</span>
                                <ChevronRight className="w-3 h-3" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {visibleCourses.length === 0 && (
                        <div className="col-span-2 text-center py-12 text-gray-400">
                          No hay cursos para el año académico seleccionado ({selectedYear}).
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* SI ESTAMOS EN MODO ENFOQUE: DESAPARECEN TODOS LOS DEMÁS CURSOS */}
                {isFocusMode && focusedCourse && stagedExam && (
                  <div className="flex-1 flex flex-col overflow-hidden bg-white">
                    {/* Header del Modo Enfoque */}
                    <div className="p-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleExitFocusMode}
                          className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                          title="Volver a la vista de todos los cursos"
                        >
                          <ArrowLeft className="w-4 h-4" /> Todos los cursos
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-black tracking-tight">
                              Mesa de Asignación: {formatCourseName(focusedCourse)}
                            </h2>
                            {getExamTypeBadge(stagedExam.examType)}
                          </div>
                          <p className="text-xs text-blue-100 font-medium">
                            Ensayo: #{stagedExam.orderNumber} - {stagedExam.title} ({stagedExam.subject})
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={handleExitFocusMode}
                        className="text-white/70 hover:text-white p-1"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Mensaje de Confirmación Rápido */}
                    {focusSuccessNotice && (
                      <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 px-4 py-3 flex items-center gap-2 text-xs font-bold animate-in fade-in">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>{focusSuccessNotice}</span>
                      </div>
                    )}

                    {/* Contenido de la Mesa de Configuración (Drop Zones) */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
                      
                      {/* DROP ZONE 1: CRONÓMETRO */}
                      <div 
                        onDragOver={(e) => { allowDrop(e); setDragOverZone("TIMER"); }}
                        onDragLeave={() => setDragOverZone(null)}
                        onDrop={handleTimerDrop}
                        className={`border-2 rounded-2xl p-4 transition-all ${
                          dragOverZone === "TIMER" 
                            ? "border-blue-500 bg-blue-50 ring-4 ring-blue-100" 
                            : "border-slate-200 bg-white hover:border-blue-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 font-bold text-gray-800 text-xs">
                            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                              <Timer className="w-4 h-4" />
                            </div>
                            <span>1. Cronómetro & Duración de Rendición</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-semibold italic">
                            (Arrastra un cronómetro aquí o selecciona abajo)
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-gray-900">
                              {stagedDuration !== null ? `${stagedDuration} min` : "Tiempo Libre"}
                            </span>
                            <span className="text-xs text-gray-500 font-medium">
                              {stagedDuration !== null ? "(Cronómetro regresivo activo)" : "(Sin cuenta regresiva)"}
                            </span>
                          </div>

                          {/* Pills rápidas de tiempo */}
                          <div className="flex flex-wrap gap-1.5">
                            {TIMER_PRESETS.map(tp => (
                              <button
                                key={tp.label}
                                type="button"
                                onClick={() => setStagedDuration(tp.minutes)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                  stagedDuration === tp.minutes 
                                    ? "bg-blue-600 text-white shadow-sm" 
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                              >
                                {tp.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* DROP ZONE 2: FECHA Y HORARIO */}
                      <div 
                        onDragOver={(e) => { allowDrop(e); setDragOverZone("DATETIME"); }}
                        onDragLeave={() => setDragOverZone(null)}
                        onDrop={handleDateDrop}
                        className={`border-2 rounded-2xl p-4 transition-all ${
                          dragOverZone === "DATETIME" 
                            ? "border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100" 
                            : "border-slate-200 bg-white hover:border-indigo-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 font-bold text-gray-800 text-xs">
                            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <span>2. Fecha & Ventana de Rendición</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-semibold italic">
                            (Arrastra una fecha predefinida aquí)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-2 border-t border-slate-100">
                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Día de Aplicación</label>
                            <input 
                              type="date"
                              value={stagedDate}
                              onChange={(e) => setStagedDate(e.target.value)}
                              className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-2 font-semibold bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Hora Inicio</label>
                            <input 
                              type="time"
                              value={stagedStartTime}
                              onChange={(e) => setStagedStartTime(e.target.value)}
                              className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-2 font-semibold bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Hora Cierre</label>
                            <input 
                              type="time"
                              value={stagedEndTime}
                              onChange={(e) => setStagedEndTime(e.target.value)}
                              className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-2 font-semibold bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        {/* Botones de fechas rápidas */}
                        <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-dashed border-gray-200">
                          {DATE_PRESETS.map(dp => (
                            <button
                              key={dp.id}
                              type="button"
                              onClick={() => {
                                const r = dp.getDateRange();
                                setStagedDate(r.dateStr);
                                setStagedStartTime(r.startTime);
                                setStagedEndTime(r.endTime);
                              }}
                              className="text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 px-2.5 py-1 rounded-md text-gray-600 transition"
                            >
                              {dp.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* DROP ZONE 3: PROFESOR ENCARGADO */}
                      <div 
                        onDragOver={(e) => { allowDrop(e); setDragOverZone("TEACHER"); }}
                        onDragLeave={() => setDragOverZone(null)}
                        onDrop={handleTeacherDrop}
                        className={`border-2 rounded-2xl p-4 transition-all ${
                          dragOverZone === "TEACHER" 
                            ? "border-purple-500 bg-purple-50 ring-4 ring-purple-100" 
                            : "border-slate-200 bg-white hover:border-purple-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 font-bold text-gray-800 text-xs">
                            <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                              <User className="w-4 h-4" />
                            </div>
                            <span>3. Docente Responsable / Aplicador</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-semibold italic">
                            (Arrastra un profesor desde la derecha)
                          </span>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                          {stagedTeacher ? (
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs">
                                {stagedTeacher.name.charAt(0)}
                              </div>
                              <div>
                                <h4 className="font-bold text-gray-900 text-xs">{stagedTeacher.name}</h4>
                                <p className="text-[10px] text-gray-500 font-medium">RUT: {stagedTeacher.rut}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 italic flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-300" />
                              <span>Sin docente asignado (Arrastra un docente aquí o déjalo sin asignar)</span>
                            </div>
                          )}

                          {stagedTeacher && (
                            <button
                              type="button"
                              onClick={() => setStagedTeacher(null)}
                              className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-100 transition"
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>

                      {/* DROP ZONE 4 / CONFIGURACIÓN: CLAVE DINÁMICA / PIN DE CLASE */}
                      <div 
                        onDragOver={(e) => { allowDrop(e); setDragOverZone("PIN"); }}
                        onDragLeave={() => setDragOverZone(null)}
                        onDrop={handlePinDrop}
                        className={`border-2 rounded-2xl p-4 transition-all ${
                          dragOverZone === "PIN" 
                            ? "border-amber-500 bg-amber-50 ring-4 ring-amber-100" 
                            : "border-slate-200 bg-white hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 font-bold text-gray-800 text-xs">
                            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                              <KeyRound className="w-4 h-4" />
                            </div>
                            <span>4. Clave Temporal / PIN Dinámico de Clase</span>
                          </div>
                          
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={stagedDynamicPinActive}
                              onChange={(e) => setStagedDynamicPinActive(e.target.checked)}
                              className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                            />
                            <span className="text-xs font-bold text-gray-700">Activar PIN</span>
                          </label>
                        </div>

                        {stagedDynamicPinActive ? (
                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-3">
                            <input 
                              type="text"
                              value={stagedDynamicPin}
                              onChange={(e) => setStagedDynamicPin(e.target.value.toUpperCase())}
                              placeholder="Código PIN (ej. SIMCE4A)"
                              className="font-mono text-sm tracking-widest font-black uppercase border border-amber-300 bg-amber-50/50 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            <p className="text-[11px] text-gray-500">
                              Los estudiantes podrán iniciar sesión en este ensayo usando este código maestro de clase.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400 mt-2 pt-1 border-t border-slate-100">
                            Arrastra la ficha de PIN desde el toolbox o marca la casilla para que los alumnos ingresen con clave de curso.
                          </p>
                        )}
                      </div>

                      {/* DROP ZONE 5 / CONFIGURACIÓN: MODALIDAD DE RENDICIÓN */}
                      <div className="border-2 rounded-2xl p-4 transition-all border-slate-200 bg-white hover:border-emerald-300">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 font-bold text-gray-800 text-xs">
                            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                              <FileText className="w-4 h-4" />
                            </div>
                            <span>5. Modalidad de Rendición de la Evaluación</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-semibold italic">
                            (Selecciona el formato de aplicación)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-2 border-t border-slate-100">
                          {/* Opción Digital */}
                          <div
                            onClick={() => setStagedApplicationMode("DIGITAL")}
                            className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                              stagedApplicationMode === "DIGITAL"
                                ? "border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-100"
                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className={`p-2 rounded-lg shrink-0 ${
                              stagedApplicationMode === "DIGITAL" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
                            }`}>
                              <Monitor className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-900">💻 Modalidad Digital (Online)</span>
                                {stagedApplicationMode === "DIGITAL" && (
                                  <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Activo</span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                                Los estudiantes rinden directamente desde sus computadores o tablets en la plataforma web.
                              </p>
                            </div>
                          </div>

                          {/* Opción Impresa */}
                          <div
                            onClick={() => setStagedApplicationMode("PRINTED")}
                            className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                              stagedApplicationMode === "PRINTED"
                                ? "border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-100"
                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className={`p-2 rounded-lg shrink-0 ${
                              stagedApplicationMode === "PRINTED" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-500"
                            }`}>
                              <Printer className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-900">📄 Modalidad Impresa (Papel / OMR)</span>
                                {stagedApplicationMode === "PRINTED" && (
                                  <span className="bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Activo</span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                                Los alumnos responden en hoja impresa personalizada con código QR. Podrás escanearlas o subir un PDF multipágina con las respuestas.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Footer con Botones de Confirmación */}
                    <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={handleExitFocusMode}
                        className="px-4 py-2.5 border border-gray-300 hover:bg-gray-50 rounded-xl text-gray-700 font-bold text-xs transition"
                      >
                        Cancelar y Volver
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveFocusAssignment}
                        disabled={isSubmittingFocus}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-black text-xs shadow-md transition disabled:opacity-50"
                      >
                        {isSubmittingFocus ? (
                          <span>Guardando Asignación...</span>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Confirmar y Guardar Asignación</span>
                          </>
                        )}
                      </button>
                    </div>

                  </div>
                )}

              </div>

              {/* ================= COLUMNA DERECHA: TOOLBOX Y ASIGNACIONES ================= */}
              <div className="col-span-3 flex flex-col gap-4 min-h-0 overflow-hidden">
                
                {/* SI ESTAMOS EN MODO ENFOQUE: PALETA DE HERRAMIENTAS ARRASTRABLES (CRONÓMETRO, FECHA, DOCENTES, PIN) */}
                {isFocusMode && (
                  <div className="bg-white border border-gray-200 rounded-2xl flex-1 flex flex-col shadow-sm overflow-hidden">
                    <div className="p-3 bg-slate-50 border-b border-gray-200 font-bold text-gray-800 text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>Fichas Arrastrables (Toolbox)</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-4">
                      
                      {/* FICHAS DE CRONÓMETRO */}
                      <div>
                        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Timer className="w-3.5 h-3.5 text-blue-500" /> Fichas de Cronómetro
                        </div>
                        <div className="space-y-1.5">
                          {TIMER_PRESETS.map(tp => (
                            <div
                              key={tp.label}
                              draggable
                              onDragStart={(evt) => handleTimerDragStart(evt, tp)}
                              className="bg-slate-50 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg p-2 flex items-center justify-between cursor-grab active:cursor-grabbing transition text-xs select-none"
                            >
                              <div className="flex items-center gap-2">
                                <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                                <div>
                                  <span className="font-bold text-gray-800">{tp.label}</span>
                                  <span className="text-[10px] text-gray-400 ml-1.5 font-medium">({tp.badge})</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setStagedDuration(tp.minutes)}
                                className="text-[10px] font-bold text-blue-600 bg-white border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-600 hover:text-white transition"
                              >
                                Aplicar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* FICHAS DE AGENDA Y FECHA */}
                      <div>
                        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-indigo-500" /> Fichas de Agenda
                        </div>
                        <div className="space-y-1.5">
                          {DATE_PRESETS.map(dp => (
                            <div
                              key={dp.id}
                              draggable
                              onDragStart={(evt) => handleDateDragStart(evt, dp)}
                              className="bg-slate-50 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg p-2 flex items-center justify-between cursor-grab active:cursor-grabbing transition text-xs select-none"
                            >
                              <div className="flex items-center gap-2">
                                <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                                <div>
                                  <div className="font-bold text-gray-800 leading-tight">{dp.label}</div>
                                  <div className="text-[9px] text-gray-400">{dp.sublabel}</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const r = dp.getDateRange();
                                  setStagedDate(r.dateStr);
                                  setStagedStartTime(r.startTime);
                                  setStagedEndTime(r.endTime);
                                }}
                                className="text-[10px] font-bold text-indigo-600 bg-white border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-600 hover:text-white transition"
                              >
                                Aplicar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* FICHAS DE DOCENTES */}
                      <div>
                        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-purple-500" /> Profesores</span>
                          <span className="text-[10px] text-gray-400">{filteredTeachers.length}</span>
                        </div>
                        <input 
                          type="text" 
                          placeholder="Buscar profesor..." 
                          value={searchTeacher}
                          onChange={(e) => setSearchTeacher(e.target.value)}
                          className="w-full text-[11px] px-2.5 py-1 mb-2 border border-gray-200 rounded-md bg-gray-50 focus:bg-white outline-none"
                        />
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {filteredTeachers.map(t => (
                            <div
                              key={t.rut}
                              draggable
                              onDragStart={(evt) => handleTeacherDragStart(evt, t)}
                              className="bg-slate-50 border border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 rounded-lg p-1.5 flex items-center justify-between cursor-grab active:cursor-grabbing transition text-xs select-none"
                            >
                              <div className="flex items-center gap-1.5">
                                <GripVertical className="w-3 h-3 text-gray-300" />
                                <div className="leading-tight">
                                  <span className="font-bold text-gray-800 text-[11px] block">{t.name}</span>
                                  <span className="text-[9px] text-gray-400">{t.rut}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setStagedTeacher(t)}
                                className="text-[9px] font-bold text-purple-600 bg-white border border-purple-200 px-1.5 py-0.5 rounded hover:bg-purple-600 hover:text-white transition"
                              >
                                Asignar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* FICHA DE PIN DINÁMICO */}
                      <div>
                        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <KeyRound className="w-3.5 h-3.5 text-amber-500" /> PIN Dinámico
                        </div>
                        <div
                          draggable
                          onDragStart={handlePinDragStart}
                          className="bg-amber-50/60 border border-amber-200 hover:border-amber-400 rounded-lg p-2.5 flex items-center justify-between cursor-grab active:cursor-grabbing transition text-xs select-none"
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-3.5 h-3.5 text-amber-400" />
                            <div>
                              <div className="font-bold text-amber-900 leading-tight">Activar PIN de Clase</div>
                              <div className="text-[10px] text-amber-700">Permite ingreso libre</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setStagedDynamicPinActive(!stagedDynamicPinActive)}
                            className="text-[10px] font-bold text-amber-700 bg-white border border-amber-300 px-2 py-0.5 rounded hover:bg-amber-600 hover:text-white transition"
                          >
                            {stagedDynamicPinActive ? "Activo" : "Activar"}
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* SI NO ESTAMOS EN MODO ENFOQUE: ASIGNACIONES ACTIVAS Y LISTA GENERAL DE DOCENTES */}
                {!isFocusMode && (
                  <>
                    {/* Lista de Asignaciones Activas en Panel Lateral */}
                    <div className="bg-white border border-gray-200 rounded-2xl flex-1 flex flex-col shadow-sm overflow-hidden min-h-0">
                      <div className="p-3 bg-slate-50 border-b border-gray-200 font-bold text-gray-800 text-xs flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-purple-600" />
                          <span>Asignaciones Activas</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setShowActiveAssignmentsModal(true)}
                            className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200 transition"
                            title="Abrir vista detallada y filtrar por tags"
                          >
                            Filtrar por Tags
                          </button>
                          <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {assignments.length}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                        {assignments.map(a => {
                          const isDragOverAssignment = dragOverAssignmentId === a.id;
                          return (
                          <div 
                            key={a.id}
                            onDragOver={(e) => {
                              allowDrop(e);
                              if (dragOverAssignmentId !== a.id) setDragOverAssignmentId(a.id);
                            }}
                            onDragEnter={(e) => {
                              allowDrop(e);
                              setDragOverAssignmentId(a.id);
                            }}
                            onDragLeave={(e) => {
                              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                              setDragOverAssignmentId(null);
                            }}
                            onDrop={(evt) => handleAssignmentTeacherDrop(evt, a.id)}
                            className={`border-l-4 border-l-indigo-600 rounded-xl p-3 shadow-sm hover:shadow transition relative ${
                              isDragOverAssignment
                                ? "bg-purple-100 border-2 border-purple-500 ring-2 ring-purple-200"
                                : "bg-white border border-gray-200"
                            }`}
                          >
                            <div className="flex justify-between items-start mb-1.5">
                              <div className="flex gap-1.5 items-center flex-wrap">
                                <span className="bg-slate-100 text-slate-800 font-black px-2 py-0.5 rounded text-[10px] uppercase">
                                  {formatCourseName(a.Course)}
                                </span>
                                {a.Exam?.examType && getExamTypeBadge(a.Exam.examType)}
                                {a.applicationMode === "PRINTED" ? (
                                  <button
                                    type="button"
                                    onClick={() => setModeChangeTarget({ assignment: a, newMode: "DIGITAL" })}
                                    className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 transition"
                                    title="Modalidad Impresa (Papel/OMR). Clic para cambiar a Digital"
                                  >
                                    <Printer className="w-2.5 h-2.5 text-emerald-700" /> Papel
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setModeChangeTarget({ assignment: a, newMode: "PRINTED" })}
                                    className="bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 transition"
                                    title="Modalidad Digital (Online). Clic para cambiar a Impreso"
                                  >
                                    <Monitor className="w-2.5 h-2.5 text-blue-700" /> Digital
                                  </button>
                                )}
                              </div>
                              <button 
                                onClick={() => handleDelete(a.id)} 
                                className="text-gray-400 hover:text-rose-600 p-0.5 rounded transition"
                                title="Eliminar asignación"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            
                            <h4 className="font-bold text-gray-900 text-xs leading-snug mb-1" title={a.Exam?.title}>
                              {a.Exam?.title}
                            </h4>
                            
                            <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3 text-gray-400" />
                              <span>{new Date(a.opensAt).toLocaleDateString()} ({new Date(a.opensAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(a.closesAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-dashed border-gray-100 flex items-center justify-between gap-2">
                              {a.assignedTeacher ? (
                                <div className="flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded truncate">
                                  <Check className="w-3 h-3 mr-1 text-emerald-600 shrink-0" /> {a.assignedTeacher.name}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center text-[10px] font-medium text-gray-400 italic bg-gray-50 border border-dashed border-gray-200 rounded py-1 px-2">
                                  Arrastra docente
                                </div>
                              )}

                              <div className="flex items-center gap-1 shrink-0">
                                <Link
                                  href={`/teacher/assignments/${a.id}/print-sheets`}
                                  target="_blank"
                                  className="text-gray-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50 transition"
                                  title="Imprimir hojas de respuestas (PDF)"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setOmrScanAssignmentId(a.id)}
                                  className="text-gray-400 hover:text-emerald-600 p-1 rounded hover:bg-emerald-50 transition"
                                  title="Escanear OMR / Subir PDF de respuestas"
                                >
                                  <ScanLine className="w-3.5 h-3.5" />
                                </button>
                                <Link
                                  href={`/teacher/assignments/${a.id}`}
                                  target="_blank"
                                  className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition"
                                  title="Digitalizar respuestas / Ver curso"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                        {assignments.length === 0 && (
                          <div className="text-center py-8 text-gray-400 text-xs font-semibold">
                            No hay evaluaciones programadas para este año.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Profesores Arrastrables en Modo Normal */}
                    <div className="bg-white border border-gray-200 rounded-2xl h-44 flex flex-col shadow-sm overflow-hidden">
                      <div className="p-2.5 bg-slate-50 border-b border-gray-200 font-bold text-gray-800 text-xs flex justify-between items-center">
                        <span>Docentes (Arrastrar para delegar)</span>
                        <span className="text-[10px] text-gray-400">{teachers.length}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                        {teachers.map(t => (
                          <div 
                            key={t.rut}
                            draggable
                            onDragStart={(evt) => handleTeacherDragStart(evt, t)}
                            onDragEnd={() => { setDraggedTeacher(null); setDragOverAssignmentId(null); }}
                            className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex items-center gap-2 cursor-grab active:cursor-grabbing hover:border-purple-400 hover:bg-purple-50/50 transition-colors select-none"
                          >
                            <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                            <User className="w-3.5 h-3.5 text-purple-600" />
                            <div className="leading-tight">
                              <p className="text-[11px] font-bold text-gray-800">{t.name}</p>
                              <p className="text-[9px] text-gray-400">{t.rut}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

              </div>

            </div>

          </div>

          {/* ================= MODAL ASIGNACIONES ACTIVAS (FILTRO POR TAGS) ================= */}
          {showActiveAssignmentsModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                
                {/* Header del Modal */}
                <div className="p-5 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white/10 backdrop-blur-sm text-purple-200">
                      <Layers className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-black tracking-tight">Asignaciones Activas</h2>
                        <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
                          {assignments.length} totales
                        </span>
                      </div>
                      <p className="text-xs text-purple-200 mt-0.5">
                        Explora todas las evaluaciones programadas y filtra con un clic por etiquetas (tags).
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowActiveAssignmentsModal(false)}
                    className="text-white/70 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Barra de Filtro por Tag y Búsqueda */}
                <div className="p-4 bg-slate-50 border-b border-gray-200 space-y-3">
                  
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input 
                        type="text"
                        placeholder="Filtrar por tag (#QUIZ, #HOY, #2M, #CON_PIN), curso o ensayo..."
                        value={tagFilterQuery}
                        onChange={(e) => setTagFilterQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 transition font-medium"
                      />
                      {tagFilterQuery && (
                        <button 
                          onClick={() => setTagFilterQuery("")} 
                          className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {(selectedTag !== "TODOS" || tagFilterQuery) && (
                      <button
                        onClick={() => { setSelectedTag("TODOS"); setTagFilterQuery(""); }}
                        className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-3 py-2 rounded-xl transition whitespace-nowrap"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </div>

                  {/* Nube de Tags Clickeables */}
                  <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pt-1">
                    <button
                      onClick={() => setSelectedTag("TODOS")}
                      className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg transition ${
                        selectedTag === "TODOS"
                          ? "bg-purple-700 text-white shadow-sm"
                          : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      #TODOS ({assignments.length})
                    </button>

                    {availableTagsList.map(([t, count]) => {
                      const isSelected = selectedTag === t;
                      return (
                        <button
                          key={t}
                          onClick={() => setSelectedTag(isSelected ? "TODOS" : t)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                            isSelected
                              ? "bg-purple-700 text-white shadow-sm ring-2 ring-purple-300"
                              : "bg-white border border-gray-200 text-purple-700 hover:border-purple-300 hover:bg-purple-50"
                          }`}
                        >
                          <span>{t}</span>
                          <span className={`text-[10px] font-extrabold px-1 rounded ${isSelected ? "bg-white/20 text-white" : "bg-purple-100 text-purple-800"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                </div>

                {/* Lista de Asignaciones en el Modal */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-100/50">
                  
                  {modalFilteredAssignments.length > 0 ? (
                    modalFilteredAssignments.map(a => {
                      const tags = getAssignmentTags(a);
                      const isExpanded = expandedActiveAssignments.has(a.id);
                      return (
                        <div 
                          key={a.id}
                          className={`bg-white border rounded-2xl shadow-xs transition-all overflow-hidden ${
                            isExpanded ? "border-purple-400 shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-xs"
                          }`}
                        >
                          {/* Fila Compacta Clicable */}
                          <div 
                            onClick={() => toggleActiveAssignmentExpand(a.id)}
                            className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none bg-white hover:bg-slate-50/70 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="bg-slate-900 text-white font-black text-xs px-2.5 py-1 rounded-lg shrink-0">
                                {formatCourseName(a.Course)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-black text-sm text-gray-900 truncate">
                                    {a.Exam?.title}
                                  </h3>
                                  <span className="text-gray-400 text-xs font-semibold shrink-0">
                                    #{a.Exam?.orderNumber}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                                  <span className="truncate">{a.Exam?.subject}</span>
                                  {a.Exam?.examType && (
                                    <>
                                      <span className="text-gray-300">•</span>
                                      {getExamTypeBadge(a.Exam.examType)}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {a.applicationMode === "PRINTED" ? (
                                <span className="font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                                  <Printer className="w-3 h-3 text-emerald-700" /> Papel (OMR)
                                </span>
                              ) : (
                                <span className="font-bold text-blue-800 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                                  <Monitor className="w-3 h-3 text-blue-700" /> Digital
                                </span>
                              )}

                              {a.dynamicPassword && a.dynamicPasswordActive && (
                                <span className="font-mono font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                                  PIN: {a.dynamicPassword}
                                </span>
                              )}
                              
                              <span className="hidden sm:inline-block text-[11px] text-gray-500 font-semibold bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                                {new Date(a.opensAt).toLocaleDateString()}
                              </span>

                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleDelete(a.id);
                                }}
                                className="text-gray-300 hover:text-rose-600 p-1.5 rounded-lg transition"
                                title="Eliminar asignación"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-md transition"
                                title={isExpanded ? "Colapsar detalles" : "Expandir detalles"}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-purple-600" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Detalles Expandidos */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-slate-50/50 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-3 rounded-xl border border-gray-100 text-xs">
                                <div className="flex items-center gap-2 text-gray-700">
                                  <Calendar className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                  <div>
                                    <span className="font-bold block">
                                      {new Date(a.opensAt).toLocaleDateString()}
                                    </span>
                                    <span className="text-[11px] text-gray-500">
                                      {new Date(a.opensAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(a.closesAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 text-gray-700">
                                  <User className="w-4 h-4 text-purple-600 flex-shrink-0" />
                                  <div>
                                    <span className="text-[10px] text-gray-400 uppercase font-bold block">Docente Aplicador</span>
                                    <span className="font-bold text-gray-900">
                                      {a.assignedTeacher ? a.assignedTeacher.name : <em className="text-amber-600 font-semibold">Sin docente</em>}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-gray-700">
                                  <div className="flex items-center gap-2">
                                    <KeyRound className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                    <div>
                                      <span className="text-[10px] text-gray-400 uppercase font-bold block">PIN Dinámico</span>
                                      {a.dynamicPassword && a.dynamicPasswordActive ? (
                                        <span className="font-mono font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[11px]">
                                          {a.dynamicPassword}
                                        </span>
                                      ) : (
                                        <span className="text-gray-400 font-medium">Inactivo</span>
                                      )}
                                    </div>
                                  </div>

                                  {a.dynamicPassword && a.dynamicPasswordActive && (
                                    <button
                                      type="button"
                                      onClick={() => copyPinToClipboard(a.dynamicPassword!, a.id)}
                                      className="text-[10px] font-bold text-amber-700 bg-white border border-amber-300 hover:bg-amber-50 px-2 py-1 rounded transition flex items-center gap-1"
                                      title="Copiar PIN"
                                    >
                                      {copiedPinId === a.id ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span className="text-emerald-700 font-bold">¡Copiado!</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3 text-amber-600" />
                                          <span>Copiar PIN</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Tarjeta Modalidad de Rendición */}
                              <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-gray-100 text-xs">
                                <div className="flex items-center gap-2.5">
                                  {a.applicationMode === "PRINTED" ? (
                                    <>
                                      <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                                        <Printer className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-gray-400 uppercase font-bold block">Modalidad Actual</span>
                                        <span className="font-bold text-emerald-800">📄 Formato Impreso (Papel / OMR)</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                                        <Monitor className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-gray-400 uppercase font-bold block">Modalidad Actual</span>
                                        <span className="font-bold text-blue-800">💻 Formato Digital (En Línea)</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setModeChangeTarget({
                                    assignment: a,
                                    newMode: a.applicationMode === "PRINTED" ? "DIGITAL" : "PRINTED"
                                  })}
                                  className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl transition"
                                >
                                  Cambiar a {a.applicationMode === "PRINTED" ? "Digital" : "Impreso"}
                                </button>
                              </div>

                              {/* Fila de Tags clickeables de la asignación */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-200/60">
                                <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Tags:</span>
                                {tags.map(t => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setSelectedTag(t)}
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${
                                      selectedTag === t
                                        ? "bg-purple-700 text-white shadow-sm"
                                        : "bg-white border border-slate-200 text-slate-600 hover:bg-purple-100 hover:text-purple-700"
                                    }`}
                                    title={`Filtrar por ${t}`}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>

                              {/* Barra de Acciones Rápidas OMR / Impresión */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200/60">
                                <span className="text-[10px] text-gray-500 font-medium">
                                  Hojas de respuestas y escaneo:
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    href={`/teacher/assignments/${a.id}/print-sheets`}
                                    target="_blank"
                                    className="text-[11px] font-bold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm transition"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-indigo-600" />
                                    Imprimir Hojas (PDF)
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => setOmrScanAssignmentId(a.id)}
                                    className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm transition"
                                  >
                                    <ScanLine className="w-3.5 h-3.5 text-emerald-600" />
                                    Escanear OMR / Subir PDF
                                  </button>
                                  <Link
                                    href={`/teacher/assignments/${a.id}`}
                                    target="_blank"
                                    className="text-[11px] font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm transition"
                                  >
                                    <ChevronRight className="w-3.5 h-3.5 text-blue-600" />
                                    Ver Curso
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400">
                      <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-gray-600">No hay asignaciones que coincidan con el tag seleccionado.</p>
                      <button
                        onClick={() => { setSelectedTag("TODOS"); setTagFilterQuery(""); }}
                        className="mt-3 text-xs text-purple-600 font-bold hover:underline"
                      >
                        Ver todas las asignaciones
                      </button>
                    </div>
                  )}

                </div>

                {/* Footer del Modal */}
                <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">
                    Mostrando <strong>{modalFilteredAssignments.length}</strong> de {assignments.length} asignaciones activas
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
                        window.location.href = `/api/admin/assignments/export.xlsx?token=${token}`;
                      }}
                      className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> Exportar a Excel
                    </button>
                    
                    <button
                      onClick={() => setShowActiveAssignmentsModal(false)}
                      className="text-xs font-bold text-gray-700 hover:bg-gray-100 border border-gray-300 px-4 py-1.5 rounded-xl transition"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ================= MODAL BANDEJA UTP: REMEDIALES Y ALERTAS ================= */}
          {showRemedialModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-50 rounded-2xl max-w-4xl w-full max-h-[90vh] shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                
                {/* Header del Modal */}
                <div className="p-5 border-b flex justify-between items-center bg-white">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-5 h-5 text-amber-700" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-gray-900 tracking-tight flex items-center gap-2">
                        Bandeja Remediales: Supervisión y Aprobación
                      </h2>
                      <p className="text-xs text-gray-500">
                        Aprueba propuestas pedagógicas de los docentes y audita ensayos rendidos sin plan remedial.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setShowRemedialModal(false); setRemedialSuccessNotice(null); }}
                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Subheader: Pestañas de Navegación */}
                <div className="px-5 pt-3 bg-white border-b border-gray-200 flex items-center gap-3">
                  <button
                    onClick={() => setRemedialModalTab("proposals")}
                    className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
                      remedialModalTab === "proposals"
                        ? "border-amber-600 text-amber-800"
                        : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    <Inbox className="w-4 h-4" />
                    <span>Propuestas de Docentes</span>
                    {pendingProposalsCount > 0 ? (
                      <span className="bg-amber-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black">
                        {pendingProposalsCount} pendiente{pendingProposalsCount > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {remedialProposals.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setRemedialModalTab("alerts")}
                    className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
                      remedialModalTab === "alerts"
                        ? "border-red-600 text-red-700"
                        : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>Alertas: Ensayos sin Remedial</span>
                    {activeAlertsCount > 0 ? (
                      <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black">
                        {activeAlertsCount} sin plan
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        0
                      </span>
                    )}
                  </button>
                </div>

                {/* Contenido scrolleable */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  
                  {/* Toast de Éxito si aplica */}
                  {remedialSuccessNotice && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>{remedialSuccessNotice}</span>
                      </div>
                      <button 
                        onClick={() => setRemedialSuccessNotice(null)}
                        className="text-emerald-700 hover:text-emerald-900"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* PESTAÑA 1: PROPUESTAS DE DOCENTES */}
                  {remedialModalTab === "proposals" && (
                    <div className="space-y-4">
                      
                      {/* Barra de Filtro de Estado */}
                      <div className="flex items-center justify-between gap-2 flex-wrap bg-white p-2.5 rounded-xl border border-gray-200">
                        <span className="text-[11px] font-black text-gray-500 uppercase tracking-wide">Filtrar por Estado:</span>
                        <div className="flex items-center gap-1.5">
                          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((st) => {
                            const labels = {
                              ALL: `Todas (${remedialProposals.length})`,
                              PENDING: `Pendientes (${pendingProposalsCount})`,
                              APPROVED: `Aprobadas (${remedialProposals.filter(p => p.status === "APPROVED").length})`,
                              REJECTED: `Rechazadas (${remedialProposals.filter(p => p.status === "REJECTED").length})`,
                            };
                            return (
                              <button
                                key={st}
                                onClick={() => setProposalStatusFilter(st)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                  proposalStatusFilter === st
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                              >
                                {labels[st]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Lista de Propuestas */}
                      {filteredProposals.length > 0 ? (
                        <div className="space-y-3">
                          {filteredProposals.map((prop) => {
                            const isPending = prop.status === "PENDING";
                            const isApproved = prop.status === "APPROVED";
                            const isRejected = prop.status === "REJECTED";
                            const isExpanded = expandedProposals.has(prop.id);

                            return (
                              <div 
                                key={prop.id} 
                                className={`bg-white border rounded-xl shadow-xs transition-all overflow-hidden ${
                                  isExpanded ? "border-amber-400 shadow-md" : "border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                {/* Cabecera Compacta Clicable */}
                                <div 
                                  onClick={() => toggleProposalExpand(prop.id)}
                                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none bg-white hover:bg-slate-50/70 transition-colors"
                                >
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <span className="bg-indigo-100 text-indigo-800 text-xs font-black px-2.5 py-0.5 rounded-md shrink-0">
                                      {prop.course ? `${formatCourseName(prop.course)} (${prop.course.year})` : "Curso"}
                                    </span>
                                    <span className="text-xs font-bold text-gray-700 flex items-center gap-1 truncate">
                                      <User className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                      <span className="truncate">{prop.teacher ? prop.teacher.name : prop.teacherRut}</span>
                                    </span>
                                    <span className="text-[11px] text-gray-400 hidden sm:inline-block">
                                      • {new Date(prop.suggestedDate).toLocaleDateString()} ({prop.startTime || "08:30"} hrs)
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {isPending && (
                                      <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full text-[11px] font-black flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-amber-600" /> Pendiente
                                      </span>
                                    )}
                                    {isApproved && (
                                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[11px] font-black flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Aprobada
                                      </span>
                                    )}
                                    {isRejected && (
                                      <span className="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full text-[11px] font-black flex items-center gap-1">
                                        <XCircle className="w-3 h-3 text-rose-600" /> Rechazada
                                      </span>
                                    )}

                                    {/* Botón Prompt IA directo en cabecera */}
                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        setAiPromptConfig({
                                          mode: "REMEDIAL",
                                          level: prop.course?.level,
                                          subject: prop.originAssignment?.exam?.subject,
                                          courseName: formatCourseName(prop.course),
                                          examTitle: prop.originAssignment?.exam?.title
                                        });
                                        setShowAiPromptModal(true);
                                      }}
                                      className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition"
                                      title="Generar prompt para este examen remedial con Agente IA"
                                    >
                                      <Bot className="w-4 h-4" />
                                    </button>

                                    <button
                                      type="button"
                                      className="text-gray-400 hover:text-gray-600 p-1 rounded-md transition"
                                      title={isExpanded ? "Colapsar propuesta" : "Expandir propuesta"}
                                    >
                                      {isExpanded ? (
                                        <ChevronUp className="w-4 h-4 text-amber-600" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* Contenido Expandido */}
                                {isExpanded && (
                                  <div className="p-4 border-t border-gray-100 bg-slate-50/50 space-y-3">
                                    {/* Contenido comparativo */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-3 rounded-xl border border-gray-100 text-xs">
                                      <div>
                                        <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                                          Ensayo SIMCE de Origen
                                        </span>
                                        <span className="font-bold text-gray-900 block">
                                          {prop.originAssignment?.exam?.title || "Ensayo"}
                                        </span>
                                        <span className="text-[11px] text-gray-500 font-semibold">
                                          {prop.originAssignment?.exam?.subject}
                                        </span>
                                      </div>

                                      <div>
                                        <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                                          Evaluación Remedial Propuesta
                                        </span>
                                        <span className="font-bold text-amber-900 block">
                                          {prop.remedialExam ? prop.remedialExam.title : "Remedial sugerida para el nivel"}
                                        </span>
                                        <span className="text-[11px] text-amber-700 font-semibold">
                                          {prop.remedialExam?.subject || prop.originAssignment?.exam?.subject}
                                        </span>
                                      </div>

                                      <div>
                                        <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">
                                          Horario Sugerido
                                        </span>
                                        <span className="font-bold text-gray-900 block flex items-center gap-1">
                                          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                          {new Date(prop.suggestedDate).toLocaleDateString()}
                                        </span>
                                        <span className="text-[11px] text-gray-500 font-semibold">
                                          {prop.startTime || "08:30"} a {prop.endTime || "10:00"} hrs
                                        </span>
                                      </div>
                                    </div>

                                    {/* Notas / Justificación pedagógica del docente */}
                                    {prop.notes && (
                                      <div className="bg-amber-50/70 border border-amber-200/60 p-2.5 rounded-lg text-xs">
                                        <span className="font-bold text-amber-900 block mb-0.5 flex items-center gap-1">
                                          <MessageSquare className="w-3 h-3 text-amber-700" />
                                          Observación del Docente:
                                        </span>
                                        <p className="text-gray-700 italic">"{prop.notes}"</p>
                                      </div>
                                    )}

                                    {/* Feedback si ya fue resuelta */}
                                    {isApproved && (
                                      <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-xs text-emerald-900">
                                        <span className="font-bold block">
                                          ✓ Aprobada por UTP ({prop.reviewedByRut || "UTP"}). Asignación ID #{prop.createdAssignmentId}.
                                        </span>
                                        {prop.reviewNotes && <p className="text-emerald-700 mt-0.5">Nota: "{prop.reviewNotes}"</p>}
                                      </div>
                                    )}

                                    {isRejected && (
                                      <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-xs text-rose-900">
                                        <span className="font-bold block">
                                          ✕ Rechazada por UTP ({prop.reviewedByRut || "UTP"}):
                                        </span>
                                        <p className="text-rose-700 mt-0.5">Motivo: "{prop.reviewNotes || "Sin observaciones"}"</p>
                                      </div>
                                    )}

                                    {/* Barra de Acciones para UTP si está PENDING */}
                                    {isPending && (
                                      <div className="pt-2 border-t border-gray-200/60 flex flex-col sm:flex-row items-center justify-end gap-2">
                                        {rejectingProposalId === prop.id ? (
                                          <div className="w-full flex flex-col sm:flex-row items-center gap-2">
                                            <input
                                              type="text"
                                              placeholder="Indica el motivo de rechazo o fecha alternativa..."
                                              value={rejectReason}
                                              onChange={(e) => setRejectReason(e.target.value)}
                                              className="flex-1 text-xs border border-rose-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-rose-500 bg-rose-50/30"
                                            />
                                            <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                              <button
                                                type="button"
                                                disabled={processingProposalId === prop.id}
                                                onClick={() => handleRejectProposal(prop.id)}
                                                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                                              >
                                                Confirmar Rechazo
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => { setRejectingProposalId(null); setRejectReason(""); }}
                                                className="text-gray-600 hover:bg-gray-100 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-300"
                                              >
                                                Cancelar
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              disabled={processingProposalId === prop.id}
                                              onClick={() => { setRejectingProposalId(prop.id); setRejectReason(""); }}
                                              className="text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                                            >
                                              <XCircle className="w-3.5 h-3.5" /> Rechazar...
                                            </button>
                                            <button
                                              type="button"
                                              disabled={processingProposalId === prop.id}
                                              onClick={() => handleApproveProposal(prop)}
                                              className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                              {processingProposalId === prop.id ? (
                                                <span>Agendando...</span>
                                              ) : (
                                                <>
                                                  <CheckCircle2 className="w-3.5 h-3.5" /> Aprobar y Agendar en Curso
                                                </>
                                              )}
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400">
                          <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-xs font-bold text-gray-600">
                            No hay propuestas remediales registradas con el filtro actual.
                          </p>
                        </div>
                      )}

                    </div>
                  )}

                  {/* PESTAÑA 2: ALERTAS DE ENSAYOS SIN REMEDIAL */}
                  {remedialModalTab === "alerts" && (
                    <div className="space-y-4">
                      
                      {/* Banner de Explicación de la Alerta */}
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-900 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-black block">Protocolo de Alerta Temprana SIMCE</span>
                          <p className="text-red-700 mt-0.5">
                            Los siguientes ensayos ya fueron rendidos por los alumnos, pero NO cuentan con evaluación remedial ni propuesta pendiente registrada. El colegio requiere que todo ensayo rendido cuente con un plan de nivelación para los Objetivos de Aprendizaje descendidos.
                          </p>
                        </div>
                      </div>

                      {/* Lista de Alertas */}
                      {remedialAlerts.length > 0 ? (
                        <div className="space-y-3">
                          {remedialAlerts.map((alrt) => {
                            const isExpanded = expandedAlerts.has(alrt.assignmentId);
                            return (
                              <div 
                                key={alrt.assignmentId}
                                className={`bg-white border rounded-xl shadow-xs transition-all overflow-hidden ${
                                  isExpanded ? "border-red-400 shadow-md" : "border-red-200 hover:border-red-300"
                                }`}
                              >
                                {/* Fila Compacta Clicable */}
                                <div 
                                  onClick={() => toggleAlertExpand(alrt.assignmentId)}
                                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none bg-white hover:bg-red-50/30 transition-colors"
                                >
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <span className="bg-red-100 text-red-800 text-xs font-black px-2.5 py-0.5 rounded-md shrink-0">
                                      {alrt.courseName} ({alrt.year})
                                    </span>
                                    <h3 className="font-black text-sm text-gray-900 truncate">
                                      {alrt.examTitle}
                                    </h3>
                                    <span className="text-xs text-gray-500 font-semibold hidden sm:inline-block">
                                      • {alrt.subject}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                      {alrt.submissionsCount} entregas
                                    </span>

                                    {/* Botón Prompt IA */}
                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        setAiPromptConfig({
                                          mode: "REMEDIAL",
                                          level: alrt.level,
                                          subject: alrt.subject,
                                          courseName: alrt.courseName,
                                          examTitle: alrt.examTitle
                                        });
                                        setShowAiPromptModal(true);
                                      }}
                                      className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition"
                                      title="Generar prompt para crear remedial con Agente IA"
                                    >
                                      <Bot className="w-4 h-4" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        handleScheduleRemedialFromAlert(alrt);
                                      }}
                                      className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg shadow-xs transition flex items-center gap-1"
                                      title="Programar evaluación remedial en este curso"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">Programar</span>
                                    </button>

                                    <button
                                      type="button"
                                      className="text-gray-400 hover:text-gray-600 p-1 rounded-md transition"
                                      title={isExpanded ? "Colapsar alerta" : "Expandir alerta"}
                                    >
                                      {isExpanded ? (
                                        <ChevronUp className="w-4 h-4 text-red-600" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* Contenido Expandido */}
                                {isExpanded && (
                                  <div className="p-4 border-t border-gray-100 bg-red-50/20 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-red-100 text-xs text-gray-700">
                                      <div className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5 text-purple-600" />
                                        <span>Docente Responsable: <strong>{alrt.teacherName}</strong></span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Rendida el: <strong>{new Date(alrt.opensAt).toLocaleDateString()}</strong></span>
                                      </div>
                                    </div>

                                    <p className="text-xs text-red-700 font-medium">
                                      {alrt.alertMessage}
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-white rounded-2xl border border-emerald-200 text-emerald-800">
                          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                          <h4 className="font-black text-sm">¡Excelente cumplimiento pedagógico!</h4>
                          <p className="text-xs text-emerald-700 mt-1 max-w-md mx-auto">
                            Todos los ensayos rendidos cuentan con su propuesta o evaluación remedial programada.
                          </p>
                        </div>
                      )}

                    </div>
                  )}

                </div>

                {/* Footer del Modal */}
                <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">
                    {remedialProposals.length} propuestas registradas • {activeAlertsCount} alertas activas
                  </span>
                  <button
                    onClick={() => { setShowRemedialModal(false); setRemedialSuccessNotice(null); }}
                    className="text-xs font-bold text-gray-700 hover:bg-gray-100 border border-gray-300 px-4 py-1.5 rounded-xl transition"
                  >
                    Cerrar
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* Modal Carga Masiva de Asignaciones */}
          {showImportModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                    <h2 className="text-base font-bold text-gray-900">Importar Asignaciones Masivas</h2>
                  </div>
                  <button 
                    onClick={() => setShowImportModal(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleImportAssignments} className="p-6 space-y-4">
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Sube una planilla en formato <strong>.xlsx</strong> o <strong>.csv</strong> con las columnas: 
                    <span className="font-mono bg-gray-100 px-1.5 py-1 rounded text-[11px] block mt-1.5 border border-gray-200">
                      IdEnsayo, Nivel, Letra, RutProfesor, FechaApertura, FechaCierre
                    </span>
                  </p>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Archivo Excel o CSV</label>
                    <input 
                      type="file" 
                      accept=".xlsx,.csv" 
                      required
                      onChange={e => setImportFile(e.target.files?.[0] || null)}
                      className="w-full text-xs border rounded-lg p-2 bg-white"
                    />
                  </div>

                  <div className="pt-1 flex items-center justify-between text-xs">
                    <span className="text-gray-500">¿No tienes el formato?</span>
                    <a
                      href={`/api/admin/templates/assignments.xlsx?token=${typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : ""}`}
                      download="Formato_Asignaciones.xlsx"
                      className="text-blue-600 hover:underline font-semibold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" /> Descargar Formato Vacío (.xlsx)
                    </a>
                  </div>

                  <div className="flex gap-3 pt-3">
                    <button 
                      type="button" 
                      onClick={() => setShowImportModal(false)}
                      className="flex-1 px-4 py-2.5 border rounded-lg text-gray-700 font-semibold hover:bg-gray-50 text-xs"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      disabled={!importFile || importing}
                      className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm text-xs disabled:opacity-50"
                    >
                      {importing ? "Importando..." : "Cargar y Asignar"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Asistente Prompts IA */}
          <AiPromptModal
            isOpen={showAiPromptModal}
            onClose={() => setShowAiPromptModal(false)}
            defaultMode={aiPromptConfig.mode}
            initialLevel={aiPromptConfig.level}
            initialSubject={aiPromptConfig.subject}
            initialCourseName={aiPromptConfig.courseName}
            initialExamTitle={aiPromptConfig.examTitle}
            initialDescendedOa={aiPromptConfig.targetOa}
          />

          {/* Modal Pop-up de Confirmación para Cambiar Modalidad (Digital vs Impreso) */}
          {modeChangeTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${
                    modeChangeTarget.newMode === "PRINTED" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {modeChangeTarget.newMode === "PRINTED" ? <Printer className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">
                      Cambiar Modalidad de Rendición
                    </h3>
                    <p className="text-xs text-gray-500">
                      {formatCourseName(modeChangeTarget.assignment.Course)} • {modeChangeTarget.assignment.Exam?.title}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-gray-700 space-y-2">
                  <p>
                    ¿Estás seguro de cambiar esta evaluación a modalidad{" "}
                    <strong className={modeChangeTarget.newMode === "PRINTED" ? "text-emerald-700 font-bold" : "text-blue-700 font-bold"}>
                      {modeChangeTarget.newMode === "PRINTED" ? "IMPRESA (Papel / OMR)" : "DIGITAL (En línea)"}
                    </strong>?
                  </p>
                  {modeChangeTarget.newMode === "PRINTED" ? (
                    <p className="text-gray-500">
                      Los alumnos no podrán rendir la prueba en línea por su cuenta. Podrás imprimir sus hojas de respuestas personalizadas con código QR y escanearlas o subir un PDF multipágina con las respuestas.
                    </p>
                  ) : (
                    <p className="text-gray-500">
                      Los alumnos podrán ingresar y rendir la prueba de forma interactiva en la plataforma web dentro de la fecha y hora programadas.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModeChangeTarget(null)}
                    disabled={isChangingMode}
                    className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-bold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmModeChange}
                    disabled={isChangingMode}
                    className={`px-5 py-2 rounded-xl text-white text-xs font-black shadow-sm transition disabled:opacity-50 flex items-center gap-2 ${
                      modeChangeTarget.newMode === "PRINTED"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {isChangingMode ? (
                      <span>Guardando...</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Confirmar Cambio</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Escáner OMR Directo para Administradores */}
          {omrScanAssignmentId !== null && (
            <OmrScannerModal
              assignmentId={omrScanAssignmentId}
              isOpen={true}
              onClose={() => setOmrScanAssignmentId(null)}
              onSuccess={() => {
                loadData();
                setOmrScanAssignmentId(null);
              }}
            />
          )}

        </AppShell>
      )}
    </RequireRole>
  );
}
