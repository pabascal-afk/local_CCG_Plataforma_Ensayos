"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, AlertCircle, Info } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { homeForRole, saveSession, type SessionUser } from "@/lib/session";

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
  const router = useRouter();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired")) {
      setNotice("Tu sesión expiró. Vuelve a iniciar sesión.");
    }
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <img src="/CCG-logo-300x300.png" alt="Logo CCG" className="w-24 h-24 mb-2 object-contain" />
        <h2 className="text-center text-3xl font-extrabold text-gray-900">ENSAYOS CCG</h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Ingresa con los datos proporcionados por tu colegio
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            {notice && !error && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 flex items-center">
                <Info className="w-5 h-5 text-blue-500 mr-2" />
                <p className="text-sm text-blue-700">{notice}</p>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="rut" className="block text-sm font-medium text-gray-700">
                RUT
              </label>
              <input
                id="rut"
                name="rut"
                type="text"
                autoComplete="username"
                placeholder="Ej: 12345678-5"
                required
                value={rut}
                onChange={(e) => setRut(formatRutInput(e.target.value))}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
              />
              <p className="mt-2 text-xs text-gray-500">
                ¿Olvidaste tu contraseña? Pídele a tu profesor(a) o al administrador que la restablezca.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? "Iniciando sesión…" : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
