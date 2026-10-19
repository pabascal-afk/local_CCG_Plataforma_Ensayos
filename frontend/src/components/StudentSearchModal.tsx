"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, X, Users, Check, School, User, ArrowRight, Loader2, Sparkles } from "lucide-react";

export interface StudentDirectoryItem {
  rut: string;
  name: string;
  courseId: number;
}

export interface CourseDirectoryItem {
  id: number;
  level: string;
  letter: string;
  year: number;
  label: string;
  fullLabel: string;
  studentCount: number;
}

interface StudentSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStudent: (student: { rut: string; name: string; courseLabel?: string }) => void;
}

export default function StudentSearchModal({
  isOpen,
  onClose,
  onSelectStudent,
}: StudentSearchModalProps) {
  const [courses, setCourses] = useState<CourseDirectoryItem[]>([]);
  const [students, setStudents] = useState<StudentDirectoryItem[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentDirectoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cargar datos cuando se abre el modal
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSelectedStudent(null);
      return;
    }

    let isMounted = true;
    async function loadDirectory() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/auth/student-directory");
        if (!res.ok) throw new Error("No se pudo cargar la lista de cursos y estudiantes");
        const data = await res.json();
        if (isMounted) {
          setCourses(data.courses || []);
          setStudents(data.students || []);
          // Si solo hay un curso, seleccionarlo automáticamente
          if (data.courses && data.courses.length === 1) {
            setSelectedCourseId(data.courses[0].id);
          } else if (data.courses && data.courses.length > 0 && selectedCourseId === null) {
            setSelectedCourseId(data.courses[0].id);
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Error al conectar con el servidor");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDirectory();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Filtrar estudiantes por curso seleccionado y término de búsqueda
  const filteredStudents = useMemo(() => {
    if (!selectedCourseId) return [];
    let list = students.filter((s) => s.courseId === selectedCourseId);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.rut.toLowerCase().includes(q)
      );
    }

    return list;
  }, [students, selectedCourseId, searchQuery]);

  const selectedCourse = useMemo(() => {
    return courses.find((c) => c.id === selectedCourseId);
  }, [courses, selectedCourseId]);

  const handleConfirm = () => {
    if (!selectedStudent) return;
    onSelectStudent({
      rut: selectedStudent.rut,
      name: selectedStudent.name,
      courseLabel: selectedCourse?.label,
    });
    onClose();
  };

  // Helper para iniciales en el avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (name.slice(0, 2) || "AL").toUpperCase();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
        
        {/* Header del Modal */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Users className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                Buscar mi Usuario Estudiante
              </h2>
              <p className="text-xs text-blue-100 font-medium mt-0.5">
                Selecciona tu curso para ver la lista y encontrar tu usuario fácilmente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controles de Selección de Curso y Búsqueda */}
        <div className="p-4 bg-slate-50 border-b border-gray-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Selector de Curso */}
            <div className="sm:col-span-6">
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <School className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Selecciona tu Curso:</span>
              </label>
              <select
                value={selectedCourseId || ""}
                onChange={(e) => {
                  setSelectedCourseId(Number(e.target.value) || null);
                  setSelectedStudent(null);
                }}
                className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
              >
                {courses.length === 0 && <option value="">No hay cursos registrados</option>}
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullLabel} ({c.studentCount} alumnos)
                  </option>
                ))}
              </select>
            </div>

            {/* Buscador de Nombre */}
            <div className="sm:col-span-6">
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-indigo-600" />
                <span>2. Filtrar por tu Nombre o Apellido:</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej: Camila, Matías, González..."
                  className="w-full bg-white border border-gray-300 rounded-xl pl-8 pr-3 py-2.5 text-xs font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs"
                />
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-3" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cuerpo del Modal: Pool de Estudiantes */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 min-h-[260px] max-h-[380px]">
          {loading && (
            <div className="h-48 flex flex-col items-center justify-center text-gray-500 space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Cargando lista de estudiantes...</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium text-center">
              {error}
            </div>
          )}

          {!loading && !error && filteredStudents.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center text-gray-400 text-center px-4">
              <Users className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-xs font-bold text-gray-600">
                {searchQuery
                  ? `No encontramos a ningún estudiante con "${searchQuery}" en este curso.`
                  : "No hay estudiantes registrados en este curso."}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Verifica haber seleccionado el curso correcto o revisa la ortografía.
              </p>
            </div>
          )}

          {!loading && !error && filteredStudents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Estudiantes de {selectedCourse?.label} ({filteredStudents.length})
                </span>
                <span className="text-[10px] text-gray-400">
                  Haz clic en tu nombre (o doble clic para seleccionar directamente)
                </span>
              </div>

              {/* Grid / Pool de estudiantes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredStudents.map((st) => {
                  const isSelected = selectedStudent?.rut === st.rut;
                  return (
                    <div
                      key={st.rut}
                      onClick={() => setSelectedStudent(st)}
                      onDoubleClick={() => {
                        setSelectedStudent(st);
                        onSelectStudent({
                          rut: st.rut,
                          name: st.name,
                          courseLabel: selectedCourse?.label,
                        });
                        onClose();
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                        isSelected
                          ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                          : "bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 transition-colors ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-700 group-hover:bg-blue-100"
                          }`}
                        >
                          {getInitials(st.name)}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold truncate leading-tight ${
                            isSelected ? "text-blue-950" : "text-gray-900"
                          }`}>
                            {st.name}
                          </p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                            RUT: {st.rut}
                          </p>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-gray-300 bg-white" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer del Modal con Acción de Confirmación */}
        <div className="p-4 bg-white border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-gray-600 truncate w-full sm:w-auto">
            {selectedStudent ? (
              <span className="flex items-center gap-1.5 text-blue-900 font-bold bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span className="truncate">Seleccionado: <strong>{selectedStudent.name}</strong> ({selectedStudent.rut})</span>
              </span>
            ) : (
              <span className="text-gray-400 italic">Haz clic en tu nombre en la lista para seleccionarlo</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedStudent}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Aceptar / Cargar Usuario</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
