"use client";

import { useEffect, useState, useMemo } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
  Calendar,
  Sparkles,
  Pencil,
  X,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";
import { getToken } from "@/lib/session";
import { useSchoolYear } from "@/context/SchoolYearContext";

type Course = {
  id: number;
  year: number;
  level: string;
  letter: string;
  _count?: {
    students: number;
    assignments: number;
    teachers: number;
  };
};

function parseCourseLevel(level: string): { nivelNum: string; ensenanza: "Básica" | "Media" } {
  const normalized = String(level || "").trim().toUpperCase();
  const isMedia = normalized.includes("M");
  const numMatch = normalized.match(/\d+/);
  const num = numMatch ? numMatch[0] : "1";
  return {
    nivelNum: num,
    ensenanza: isMedia ? "Media" : "Básica",
  };
}

function formatCourseName(level: string, letter: string, year?: number) {
  const base = `${level.replace("B", "° Básico").replace("M", "° Medio")} ${letter}`;
  return year !== undefined ? `${base} ${year}` : base;
}

export default function CoursesPage() {
  const { selectedYear } = useSchoolYear();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");

  // Desglose de creación de curso: Nivel, Enseñanza, Letra/Identificador, Año
  const [nivelNum, setNivelNum] = useState("2");
  const [ensenanza, setEnsenanza] = useState<"Media" | "Básica">("Media");
  const [letter, setLetter] = useState("A");
  const [courseYear, setCourseYear] = useState(selectedYear);

  // Modal Editar Curso
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editNivelNum, setEditNivelNum] = useState("2");
  const [editEnsenanza, setEditEnsenanza] = useState<"Media" | "Básica">("Media");
  const [editLetter, setEditLetter] = useState("A");
  const [editYear, setEditYear] = useState(selectedYear);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Sincronizar año por defecto al cambiar selector global
  useEffect(() => {
    setCourseYear(selectedYear);
  }, [selectedYear]);

  const showSuccess = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(""), 5000);
  };

  const loadCourses = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Course[]>(`/admin/courses?year=${selectedYear}`);
      setCourses(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, [selectedYear]);

  const handleDownloadTemplate = async () => {
    try {
      const token = getToken();
      const res = await fetch("/api/admin/templates/courses.xlsx", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error al descargar plantilla");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Formato_Cursos.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleExportCourses = async () => {
    try {
      const token = getToken();
      const res = await fetch("/api/admin/courses/export.xlsx", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error al exportar cursos");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Cursos_CCG.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // Vista previa en vivo del curso formateado
  const previewCourseName = useMemo(() => {
    return `${nivelNum}° ${ensenanza} ${letter.trim() || "..."} ${courseYear}`;
  }, [nivelNum, ensenanza, letter, courseYear]);

  const editPreviewCourseName = useMemo(() => {
    return `${editNivelNum}° ${editEnsenanza} ${editLetter.trim() || "..."} ${editYear}`;
  }, [editNivelNum, editEnsenanza, editLetter, editYear]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanLetter = letter.trim().toUpperCase();
      await apiFetch("/admin/courses", {
        method: "POST",
        body: {
          nivel: nivelNum,
          ensenanza,
          letter: cleanLetter,
          year: courseYear,
        },
      });
      await loadCourses();
      showSuccess(`Curso ${nivelNum}° ${ensenanza} ${cleanLetter} (${courseYear}) creado con éxito.`);
      if (/^[A-Y]$/.test(cleanLetter)) {
        setLetter(String.fromCharCode(cleanLetter.charCodeAt(0) + 1));
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenEditModal = (c: Course) => {
    const parsed = parseCourseLevel(c.level);
    setEditingCourse(c);
    setEditNivelNum(parsed.nivelNum);
    setEditEnsenanza(parsed.ensenanza);
    setEditLetter(c.letter);
    setEditYear(c.year);
    setEditError("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;

    const cleanLetter = editLetter.trim().toUpperCase();
    if (!cleanLetter) {
      setEditError("La letra o identificador del curso es obligatoria.");
      return;
    }

    setSavingEdit(true);
    setEditError("");

    try {
      const updated = await apiFetch<Course>(`/admin/courses/${editingCourse.id}`, {
        method: "PUT",
        body: {
          nivel: editNivelNum,
          ensenanza: editEnsenanza,
          letter: cleanLetter,
          year: editYear,
        },
      });

      setEditingCourse(null);
      await loadCourses();
      const updatedLabel = formatCourseName(updated.level, updated.letter, updated.year);
      if (updated.year !== selectedYear) {
        showSuccess(
          `Curso actualizado a ${updatedLabel}. Cambia el año escolar en el menú lateral para verlo en el listado de ${updated.year}.`
        );
      } else {
        showSuccess(`Curso actualizado a ${updatedLabel} con éxito.`);
      }
    } catch (err: any) {
      setEditError(err.message || "Error al actualizar el curso");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleImportCourses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const res = await fetch("/api/admin/courses/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al importar cursos");

      if (data.errors && data.errors.length > 0) {
        const errorDetails = data.errors
          .slice(0, 5)
          .map((errItem: any) => `• Fila ${errItem.row}: ${errItem.error}`)
          .join("\n");
        alert(
          `Cursos creados con éxito: ${data.imported}\n\nFilas con advertencia o error (${data.errors.length}):\n${errorDetails}${
            data.errors.length > 5 ? "\n... (y más)" : ""
          }`
        );
      } else {
        alert(`¡Importación exitosa! Se procesaron ${data.imported} curso(s) correctamente.`);
      }
      setImportFile(null);
      loadCourses();
    } catch (err: any) {
      alert("Error al importar: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Seguro que quieres eliminar este curso?")) return;
    try {
      await apiFetch(`/admin/courses/${id}`, { method: "DELETE" });
      loadCourses();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => {
        const isAdmin = user.role === "ADMIN";
        return (
          <AppShell user={user}>
            <div className="p-8 max-w-6xl mx-auto">
              <div className="mb-6">
                <Link href="/admin/dashboard" className="text-blue-600 hover:underline flex items-center gap-1 inline-flex">
                  <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Gestión de Cursos</h1>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-semibold border border-blue-200">
                      <Calendar className="w-3.5 h-3.5" /> Año escolar activo: {selectedYear}
                    </span>
                    <span>
                      ({courses.length} curso{courses.length === 1 ? "" : "s"} registrados)
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors shadow-xs inline-flex items-center cursor-pointer"
                    title="Descargar plantilla Excel vacía (.xlsx)"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCourses}
                    className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
                    title="Exportar Cursos a Excel (.xlsx)"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {error && <div className="bg-red-50 text-red-600 p-4 rounded mb-6">{error}</div>}

              {successNotice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl mb-6 flex items-center gap-2 text-sm font-medium shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  {/* Formulario desglosado: Nivel, Enseñanza, Letra, Año */}
                  <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h2 className="text-lg font-semibold mb-3 text-gray-800">Nuevo Curso</h2>
                    <p className="text-xs text-gray-500 mb-4">
                      Ingresa los datos desglosados del curso para asignarlo al año escolar correspondiente.
                    </p>
                    <form onSubmit={handleCreate} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Nivel (Grado)</label>
                          <select
                            value={nivelNum}
                            onChange={(e) => setNivelNum(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            required
                          >
                            {(ensenanza === "Media" ? ["1", "2", "3", "4"] : ["1", "2", "3", "4", "5", "6", "7", "8"]).map(
                              (n) => (
                                <option key={n} value={n}>
                                  {n}°
                                </option>
                              )
                            )}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Enseñanza</label>
                          <select
                            value={ensenanza}
                            onChange={(e) => {
                              const val = e.target.value as "Media" | "Básica";
                              setEnsenanza(val);
                              if (val === "Media" && parseInt(nivelNum, 10) > 4) {
                                setNivelNum("1");
                              }
                            }}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            required
                          >
                            <option value="Media">Media</option>
                            <option value="Básica">Básica</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            Letra / Identificador
                          </label>
                          <input
                            type="text"
                            value={letter}
                            onChange={(e) => setLetter(e.target.value.toUpperCase())}
                            placeholder="Ej: A, B, HC"
                            className="w-full border rounded-lg px-3 py-2 text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold text-center"
                            maxLength={20}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Año</label>
                          <input
                            type="number"
                            value={courseYear}
                            onChange={(e) => setCourseYear(Number(e.target.value))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold text-center"
                            required
                          />
                        </div>
                      </div>

                      {/* Vista Previa del Curso */}
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                        <span className="text-xs text-blue-700 flex items-center gap-1 font-medium">
                          <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Vista previa:
                        </span>
                        <span className="text-sm font-bold text-blue-900 bg-white px-2.5 py-1 rounded border border-blue-200 shadow-xs">
                          {previewCourseName}
                        </span>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 hover:bg-blue-700 font-semibold text-sm transition-colors shadow-sm cursor-pointer"
                      >
                        Guardar Curso
                      </button>
                    </form>
                  </div>

                  {/* Tarjeta de Carga Masiva Desglosada */}
                  <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-gray-800">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Carga Masiva (4 Campos)
                    </h2>
                    <p className="text-xs text-gray-500 mb-3">
                      Sube un archivo Excel (.xlsx) o CSV desglosado en 4 columnas:
                    </p>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-4 text-xs font-mono text-slate-700 space-y-1">
                      <div className="font-semibold text-slate-900 text-[11px]">Columnas requeridas:</div>
                      <div>1. <strong>Nivel</strong> (ej: 2)</div>
                      <div>2. <strong>Enseñanza</strong> (ej: Media o Básica)</div>
                      <div>3. <strong>Letra</strong> (ej: A)</div>
                      <div>4. <strong>Año</strong> (ej: 2027)</div>
                    </div>
                    <form onSubmit={handleImportCourses} className="space-y-3">
                      <input
                        type="file"
                        accept=".xlsx,.csv"
                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                        className="w-full text-xs border rounded-lg p-2 bg-gray-50 cursor-pointer"
                      />
                      <button
                        type="submit"
                        disabled={!importFile || importing}
                        className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 font-semibold text-sm disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                      >
                        <Upload className="w-4 h-4" /> {importing ? "Importando Cursos..." : "Importar Cursos"}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="block w-full text-center text-xs text-blue-600 hover:underline pt-1 font-medium cursor-pointer"
                      >
                        Descargar Plantilla Oficial (.xlsx)
                      </button>
                    </form>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-800 text-sm">
                        Cursos del Año Escolar {selectedYear}
                      </h3>
                      <span className="text-xs bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                        {courses.length} cursos
                      </span>
                    </div>
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50 border-b text-xs text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="p-4 font-semibold">Año</th>
                          <th className="p-4 font-semibold">Nivel & Enseñanza</th>
                          <th className="p-4 font-semibold">Letra</th>
                          <th className="p-4 font-semibold">Nombre Completo</th>
                          <th className="p-4 font-semibold text-center">Matrícula</th>
                          <th className="p-4 font-semibold w-28 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-sm">
                        {loading ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-500">
                              Cargando cursos del año {selectedYear}...
                            </td>
                          </tr>
                        ) : courses.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-500">
                              No hay cursos registrados para el año escolar {selectedYear}.
                              <br />
                              <span className="text-xs text-gray-400">
                                Puedes crearlos usando el formulario o la carga masiva a la izquierda.
                              </span>
                            </td>
                          </tr>
                        ) : (
                          courses.map((c) => {
                            const fullName = formatCourseName(c.level, c.letter, c.year);
                            const isMedia = c.level.includes("M");
                            const studentCount = c._count?.students ?? 0;
                            return (
                              <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="p-4 font-medium text-gray-600">{c.year}</td>
                                <td className="p-4">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                      isMedia
                                        ? "bg-indigo-50 text-indigo-700 border border-indigo-150"
                                        : "bg-emerald-50 text-emerald-700 border border-emerald-150"
                                    }`}
                                  >
                                    {c.level.replace("B", "° Básico").replace("M", "° Medio")}
                                  </span>
                                </td>
                                <td className="p-4 font-bold text-gray-800">{c.letter}</td>
                                <td className="p-4 font-semibold text-gray-900">{fullName}</td>
                                <td className="p-4 text-center">
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                    <Users className="w-3 h-3 text-slate-400" />
                                    {studentCount}
                                  </span>
                                </td>
                                <td className="p-4 text-center">
                                  {isAdmin ? (
                                    <div className="inline-flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(c)}
                                        className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition-colors cursor-pointer"
                                        title="Editar datos del curso"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(c.id)}
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors cursor-pointer"
                                        title="Eliminar curso"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">Solo lectura</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Editar Curso */}
            {editingCourse && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border max-h-[92vh] flex flex-col">
                  <div className="flex justify-between items-center p-4 border-b bg-blue-50">
                    <div>
                      <h3 className="font-bold text-lg text-blue-900 flex items-center gap-2">
                        <Pencil className="w-5 h-5 text-blue-600" /> Editar Curso
                      </h3>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Editando:{" "}
                        <span className="font-semibold">
                          {formatCourseName(editingCourse.level, editingCourse.letter, editingCourse.year)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingCourse(null)}
                      className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleSaveEdit} className="p-5 space-y-4 overflow-y-auto flex-1">
                    {editError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{editError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Nivel (Grado)</label>
                        <select
                          value={editNivelNum}
                          onChange={(e) => setEditNivelNum(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          required
                        >
                          {(editEnsenanza === "Media"
                            ? ["1", "2", "3", "4"]
                            : ["1", "2", "3", "4", "5", "6", "7", "8"]
                          ).map((n) => (
                            <option key={n} value={n}>
                              {n}°
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Enseñanza</label>
                        <select
                          value={editEnsenanza}
                          onChange={(e) => {
                            const val = e.target.value as "Media" | "Básica";
                            setEditEnsenanza(val);
                            if (val === "Media" && parseInt(editNivelNum, 10) > 4) {
                              setEditNivelNum("1");
                            }
                          }}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          required
                        >
                          <option value="Media">Media</option>
                          <option value="Básica">Básica</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          Letra / Identificador
                        </label>
                        <input
                          type="text"
                          value={editLetter}
                          onChange={(e) => setEditLetter(e.target.value.toUpperCase())}
                          placeholder="Ej: A, B, HC"
                          className="w-full border rounded-lg px-3 py-2 text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold text-center"
                          maxLength={20}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Año Escolar</label>
                        <input
                          type="number"
                          value={editYear}
                          onChange={(e) => setEditYear(Number(e.target.value))}
                          min={2000}
                          max={2100}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold text-center"
                          required
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                      <span className="text-xs text-blue-700 flex items-center gap-1 font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Vista previa:
                      </span>
                      <span className="text-sm font-bold text-blue-900 bg-white px-2.5 py-1 rounded border border-blue-200 shadow-xs">
                        {editPreviewCourseName}
                      </span>
                    </div>

                    {((editingCourse._count?.students ?? 0) > 0 || (editingCourse._count?.assignments ?? 0) > 0) && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                        <strong>Actualización automática vinculada:</strong> Este curso tiene{" "}
                        <strong>{editingCourse._count?.students ?? 0}</strong> estudiante(s) y{" "}
                        <strong>{editingCourse._count?.assignments ?? 0}</strong> evaluación(es) asignada(s). Al
                        guardar, el nuevo nombre se reflejará automáticamente en toda la plataforma sin perder datos.
                      </p>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <button
                        type="button"
                        onClick={() => setEditingCourse(null)}
                        disabled={savingEdit}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        {savingEdit ? "Guardando..." : "Guardar Cambios"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </AppShell>
        );
      }}
    </RequireRole>
  );
}
