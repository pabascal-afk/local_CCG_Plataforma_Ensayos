"use client";

import { useEffect, useState, useMemo } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, Trash2, Download, Upload, FileSpreadsheet, Calendar, Sparkles } from "lucide-react";
import { getToken } from "@/lib/session";
import { useSchoolYear } from "@/context/SchoolYearContext";

type Course = {
  id: number;
  year: number;
  level: string;
  letter: string;
};

export default function CoursesPage() {
  const { selectedYear } = useSchoolYear();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Desglose de creación de curso solicitado: Nivel, Enseñanza, Letra, Año
  const [nivelNum, setNivelNum] = useState("2");
  const [ensenanza, setEnsenanza] = useState<"Media" | "Básica">("Media");
  const [letter, setLetter] = useState("A");
  const [courseYear, setCourseYear] = useState(selectedYear);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Sincronizar año por defecto al cambiar selector global
  useEffect(() => {
    setCourseYear(selectedYear);
  }, [selectedYear]);

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

  // Vista previa en vivo del curso formateado
  const previewCourseName = useMemo(() => {
    return `${nivelNum}° ${ensenanza} ${letter} ${courseYear}`;
  }, [nivelNum, ensenanza, letter, courseYear]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/admin/courses", {
        method: "POST",
        body: {
          nivel: nivelNum,
          ensenanza,
          letter,
          year: courseYear
        }
      });
      loadCourses();
      setLetter(String.fromCharCode(letter.charCodeAt(0) + 1));
    } catch (err: any) {
      alert(err.message);
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
          "Authorization": `Bearer ${getToken()}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al importar cursos");

      alert(`Cursos procesados con éxito. Creados: ${data.imported}. Errores: ${data.errors.length}`);
      setImportFile(null);
      loadCourses();
    } catch (err: any) {
      alert(err.message);
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
      {(user) => (
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
                  <span>({courses.length} curso{courses.length === 1 ? "" : "s"} registrados)</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <a
                  href={`/api/admin/templates/courses.xlsx?token=${typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : ""}`}
                  download="Formato_Cursos.xlsx"
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors shadow-xs inline-flex items-center"
                  title="Descargar plantilla Excel vacía (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
                    window.location.href = `/api/admin/courses/export.xlsx?token=${token}`;
                  }}
                  className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-colors"
                  title="Exportar Cursos a Excel (.xlsx)"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-4 rounded mb-6">{error}</div>}

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
                          {(ensenanza === "Media" ? ["1", "2", "3", "4"] : ["1", "2", "3", "4", "5", "6", "7", "8"]).map(n => (
                            <option key={n} value={n}>{n}°</option>
                          ))}
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
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Letra</label>
                        <input
                          type="text"
                          value={letter}
                          onChange={(e) => setLetter(e.target.value.toUpperCase())}
                          className="w-full border rounded-lg px-3 py-2 text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold text-center"
                          maxLength={1}
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
                      className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 hover:bg-blue-700 font-semibold text-sm transition-colors shadow-sm"
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
                      className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 text-white rounded-lg px-4 py-2 hover:bg-emerald-700 font-semibold text-sm disabled:opacity-50 transition-colors shadow-sm"
                    >
                      <Upload className="w-4 h-4" /> {importing ? "Importando Cursos..." : "Importar Cursos"}
                    </button>
                    <a
                      href={`/api/admin/templates/courses.xlsx?token=${typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : ""}`}
                      download="Formato_Cursos.xlsx"
                      className="block text-center text-xs text-blue-600 hover:underline pt-1 font-medium"
                    >
                      Descargar Plantilla Oficial (.xlsx)
                    </a>
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
                        <th className="p-4 font-semibold w-20 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-gray-500">
                            Cargando cursos del año {selectedYear}...
                          </td>
                        </tr>
                      ) : courses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-gray-500">
                            No hay cursos registrados para el año escolar {selectedYear}.
                            <br />
                            <span className="text-xs text-gray-400">Puedes crearlos usando el formulario o la carga masiva a la izquierda.</span>
                          </td>
                        </tr>
                      ) : (
                        courses.map((c) => {
                          const fullName = `${c.level.replace('B', '° Básico').replace('M', '° Medio')} ${c.letter} ${c.year}`;
                          const isMedia = c.level.includes("M");
                          return (
                            <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="p-4 font-medium text-gray-600">{c.year}</td>
                              <td className="p-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${isMedia ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' : 'bg-emerald-50 text-emerald-700 border border-emerald-150'}`}>
                                  {c.level.replace('B', '° Básico').replace('M', '° Medio')}
                                </span>
                              </td>
                              <td className="p-4 font-bold text-gray-800">{c.letter}</td>
                              <td className="p-4 font-semibold text-gray-900">{fullName}</td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => handleDelete(c.id)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors"
                                  title="Eliminar curso"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
        </AppShell>
      )}
    </RequireRole>
  );
}
