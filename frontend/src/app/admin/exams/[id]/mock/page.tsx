"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import RequireRole from "@/components/RequireRole";

// react-pdf necesita el navegador: se carga sin SSR
const ExamScreen = dynamic(() => import("@/components/ExamScreen"), { ssr: false });

export default function AdminExamMockPage({ params }: { params: { id: string } }) {
  const examId = Number(params.id);

  return (
    <RequireRole roles={["ADMIN", "DIRECTOR"]}>
      {() =>
        !Number.isInteger(examId) || examId <= 0 ? (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <div className="bg-white border rounded-xl p-8 max-w-md text-center shadow-sm space-y-3">
              <p className="text-gray-800 font-semibold">ID de evaluación inválido para Mocktest.</p>
              <Link href="/admin/exams" className="inline-block text-blue-600 font-medium hover:underline">
                Volver al catálogo
              </Link>
            </div>
          </div>
        ) : (
          <ExamScreen mockExamId={examId} />
        )
      }
    </RequireRole>
  );
}
