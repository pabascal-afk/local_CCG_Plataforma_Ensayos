"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);

  return (
    <div className="p-8 text-center text-gray-400">
      Redirigiendo a Dashboard Global...
    </div>
  );
}
