"use client";

import { useEffect, useState, useMemo } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { useSchoolYear } from "@/context/SchoolYearContext";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Plus, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  RotateCcw, 
  Ban, 
  Flag, 
  Filter, 
  School,
  CalendarDays,
  Sparkles
} from "lucide-react";

type Assignment = {
  id: number;
  examId: number;
  courseId: number;
  opensAt: string;
  closesAt: string;
  status?: string;
  originalOpensAt?: string | null;
  cancelReason?: string | null;
  released?: boolean;
  Exam?: { title: string; subject: string };
  Course?: { id: number; level: string; letter: string; year: number };
};

type SimceMilestone = {
  id: number;
  title: string;
  notes?: string | null;
  date: string;
  level: string;
  year: number;
  courseId?: number | null;
  course?: { id: number; level: string; letter: string } | null;
};

type Course = {
  id: number;
  level: string;
  letter: string;
  year: number;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function AdminCalendarPage() {
  const { selectedYear } = useSchoolYear();

  // Fecha visible en el calendario (año y mes)
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(selectedYear, now.getMonth(), 1);
  });

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [milestones, setMilestones] = useState<SimceMilestone[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterLevel, setFilterLevel] = useState("TODOS");
  const [filterStatus, setFilterStatus] = useState("TODOS");

  // Modales
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ day: Date; events: any[] } | null>(null);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Estado formulario hito
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [milestoneLevel, setMilestoneLevel] = useState("4B");
  const [milestoneCourseId, setMilestoneCourseId] = useState("");
  const [milestoneNotes, setMilestoneNotes] = useState("");

  // Estado reprogramar / cancelar
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [newOpensAt, setNewOpensAt] = useState("");
  const [newClosesAt, setNewClosesAt] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  // Sincronizar año si cambia el selector global
  useEffect(() => {
    setCurrentDate(prev => new Date(selectedYear, prev.getMonth(), 1));
  }, [selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assigns, miles, crses] = await Promise.all([
        apiFetch<Assignment[]>(`/admin/assignments?year=${selectedYear}`),
        apiFetch<SimceMilestone[]>(`/admin/milestones?year=${selectedYear}`),
        apiFetch<Course[]>(`/admin/courses?year=${selectedYear}`)
      ]);
      setAssignments(assigns);
      setMilestones(miles);
      setCourses(crses);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  // Navegación de meses
  const prevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };
  const goToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(selectedYear, now.getMonth(), 1));
  };

  // Determinar estado de una asignación
  const getAssignmentStatus = (a: Assignment) => {
    if (a.status === "CANCELLED") return "CANCELLED";
    if (a.status === "RESCHEDULED") return "RESCHEDULED";
    const now = new Date();
    const opens = new Date(a.opensAt);
    const closes = new Date(a.closesAt);
    if (a.released || now > closes) return "COMPLETED";
    if (now >= opens && now <= closes) return "IN_PROGRESS";
    return "SCHEDULED";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED":
        return { label: "Por Rendir", bg: "bg-blue-100 text-blue-800 border-blue-200" };
      case "IN_PROGRESS":
        return { label: "En Curso", bg: "bg-emerald-100 text-emerald-800 border-emerald-200" };
      case "COMPLETED":
        return { label: "Rendida", bg: "bg-purple-100 text-purple-800 border-purple-200" };
      case "RESCHEDULED":
        return { label: "Reagendada", bg: "bg-amber-100 text-amber-800 border-amber-200" };
      case "CANCELLED":
        return { label: "Cancelada", bg: "bg-rose-100 text-rose-800 border-rose-200" };
      default:
        return { label: status, bg: "bg-gray-100 text-gray-800 border-gray-200" };
    }
  };

  // Días del mes actual
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const totalDays = lastDay.getDate();
    // Monday = 0, Sunday = 6
    const startDayIndex = (firstDay.getDay() + 6) % 7;

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Días del mes previo
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }

    // Días del mes actual
    for (let d = 1; d <= totalDays; d++) {
      days.push({
        date: new Date(year, month, d),
        isCurrentMonth: true
      });
    }

    // Rellenar hasta múltiplo de 7
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      days.push({
        date: new Date(year, month + 1, d),
        isCurrentMonth: false
      });
    }

    return days;
  }, [currentDate]);

  // Eventos filtrados por fecha y criterios
  const getEventsForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];

    // Asignaciones
    const dayAssignments = assignments.filter(a => {
      const aDate = new Date(a.opensAt).toISOString().split("T")[0];
      if (aDate !== dateStr) return false;

      // Filtro Nivel
      if (filterLevel !== "TODOS" && a.Course?.level !== filterLevel) return false;

      // Filtro Estado
      const st = getAssignmentStatus(a);
      if (filterStatus !== "TODOS" && filterStatus !== "MILESTONE" && st !== filterStatus) return false;
      if (filterStatus === "MILESTONE") return false;

      return true;
    }).map(a => ({
      type: "ASSIGNMENT",
      data: a,
      status: getAssignmentStatus(a),
      title: `${a.Exam?.title || "Ensayo"} (${a.Course?.level?.replace('B', '° Básico').replace('M', '° Medio')} ${a.Course?.letter})`,
      time: new Date(a.opensAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));

    // Hitos Oficiales SIMCE
    const dayMilestones = milestones.filter(m => {
      const mDate = new Date(m.date).toISOString().split("T")[0];
      if (mDate !== dateStr) return false;
      if (filterLevel !== "TODOS" && m.level !== filterLevel) return false;
      if (filterStatus !== "TODOS" && filterStatus !== "MILESTONE") return false;
      return true;
    }).map(m => ({
      type: "MILESTONE",
      data: m,
      status: "MILESTONE",
      title: m.title,
      time: "Oficial"
    }));

    return [...dayMilestones, ...dayAssignments];
  };

  // Crear Hito Oficial SIMCE
  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/admin/milestones", {
        method: "POST",
        body: {
          title: milestoneTitle,
          notes: milestoneNotes,
          date: milestoneDate,
          level: milestoneLevel,
          year: selectedYear,
          courseId: milestoneCourseId ? parseInt(milestoneCourseId, 10) : null
        }
      });
      setShowMilestoneModal(false);
      setMilestoneTitle("");
      setMilestoneDate("");
      setMilestoneNotes("");
      setMilestoneCourseId("");
      loadData();
    } catch (e: any) {
      alert(e.message || "Error al crear hito SIMCE");
    }
  };

  // Eliminar Hito Oficial SIMCE
  const handleDeleteMilestone = async (id: number) => {
    if (!confirm("¿Seguro que deseas eliminar este Hito Oficial SIMCE?")) return;
    try {
      await apiFetch(`/admin/milestones/${id}`, { method: "DELETE" });
      loadData();
      if (selectedDayEvents) {
        setSelectedDayEvents(prev => prev ? {
          ...prev,
          events: prev.events.filter(e => !(e.type === "MILESTONE" && e.data.id === id))
        } : null);
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Reagendar Asignación
  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;
    try {
      await apiFetch(`/admin/assignments/${selectedAssignment.id}/reschedule`, {
        method: "PATCH",
        body: {
          opensAt: newOpensAt,
          closesAt: newClosesAt,
          reason: rescheduleReason
        }
      });
      setShowRescheduleModal(false);
      setSelectedAssignment(null);
      loadData();
      if (selectedDayEvents) setSelectedDayEvents(null);
    } catch (e: any) {
      alert(e.message || "Error al reagendar");
    }
  };

  // Cancelar Asignación
  const handleCancelAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;
    try {
      await apiFetch(`/admin/assignments/${selectedAssignment.id}/cancel`, {
        method: "PATCH",
        body: { reason: cancelReason }
      });
      setShowCancelModal(false);
      setSelectedAssignment(null);
      loadData();
      if (selectedDayEvents) setSelectedDayEvents(null);
    } catch (e: any) {
      alert(e.message || "Error al cancelar");
    }
  };

  // Hitos SIMCE próximos para banner de cuenta regresiva
  const upcomingMilestones = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return milestones
      .map(m => {
        const mDate = new Date(m.date);
        const diffTime = mDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...m, diffDays };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [milestones]);

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR", "TEACHER"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-7xl mx-auto space-y-6">
            
            {/* Header del Calendario */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <CalendarIcon className="w-7 h-7 text-blue-600" />
                  Calendario de Ensayos e Hitos SIMCE
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                  Planificación oficial, fechas de evaluaciones por curso y seguimiento de estados en tiempo real.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {user.role === "ADMIN" && (
                  <button
                    onClick={() => {
                      setMilestoneDate(new Date(selectedYear, currentDate.getMonth(), 15).toISOString().split("T")[0]);
                      setShowMilestoneModal(true);
                    }}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5" /> Programar Hito SIMCE Oficial
                  </button>
                )}
              </div>
            </div>

            {/* Banners de Cuenta Regresiva de Hitos Oficiales SIMCE */}
            {upcomingMilestones.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {upcomingMilestones.slice(0, 3).map((m) => {
                  const isPast = m.diffDays < 0;
                  const isToday = m.diffDays === 0;
                  return (
                    <div 
                      key={m.id}
                      className="bg-white border-2 border-indigo-100 rounded-xl p-3.5 shadow-xs flex items-center justify-between relative overflow-hidden"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                          <span className="text-xs font-bold text-indigo-900 truncate max-w-[200px]">
                            {m.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {new Date(m.date).toLocaleDateString("es-CL", { dateStyle: "long" })}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`inline-block text-xs font-black px-2.5 py-1 rounded-full ${
                          isToday ? 'bg-red-500 text-white' :
                          isPast ? 'bg-gray-100 text-gray-600' :
                          'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}>
                          {isToday ? "¡HOY!" : isPast ? `Pasó hace ${Math.abs(m.diffDays)}d` : `Faltan ${m.diffDays} días`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Barra de Filtros y Navegación del Calendario */}
            <div className="bg-white rounded-xl border p-4 shadow-xs flex flex-col lg:flex-row items-center justify-between gap-4">
              {/* Controles de Navegación Mes */}
              <div className="flex items-center gap-3">
                <button
                  onClick={prevMonth}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
                  title="Mes anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <h2 className="text-lg font-bold text-gray-800 min-w-[180px] text-center capitalize">
                  {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h2>

                <button
                  onClick={nextMonth}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
                  title="Mes siguiente"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                <button
                  onClick={goToToday}
                  className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg border transition-colors ml-2"
                >
                  Mes Actual
                </button>
              </div>

              {/* Filtros de Nivel y Estado */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-600">Nivel:</span>
                  <select
                    value={filterLevel}
                    onChange={(e) => setFilterLevel(e.target.value)}
                    className="text-xs border rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-700 font-medium focus:outline-blue-500"
                  >
                    <option value="TODOS">Todos los niveles</option>
                    <option value="4B">4° Básico</option>
                    <option value="6B">6° Básico</option>
                    <option value="8B">8° Básico</option>
                    <option value="2M">2° Medio</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-600">Estado:</span>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="text-xs border rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-700 font-medium focus:outline-blue-500"
                  >
                    <option value="TODOS">Todos los estados</option>
                    <option value="SCHEDULED">Por rendir</option>
                    <option value="IN_PROGRESS">En curso</option>
                    <option value="COMPLETED">Rendida</option>
                    <option value="RESCHEDULED">Reagendada</option>
                    <option value="CANCELLED">Cancelada</option>
                    <option value="MILESTONE">Hitos Oficiales</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Matriz del Calendario */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              {/* Encabezado Días de Semana */}
              <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-bold text-slate-600 py-2.5">
                {WEEKDAYS.map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              {/* Celdas de Días */}
              <div className="grid grid-cols-7 divide-x divide-y border-b text-xs">
                {monthDays.map((d, index) => {
                  const events = getEventsForDay(d.date);
                  const isToday = d.date.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={index}
                      onClick={() => setSelectedDayEvents({ day: d.date, events })}
                      className={`min-h-[105px] p-2 flex flex-col transition-colors cursor-pointer group ${
                        !d.isCurrentMonth ? 'bg-gray-50/50 text-gray-300' : 'bg-white hover:bg-blue-50/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`font-mono text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                            isToday
                              ? 'bg-blue-600 text-white shadow-xs'
                              : d.isCurrentMonth
                              ? 'text-gray-700 group-hover:text-blue-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {d.date.getDate()}
                        </span>
                        {events.length > 0 && (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-full">
                            {events.length}
                          </span>
                        )}
                      </div>

                      {/* Lista de Eventos en la Celda */}
                      <div className="space-y-1 overflow-y-auto max-h-[70px] pr-0.5">
                        {events.map((ev, evIdx) => {
                          const isMilestone = ev.type === "MILESTONE";
                          const badge = getStatusBadge(ev.status);

                          return (
                            <div
                              key={evIdx}
                              className={`p-1 rounded text-[10px] font-medium border truncate transition-all ${
                                isMilestone
                                  ? 'bg-indigo-600 text-white border-indigo-700 font-bold'
                                  : `${badge.bg} border`
                              }`}
                              title={ev.title}
                            >
                              <div className="truncate">{ev.title}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leyenda de Estados */}
            <div className="bg-white rounded-xl border p-4 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
              <span className="font-bold text-gray-700">Estados de Evaluación:</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span> Por Rendir
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span> En Curso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-purple-500"></span> Rendida
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span> Reagendada
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500"></span> Cancelada
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-indigo-600"></span> Hito SIMCE Oficial
                </span>
              </div>
            </div>
          </div>

          {/* Modal Detalle de Eventos del Día */}
          {selectedDayEvents && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border">
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base">
                      {selectedDayEvents.day.toLocaleDateString("es-CL", { dateStyle: "full" })}
                    </h3>
                    <p className="text-xs text-slate-300">
                      {selectedDayEvents.events.length} actividad{selectedDayEvents.events.length === 1 ? "" : "es"} programada(s)
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDayEvents(null)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 max-h-[420px] overflow-y-auto space-y-3">
                  {selectedDayEvents.events.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      No hay ensayos ni hitos agendados para este día.
                    </div>
                  ) : (
                    selectedDayEvents.events.map((ev, idx) => {
                      const isMilestone = ev.type === "MILESTONE";
                      const a = ev.data;
                      const badge = getStatusBadge(ev.status);

                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-xl border ${
                            isMilestone ? 'bg-indigo-50/70 border-indigo-200' : 'bg-white border-gray-200'
                          } shadow-xs space-y-2`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${badge.bg}`}>
                                  {isMilestone ? "Hito SIMCE Oficial" : badge.label}
                                </span>
                                <span className="text-xs text-gray-500 font-mono">
                                  {ev.time}
                                </span>
                              </div>
                              <h4 className="font-bold text-gray-900 text-sm mt-1">
                                {ev.title}
                              </h4>
                            </div>

                            {/* Botones de acción para admin */}
                            {user.role === "ADMIN" && (
                              <div className="flex items-center gap-1">
                                {isMilestone ? (
                                  <button
                                    onClick={() => handleDeleteMilestone(a.id)}
                                    className="text-xs text-red-600 hover:bg-red-50 p-1 rounded"
                                    title="Eliminar hito"
                                  >
                                    Eliminar
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedAssignment(a);
                                        setNewOpensAt(new Date(a.opensAt).toISOString().slice(0, 16));
                                        setNewClosesAt(new Date(a.closesAt).toISOString().slice(0, 16));
                                        setShowRescheduleModal(true);
                                      }}
                                      className="p-1 text-amber-600 hover:bg-amber-50 rounded"
                                      title="Reagendar prueba"
                                    >
                                      <RotateCcw className="w-4 h-4" />
                                    </button>
                                    {a.status !== "CANCELLED" && (
                                      <button
                                        onClick={() => {
                                          setSelectedAssignment(a);
                                          setShowCancelModal(true);
                                        }}
                                        className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                        title="Cancelar prueba"
                                      >
                                        <Ban className="w-4 h-4" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          {!isMilestone && a.cancelReason && (
                            <p className="text-xs bg-rose-50 text-rose-700 p-2 rounded border border-rose-200">
                              <strong>Motivo:</strong> {a.cancelReason}
                            </p>
                          )}

                          {isMilestone && a.notes && (
                            <p className="text-xs text-indigo-900 bg-white p-2 rounded border border-indigo-150">
                              {a.notes}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-3 bg-gray-50 border-t flex justify-end">
                  <button
                    onClick={() => setSelectedDayEvents(null)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-lg"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Crear Hito SIMCE Oficial */}
          {showMilestoneModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border">
                <div className="p-4 bg-indigo-900 text-white flex items-center justify-between">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <Flag className="w-4 h-4 text-indigo-400" /> Programar Hito Oficial SIMCE
                  </h3>
                  <button onClick={() => setShowMilestoneModal(false)} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleCreateMilestone} className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Título del Hito</label>
                    <input
                      required
                      type="text"
                      placeholder="Ej: SIMCE Nacional 4° Básico Matemática"
                      value={milestoneTitle}
                      onChange={(e) => setMilestoneTitle(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-sm focus:outline-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha Oficial</label>
                      <input
                        required
                        type="date"
                        value={milestoneDate}
                        onChange={(e) => setMilestoneDate(e.target.value)}
                        className="w-full border rounded-lg p-2.5 text-sm focus:outline-indigo-500 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Nivel</label>
                      <select
                        value={milestoneLevel}
                        onChange={(e) => setMilestoneLevel(e.target.value)}
                        className="w-full border rounded-lg p-2.5 text-sm focus:outline-indigo-500"
                      >
                        <option value="4B">4° Básico</option>
                        <option value="6B">6° Básico</option>
                        <option value="8B">8° Básico</option>
                        <option value="2M">2° Medio</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Curso Específico (Opcional)</label>
                    <select
                      value={milestoneCourseId}
                      onChange={(e) => setMilestoneCourseId(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-sm focus:outline-indigo-500"
                    >
                      <option value="">-- Aplica a todos los cursos del nivel --</option>
                      {courses.filter(c => c.level === milestoneLevel).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.level.replace('B', '° Básico').replace('M', '° Medio')} {c.letter}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Instrucciones o Notas</label>
                    <textarea
                      rows={2}
                      placeholder="Detalles sobre aplicación oficial, salas, etc."
                      value={milestoneNotes}
                      onChange={(e) => setMilestoneNotes(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-xs focus:outline-indigo-500"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowMilestoneModal(false)}
                      className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                      Guardar Hito SIMCE
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Reagendar Prueba */}
          {showRescheduleModal && selectedAssignment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border">
                <div className="p-4 bg-amber-500 text-white flex items-center justify-between">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Reagendar Ensayo
                  </h3>
                  <button onClick={() => setShowRescheduleModal(false)} className="text-white hover:opacity-75">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleReschedule} className="p-5 space-y-4">
                  <p className="text-xs text-gray-600">
                    Estás reagendando la evaluación <strong>{selectedAssignment.Exam?.title}</strong> para el curso <strong>{selectedAssignment.Course?.level?.replace('B', '° Básico').replace('M', '° Medio')} {selectedAssignment.Course?.letter}</strong>.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Nueva Fecha y Hora de Apertura</label>
                    <input
                      required
                      type="datetime-local"
                      value={newOpensAt}
                      onChange={(e) => setNewOpensAt(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-xs focus:outline-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Nueva Fecha y Hora de Cierre</label>
                    <input
                      required
                      type="datetime-local"
                      value={newClosesAt}
                      onChange={(e) => setNewClosesAt(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-xs focus:outline-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Motivo del Cambio</label>
                    <input
                      required
                      type="text"
                      placeholder="Ej: Actividad curricular imprevista"
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-xs focus:outline-amber-500"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRescheduleModal(false)}
                      className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                      Confirmar Reagendamiento
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Cancelar Prueba */}
          {showCancelModal && selectedAssignment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border">
                <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <Ban className="w-4 h-4" /> Cancelar Ensayo Calendarizado
                  </h3>
                  <button onClick={() => setShowCancelModal(false)} className="text-white hover:opacity-75">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleCancelAssignment} className="p-5 space-y-4">
                  <p className="text-xs text-gray-600">
                    ¿Estás seguro de cancelar esta evaluación para el curso <strong>{selectedAssignment.Course?.level?.replace('B', '° Básico').replace('M', '° Medio')} {selectedAssignment.Course?.letter}</strong>?
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Motivo de la Cancelación</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Ej: Feriado decretado o suspensión de clases"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-xs focus:outline-rose-500"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(false)}
                      className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Volver
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm"
                    >
                      Cancelar Ensayo
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </AppShell>
      )}
    </RequireRole>
  );
}
