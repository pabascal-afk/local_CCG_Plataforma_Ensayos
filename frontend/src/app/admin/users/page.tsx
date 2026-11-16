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
  Calendar,
  Pencil,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Lock,
  UserCheck,
  UserX
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
  isActive?: boolean;
  createdAt?: string;
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

  // Filtros de búsqueda en la tabla
  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Modal contraseña masiva por curso
  const [showBulkPasswordModal, setShowBulkPasswordModal] = useState(false);
  const [bulkCourseId, setBulkCourseId] = useState("");
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkMustChange, setBulkMustChange] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Modal Crear Usuario Manual
  const [formRut, setFormRut] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("STUDENT");
  const [formCourseId, setFormCourseId] = useState("");
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);

  // Modal Editar Usuario
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRut, setEditRut] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("STUDENT");
  const [editCourseId, setEditCourseId] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editMustChangePassword, setEditMustChangePassword] = useState(false);
  const [editResetPassword, setEditResetPassword] = useState(false);
  const [editCustomPassword, setEditCustomPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");

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
      setSuccessNotice("Usuario creado correctamente");
      setTimeout(() => setSuccessNotice(""), 4000);
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

  const handleOpenEditModal = (u: User) => {
    setEditingUser(u);
    setEditRut(u.rut);
    setEditName(u.name);
    setEditRole(u.role);
    setEditCourseId(u.courseId ? String(u.courseId) : "");
    setEditIsActive(u.isActive !== false);
    setEditMustChangePassword(!!u.mustChangePassword);
    setEditResetPassword(false);
    setEditCustomPassword("");
    setEditError("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setEditError("");

    try {
      const payload: any = {
        rut: editRut.trim(),
        name: editName.trim(),
        role: editRole,
        courseId: editRole === "STUDENT" ? (editCourseId ? parseInt(editCourseId, 10) : null) : null,
        isActive: editIsActive,
        mustChangePassword: editMustChangePassword
      };

      if (editResetPassword) {
        payload.resetPassword = true;
      } else if (editCustomPassword.trim()) {
        payload.password = editCustomPassword.trim();
      }

      await apiFetch(`/admin/users/${editingUser.rut}`, {
        method: "PUT",
        body: payload
      });

      setEditingUser(null);
      setSuccessNotice(`Datos del usuario ${editName.trim()} (${editRut.trim()}) actualizados con éxito.`);
      setTimeout(() => setSuccessNotice(""), 4000);
      await loadData();
    } catch (err: any) {
      setEditError(err.message || "Error al actualizar el usuario");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleResetPassword = async (rut: string) => {
    if (!confirm(`¿Resetear contraseña para ${rut}? Volverá a ser los primeros 6 dígitos de su RUT.`)) return;
    try {
      await apiFetch(`/admin/users/${rut}`, {
        method: "PUT",
        body: { resetPassword: true }
      });
      setSuccessNotice(`Contraseña para ${rut} reseteada con éxito.`);
      setTimeout(() => setSuccessNotice(""), 4000);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (rut: string) => {
    if (!confirm(`¿Seguro que quieres eliminar al usuario ${rut}?`)) return;
    try {
      await apiFetch(`/admin/users/${rut}`, { method: "DELETE" });
      setSuccessNotice(`Usuario ${rut} eliminado.`);
      setTimeout(() => setSuccessNotice(""), 4000);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredUsers = users.filter((u) => {
    // Filtro pestaña (Estudiantes vs Personal)
    if (activeTab === "STUDENTS" && u.role !== "STUDENT") return false;
    if (activeTab === "STAFF" && u.role === "STUDENT") return false;

    // Filtro de búsqueda por texto (RUT o Nombre)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchRut = u.rut.toLowerCase().includes(q);
      const matchName = u.name.toLowerCase().includes(q);
      if (!matchRut && !matchName) return false;
    }

    // Filtro por curso
    if (courseFilter !== "ALL") {
      if (courseFilter === "NONE") {
        if (u.courseId !== null && u.courseId !== undefined) return false;
      } else {
        if (String(u.courseId) !== courseFilter) return false;
      }
    }

    // Filtro por estado activo / inactivo
    if (statusFilter === "ACTIVE" && u.isActive === false) return false;
    if (statusFilter === "INACTIVE" && u.isActive !== false) return false;

    return true;
  });

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

            {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-200">{error}</div>}

            {successNotice && (
              <div className="bg-emerald-50 text-emerald-800 p-3.5 rounded-lg mb-6 border border-emerald-200 flex items-center gap-2 text-sm font-medium animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {successNotice}
              </div>
            )}

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="flex border-b bg-gray-50">
                <button 
                  onClick={() => { setActiveTab("STUDENTS"); setCourseFilter("ALL"); }}
                  className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'STUDENTS' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Estudiantes ({users.filter(u => u.role === "STUDENT").length})
                </button>
                <button 
                  onClick={() => { setActiveTab("STAFF"); setCourseFilter("ALL"); }}
                  className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'STAFF' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Profesores y Directivos ({users.filter(u => u.role !== "STUDENT").length})
                </button>
              </div>

              {/* Filtros de Búsqueda y Selección */}
              <div className="p-3 border-b bg-gray-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por RUT o Nombre..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")} 
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs bg-gray-100 rounded px-1.5 py-0.5"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === "STUDENTS" && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Filter className="w-3.5 h-3.5 text-gray-400" />
                      <select
                        value={courseFilter}
                        onChange={(e) => setCourseFilter(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2.5 py-2 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="ALL">Todos los Cursos</option>
                        <option value="NONE">Sin Curso Asignado</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.level.replace("B", "° Básico").replace("M", "° Medio")} {c.letter} ({c.year})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="border border-gray-300 rounded-lg px-2.5 py-2 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">Todos los Estados</option>
                    <option value="ACTIVE">Solo Activos</option>
                    <option value="INACTIVE">Solo Inactivos</option>
                  </select>

                  {(searchQuery || courseFilter !== "ALL" || statusFilter !== "ALL") && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setCourseFilter("ALL");
                        setStatusFilter("ALL");
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 underline px-1 py-1 font-medium"
                    >
                      Restablecer filtros
                    </button>
                  )}
                </div>
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
                      <th className="p-4 font-semibold text-center w-28">Estado</th>
                      <th className="p-4 font-semibold text-center w-32">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {loading ? (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-500">Cargando usuarios...</td></tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">
                          No se encontraron usuarios coincidentes con los filtros seleccionados para el año {selectedYear}.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => {
                        const courseObj = u.course || u.Course;
                        const courseLabel = courseObj 
                          ? `${courseObj.level.replace('B', '° Básico').replace('M', '° Medio')} ${courseObj.letter} (${courseObj.year})`
                          : '-';

                        return (
                          <tr key={u.rut} className={`hover:bg-gray-50/80 transition-colors ${u.isActive === false ? 'bg-gray-50/50 opacity-75' : ''}`}>
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
                                <span className="text-gray-400 text-xs italic">Sin curso</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              {u.isActive !== false ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Activo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Inactivo
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => handleOpenEditModal(u)} 
                                  title="Editar usuario (RUT, nombre, rol, curso, estado, contraseña)" 
                                  className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition-colors"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
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

          {/* Modal Editar Usuario */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border max-h-[92vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b bg-blue-50">
                  <div>
                    <h3 className="font-bold text-lg text-blue-900 flex items-center gap-2">
                      <Pencil className="w-5 h-5 text-blue-600" /> Editar Usuario
                    </h3>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Editando: <span className="font-semibold">{editingUser.name}</span> ({editingUser.rut})
                    </p>
                  </div>
                  <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveEdit} className="p-5 space-y-4 overflow-y-auto flex-1">
                  {editError && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs border border-red-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                      <span>{editError}</span>
                    </div>
                  )}

                  {/* RUT */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      RUT (con guion)
                    </label>
                    <input 
                      required 
                      type="text" 
                      value={editRut} 
                      onChange={e => setEditRut(formatRutInput(e.target.value))}
                      className="w-full border rounded-lg p-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    {editRut !== editingUser.rut && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded mt-1.5 border border-amber-200">
                        <strong>Aviso de actualización en cascada:</strong> Al cambiar el RUT, el sistema actualizará automáticamente todas sus respuestas, pruebas rendidas, cursos y registros de auditoría sin perder datos.
                      </p>
                    )}
                  </div>

                  {/* Nombre */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo</label>
                    <input 
                      required 
                      type="text" 
                      value={editName} 
                      onChange={e => setEditName(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Rol y Curso */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Rol</label>
                      <select 
                        value={editRole} 
                        onChange={e => setEditRole(e.target.value)}
                        className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="STUDENT">Estudiante</option>
                        <option value="TEACHER">Profesor</option>
                        <option value="DIRECTOR">Director</option>
                        <option value="ADMIN">Administrador</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Curso Asignado ({selectedYear})
                      </label>
                      <select 
                        value={editCourseId} 
                        onChange={e => setEditCourseId(e.target.value)}
                        disabled={editRole !== 'STUDENT'}
                        className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="">-- Sin curso --</option>
                        {courses.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.level.replace("B", "° Básico").replace("M", "° Medio")} {c.letter} ({c.year})
                          </option>
                        ))}
                      </select>
                      {editRole !== 'STUDENT' && (
                        <p className="text-[10px] text-gray-400 mt-1">Los roles no-estudiante no usan curso fijo.</p>
                      )}
                    </div>
                  </div>

                  {/* Estado de Cuenta */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Estado de la Cuenta</label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="radio"
                          name="editIsActive"
                          checked={editIsActive === true}
                          onChange={() => setEditIsActive(true)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        <span className="font-medium text-emerald-700">Activo</span> (Acceso permitido)
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="radio"
                          name="editIsActive"
                          checked={editIsActive === false}
                          onChange={() => setEditIsActive(false)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <UserX className="w-4 h-4 text-rose-600" />
                        <span className="font-medium text-rose-700">Inactivo</span> (Acceso bloqueado)
                      </label>
                    </div>
                  </div>

                  {/* Sección de Contraseña / Acceso */}
                  <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                      <Lock className="w-3.5 h-3.5 text-amber-600" />
                      Gestión de Contraseña
                    </div>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editResetPassword}
                        onChange={(e) => {
                          setEditResetPassword(e.target.checked);
                          if (e.target.checked) setEditCustomPassword("");
                        }}
                        className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-700">
                        <strong>Resetear contraseña a los 6 primeros dígitos del RUT</strong>
                        <span className="block text-[11px] text-gray-500">
                          Nueva clave por defecto: <span className="font-mono font-bold text-blue-700">{editRut.split('-')[0].slice(0, 6) || "123456"}</span>
                        </span>
                      </span>
                    </label>

                    {!editResetPassword && (
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          O definir una nueva contraseña manual (opcional):
                        </label>
                        <input
                          type="text"
                          placeholder="Dejar en blanco para mantener la clave actual"
                          value={editCustomPassword}
                          onChange={(e) => setEditCustomPassword(e.target.value)}
                          className="w-full border rounded-lg p-2 text-xs font-mono bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    )}

                    <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-slate-200/80">
                      <input
                        type="checkbox"
                        checked={editMustChangePassword}
                        onChange={(e) => setEditMustChangePassword(e.target.checked)}
                        className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-700">
                        Exigir cambio de clave al próximo inicio de sesión
                      </span>
                    </label>
                  </div>

                  <div className="pt-2 flex justify-end gap-2 border-t">
                    <button 
                      type="button" 
                      onClick={() => setEditingUser(null)} 
                      disabled={savingEdit}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      disabled={savingEdit}
                      className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold text-sm shadow-sm transition-colors disabled:opacity-50"
                    >
                      {savingEdit ? "Guardando..." : "Guardar Cambios"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

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
