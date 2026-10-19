"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, AlertCircle, Info, Users, Search, KeyRound, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { homeForRole, saveSession, type SessionUser } from "@/lib/session";
import StudentSearchModal from "@/components/StudentSearchModal";

function formatRutInput(val: string): string {
  const trimmed = val.trim();
  if (/^[a-zA-Z]+$/.test(trimmed)) {
    return val;
  }
  const clean = val.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (clean.length <= 1) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

export default function LoginPage() {
  const [rut, setRut] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedStudentInfo, setSelectedStudentInfo] = useState<{ name: string; courseLabel?: string } | null>(null);

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired")) {
      setNotice("Tu sesión expiró. Vuelve a iniciar sesión.");
    }
  }, []);

  const handleSelectStudent = (student: { rut: string; name: string; courseLabel?: string }) => {
    setRut(formatRutInput(student.rut));
    setSelectedStudentInfo({ name: student.name, courseLabel: student.courseLabel });
    setError("");
    // Enfocar automáticamente el campo de contraseña
    setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 150);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: SessionUser }>("/auth/login", {
        method: "POST",
        body: { rut, password },
      });
      saveSession(data.token, data.user);
      router.replace(data.user.mustChangePassword ? "/change-password" : homeForRole(data.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const isTestEnv = typeof window !== "undefined" && window.location.port === "3600";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <img src="/CCG-logo-300x300.png" alt="Logo CCG" className="w-24 h-24 mb-2 object-contain" />
        <h2 className={`text-center text-3xl font-extrabold ${isTestEnv ? "text-amber-600" : "text-gray-900"}`}>
          {isTestEnv ? "PRUEBAS CCG" : "ENSAYOS CCG"}
        </h2>
        {isTestEnv && (
          <span className="inline-block px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 rounded-full mt-1.5 border border-amber-300">
            Ambiente de Pruebas (Puerto 3600)
          </span>
        )}
        <p className="mt-2 text-center text-sm text-gray-600">
          Ingresa con los datos proporcionados por tu colegio
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          
          {/* Asistente Rápido: Buscar mi Usuario por Curso */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border border-blue-200 rounded-2xl p-3.5 mb-5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                  <Users className="w-4 h-4 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-blue-950 truncate">¿No recuerdas tu RUT?</p>
                  <p className="text-[11px] text-blue-800 font-medium truncate">Selecciona tu curso y búscate en la lista</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSearchModal(true)}
                className="flex-shrink-0 whitespace-nowrap px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Buscar Estudiante</span>
              </button>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
            {notice && !error && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 flex items-center rounded-r-lg">
                <Info className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0" />
                <p className="text-sm text-blue-700">{notice}</p>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 flex items-center rounded-r-lg">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* RUT o Estudiante Seleccionado */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="rut" className="block text-sm font-bold text-gray-700">
                  RUT del Usuario
                </label>
                <button
                  type="button"
                  onClick={() => setShowSearchModal(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-1"
                >
                  <Search className="w-3 h-3" />
                  <span>Buscar por curso</span>
                </button>
              </div>

              {selectedStudentInfo ? (
                <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-xs flex-shrink-0 shadow-xs">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-emerald-950 truncate">{selectedStudentInfo.name}</p>
                      <p className="text-[11px] text-emerald-700 font-medium">
                        {selectedStudentInfo.courseLabel ? `${selectedStudentInfo.courseLabel} • ` : ""}
                        RUT: <span className="font-mono font-bold">{rut}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentInfo(null);
                      setRut("");
                    }}
                    className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline px-2 py-1 hover:bg-emerald-100 rounded-lg transition"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <input
                  id="rut"
                  name="rut"
                  type="text"
                  autoComplete="username"
                  placeholder="Ej: 12345678-5 o admin"
                  required
                  value={rut}
                  onChange={(e) => {
                    setRut(formatRutInput(e.target.value));
                    setSelectedStudentInfo(null);
                  }}
                  className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-2xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 font-medium"
                />
              )}
            </div>

            {/* Contraseña o Clave de Prueba */}
            <div>
              <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-1">
                Contraseña o PIN de Prueba
              </label>
              <input
                ref={passwordInputRef}
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña o el PIN..."
                className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-xl shadow-2xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 font-medium"
              />
              <p className="mt-1.5 text-xs text-indigo-700 font-medium flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 flex-shrink-0 text-indigo-600" />
                <span>Ingresa tu contraseña o el PIN generado por tu profesor (ej: SIMCE4A o CCG...)</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-black text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              {loading ? "Iniciando sesión…" : "Ingresar a la Plataforma"}
            </button>
          </form>
        </div>
      </div>

      {/* Modal Buscador de Estudiante por Curso */}
      <StudentSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectStudent={handleSelectStudent}
      />
    </div>
  );
}
