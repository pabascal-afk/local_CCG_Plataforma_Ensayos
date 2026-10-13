"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken, getUser, homeForRole, updateUser, type SessionUser } from "@/lib/session";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!getToken() || !u) router.replace("/login");
    else setUser(u);
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) return setError("La nueva contraseña debe tener al menos 6 caracteres");
    if (newPassword !== confirm) return setError("Las contraseñas no coinciden");
    setLoading(true);
    try {
      const data = await apiFetch<{ user: SessionUser }>("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      updateUser(data.user);
      setDone(true);
      setTimeout(() => router.replace(homeForRole(data.user.role)), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const input =
    "mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4">
      <div className="mx-auto w-full max-w-md bg-white p-8 rounded-lg shadow border border-gray-100">
        <div className="flex items-center mb-2">
          <KeyRound className="w-6 h-6 text-blue-600 mr-2" />
          <h1 className="text-xl font-bold text-gray-900">Cambiar contraseña</h1>
        </div>
        {user.mustChangePassword && (
          <p className="text-sm text-gray-600 mb-6">
            Hola {user.name.split(" ")[0]}, es tu primer ingreso. Por seguridad, crea una contraseña nueva.
          </p>
        )}

        {done ? (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 flex items-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 mr-2" />
            <p className="text-sm text-green-700">Contraseña actualizada. Redirigiendo…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-4">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña actual</label>
              <input type="password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={input} autoComplete="current-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nueva contraseña (mínimo 6 caracteres)</label>
              <input type="password" required value={newPassword} onChange={(e) => setNew(e.target.value)} className={input} autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Repetir nueva contraseña</label>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} autoComplete="new-password" />
            </div>
            <div className="flex gap-3 pt-2">
              {!user.mustChangePassword && (
                <button type="button" onClick={() => router.back()} className="flex-1 py-2 px-4 border rounded-md text-sm text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
              )}
              <button type="submit" disabled={loading} className="flex-1 py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                {loading ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
