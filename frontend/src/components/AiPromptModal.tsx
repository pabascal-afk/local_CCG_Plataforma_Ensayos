"use client";

import { useState, useMemo } from "react";
import { 
  Sparkles, Copy, Check, Download, X, FileSpreadsheet, 
  Bot, HelpCircle, CheckCircle2, SlidersHorizontal, 
  FileText, Lightbulb, ChevronRight
} from "lucide-react";

export type AiPromptMode = "EXAM_XLSX" | "REMEDIAL" | "UTP_REPORT" | "CLASS_WORKSHOP";

interface AiPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: AiPromptMode;
  initialLevel?: string; // ej: "4° Básico", "2° Medio" o "4B", "2M"
  initialSubject?: string; // ej: "Matemática", "Lenguaje"
  initialCourseName?: string; // ej: "4° Básico B"
  initialExamTitle?: string; // ej: "Ensayo SIMCE Matemática N°1"
  initialDescendedOa?: string; // ej: "OA 4: Fracciones y Operaciones"
}

export default function AiPromptModal({
  isOpen,
  onClose,
  defaultMode = "EXAM_XLSX",
  initialLevel = "4° Básico",
  initialSubject = "Matemática",
  initialCourseName,
  initialExamTitle,
  initialDescendedOa
}: AiPromptModalProps) {
  const [activeTab, setActiveTab] = useState<AiPromptMode>(defaultMode);

  // Estados configurables para el generador
  const normalizeLevel = (lvl?: string) => {
    if (!lvl) return "4° Básico";
    if (lvl.includes("Básico") || lvl.includes("Medio")) return lvl;
    return lvl.replace("B", "° Básico").replace("M", "° Medio");
  };

  const [level, setLevel] = useState(normalizeLevel(initialLevel));
  const [subject, setSubject] = useState(initialSubject || "Matemática");
  const [examType, setExamType] = useState("Ensayo SIMCE");
  const [questionCount, setQuestionCount] = useState<number>(30);
  const [optionCount, setOptionCount] = useState<number>(4);
  const [targetOa, setTargetOa] = useState(initialDescendedOa || "OA 4 (Fracciones y Números Mixtos)");
  const [courseName, setCourseName] = useState(initialCourseName || "4° Básico B");
  const [examOriginTitle, setExamOriginTitle] = useState(initialExamTitle || "Ensayo SIMCE Oficial N°1");
  const [includeExplanations, setIncludeExplanations] = useState(true);

  // Estado de copiado
  const [copied, setCopied] = useState(false);

  // Sincronizar si cambian props externas al abrir
  useMemo(() => {
    if (defaultMode) setActiveTab(defaultMode);
    if (initialLevel) setLevel(normalizeLevel(initialLevel));
    if (initialSubject) setSubject(initialSubject);
    if (initialCourseName) setCourseName(initialCourseName);
    if (initialExamTitle) setExamOriginTitle(initialExamTitle);
    if (initialDescendedOa) setTargetOa(initialDescendedOa);
  }, [defaultMode, initialLevel, initialSubject, initialCourseName, initialExamTitle, initialDescendedOa]);

  // Generación dinámica de prompts
  const generatedPrompt = useMemo(() => {
    if (activeTab === "EXAM_XLSX") {
      const optionsText = optionCount === 4 ? "4 alternativas (A, B, C, D)" : "5 alternativas (A, B, C, D, E)";
      return `Actúa como un Especialista Curricular y Metodólogo Senior de Evaluación Estandarizada SIMCE de la Agencia de Calidad de la Educación y el MINEDUC de Chile.

Tu misión es crear una evaluación completa y rigurosa con su correspondiente pauta técnica para el nivel **${level}** en la asignatura de **${subject}**, bajo la modalidad de **${examType}**, compuesta por **${questionCount} preguntas**.

### REQUISITOS PSICOMÉTRICOS Y METODOLÓGICOS SIMCE:
1. **Alineación Curricular**: Basar cada ítem en los Objetivos de Aprendizaje (OA) y Ejes Temáticos oficiales vigentes de ${level}.
2. **Estructura de Ítems**: Preguntas de opción múltiple con ${optionsText}.
3. **Calidad de Distractores**:
   - Una única clave correcta indiscutible.
   - Distractores plausibles que capturen errores conceptuales típicos o procedimientos incompletos de estudiantes de ${level}.
   - Ninguna opción del tipo "todas las anteriores" ni "ninguna de las anteriores".
   - Opciones con longitud y estructura gramatical simétrica.
4. **Distribución de Dificultad (TRI - Teoría de Respuesta al Ítem)**:
   - 30% Fácil (Dificultad TRI -1.5 a -0.5)
   - 50% Media (Dificultad TRI -0.4 a +0.6)
   - 20% Difícil (Dificultad TRI +0.7 a +1.8)

---

### FORMATO OBLIGATORIO DE SALIDA PARA EXCEL (.xlsx):
Por favor, genera un archivo Excel (.xlsx) o una tabla completa perfectamente estructurada con las siguientes columnas exactas para ser importada directamente al sistema:

| Numero | Clave | Habilidad | Eje | OA | Dificultad | ${includeExplanations ? "Enunciado_Pregunta | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Justificacion_Pedagogica" : ""} |

**Detalle de las columnas de la Pauta Oficial**:
- **Numero**: 1 a ${questionCount} correlativo.
- **Clave**: Letra de la respuesta correcta en MAYÚSCULA (${optionCount === 4 ? "A, B, C o D" : "A, B, C, D o E"}).
- **Habilidad**: Habilidad curricular evaluada (ej: ${subject.toLowerCase().includes("matem") ? "Conocer, Aplicar, Razonar / Resolver Problemas, Modelar, Argumentar" : "Localizar información, Interpretar y relacionar, Reflexionar y evaluar"}).
- **Eje**: Eje temático oficial de ${level} (ej: ${subject.toLowerCase().includes("matem") ? "Números y Operaciones, Patrones y Álgebra, Geometría, Medición, Datos y Probabilidades" : "Lectura, Escritura, Comunicación Oral"}).
- **OA**: Código del Objetivo de Aprendizaje (ej: OA 1, OA 3, OA 5, OA 12).
- **Dificultad**: Valor numérico TRI (ej: -1.2, 0.0, 1.4).
${includeExplanations ? `- **Enunciado_Pregunta**: El texto claro y contextualizado de la pregunta.
- **Opcion_A**: Texto de la opción A.
- **Opcion_B**: Texto de la opción B.
- **Opcion_C**: Texto de la opción C.
- **Opcion_D**: Texto de la opción D.
- **Justificacion_Pedagogica**: Breve explicación de por qué la clave es correcta y qué error pedagógico evidencia cada distractor.` : ""}

Entrega el resultado completo con las ${questionCount} filas desarrolladas sin omitir ninguna pregunta, listo para ser copiado a Excel o descargado.`;
    }

    if (activeTab === "REMEDIAL") {
      return `Actúa como Coordinador Pedagógico y Especialista en Remediales SIMCE del MINEDUC de Chile.

El curso **${courseName}** rindió la evaluación **"${examOriginTitle}"** en la asignatura de **${subject}** (${level}) y los resultados de la plataforma arrojaron una alerta temprana por Objetivos de Aprendizaje descendidos, requiriendo un Plan Remedial de nivelación urgente.

### OBJETIVO DE LA REMEDIAL:
Crear una evaluación formativa remedial concentrada de **10 preguntas de opción múltiple** con 4 alternativas (A-D) enfocada principalmente en reforzar y nivelar el siguiente Objetivo de Aprendizaje prioritario:
**${targetOa}**

### REQUERIMIENTOS DIDÁCTICOS DEL PLAN REMEDIAL:
1. **Gradualidad Cognitiva**:
   - Ítems 1-3: Activación y concepto base (Habilidad Conocer / Localizar información elemental).
   - Ítems 4-7: Aplicación guiada en contextos cotidianos (Habilidad Aplicar / Interpretar y relacionar).
   - Ítems 8-10: Desafío de razonamiento y resolución de problemas (Habilidad Razonar / Reflexionar y evaluar).
2. **Análisis de Error Didáctico**: Cada distractor debe reflejar específicamente el error de concepción más recurrente que tienen los alumnos en este OA.

### SALIDA REQUERIDA (FORMATO EXCEL .xlsx PARA IMPORTACIÓN):
Entrega una tabla con las 10 preguntas con las siguientes columnas exactas:
| Numero | Clave | Habilidad | Eje | OA | Dificultad | Enunciado | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Error_Asociado_Distractor |

Al final de la tabla, incluye una breve **Estrategia Didáctica de 3 pasos** que el docente de ${courseName} puede ejecutar en los primeros 15 minutos de la clase para asegurar que todos los estudiantes superen este OA descendido.`;
    }

    if (activeTab === "UTP_REPORT") {
      return `Actúa como Jefe de Unidad Técnica Pedagógica (UTP) y Asesor de Mejora Escolar para colegios en Chile.

Necesito que redactes un **Informe Técnico-Pedagógico y Plan de Acción Institucional** basado en los resultados obtenidos por los estudiantes de **${level}** en las evaluaciones SIMCE de **${subject}**.

### ESTRUCTURA DEL INFORME REQUERIDA:
1. **Diagnóstico Ejecutivo**:
   - Análisis del puntaje promedio estimado en la escala SIMCE (100 a 400 puntos).
   - Diagnóstico de la distribución de estudiantes en los tres Estándares de Aprendizaje: Insuficiente, Elemental y Adecuado.
2. **Identificación de Brechas Críticas**:
   - Detección de los Ejes Temáticos y Objetivos de Aprendizaje con menor porcentaje de logro.
   - Brechas comparativas entre cursos paralelos (ej: Curso A vs Curso B).
3. **Plan de Intervención Focalizado (PME - Plan de Mejoramiento Educativo)**:
   - Metas cuantitativas de avance para el próximo ensayo (ej: reducir en 15% el nivel Insuficiente).
   - Acciones de aula inmediatas: modelamiento metacognitivo, trabajo con guías de error frecuente y evaluaciones remediales cortas.
   - Calendario sugerido de monitoreo para las próximas 4 semanas.
4. **Pautas de Acompañamiento al Aula**:
   - Preguntas clave para la retroalimentación entre pares y consejo de profesores de ciclo.

Redacta el informe con tono técnico, riguroso y constructivo, listo para ser presentado al Equipo Directivo y Sostenedor.`;
    }

    if (activeTab === "CLASS_WORKSHOP") {
      return `Actúa como Profesor Especialista de Aula en **${subject}** para **${level}** en Chile.

Diseña un **Taller Práctico de Reforzamiento en Aula (Duración: 90 minutos / 2 horas pedagógicas)** para el curso **${courseName}**, enfocado en superar las dificultades detectadas en el ensayo reciente.

### ESTRUCTURA DEL TALLER (MÉTODO DE ENSEÑANZA EXPLÍCITA):
1. **Fase 1: Activación y Demostración (15 min)**:
   - Pregunta detonante basada en un problema cotidiano.
   - "Pensamiento en Voz Alta" del docente modelando el paso a paso para no caer en el distractor típico.
2. **Fase 2: Práctica Guiada (30 min)**:
   - 3 ejercicios resueltos en parejas con rúbrica rápida de auto-evaluación.
3. **Fase 3: Práctica Independiente (35 min)**:
   - 5 ejercicios tipo SIMCE con alternativas A-D. Incluye para cada uno la solución explicada.
4. **Fase 4: Ticket de Salida (10 min)**:
   - 1 ejercicio decisivo de 1 alternativa para comprobar si el 80%+ del curso dominó el concepto antes de terminar la clase.

Entrega todo el material listo para imprimir o proyectar en pizarra interactiva.`;
    }

    return "";
  }, [activeTab, level, subject, examType, questionCount, optionCount, targetOa, courseName, examOriginTitle, includeExplanations]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        
        {/* Header con gradiente IA */}
        <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Asistente de Prompts para Agentes de IA</h2>
                <span className="bg-amber-400 text-amber-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider shadow-xs">
                  IA Generativa
                </span>
              </div>
              <p className="text-xs text-indigo-100 font-medium mt-0.5">
                Genera prompts especializados para ChatGPT, Claude, Gemini o DeepSeek con especificaciones exactas en formato Excel (.xlsx).
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de Selección de Caso de Uso */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-2 overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab("EXAM_XLSX")}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              activeTab === "EXAM_XLSX"
                ? "bg-white text-indigo-700 border-indigo-600 shadow-xs"
                : "text-gray-600 hover:text-gray-900 border-transparent hover:bg-gray-100"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Crear Ensayo SIMCE en Excel</span>
          </button>

          <button
            onClick={() => setActiveTab("REMEDIAL")}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              activeTab === "REMEDIAL"
                ? "bg-white text-amber-700 border-amber-600 shadow-xs"
                : "text-gray-600 hover:text-gray-900 border-transparent hover:bg-gray-100"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>Evaluación Remedial (OA Descendido)</span>
          </button>

          <button
            onClick={() => setActiveTab("UTP_REPORT")}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              activeTab === "UTP_REPORT"
                ? "bg-white text-purple-700 border-purple-600 shadow-xs"
                : "text-gray-600 hover:text-gray-900 border-transparent hover:bg-gray-100"
            }`}
          >
            <FileText className="w-4 h-4 text-purple-600" />
            <span>Informe Técnico UTP</span>
          </button>

          <button
            onClick={() => setActiveTab("CLASS_WORKSHOP")}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              activeTab === "CLASS_WORKSHOP"
                ? "bg-white text-blue-700 border-blue-600 shadow-xs"
                : "text-gray-600 hover:text-gray-900 border-transparent hover:bg-gray-100"
            }`}
          >
            <Lightbulb className="w-4 h-4 text-blue-600" />
            <span>Taller de Refuerzo en Aula</span>
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Panel Izquierdo: Parámetros del Prompt */}
          <div className="lg:col-span-5 space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-xs font-bold text-gray-700">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              <span>Personalizar Parámetros del Prompt</span>
            </div>

            {/* Parámetros específicos según la pestaña */}
            {activeTab === "EXAM_XLSX" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Nivel Educativo</label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="4° Básico">4° Básico</option>
                      <option value="6° Básico">6° Básico</option>
                      <option value="8° Básico">8° Básico</option>
                      <option value="1° Medio">1° Medio</option>
                      <option value="2° Medio">2° Medio</option>
                      <option value="3° Medio">3° Medio</option>
                      <option value="4° Medio">4° Medio</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Asignatura</label>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Matemática">Matemática</option>
                      <option value="Lenguaje y Comunicación">Lenguaje</option>
                      <option value="Ciencias Naturales">Ciencias Naturales</option>
                      <option value="Historia y Geografía">Historia y Geografía</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Tipo de Prueba</label>
                    <select
                      value={examType}
                      onChange={(e) => setExamType(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Ensayo SIMCE Estándar">Ensayo SIMCE Estándar</option>
                      <option value="Quiz Corto Formativo">Quiz Corto</option>
                      <option value="Evaluación Remedial">Evaluación Remedial</option>
                      <option value="Diagnóstico Inicial">Diagnóstico Inicial</option>
                      <option value="Ensayo Extendido">Ensayo Extendido</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">N° de Preguntas</label>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={questionCount}
                      onChange={(e) => setQuestionCount(parseInt(e.target.value) || 30)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Opciones Alternativas</label>
                    <select
                      value={optionCount}
                      onChange={(e) => setOptionCount(parseInt(e.target.value) || 4)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={4}>4 alternativas (A, B, C, D)</option>
                      <option value={5}>5 alternativas (A, B, C, D, E)</option>
                    </select>
                  </div>

                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-700 font-medium">
                      <input
                        type="checkbox"
                        checked={includeExplanations}
                        onChange={(e) => setIncludeExplanations(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span>Incluir textos de preguntas y opciones</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "REMEDIAL" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Curso Destinatario</label>
                  <input
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Ej: 4° Básico B"
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Ensayo de Origen</label>
                  <input
                    type="text"
                    value={examOriginTitle}
                    onChange={(e) => setExamOriginTitle(e.target.value)}
                    placeholder="Ej: Ensayo Matemática N°1"
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">OA Descendido a Nivelar</label>
                  <input
                    type="text"
                    value={targetOa}
                    onChange={(e) => setTargetOa(e.target.value)}
                    placeholder="Ej: OA 4: Resolver operaciones combinadas con fracciones"
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            )}

            {activeTab === "UTP_REPORT" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Nivel a Analizar</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="4° Básico">4° Básico</option>
                    <option value="6° Básico">6° Básico</option>
                    <option value="8° Básico">8° Básico</option>
                    <option value="2° Medio">2° Medio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Asignatura</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="Matemática">Matemática</option>
                    <option value="Lenguaje y Comunicación">Lenguaje</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === "CLASS_WORKSHOP" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Curso</label>
                  <input
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Ej: 4° Básico B"
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Asignatura y Nivel</label>
                  <input
                    type="text"
                    value={`${subject} - ${level}`}
                    disabled
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg p-2 text-xs font-medium text-gray-500"
                  />
                </div>
              </div>
            )}

            {/* Caja de Ayuda y Flujo Recomendado */}
            <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-2 mt-4">
              <span className="text-[11px] font-black text-indigo-950 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
                Flujo Recomendado de Trabajo
              </span>
              <ol className="text-[11px] text-gray-600 space-y-1 list-decimal list-inside leading-snug">
                <li>Copia el prompt generado con el botón inferior.</li>
                <li>Pégalo en ChatGPT Plus, Claude 3.5 o Gemini 2.0 Pro.</li>
                <li>Descarga o copia la tabla Excel generada por el agente.</li>
                <li>Importa el archivo en la plataforma desde <strong>"Importar Pauta (.xlsx)"</strong>.</li>
              </ol>
              
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[10px] text-gray-400 font-semibold">Plantilla oficial vacía:</span>
                <a
                  href={`/api/admin/templates/exam_questions.xlsx?token=${typeof window !== "undefined" ? localStorage.getItem("simce_token") || "" : ""}`}
                  download="Formato_Pauta_Ensayo.xlsx"
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 hover:underline"
                >
                  <Download className="w-3 h-3 text-emerald-600" /> Descargar .xlsx
                </a>
              </div>
            </div>
          </div>

          {/* Panel Derecho: Visualizador del Prompt en Vivo */}
          <div className="lg:col-span-7 flex flex-col h-full bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-md">
            <div className="bg-gray-950 px-4 py-2.5 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="text-xs font-mono text-gray-400 ml-2">prompt_agente_ia.md</span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                  copied 
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30" 
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>¡Copiado al Portapapeles!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Prompt</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] text-gray-200 leading-relaxed whitespace-pre-wrap select-all">
              {generatedPrompt}
            </div>

            <div className="bg-gray-950/80 px-4 py-2 border-t border-gray-800/80 flex items-center justify-between text-[10px] text-gray-400">
              <span>{generatedPrompt.length} caracteres • Optimizado para ChatGPT, Claude y Gemini</span>
              <span className="text-indigo-400 font-semibold">Listo para ejecutar en tu Agente IA</span>
            </div>
          </div>

        </div>

        {/* Footer del Modal */}
        <div className="bg-gray-50 border-t border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Bot className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span>Compatible con <strong>OpenAI GPT-4o</strong>, <strong>Anthropic Claude 3.5 Sonnet</strong> y <strong>Google Gemini 2.0</strong>.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md transition"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "¡Prompt Copiado!" : "Copiar Prompt para Agente IA"}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
