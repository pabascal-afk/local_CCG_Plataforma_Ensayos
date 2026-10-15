"use client";

import { useState, useMemo, useEffect } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { 
  Sparkles, Copy, Check, Download, X, FileSpreadsheet, 
  Bot, HelpCircle, CheckCircle2, SlidersHorizontal, 
  FileText, Lightbulb, ChevronRight, BookOpen, Layers
} from "lucide-react";

export type AiPromptMode = "EXAM_XLSX" | "REMEDIAL" | "UTP_REPORT" | "CLASS_WORKSHOP";

interface AiPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: AiPromptMode;
  initialLevel?: string; // ej: "4° Básico", "5° Básico", "3° Medio", "4B", "5B", "3M"
  initialSubject?: string; // ej: "Matemática", "Inglés", "Lenguaje"
  initialCourseName?: string; // ej: "5° Básico A"
  initialExamTitle?: string; // ej: "Prueba Unidad 1 Matemática"
  initialDescendedOa?: string; // ej: "OA 4: Fracciones y Operaciones"
  isPruebasMode?: boolean; // Permite forzar o detectar automáticamente
}

export default function AiPromptModal({
  isOpen,
  onClose,
  defaultMode = "EXAM_XLSX",
  initialLevel,
  initialSubject,
  initialCourseName,
  initialExamTitle,
  initialDescendedOa,
  isPruebasMode
}: AiPromptModalProps) {
  // Detección inteligente de entorno (Puerto 3600 = PRUEBAS CCG, Puerto 3300 = SIMCE)
  const isPruebas = isPruebasMode ?? (typeof window !== "undefined" && (window.location.port === "3600" || window.location.hostname.includes("pruebas")));

  const [activeTab, setActiveTab] = useState<AiPromptMode>(defaultMode);

  // Normalizador de niveles escolares
  const normalizeLevel = (lvl?: string) => {
    if (!lvl) return isPruebas ? "5° Básico" : "4° Básico";
    if (lvl.includes("Básico") || lvl.includes("Medio")) return lvl;
    return lvl.replace("B", "° Básico").replace("M", "° Medio");
  };

  const defaultSub = initialSubject || (isPruebas ? "Matemática" : "Matemática");
  const defaultLvl = normalizeLevel(initialLevel);
  const defaultExType = isPruebas ? "Prueba de Unidad (con OAs seleccionados)" : "Ensayo SIMCE Estándar";

  const [level, setLevel] = useState(defaultLvl);
  const [subject, setSubject] = useState(defaultSub);
  const [examType, setExamType] = useState(defaultExType);
  const [questionCount, setQuestionCount] = useState<number>(isPruebas ? 20 : 30);
  const [optionCount, setOptionCount] = useState<number>(4);
  const [targetOa, setTargetOa] = useState(initialDescendedOa || "");
  const [courseName, setCourseName] = useState(initialCourseName || (isPruebas ? "5° Básico A" : "4° Básico B"));
  const [examOriginTitle, setExamOriginTitle] = useState(initialExamTitle || (isPruebas ? "Prueba Regular N°1" : "Ensayo SIMCE Oficial N°1"));
  const [includeExplanations, setIncludeExplanations] = useState(true);

  // Estado de copiado
  const [copied, setCopied] = useState(false);

  // Sincronizar si cambian props externas al abrir
  useEffect(() => {
    if (defaultMode) setActiveTab(defaultMode);
    if (initialLevel) setLevel(normalizeLevel(initialLevel));
    if (initialSubject) setSubject(initialSubject);
    if (initialCourseName) setCourseName(initialCourseName);
    if (initialExamTitle) setExamOriginTitle(initialExamTitle);
    if (initialDescendedOa) setTargetOa(initialDescendedOa);
  }, [defaultMode, initialLevel, initialSubject, initialCourseName, initialExamTitle, initialDescendedOa]);

  // Listas de niveles y asignaturas
  const ALL_LEVELS = [
    "1° Básico", "2° Básico", "3° Básico", "4° Básico",
    "5° Básico", "6° Básico", "7° Básico", "8° Básico",
    "1° Medio", "2° Medio", "3° Medio", "4° Medio"
  ];

  const SIMCE_LEVELS = ["4° Básico", "6° Básico", "8° Básico", "2° Medio"];

  const ALL_SUBJECTS = [
    "Matemática",
    "Lengua y Literatura",
    "Idioma Extranjero: Inglés",
    "Ciencias Naturales",
    "Historia, Geografía y Ciencias Sociales",
    "Biología",
    "Física",
    "Química",
    "Educación Ciudadana",
    "Tecnología",
    "Artes Visuales",
    "Música",
    "Filosofía"
  ];

  const SIMCE_SUBJECTS = [
    "Matemática",
    "Lenguaje y Comunicación",
    "Ciencias Naturales",
    "Historia y Geografía"
  ];

  const PRUEBAS_EXAM_TYPES = [
    "Prueba de Unidad (con OAs seleccionados)",
    "Prueba de Conocimientos Generales",
    "Quiz Corto Formativo",
    "Control de Lectura / Comprensión",
    "Evaluación Sumativa Regular",
    "Evaluación Diagnóstica Inicial"
  ];

  const SIMCE_EXAM_TYPES = [
    "Ensayo SIMCE Estándar",
    "Quiz Corto Formativo",
    "Evaluación Remedial",
    "Diagnóstico Inicial",
    "Ensayo Extendido"
  ];

  // Habilidades de ejemplo por asignatura
  const getSkillsExample = (subj: string) => {
    const s = subj.toLowerCase();
    if (s.includes("ingl") || s.includes("english")) return "Reading Comprehension, Use of English / Grammar, Vocabulary, Writing Conventions";
    if (s.includes("matem")) return "Resolver Problemas, Modelar, Representar, Argumentar y Comunicar, Calcular";
    if (s.includes("lengua") || s.includes("lenguaje")) return "Localizar información, Interpretar y relacionar, Reflexionar sobre la forma y el contenido";
    if (s.includes("cien") || s.includes("biol") || s.includes("fís") || s.includes("quím")) return "Observar y plantear preguntas, Planificar y conducir una investigación, Analizar evidencia y comunicar";
    if (s.includes("historia") || s.includes("ciudadana")) return "Pensamiento temporal y espacial, Análisis y trabajo con fuentes, Pensamiento crítico";
    return "Conocer, Comprender, Aplicar, Analizar, Evaluar";
  };

  // Generación dinámica de prompts
  const generatedPrompt = useMemo(() => {
    const optionsText = optionCount === 4 ? "4 alternativas (A, B, C, D)" : "5 alternativas (A, B, C, D, E)";
    const isEnglish = subject.toLowerCase().includes("ingl") || subject.toLowerCase().includes("english");
    const isMath = subject.toLowerCase().includes("matem");
    const isGeneral = examType.includes("Generales");
    const isQuiz = examType.includes("Quiz") || examType.includes("Control");

    // ==========================================
    // 1. MODO: CREACIÓN DE EVALUACIÓN (EXCEL)
    // ==========================================
    if (activeTab === "EXAM_XLSX") {
      // ----------------------------------------------------
      // CASO A: INSTANCIA DE PRUEBAS CCG (Pruebas Regulares)
      // ----------------------------------------------------
      if (isPruebas) {
        // Sub-caso A1: Inglés (EFL / ESL)
        if (isEnglish) {
          return `Actúa como un Profesor de Idioma Extranjero Inglés Senior y Diseñador Curricular en Chile para **${level}**.

Tu misión es crear una **${examType}** de **${questionCount} preguntas de opción múltiple** (${optionsText}), alineada con los Objetivos de Aprendizaje de Inglés del MINEDUC para ${level}.

### OBJETIVOS DE APRENDIZAJE (OA) Y CONTENIDOS EVALUADOS:
**${targetOa || "Comprensión lectora, gramática en contexto y vocabulario clave del nivel"}**

### CRITERIOS PEDAGÓGICOS PARA LA EVALUACIÓN DE INGLÉS:
1. **Nivel CEFR Adecuado**:
   - Educación Básica (1° a 8°): Nivel CEFR A1 a A2 (instrucciones claras, vocabulario cotidiano, oraciones directas).
   - Educación Media (1° a 4°): Nivel CEFR B1 (textos de lectura de 150-250 palabras, tiempos verbales contextualizados y análisis inferencial).
2. **Estructura Equilibrada de Ítems**:
   - Reading Comprehension (40%): Preguntas basadas en un texto de lectura o diálogo en inglés.
   - Use of English / Grammar (30%): Oraciones incompletas o identificación de estructuras en contexto real.
   - Vocabulary (30%): Significado, opuestos o aplicación de palabras clave.
3. **Calidad de Opciones**:
   - 1 clave correcta incuestionable.
   - Distractores basados en errores frecuentes de hispanohablantes aprendiendo inglés (falsos amigos, auxiliares faltantes, concordancia).
   - Longitud simétrica entre opciones.

---

### FORMATO OBLIGATORIO DE SALIDA PARA EXCEL (.xlsx):
Genera una tabla perfectamente estructurada con las siguientes columnas exactas para ser importada directamente a la plataforma:

| Numero | Clave | Habilidad | Eje | OA | Dificultad | ${includeExplanations ? "Enunciado_Pregunta | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Justificacion_Pedagogica" : ""} |

- **Numero**: 1 a ${questionCount} correlativo.
- **Clave**: Letra de la respuesta correcta (${optionCount === 4 ? "A, B, C o D" : "A, B, C, D o E"}).
- **Habilidad**: Reading / Language in Use / Vocabulary.
- **Eje**: Comprensión Lectora / Manejo de la Lengua.
- **OA**: Código del OA (ej: OA 1, OA 3, OA 8).
- **Dificultad**: -1.0 (Básica/A1), 0.0 (Intermedia/A2), +1.0 (Avanzada/B1).
${includeExplanations ? `- **Enunciado_Pregunta**: Pregunta o instrucción en inglés (e incluir el texto de lectura breve si aplica).
- **Opcion_A**: Opción A en inglés.
- **Opcion_B**: Opción B en inglés.
- **Opcion_C**: Opción C en inglés.
- **Opcion_D**: Opción D en inglés.
- **Justificacion_Pedagogica**: Breve explicación en español de la respuesta correcta y del error típico en los distractores.` : ""}

Entrega las ${questionCount} filas completas desarrolladas en la tabla, listas para ser copiadas a Excel o importadas.`;
        }

        // Sub-caso A2: Matemáticas Conocimientos Generales
        if (isMath && isGeneral) {
          return `Actúa como un Docente Especialista en Educación Matemática en Chile para **${level}**.

Tu misión es crear una **Prueba Sumativa de Conocimientos Matemáticos Generales** de **${questionCount} preguntas de opción múltiple** (${optionsText}), representativa del currículum escolar para ${level}.

### CONTENIDOS Y EJES MATEMÁTICOS DEL NIVEL:
**${targetOa || "Conocimientos generales: Números y Operaciones, Patrones y Álgebra, Geometría, Medición, Datos y Probabilidades"}**

### CRITERIOS PEDAGÓGICOS:
1. **Distribución por Ejes Temáticos**:
   - 40% Números y Operaciones (Cálculo mental, algoritmos y resolución de problemas cotidianos de ${level}).
   - 25% Álgebra y Patrones (Regularidades, ecuaciones e inecuaciones simples).
   - 20% Geometría y Medición (Propiedades de figuras 2D/3D, áreas, perímetros o ángulos).
   - 15% Datos y Probabilidades (Tablas, gráficos y nociones de probabilidad).
2. **Habilidades del Currículum MINEDUC**:
   - Resolver Problemas, Modelar, Representar y Argumentar.
3. **Distractores Basados en Errores Típicos**:
   - Errores comunes de cálculo aritmético, confusión de operaciones inversas o aplicación errónea de fórmulas.

---

### FORMATO OBLIGATORIO DE SALIDA PARA EXCEL (.xlsx):
| Numero | Clave | Habilidad | Eje | OA | Dificultad | ${includeExplanations ? "Enunciado_Pregunta | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Justificacion_Pedagogica" : ""} |

- **Numero**: 1 a ${questionCount} correlativo.
- **Clave**: ${optionCount === 4 ? "A, B, C o D" : "A, B, C, D o E"}.
- **Habilidad**: Resolver Problemas / Modelar / Argumentar / Representar / Calcular.
- **Eje**: Números y Operaciones / Patrones y Álgebra / Geometría / Medición / Datos.
- **OA**: Código del OA (ej: OA 1, OA 3, OA 8).
- **Dificultad**: -1.0 Fácil, 0.0 Media, +1.0 Difícil.
${includeExplanations ? `- **Enunciado_Pregunta**: El texto del problema o ejercicio matemático claro y contextualizado.
- **Opcion_A**: Opción A.
- **Opcion_B**: Opción B.
- **Opcion_C**: Opción C.
- **Opcion_D**: Opción D.
- **Justificacion_Pedagogica**: Breve justificación del procedimiento correcto y del error asociado a cada distractor.` : ""}

Entrega las ${questionCount} preguntas completas desarrolladas en la tabla.`;
        }

        // Sub-caso A3: Prueba Regular con Selección de OAs (Lenguaje, Ciencias, Historia, etc.)
        return `Actúa como un Docente de Aula y Diseñador Pedagógico Senior en Chile de la asignatura de **${subject}** para **${level}**.

Tu misión es crear una **${examType}** de **${questionCount} preguntas de opción múltiple** (${optionsText}), perfectamente alineada a las Bases Curriculares oficiales del MINEDUC para ${level}.

### OBJETIVOS DE APRENDIZAJE (OA) Y CONTENIDOS PRIORIZADOS A EVALUAR:
**${targetOa || "Objetivos de Aprendizaje prioritarios de la Unidad"}**

### CRITERIOS PEDAGÓGICOS DE CONSTRUCCIÓN:
1. **Alineación Curricular Estricta**: Cada ítem debe evaluar con precisión los OAs y contenidos indicados arriba.
2. **Contextualización Significativa**: Problemas, textos y situaciones auténticas de la vida cotidiana y el entorno de los estudiantes de ${level}.
3. **Distribución de Habilidades Cognitivas**:
   - 35% Conocer / Localizar / Identificar
   - 45% Aplicar / Procedimientos / Interpretar y Relacionar
   - 20% Analizar / Evaluar / Resolver Problemas
4. **Calidad de Ítems y Distractores**:
   - Clave única indiscutible.
   - Distractores pedagógicos plausibles (sin opciones "todas las anteriores" ni "ninguna de las anteriores").
   - Longitud y complejidad equilibrada en las alternativas.

---

### FORMATO OBLIGATORIO DE SALIDA PARA EXCEL (.xlsx):
Genera una tabla perfectamente estructurada con las siguientes columnas exactas para ser importada directamente a la plataforma:

| Numero | Clave | Habilidad | Eje | OA | Dificultad | ${includeExplanations ? "Enunciado_Pregunta | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Justificacion_Pedagogica" : ""} |

- **Numero**: 1 a ${questionCount} correlativo.
- **Clave**: ${optionCount === 4 ? "A, B, C o D" : "A, B, C, D o E"}.
- **Habilidad**: Habilidad curricular evaluada (ej: ${getSkillsExample(subject)}).
- **Eje**: Eje temático o Unidad curricular de ${level}.
- **OA**: Código del OA (ej: OA 1, OA 3, OA 5).
- **Dificultad**: -1.0 Fácil, 0.0 Media, +1.0 Difícil.
${includeExplanations ? `- **Enunciado_Pregunta**: El texto claro y contextualizado de la pregunta.
- **Opcion_A**: Opción A.
- **Opcion_B**: Opción B.
- **Opcion_C**: Opción C.
- **Opcion_D**: Opción D.
- **Justificacion_Pedagogica**: Breve explicación de por qué la clave es correcta y qué error pedagógico evidencia cada distractor.` : ""}

Entrega el resultado completo con las ${questionCount} filas desarrolladas, listo para copiar a Excel.`;
      }

      // ----------------------------------------------------
      // CASO B: INSTANCIA DE ENSAYOS SIMCE (Producción Oficial)
      // ----------------------------------------------------
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
- **Habilidad**: Habilidad curricular evaluada (ej: ${getSkillsExample(subject)}).
- **Eje**: Eje temático oficial de ${level}.
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

    // ==========================================
    // 2. MODO: EVALUACIÓN REMEDIAL (OA DESCENDIDO)
    // ==========================================
    if (activeTab === "REMEDIAL") {
      const targetOaText = targetOa || (isPruebas ? "OA de la Unidad con menor porcentaje de logro" : "OA 4 (Fracciones y Números Mixtos)");
      return `Actúa como ${isPruebas ? "Profesor de Aula y Especialista en Nivelación de Aprendizajes" : "Coordinador Pedagógico y Especialista en Remediales SIMCE"} del MINEDUC de Chile.

El curso **${courseName}** rindió la evaluación **"${examOriginTitle}"** en la asignatura de **${subject}** (${level}) y los resultados de la plataforma arrojaron una alerta temprana por Objetivos de Aprendizaje descendidos, requiriendo un Plan Remedial de nivelación urgente.

### OBJETIVO DE LA EVALUACIÓN REMEDIAL:
Crear una evaluación formativa remedial concentrada de **10 preguntas de opción múltiple** con 4 alternativas (A-D) enfocada principalmente en reforzar y nivelar el siguiente Objetivo de Aprendizaje prioritario:
**${targetOaText}**

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

    // ==========================================
    // 3. MODO: INFORME UTP
    // ==========================================
    if (activeTab === "UTP_REPORT") {
      if (isPruebas) {
        return `Actúa como Jefe de Unidad Técnica Pedagógica (UTP) del Colegio Cerro Grande.

Necesito que redactes un **Informe Técnico-Pedagógico y Plan de Mejora de Aula** basado en los resultados obtenidos por los estudiantes de **${level}** en las evaluaciones regulares de **${subject}**.

### ESTRUCTURA DEL INFORME REQUERIDA:
1. **Diagnóstico Cuantitativo y Cualitativo**:
   - Análisis del promedio de notas (escala chilena 1.0 a 7.0) y porcentaje de aprobación/reprobación con 60% de exigencia.
   - Distribución de estudiantes según logro: Insuficiente (< 4.0), Elemental (4.0 - 5.4) y Adecuado (5.5 - 7.0).
2. **Identificación de Brechas por Objetivos de Aprendizaje**:
   - Detección de los OAs y habilidades con menor porcentaje de acierto.
   - Comparación del rendimiento entre cursos paralelos.
3. **Plan de Acción Pedagógico Inmediato**:
   - Metas concretas para la próxima evaluación de unidad.
   - Acciones pedagógicas: reforzamiento de conceptos clave, modelamiento y guías de error frecuente.
4. **Pautas para el Consejo de Profesores / Reunión de Departamento**:
   - Preguntas orientadoras para la reflexión docente y acuerdos metodológicos.`;
      }

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

    // ==========================================
    // 4. MODO: TALLER / GUÍA DE AULA
    // ==========================================
    if (activeTab === "CLASS_WORKSHOP") {
      return `Actúa como Profesor Especialista de Aula en **${subject}** para **${level}** en Chile.

Diseña un **Taller Práctico / Guía de Ejercitación de Aula (Duración: 90 minutos / 2 horas pedagógicas)** para el curso **${courseName}**, enfocado en consolidar los contenidos y superar dificultades de la evaluación reciente.

### CONTENIDOS O ENFOQUE DEL TALLER:
**${targetOa || "Objetivos de Aprendizaje clave de la Unidad"}**

### ESTRUCTURA DEL TALLER (MÉTODO DE ENSEÑANZA EXPLÍCITA):
1. **Fase 1: Activación y Demostración (15 min)**:
   - Pregunta detonante basada en un problema cotidiano o situación real.
   - "Pensamiento en Voz Alta" del docente modelando el procedimiento correcto paso a paso.
2. **Fase 2: Práctica Guiada (30 min)**:
   - 3 ejercicios resueltos en parejas con rúbrica rápida de auto-evaluación.
3. **Fase 3: Práctica Independiente (35 min)**:
   - 5 ejercicios de selección múltiple (A-D) o desarrollo breve con soluciones explicadas.
4. **Fase 4: Ticket de Salida (10 min)**:
   - 1 ejercicio decisivo para comprobar si el 80%+ del curso dominó el concepto clave antes de terminar la clase.

Entrega todo el material listo para imprimir o proyectar en clase.`;
    }

    return "";
  }, [activeTab, level, subject, examType, questionCount, optionCount, targetOa, courseName, examOriginTitle, includeExplanations, isPruebas]);

  const handleCopy = async () => {
    await copyToClipboard(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Sugerencias rápidas de OA según asignatura
  const renderOaPresets = () => {
    const s = subject.toLowerCase();
    let presets: { label: string; value: string }[] = [];

    if (s.includes("ingl") || s.includes("english")) {
      presets = [
        { label: "Quiz de Inglés (Reading & Grammar)", value: "Reading comprehension, Past Simple & Continuous, and Key Vocabulary" },
        { label: "Present Simple & Daily Routines", value: "Present Simple, Daily Routines, Adverbs of Frequency (CEFR A1/A2)" },
        { label: "Modal Verbs & Conditionals", value: "Modal Verbs (can, must, should) and First Conditional in context" }
      ];
    } else if (s.includes("matem")) {
      presets = [
        { label: "Conocimientos Matemáticos Generales", value: "Conocimientos matemáticos generales: Números, Álgebra, Geometría y Datos" },
        { label: "Fracciones y Números Mixtos", value: "OA 3 y OA 5: Fracciones, números mixtos y operaciones combinadas" },
        { label: "Ecuaciones e Inecuaciones", value: "OA 4: Ecuaciones e inecuaciones lineales en problemas cotidianos" },
        { label: "Geometría y Medición", value: "OA 12: Cálculo de áreas, perímetros y ángulos en figuras compuestas" }
      ];
    } else if (s.includes("lengua") || s.includes("lenguaje")) {
      presets = [
        { label: "Comprensión Lectora Texto Narrativo", value: "OA 3: Extraer información explícita e implícita, caracterizar personajes y vocabulario" },
        { label: "Texto Argumentativo e Idea Principal", value: "OA 6: Identificar tesis, argumentos y posturas en textos no literarios" },
        { label: "Control de Lectura Domiciliaria", value: "Control de comprensión, análisis de conflicto central y sentido global" }
      ];
    } else if (s.includes("cien") || s.includes("biol")) {
      presets = [
        { label: "Fotosíntesis y Ecosistemas", value: "OA 1 y OA 2: Fotosíntesis, cadenas tróficas y flujo de materia y energía" },
        { label: "Célula y Estructura Biológica", value: "OA 3: Estructura celular, organelos y funciones vitales" }
      ];
    } else {
      presets = [
        { label: "Objetivos Priorizados Unidad 1", value: "OA 1 y OA 2: Conceptos fundamentales y aplicación directa" },
        { label: "Evaluación Sumativa General", value: "Objetivos de Aprendizaje integrados del primer semestre" }
      ];
    }

    return (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {presets.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setTargetOa(p.value)}
            className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md transition font-semibold"
          >
            + {p.label}
          </button>
        ))}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        
        {/* Header con gradiente IA adaptativo */}
        <div className={`p-5 text-white flex items-center justify-between ${
          isPruebas 
            ? "bg-gradient-to-r from-amber-600 via-indigo-700 to-purple-800" 
            : "bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-600"
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">
                  {isPruebas ? "Asistente de Prompts para Evaluaciones Regulares" : "Asistente de Prompts para Ensayos SIMCE"}
                </h2>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider shadow-xs ${
                  isPruebas 
                    ? "bg-amber-400 text-amber-950" 
                    : "bg-pink-400 text-pink-950"
                }`}>
                  {isPruebas ? "PRUEBAS CCG" : "SIMCE OFICIAL"}
                </span>
              </div>
              <p className="text-xs text-indigo-100 font-medium mt-0.5">
                {isPruebas 
                  ? "Crea prompts para pruebas por OA, conocimientos generales (ej. 5° Básico), quizzes de inglés (3° Medio) y más, listos para exportar a Excel." 
                  : "Genera prompts especializados para ChatGPT, Claude, Gemini o DeepSeek con especificaciones exactas para ensayos SIMCE."}
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
            <span>{isPruebas ? "Crear Prueba Regular en Excel" : "Crear Ensayo SIMCE en Excel"}</span>
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
            onClick={() => setActiveTab("CLASS_WORKSHOP")}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              activeTab === "CLASS_WORKSHOP"
                ? "bg-white text-blue-700 border-blue-600 shadow-xs"
                : "text-gray-600 hover:text-gray-900 border-transparent hover:bg-gray-100"
            }`}
          >
            <Lightbulb className="w-4 h-4 text-blue-600" />
            <span>Guía / Taller de Aula</span>
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
            <span>{isPruebas ? "Informe Pedagógico UTP" : "Informe Técnico SIMCE UTP"}</span>
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

            {/* Parámetros específicos para creación de pruebas */}
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
                      {(isPruebas ? ALL_LEVELS : SIMCE_LEVELS).map((lvl) => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Asignatura</label>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    >
                      {(isPruebas ? ALL_SUBJECTS : SIMCE_SUBJECTS).map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Tipo de Evaluación</label>
                    <select
                      value={examType}
                      onChange={(e) => setExamType(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    >
                      {(isPruebas ? PRUEBAS_EXAM_TYPES : SIMCE_EXAM_TYPES).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">N° de Preguntas</label>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={questionCount}
                      onChange={(e) => setQuestionCount(parseInt(e.target.value) || 20)}
                      className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Campo específico: Objetivos de Aprendizaje (OAs) o Contenidos */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center justify-between">
                    <span>OAs o Contenidos a Evaluar</span>
                    <span className="text-[10px] text-gray-400 font-normal">Opcional / Personalizable</span>
                  </label>
                  <textarea
                    rows={2}
                    value={targetOa}
                    onChange={(e) => setTargetOa(e.target.value)}
                    placeholder={
                      subject.toLowerCase().includes("ingl") 
                        ? "Ej: Reading comprehension, Past Simple & Continuous, and Vocabulary" 
                        : subject.toLowerCase().includes("matem")
                          ? "Ej: OA 3 y OA 5: Fracciones, números mixtos y cálculo de áreas"
                          : "Ej: OA 1, OA 3 o contenidos específicos de la unidad a evaluar"
                    }
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  {renderOaPresets()}
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Alternativas</label>
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

            {/* Parámetros para Remedial */}
            {activeTab === "REMEDIAL" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Curso Destinatario</label>
                  <input
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Ej: 5° Básico A"
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Evaluación de Origen</label>
                  <input
                    type="text"
                    value={examOriginTitle}
                    onChange={(e) => setExamOriginTitle(e.target.value)}
                    placeholder="Ej: Prueba Unidad 1 Matemática"
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

            {/* Parámetros para Taller de Aula */}
            {activeTab === "CLASS_WORKSHOP" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Curso</label>
                  <input
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Ej: 3° Medio A"
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Contenidos del Taller</label>
                  <input
                    type="text"
                    value={targetOa}
                    onChange={(e) => setTargetOa(e.target.value)}
                    placeholder="Ej: Resolución guiada de problemas y comprensión lectora"
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

            {/* Parámetros para Informe UTP */}
            {activeTab === "UTP_REPORT" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Nivel a Analizar</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-purple-500"
                  >
                    {(isPruebas ? ALL_LEVELS : SIMCE_LEVELS).map((lvl) => (
                      <option key={lvl} value={lvl}>{lvl}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Asignatura</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-purple-500"
                  >
                    {(isPruebas ? ALL_SUBJECTS : SIMCE_SUBJECTS).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
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
          <div className="lg:col-span-7 flex flex-col h-full bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-md min-h-[460px]">
            <div className="bg-gray-950 px-4 py-2.5 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="text-xs font-mono text-gray-400 ml-2">
                  {isPruebas ? "prompt_pruebas_ccg.md" : "prompt_simce_oficial.md"}
                </span>
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
