"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Users, Clock, CheckCircle2, ChevronRight, BarChart2, Download } from "lucide-react";
import RequireRole from "@/components/RequireRole";
import AppShell from "@/components/AppShell";
import { apiFetch, ApiError } from "@/lib/api";
import { useSchoolYear } from "@/context/SchoolYearContext";

type Assignment = {
  id: number;
  examId: number;
  courseId: number;
  courseName: string;
  title: string;
  subject: string;
  opensAt: string;
  closesAt: string;
  released: boolean;
  releasedAt: string | null;
  submissionsCount: number;
  totalStudents: number;
};

function TeacherDashboard() {
  const { selectedYear } = useSchoolYear();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Assignment[]>(`/teacher/assignments?year=${selectedYear}`)
      .then(setAssignments)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"));
  }, [selectedYear]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portal del Profesor</h1>
          <p className="text-gray-500">Monitoreo y resultados de los ensayos asignados a tus cursos.</p>
        </div>
        {assignments && assignments.length > 0 && (
          <button
            onClick={() => {
              const token = typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : "";
              window.location.href = `/api/teacher/assignments-export.xlsx?token=${token}`;
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" /> Exportar Resumen a Excel
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {!assignments && !error ? (
        <div className="text-gray-500 animate-pulse">Cargando...</div>
      ) : assignments?.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
          No tienes cursos o ensayos asignados actualmente.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments?.map((a) => {
            const now = new Date();
            const opens = new Date(a.opensAt);
            const closes = new Date(a.closesAt);
            const isLive = now >= opens && now <= closes;
            const isClosed = now > closes;
            
            return (
              <div key={a.id} className="bg-white border rounded-xl p-6 shadow-sm flex flex-col relative overflow-hidden group hover:border-blue-300 transition-colors">
                {isLive && (
                  <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wider">
                    En Curso
                  </div>
                )}
                {isClosed && (
                  <div className="absolute top-0 right-0 bg-gray-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wider">
                    Finalizado
                  </div>
                )}
                
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded">
                    {a.courseName}
                  </span>
                  <span className="text-xs text-gray-500 uppercase font-semibold">
                    {a.subject}
                  </span>
                </div>
                
                <h3 className="font-bold text-gray-900 mb-4 line-clamp-2" title={a.title}>
                  {a.title}
                </h3>
                
                <div className="mt-auto space-y-2 mb-6 text-sm text-gray-600">
                  <div className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                    <span className="flex items-center"><Users className="w-4 h-4 mr-2 text-gray-400" /> Rendición</span>
                    <span className="font-semibold text-gray-900">{a.submissionsCount} / {a.totalStudents}</span>
                  </div>
                  
                  <div className="flex justify-between items-center px-3 py-2">
                    <span className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-gray-400" /> Resultados</span>
                    <span className={`font-semibold ${a.released ? 'text-green-600' : 'text-amber-600'}`}>
                      {a.released ? 'Liberados' : 'Ocultos'}
                    </span>
                  </div>
                </div>
                
                <Link 
                  href={`/teacher/assignments/${a.id}`} 
                  className="w-full inline-flex items-center justify-center bg-gray-50 hover:bg-blue-50 text-blue-600 font-semibold py-2.5 rounded-lg border border-transparent group-hover:border-blue-200 transition-colors"
                >
                  Ver Reporte <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TeacherPage() {
  return (
    <RequireRole roles={["TEACHER", "ADMIN", "DIRECTOR"]}>
      {(user) => (
        <AppShell user={user}>
          <TeacherDashboard />
        </AppShell>
      )}
    </RequireRole>
  );
}
