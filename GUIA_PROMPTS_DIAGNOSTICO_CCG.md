# BANCO DE PROMPTS MAESTROS: EVALUACIONES DIAGNÓSTICAS CCG
## Colegio Cerro Grande • Plataforma de Pruebas Regulares (1° Básico a 4° Medio)

Esta guía contiene la especificación psicométrica oficial y **4 prompts maestros especializados** diseñados para ser ejecutados en **ChatGPT (GPT-4o)**, **Claude 3.5 Sonnet** o **Google Gemini Pro**. Cada prompt genera una prueba diagnóstica completa de **20 a 24 preguntas de selección múltiple** ancladas a estímulos contextualizados, junto a la tabla en formato exacto para ser importada a la plataforma mediante el archivo Excel [`Plantilla_Formato_Pauta_Pruebas.xlsx`](file:///c:/Users/TI/Documents/antigravity/ENSAYOS%20SIMCE/Plantilla_Formato_Pauta_Pruebas.xlsx).

---

### TABLA DE ESPECIFICACIONES METODOLÓGICAS (MINEDUC / DIA)

| Dimensión | Especificación Técnica | Justificación Metodológica y Psicométrica |
| :--- | :--- | :--- |
| **Volumen de Ítems** | **20 a 24 preguntas** por prueba disciplinar (100% selección múltiple). | Umbral mínimo estadísticamente viable para lograr un coeficiente de confiabilidad aceptable ($\alpha \ge 0.80$) y permitir la clasificación en los tres niveles de logro del DIA (Insuficiente, Elemental, Adecuado) sin generar sobrecarga cognitiva. |
| **Estructura del Ítem** | Base contextualizada + **4 alternativas** (A, B, C, D) con clave única. *(En 1° y 2° Básico se permiten 3 alternativas A, B, C).* | La exclusión de preguntas de desarrollo exige distractores de alta plausibilidad que midan procesos taxonómicos superiores (reflexión crítica, inferencias complejas, modelamiento). |
| **Tiempo de Rendición** | **60 a 75 minutos cronológicos** (1 a 1.25 horas pedagógicas). | Promedio de 2.5 a 3.5 minutos por reactivo, contemplando tiempo para lectura comprensiva de estímulos, procesamiento lógico y resolución. |
| **Uso de Estímulos** | **100% de reactivos anclados a estímulos auténticos**. | Obligatoriedad de infografías, fragmentos literarios, columnas de opinión, gráficos estadísticos o situaciones cotidianas. Quedan prohibidos los ejercicios aislados de memoria. |
| **Formato de Salida** | Tabla con columnas exactas de Excel (.xlsx) | Compatibilidad inmediata con el importador automático de la plataforma. |

---

```
                                      ÍNDICE DE PROMPTS
 1. PROMPT 1: MATEMÁTICA (1° Básico a 4° Medio)
 2. PROMPT 2: LENGUAJE Y COMUNICACIÓN (1° Básico a 6° Básico)
 3. PROMPT 3: LENGUA Y LITERATURA (7° Básico a 4° Medio)
 4. PROMPT 4: IDIOMA EXTRANJERO: INGLÉS (1° Básico a 4° Medio - Planes Propios CCG)
```

---

## PROMPT 1: MATEMÁTICA (1° Básico a 4° Medio)
> **Instrucción para el docente:** Copia el siguiente bloque en la IA reemplazando únicamente el parámetro `[NIVEL]` (ej: *5° Básico*, *8° Básico*, *2° Medio*) y opcionalmente `[ENFOQUE_ESPECIFICO]` si deseas priorizar alguna unidad.

```markdown
Actúa como un Especialista en Evaluación Educativa y Metodólogo Curricular Senior de Matemática en Chile, con amplia experiencia en el Diagnóstico Integral de Aprendizajes (DIA) de la Agencia de Calidad de la Educación y el MINEDUC.

Tu misión es diseñar una **Evaluación Diagnóstica Integral de Matemática** para el nivel:
- NIVEL: [INSERTE AQUÍ EL NIVEL, EJ: 5° BÁSICO / 8° BÁSICO / 2° MEDIO]
- ENFOQUE: Diagnóstico de entrada que evalúa los Objetivos de Aprendizaje (OA) basales del año anterior y prerrequisitos clave del nivel actual.
[OPCIONAL - INSERTE OAs PRIORIZADOS O CONTENIDOS PUNTUALES SI LO REQUIERE]

### REGLAS PSICOMÉTRICAS Y METODOLÓGICAS OBLIGATORIAS:
1. **Volumen de Ítems**: Exactamente 24 preguntas de selección múltiple con 4 alternativas (A, B, C, D) y clave única indiscutible.
2. **Tiempo de Rendición Estimado**: 60 a 75 minutos cronológicos (2.5 a 3.0 min por ítem).
3. **100% Basado en Estímulos Situados y Contextualizados**:
   - Cada reactivo (o bloque de reactivos) DEBE iniciar presentando un estímulo explícito: un gráfico estadístico (barras, líneas, circular), una tabla de datos de la vida real, una infografía económica/social, un plano geométrico/croquis a escala, o un problema cotidiano situado (presupuestos familiares, compras, medidas del hogar, recetas, distancias).
   - Quedan terminantemente prohibidos ejercicios algorítmicos aislados del tipo "Resuelve: 254 x 12". Toda operación debe responder a una necesidad de toma de decisiones en el contexto planteado.
4. **Distribución Equilibrada por Ejes Temáticos**:
   - Eje Números y Operaciones: 35% a 40% de los reactivos.
   - Eje Patrones y Álgebra: 20% a 25% de los reactivos.
   - Eje Geometría y Medición: 20% a 25% de los reactivos.
   - Eje Probabilidades y Estadística: 15% a 20% de los reactivos.
5. **Distribución de Habilidades del Pensamiento Matemático (MINEDUC)**:
   - Resolver Problemas: ~40%
   - Modelar / Representar: ~35%
   - Argumentar y Comunicar: ~25%
6. **Diseño de Distractores de Alta Complejidad Cognitiva**:
   - Cada distractor debe fundamentarse en un obstáculo didáctico documentado (ej: ignorar el orden de operaciones PAPOMUDAS, invertir coordenadas en el plano cartesiano, calcular perímetro en vez de área, confundir porcentaje con valor nominal).
   - Ninguna opción debe decir "Todas las anteriores" ni "Ninguna de las anteriores".
7. **Graduación de Dificultad para Clasificación DIA**:
   - Nivel Insuficiente: 30% preguntas elementales/acceso directo (Dificultad -1.0 a -0.5).
   - Nivel Elemental: 50% preguntas de aplicación guiada y modelamiento (Dificultad -0.4 a +0.5).
   - Nivel Adecuado: 20% preguntas de análisis crítico y transferencia compleja (Dificultad +0.6 a +1.4).

---

### ESTRUCTURA DE LA RESPUESTA REQUERIDA:

#### PARTE 1: CUADERNILLO DE LA EVALUACIÓN
Para cada una de las 24 preguntas, presenta:
- **Estímulo**: Descripción o datos del contexto/gráfico/situación auténtica.
- **Enunciado de la Pregunta**: Redacción clara y sin ambigüedades.
- **Alternativas**: A), B), C), D).

#### PARTE 2: PAUTA OFICIAL EN TABLA EXCEL (.XLSX)
Entrega una tabla completa de 24 filas con las siguientes columnas exactas para importación directa al sistema:

| Numero | Clave | Habilidad | Eje | OA | Dificultad | Enunciado_Pregunta | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Justificacion_Pedagogica |

*Nota técnica: En "Dificultad", asigna un valor numérico entre -1.5 y 1.5. En "Justificacion_Pedagogica", redacta una breve explicación de por qué la clave es correcta y qué error pedagógico evidencia cada distractor.*
```

---

## PROMPT 2: LENGUAJE Y COMUNICACIÓN (1° Básico a 6° Básico)
> **Instrucción para el docente:** Copia el siguiente bloque en la IA indicando el nivel (ej: *3° Básico*, *4° Básico*, *6° Básico*).

```markdown
Actúa como un Especialista en Comprensión Lectora y Evaluación Formativa Inicial en Chile, experto en los estándares DIA (Diagnóstico Integral de Aprendizajes) del MINEDUC para Educación Básica.

Tu misión es elaborar una **Evaluación Diagnóstica de Lenguaje y Comunicación** para:
- NIVEL: [INSERTE AQUÍ EL NIVEL ENTRE 1° Y 6° BÁSICO, EJ: 4° BÁSICO]
- ENFOQUE: Diagnóstico de lectura comprensiva y habilidades de comunicación basal.

### ESPECIFICACIONES METODOLÓGICAS ESTRICTAS:
1. **Volumen de Ítems**: 20 a 24 preguntas de opción múltiple (4 alternativas A-D en 3° a 6° Básico; 3 alternativas A-C en 1° y 2° Básico).
2. **Tiempo de Rendición**: 60 a 70 minutos.
3. **Organización en Torno a 3 o 4 Estímulos Textuales Auténticos**:
   - **Texto 1 (Narrativo Literario)**: Cuento, fábula o leyenda tradicional/latinoamericana (adaptada en extensión al nivel: 150 a 350 palabras).
   - **Texto 2 (Informativo / Divulgación)**: Artículo de divulgación científica escolar, reportaje breve sobre naturaleza, animales o tecnología con infografía o tabla anexa.
   - **Texto 3 (Texto Discontinuo / Funcional)**: Infografía informativa, afiche publicitario/propagandístico o receta/instructivo con elementos visuales descritos.
   - Cada texto debe sustentar un bloque de 6 a 8 preguntas secuenciadas cognitivamente.
4. **Distribución de Habilidades Lectoras DIA / SIMCE**:
   - **Localizar Información Explícita (30%)**: Extracción de datos directos, secuencias de hechos y caracterizaciones literales.
   - **Interpretar y Relacionar (50%)**: Inferencias globales y locales, causa-efecto, determinación de la idea principal, significado de palabras en contexto (vocabulario contextual) y deducción del propósito comunicativo.
   - **Reflexionar y Evaluar (20%)**: Emisión de juicios sobre actitudes de personajes, evaluación de la función de imágenes en el texto y postura crítica del lector fundamentada en el texto.
5. **Calidad de los Distractores**:
   - Diseñados para diagnosticar sesgos lectores comunes (extracción de detalles secundarios en lugar de la idea central, inferencias desconectadas del texto, literalidad ingenua).

---

### ESTRUCTURA DE LA RESPUESTA REQUERIDA:

#### PARTE 1: TEXTOS Y CUADERNILLO DE PREGUNTAS
- Incluye el texto completo de cada uno de los estímulos con su título y autor/fuente ficticia o real.
- Presenta las preguntas correlativas (1 a 24) con sus opciones.

#### PARTE 2: PAUTA OFICIAL EN TABLA EXCEL (.XLSX)
Entrega la tabla completa lista para ser copiada a la plataforma:

| Numero | Clave | Habilidad | Eje | OA | Dificultad | Enunciado_Pregunta | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Justificacion_Pedagogica |
```

---

## PROMPT 3: LENGUA Y LITERATURA (7° Básico a 4° Medio)
> **Instrucción para el docente:** Copia el siguiente bloque en la IA indicando el nivel (ej: *8° Básico*, *1° Medio*, *3° Medio*).

```markdown
Actúa como un Diseñador Curricular y Metodólogo Evaluador de Lengua y Literatura para Educación Media en Chile, especialista en evaluación estandarizada DIA y PAES Competencia Lectora.

Tu misión es diseñar una **Evaluación Diagnóstica de Lengua y Literatura** para:
- NIVEL: [INSERTE AQUÍ EL NIVEL ENTRE 7° BÁSICO Y 4° MEDIO, EJ: 2° MEDIO]
- ENFOQUE: Diagnóstico de competencias de lectura crítica, análisis discursivo y razonamiento contextualizado.

### EXIGENCIAS METODOLÓGICAS Y TAXONÓMICAS:
1. **Volumen de Ítems**: Exactamente 24 preguntas de opción múltiple (4 alternativas A-D, clave única).
2. **Tiempo de Rendición**: 70 a 75 minutos cronológicos (3 minutos por ítem considerando lectura analítica).
3. **Estímulos Textuales Complejos y Auténticos (3 Textos de 400 a 600 palabras)**:
   - **Texto 1 (Literario Narrativo o Dramático)**: Fragmento de narrativa contemporánea o universal con profundidad psicológica, simbolismo o conflicto social/existencial.
   - **Texto 2 (Argumentativo de Opinión / Ensayo Breve)**: Columna de opinión periodística o ensayo sobre un debate contingente (inteligencia artificial, medio ambiente, educación, ética o cultura digital), con tesis explícita, argumentos y contraargumentos.
   - **Texto 3 (Texto Multimodal / Expositivo Científico)**: Artículo de divulgación con integración de infografía o datos estadísticos que complementan el cuerpo del texto.
4. **Graduación de Habilidades Cognitivas Superiores**:
   - **Rastrear-Localizar (25%)**: Síntesis local y ubicación de argumentos nucleares.
   - **Relacionar-Interpretar (45%)**: Determinación de tesis central, reconstrucción de cadenas argumentativas, interpretación de metáforas/figuras retóricas, análisis de perspectiva del emisor y tono discursivo.
   - **Evaluar-Reflexionar (30%)**: Detección de falacias lógicas, evaluación de la solidez y pertinencia de las evidencias aportadas por el autor, contraste entre posturas y análisis del impacto del recurso multimodal.
5. **Rigurosidad en los Distractores**:
   - Deben representar lecturas apresuradas, sobregeneralizaciones, falacias de falsa causalidad o confusión entre hechos objetivos y juicios de valor del emisor.

---

### ESTRUCTURA DE LA RESPUESTA REQUERIDA:

#### PARTE 1: CUADERNILLO CON TEXTOS Y PREGUNTAS
- Presenta los 3 textos completos desarrollados.
- Las 24 preguntas enumeradas correlativamente con sus 4 opciones cada una.

#### PARTE 2: PAUTA TÉCNICA FORMATO EXCEL (.XLSX)
| Numero | Clave | Habilidad | Eje | OA | Dificultad | Enunciado_Pregunta | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Justificacion_Pedagogica |
```

---

## PROMPT 4: IDIOMA EXTRANJERO: INGLÉS (1° Básico a 4° Medio)
### Con Adaptación a los Planes y Programas Propios del Colegio Cerro Grande
> **Instrucción para el docente:** Este prompt incluye una sección especial marcada para pegar el plan propio, unidades o lista de vocabulario/estructuras del Colegio Cerro Grande.

```markdown
Actúa como un Diseñador Curricular y Especialista en Evaluación de Inglés como Lengua Extranjera (EFL/ESL Lead Assessor) en Chile, con dominio del Marco Común Europeo de Referencia para las Lenguas (CEFR) y los estándares del MINEDUC.

Tu misión es crear una **Evaluación Diagnóstica Integral de Idioma Extranjero: Inglés** adaptada a las características pedagógicas del **Colegio Cerro Grande**:

### DATOS DE CONFIGURACIÓN DEL DOCENTE:
- NIVEL ESCOLAR: [INSERTE NIVEL: EJ. 5° BÁSICO / 8° BÁSICO / 3° MEDIO]
- NIVEL CEFR OBJETIVO: [Pre-A1 para 1°-2° Bás / A1 para 3°-5° Bás / A2 para 6°-8° Bás / B1 para 1°-4° Medio]
- PLANES PROPIOS DEL COLEGIO CERRO GRANDE:
```
[PEGUE AQUÍ EL EXTRACTO DE SU PLAN PROPIO, UNIDAD O CONTENIDOS DEL COLEGIO CERRO GRANDE]
(Ejemplo: Unidades temáticas, lista de verbos, tiempos verbales priorizados, lecturas específicas o vocabulario clave del ciclo).
```

### REQUERIMIENTOS PSICOMÉTRICOS Y METODOLÓGICOS:
1. **Volumen de Ítems**: 20 a 24 preguntas de opción múltiple (4 alternativas A-D, clave única).
2. **Tiempo de Rendición**: 60 a 70 minutos cronológicos.
3. **100% Anclado a Estímulos Auténticos en Idioma Inglés**:
   - **Estímulo 1 (Reading Passage 1)**: Texto informativo breve, correo electrónico formal/informal o folleto descriptivo (100 a 250 palabras acorde al nivel CEFR).
   - **Estímulo 2 (Reading Passage 2 o Diálogo Cotidiano)**: Conversación en contexto escolar, laboral o de viaje cotidiano.
   - **Estímulo 3 (Infografía o Anuncio Gráfico)**: Póster con datos, horarios, precios e instrucciones funcionales.
4. **Distribución de Habilidades del Aprendizaje del Inglés**:
   - **Reading Comprehension (40%)**: Identificación de ideas generales (skimming), extracción de detalles específicos (scanning), vocabulario contextual e inferencia básica.
   - **Use of English / Grammar in Context (35%)**: Uso de estructuras gramaticales en oraciones completas con sentido comunicativo real (tiempos verbales, conectores, modales, preposiciones). Quedan prohibidos los reactivos de mera memorización de reglas.
   - **Vocabulary & Lexical Recognition (25%)**: Vocabulario temático del nivel aplicado a situaciones prácticas.
5. **Idioma de Redacción**:
   - Los estímulos, instrucciones de las preguntas y alternativas deben estar redactados **100% en inglés**.
   - La columna de *Justificacion_Pedagogica* de la pauta técnica debe redactarse en **español** para facilitar la retroalimentación docente en el colegio.
6. **Distractores de Alta Pobreza de Acierto Aleatorio**:
   - Basados en interferencias típicas del español (falsos amigos, omisión de sujetos/auxiliares *do/does/did*, orden incorrecto adjetivo-sustantivo).

---

### ESTRUCTURA DE LA RESPUESTA REQUERIDA:

#### PARTE 1: CUADERNILLO DE EVALUACIÓN (EN INGLÉS)
- Estímulos textuales completos.
- Las 20 a 24 preguntas con sus alternativas (A, B, C, D).

#### PARTE 2: PAUTA OFICIAL EN FORMATO EXCEL (.XLSX)
Entrega la tabla estructurada con las columnas exactas de la plataforma:

| Numero | Clave | Habilidad | Eje | OA | Dificultad | Enunciado_Pregunta | Opcion_A | Opcion_B | Opcion_C | Opcion_D | Justificacion_Pedagogica |

*Columnas requeridas:*
- **Numero**: 1 a 24 correlativo.
- **Clave**: Letra en mayúscula (A, B, C, D).
- **Habilidad**: Reading Comprehension / Use of English / Vocabulary.
- **Eje**: Comprensión Lectora / Manejo de la Lengua.
- **OA**: Código del OA del plan de estudio.
- **Dificultad**: -1.0 Fácil (A1), 0.0 Media (A2), +1.0 Difícil (B1).
- **Enunciado_Pregunta**: Enunciado de la pregunta en inglés.
- **Opcion_A a D**: Opciones de respuesta en inglés.
- **Justificacion_Pedagogica**: Breve justificación en español explicando la clave y el error diagnóstico del distractor.
```

---

### CÓMO IMPORTAR LA EVALUACIÓN GENERADA A LA PLATAFORMA

1. **Generar la prueba con la IA:** Copia uno de los prompts anteriores, pégalo en ChatGPT Plus, Claude 3.5 o Gemini Pro y deja que genere el contenido.
2. **Copiar la tabla a Excel:**
   - Abre el archivo [`Plantilla_Formato_Pauta_Pruebas.xlsx`](file:///c:/Users/TI/Documents/antigravity/ENSAYOS%20SIMCE/Plantilla_Formato_Pauta_Pruebas.xlsx).
   - Copia la tabla generada en la pestaña `Pauta_Oficial` (asegurándote de que los encabezados coincidan en la fila 1).
   - Guarda el archivo en tu equipo.
3. **Cargar la prueba en el sistema:**
   - En **PRUEBAS CCG** (`http://192.168.3.16:3600`):
   - Ve a **Evaluaciones** $\rightarrow$ **Nueva Prueba**.
   - Sube el PDF del cuadernillo generado (o un documento con las preguntas).
   - Selecciona el nivel (ej: 5° Básico, 3° Medio) y la asignatura (ej: Matemática, Inglés).
   - Haz clic en **"Crear Evaluación y Cargar Pauta"**.
   - Presiona **"Importar Pauta (.xlsx)"** y selecciona tu archivo guardado.
   - ¡Listo! Las 20 a 24 preguntas con sus claves, habilidades, ejes, OAs y niveles de dificultad quedarán cargadas instantáneamente en la plataforma.
