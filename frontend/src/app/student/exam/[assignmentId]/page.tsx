"use client";

import dynamic from "next/dynamic";
import RequireRole from "@/components/RequireRole";

// react-pdf necesita el navegador: se carga sin SSR
const ExamScreen = dynamic(() => import("@/components/ExamScreen"), { ssr: false });

export default function StudentExamPage({ params }: { params: { assignmentId: string } }) {
  return <RequireRole roles={["STUDENT"]}>{() => <ExamScreen assignmentId={Number(params.assignmentId)} />}</RequireRole>;
}
