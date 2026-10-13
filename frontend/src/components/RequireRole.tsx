"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser, homeForRole, type Role, type SessionUser } from "@/lib/session";

/**
 * Protege una página por rol. Redirige al login si no hay sesión,
 * a cambio de contraseña si es obligatorio, o al inicio de su rol si no tiene permiso.
 */
export default function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: (user: SessionUser) => React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!getToken() || !u) {
      router.replace("/login");
      return;
    }
    if (u.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    if (!roles.includes(u.role)) {
      router.replace(homeForRole(u.role));
      return;
    }
    setUser(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <div className="animate-pulse">Cargando…</div>
      </div>
    );
  }
  return <>{children(user)}</>;
}
