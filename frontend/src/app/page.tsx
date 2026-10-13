"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser, homeForRole } from "@/lib/session";

// La raíz redirige: al login si no hay sesión, o al inicio del rol.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!getToken() || !user) router.replace("/login");
    else if (user.mustChangePassword) router.replace("/change-password");
    else router.replace(homeForRole(user.role));
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      <div className="animate-pulse">Cargando…</div>
    </div>
  );
}
