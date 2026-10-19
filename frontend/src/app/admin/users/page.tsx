"use client";

import { useEffect, useState, useRef } from "react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";
import Link from "next/link";
import { 
  ArrowLeft, 
  Trash2, 
  KeyRound, 
  Upload, 
  Plus, 
  X, 
  Download, 
  FileSpreadsheet, 
  ShieldCheck, 
  Calendar 
} from "lucide-react";
import { useSchoolYear } from "@/context/SchoolYearContext";

function formatRutInput(val: string): string {
  const trimmed = val.trim();
  if (/^[a-zA-Z]+$/.test(trimmed)) {
    return val;
  }
  const clean = val.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (clean.length <= 1) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

type User = {
  rut: string;
  name: string;
  role: string;
  courseId: number | null;
  mustChangePassword?: boolean;
  course?: {
    id: number;
    level: string;
    letter: string;
    year: number;
  };
  Course?: {
    id: number;
    level: string;
    letter: string;
    year: number;
  };
};

type Course = {
  id: number;
  level: string;
  letter: string;
  year: number;
};

export default function UsersPage() {
  const { selectedYear } = useSchoolYear();
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"STUDENTS" | "STAFF">("STUDENTS");
  const [showModal, setShowModal] = useState(false);

  // Modal contraseña masiva por curso
  const [showBulkPasswordModal, setShowBulkPasswordModal] = useState(false);
  const [bulkCourseId, setBulkCourseId] = useState("");
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkMustChange, setBulkMustChange] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Modal form state
  const [formRut, setFormRut] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("STUDENT");
  const [formCourseId, setFormCourseId] = useState("");
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const token = getToken();
      const res = await fetch("/api/admin/templates/users.xlsx", {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Error al descargar la plantilla de usuarios");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Formato_Usuarios.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleExportUsers = async () => {
    try {
      setExportingUsers(true);
      const token = getToken();
      const res = await fetch("/api/admin/users/export.xlsx", {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Error al exportar la lista de usuarios");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Usuarios_CCG.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setExportingUsers(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [uData, cData] = await Promise.all([
        apiFetch<User[]>(`/admin/users?year=${selectedYear}`),
        apiFetch<Course[]>(`/admin/courses?year=${selectedYear}`)
      ]);
      setUsers(uData);
      setCourses(cData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    
    setImporting(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/users/import", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getToken()}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al importar usuarios");
      
      if (data.errors && data.errors.length > 0) {
        const errorDetails = data.errors.slice(0, 5).map((errItem: any) => `• Fila ${errItem.row}: ${errItem.error}`).join("\n");
        alert(`Importados con éxito: ${data.imported}\n\nFilas con advertencia o error (${data.errors.length}):\n${errorDetails}${data.errors.length > 5 ? '\n... (y más)' : ''}`);
      } else {
        alert(`¡Importación exitosa! Se procesaron ${data.imported} usuario(s) correctamente.`);
      }

      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      loadData();
    } catch (err: any) {
      alert("Error al importar: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/admin/users", {
        method: "POST",
        body: {
          rut: formRut,
          name: formName,
          role: formRole,
          courseId: formCourseId ? parseInt(formCourseId) : null
        }
      });
      setShowModal(false);
      setFormRut("");
      setFormName("");
      setFormRole("STUDENT");
      setFormCourseId("");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkCourseId || !bulkPassword) {
      alert("Por favor selecciona un curso e ingresa una contraseña.");
      return;
    }

    setBulkSubmitting(true);
    try {
      const res = await apiFetch<{ count: number; message: string }>("/admin/users/bulk-password", {
        method: "POST",
        body: {
          courseId: parseInt(bulkCourseId, 10),
          newPassword: bulkPassword,
          mustChangePassword: bulkMustChange
        }
      });
      alert(`¡Contraseñas actualizadas con éxito! Se aplicó a ${res.count} estudiante(s) del curso.`);
      setShowBulkPasswordModal(false);
      setBulkPassword("");
      setBulkMustChange(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleResetPassword = async (rut: string) => {
    if (!confirm(`¿Resetear contraseña para ${rut}? Volverá a ser los primeros 6 dígitos de su RUT.`)) return;
    try {
      await apiFetch(`/admin/users/${rut}`, {
        method: "PUT",
        body: { resetPassword: true }
      });
      alert("Contraseña reseteada con éxito.");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (rut: string) => {
    if (!confirm(`¿Seguro que quieres eliminar al usuario ${rut}?`)) return;
    try {
      await apiFetch(`/admin/users/${rut}`, { method: "DELETE" });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredUsers = users.filter(u => 
    activeTab === "STUDENTS" ? u.role === "STUDENT" : u.role !== "STUDENT"
  );

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <Link href="/admin/dashboard" className="text-blue-600 hover:underline flex items-center gap-1 inline-flex mb-1.5 text-sm">
                  <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
                </Link>
                <h1 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h1>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-semibold border border-blue-200">
                    <Calendar className="w-3.5 h-3.5" /> Año escolar: {selectedYear}
                  </span>
                  <span>({users.length} usuario{users.length === 1 ? "" : "s"} totales)</span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2.5 items-center">
                {/* Botón Contraseña Masiva por Curso */}
                <button
                  onClick={() => setShowBulkPasswordModal(true)}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                  title="Asignar una sola contraseña a todos los alumnos de un curso sin exigir cambio de clave"
                >
                  <KeyRound className="w-4 h-4" /> Contraseña Masiva
                </button>

                <button 
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-1 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" /> Nuevo Usuario
                </button>

                <form onSubmit={handleImport} className="flex items-center gap-1.5 bg-white p-1 border rounded-lg shadow-sm">
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept=".xlsx,.csv" 
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="text-xs max-w-[170px]"
                  />
                  <button 
                    type="submit" 
                    disabled={!file || importing}
                    className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> {importing ? "Subiendo..." : "Importar"}
                  </button>
                </form>

                <button 
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={downloadingTemplate}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors shadow-xs inline-flex items-center disabled:opacity-50 cursor-pointer"
                  title="Descargar plantilla Excel vacía (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                </button>

                <button 
                  type="button"
                  onClick={handleExportUsers}
                  disabled={exportingUsers}
                  className="p-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  title="Exportar usuarios a Excel (.xlsx)"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-4 rounded mb-6">{error}</div>}

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="flex border-b bg-gray-50">
                <button 
                  onClick={() => setActiveTab("STUDENTS")}
                  className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'STUDENTS' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Estudiantes ({users.filter(u => u.role === "STUDENT").length})
                </button>
                <button 
                  onClick={() => setActiveTab("STAFF")}
                  className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'STAFF' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Profesores y Directivos ({users.filter(u => u.role !== "STUDENT").length})
                </button>
              </div>

              {/* Banner informativo de Formato de Importación */}
              <div className="p-3.5 border-b bg-amber-50/70 text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <strong>Formato de importación masiva vinculado a Curso y Año:</strong> 
                  <span className="font-mono ml-1.5 bg-white px-2 py-0.5 rounded border border-amber-200">
                    RUT ; Nombre ; Nivel (ej: 2) ; Enseñanza (ej: Media) ; Letra (ej: A) ; Año (ej: {selectedYear}) ; Rol
                  </span>
                </div>
                <span className="text-[11px] text-amber-800 italic shrink-0">
                  (También admite formatos compactos de 5 o 4 columnas)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/70 border-b text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-4 font-semibold">RUT</th>
                      <th className="p-4 font-semibold">Nombre</th>
                      <th className="p-4 font-semibold">Rol</th>
                      <th className="p-4 font-semibold">Curso & Año</th>
                      <th className="p-4 font-semibold text-center w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {loading ? (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-500">Cargando usuarios...</td></tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-500">
                          No hay usuarios registrados en esta categoría para el año {selectedYear}.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => {
                        const courseObj = u.course || u.Course;
                        const courseLabel = courseObj 
                          ? `${courseObj.level.replace('B', '° Básico').replace('M', '° Medio')} ${courseObj.letter} (${courseObj.year})`
                          : '-';

                        return (
                          <tr key={u.rut} className="hover:bg-gray-50/80 transition-colors">
                            <td className="p-4 font-mono font-medium text-gray-700">{u.rut}</td>
                            <td className="p-4 font-semibold text-gray-900">{u.name}</td>
                            <td className="p-4">
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wide ${u.role === 'ADMIN' ? 'bg-red-100 text-red-700 border border-red-200' : u.role === 'DIRECTOR' ? 'bg-purple-100 text-purple-700 border border-purple-200' : u.role === 'TEACHER' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="p-4">
                              {courseObj ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                                  {courseLabel}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => handleResetPassword(u.rut)} 
                                  title="Resetear contraseña a primeros 6 dígitos del RUT" 
                                  className="text-gray-500 hover:text-amber-700 bg-gray-100 hover:bg-amber-100 p-1.5 rounded transition-colors"
                                >
                                  <KeyRound className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDelete(u.rut)} 
                                  title="Eliminar usuario" 
                                  className="text-gray-500 hover:text-red-700 bg-gray-100 hover:bg-red-100 p-1.5 rounded transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
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

          {/* Modal Contraseña Masiva por Curso */}
          {showBulkPasswordModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border">
                <div className="flex justify-between items-center p-4 border-b bg-amber-50">
                  <h3 className="font-bold text-lg text-amber-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-600" /> Contraseña Masiva por Curso
                  </h3>
                  <button onClick={() => setShowBulkPasswordModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleBulkPassword} className="p-5 space-y-4">
                  <p className="text-xs text-gray-600">
                    Esta función asigna una misma contraseña a todos los estudiantes del curso seleccionado. Ideal para agilizar el ingreso antes de rendir ensayos SIMCE.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Curso Destino ({selectedYear})</label>
                    <select
                      value={bulkCourseId}
                      onChange={(e) => setBulkCourseId(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      required
                    >
                      <option value="">-- Selecciona el Curso --</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.level.replace("B", "° Básico").replace("M", "° Medio")} {c.letter} ({c.year})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Nueva Contraseña para el Curso</label>
                    <input
                      required
                      type="text"
                      placeholder="Ej: Colegio2026! o simce123"
                      value={bulkPassword}
                      onChange={(e) => setBulkPassword(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkMustChange}
                        onChange={(e) => setBulkMustChange(e.target.checked)}
                        className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs text-gray-700">
                        <strong>Exigir cambio de contraseña al ingresar</strong>
                        <span className="block text-gray-500 text-[11px] mt-0.5">
                          Desmarcado por defecto para permitir acceso inmediato a las pruebas sin forzar cambio de clave.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button 
                      type="button" 
                      onClick={() => setShowBulkPasswordModal(false)} 
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      disabled={bulkSubmitting}
                      className="px-4 py-2 bg-amber-600 text-white hover:bg-amber-700 rounded-lg font-bold text-sm shadow-sm transition-colors disabled:opacity-50"
                    >
                      {bulkSubmitting ? "Asignando..." : "Asignar a Todo el Curso"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Crear Usuario Manual */}
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                  <h3 className="font-bold text-lg text-gray-800">Añadir Usuario Manual</h3>
                  <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleCreateUser} className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">RUT (con guion)</label>
                    <input 
                      required 
                      type="text" 
                      placeholder="Ej: 12345678-9"
                      value={formRut} 
                      onChange={e => setFormRut(formatRutInput(e.target.value))}
                      className="w-full border rounded-lg p-2.5 text-sm focus:outline-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre Completo</label>
                    <input 
                      required 
                      type="text" 
                      value={formName} 
                      onChange={e => setFormName(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-sm focus:outline-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Rol</label>
                    <select 
                      value={formRole} 
                      onChange={e => setFormRole(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-sm focus:outline-blue-500"
                    >
                      <option value="STUDENT">Estudiante</option>
                      <option value="TEACHER">Profesor</option>
                      <option value="DIRECTOR">Director</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </div>
                  {(formRole === 'STUDENT' || formRole === 'TEACHER') && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Curso Asignado ({selectedYear}) {formRole === 'TEACHER' && "(Opcional)"}
                      </label>
                      <select 
                        value={formCourseId} 
                        onChange={e => setFormCourseId(e.target.value)}
                        className="w-full border rounded-lg p-2.5 text-sm focus:outline-blue-500"
                        required={formRole === 'STUDENT'}
                      >
                        <option value="">-- Sin curso --</option>
                        {courses.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.level.replace("B", "° Básico").replace("M", "° Medio")} {c.letter} ({c.year})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="pt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold text-sm">Crear Usuario</button>
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
