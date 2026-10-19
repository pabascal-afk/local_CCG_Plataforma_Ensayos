import jsQR from "jsqr";

export interface OmrSheetMetadata {
  aid: number;
  rut: string;
  eid: number;
  qc: number;
  oc: number;
}

export interface QuestionReadResult {
  questionNumber: number;
  selectedOption: string | null; // "A", "B", "C", "D", "E" o null (blanco)
  status: "VALID" | "BLANK" | "DOUBLE_MARK" | "UNCERTAIN";
  confidence: number; // 0 a 100
  optionsScores: Record<string, number>; // "A": 82, "B": 12, etc.
}

export interface SheetReadResult {
  success: boolean;
  pageIndex: number;
  metadata: OmrSheetMetadata | null;
  studentRut: string;
  studentName?: string;
  assignmentId: number;
  examId: number;
  totalQuestions: number;
  optionsCount: number;
  answers: Record<number, string>; // { 1: "A", 2: "B", ... }
  questionsDetail: QuestionReadResult[];
  confidenceAvg: number;
  hasUncertainOrDouble: boolean;
  rawError?: string;
  thumbnailDataUrl?: string;
}

interface Point {
  x: number;
  y: number;
}

interface CornerMarkers {
  tl: Point;
  tr: Point;
  bl: Point;
  br: Point;
  detectedCount: number;
}

/**
 * Rota un canvas en múltiplos de 90 grados.
 */
function rotateCanvas(srcCanvas: HTMLCanvasElement, angleDegrees: number): HTMLCanvasElement {
  if (angleDegrees === 0) return srcCanvas;

  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const dst = document.createElement("canvas");
  const ctx = dst.getContext("2d");
  if (!ctx) return srcCanvas;

  if (angleDegrees === 90 || angleDegrees === 270) {
    dst.width = h;
    dst.height = w;
  } else {
    dst.width = w;
    dst.height = h;
  }

  ctx.translate(dst.width / 2, dst.height / 2);
  ctx.rotate((angleDegrees * Math.PI) / 180);
  ctx.drawImage(srcCanvas, -w / 2, -h / 2);

  return dst;
}

/**
 * Busca los 4 marcadores de esquina (cuadrados negros de 10x10mm) en ventanas restringidas
 * para no interferir jamás con el logo del colegio (que empieza en X=20mm) ni con el QR.
 */
function detectCornerMarkers(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): CornerMarkers {
  const getDarkness = (x: number, y: number): number => {
    const px = Math.min(Math.max(0, Math.round(x)), width - 1);
    const py = Math.min(Math.max(0, Math.round(y)), height - 1);
    const idx = (py * width + px) * 4;
    const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    return Math.max(0, 255 - lum);
  };

  // Ventana ajustada: máx 11% del ancho y 10% del alto
  const findMarkerInBox = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): Point | null => {
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    // Umbral de negro sólido (los marcadores son tinta negra pura > 140)
    const BLACK_THRESHOLD = 135;

    for (let y = minY; y < maxY; y += 2) {
      for (let x = minX; x < maxX; x += 2) {
        if (getDarkness(x, y) >= BLACK_THRESHOLD) {
          sumX += x;
          sumY += y;
          count++;
        }
      }
    }

    // Un marcador de 10x10mm tiene al menos 30-50 píxeles con paso 2
    const minPixels = Math.max(20, Math.round((width * height) * 0.00002));
    if (count >= minPixels) {
      return { x: sumX / count, y: sumY / count };
    }

    return null;
  };

  const wEdge = Math.round(width * 0.11);
  const hEdge = Math.round(height * 0.10);

  // Cuatro esquinas en rangos estrictos:
  const tl = findMarkerInBox(0, wEdge, 0, hEdge);
  const tr = findMarkerInBox(width - wEdge, width, 0, hEdge);
  const bl = findMarkerInBox(0, wEdge, height - hEdge, height);
  const br = findMarkerInBox(width - wEdge, width, height - hEdge, height);

  let detectedCount = 0;
  if (tl) detectedCount++;
  if (tr) detectedCount++;
  if (bl) detectedCount++;
  if (br) detectedCount++;

  let finalTl = tl;
  let finalTr = tr;
  let finalBl = bl;
  let finalBr = br;

  // Si se detectaron 3, reconstruir la 4ta por geometría afín (paralelogramo de hoja)
  if (detectedCount === 3) {
    if (!finalBr && finalTl && finalTr && finalBl) {
      finalBr = { x: finalTr.x + finalBl.x - finalTl.x, y: finalTr.y + finalBl.y - finalTl.y };
    } else if (!finalBl && finalTl && finalTr && finalBr) {
      finalBl = { x: finalTl.x + finalBr.x - finalTr.x, y: finalTl.y + finalBr.y - finalTr.y };
    } else if (!finalTr && finalTl && finalBl && finalBr) {
      finalTr = { x: finalTl.x + finalBl.x - finalBr.x, y: finalTl.y + finalBl.y - finalBr.y };
    } else if (!finalTl && finalTr && finalBl && finalBr) {
      finalTl = { x: finalTr.x + finalBl.x - finalBr.x, y: finalTr.y + finalBl.y - finalBr.y };
    }
  }

  // Fallback a coordenadas nominales de hoja Letter (216x279 mm) con marcadores centrados en 11mm y 205mm
  const nomTl: Point = { x: width * (11 / 216), y: height * (11 / 279) };
  const nomTr: Point = { x: width * (205 / 216), y: height * (11 / 279) };
  const nomBl: Point = { x: width * (11 / 216), y: height * (267 / 279) };
  const nomBr: Point = { x: width * (205 / 216), y: height * (267 / 279) };

  return {
    tl: finalTl || nomTl,
    tr: finalTr || nomTr,
    bl: finalBl || nomBl,
    br: finalBr || nomBr,
    detectedCount,
  };
}

/**
 * Interpola bilinealmente (u, v) en [0, 1] hacia coordenadas de píxel.
 */
function mapBilinear(u: number, v: number, corners: CornerMarkers): Point {
  const { tl, tr, bl, br } = corners;
  const x = (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x;
  const y = (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y;
  return { x, y };
}

/**
 * Procesa un canvas de imagen que contiene una hoja de respuestas escaneada o fotografiada.
 */
export async function readOmrSheetFromCanvas(
  canvas: HTMLCanvasElement,
  pageIndex: number,
  expectedAssignmentId?: number
): Promise<SheetReadResult> {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d");

  if (!ctx || width < 200 || height < 200) {
    return {
      success: false,
      pageIndex,
      metadata: null,
      studentRut: "",
      assignmentId: expectedAssignmentId || 0,
      examId: 0,
      totalQuestions: 0,
      optionsCount: 4,
      answers: {},
      questionsDetail: [],
      confidenceAvg: 0,
      hasUncertainOrDouble: false,
      rawError: "Imagen no válida o resolución insuficiente",
    };
  }

  // 1. Detección de Código QR y Orientación (probar 0°, 90°, 180°, 270°)
  let orientedCanvas = canvas;
  let metadata: OmrSheetMetadata | null = null;
  const anglesToTry = [0, 180, 90, 270];

  for (const angle of anglesToTry) {
    const testCanvas = rotateCanvas(canvas, angle);
    const testCtx = testCanvas.getContext("2d");
    if (!testCtx) continue;

    const testImgData = testCtx.getImageData(0, 0, testCanvas.width, testCanvas.height);
    const qr = jsQR(testImgData.data, testCanvas.width, testCanvas.height, {
      inversionAttempts: "attemptBoth",
    });

    if (qr && qr.data) {
      try {
        const parsed = JSON.parse(qr.data);
        if (parsed.aid && parsed.qc) {
          metadata = {
            aid: Number(parsed.aid),
            rut: String(parsed.rut || ""),
            eid: Number(parsed.eid || 0),
            qc: Number(parsed.qc),
            oc: Number(parsed.oc || 4),
          };
          orientedCanvas = testCanvas;
          break;
        }
      } catch {
        // Ignorar JSON no conforme
      }
    }
  }

  const curWidth = orientedCanvas.width;
  const curHeight = orientedCanvas.height;
  const curCtx = orientedCanvas.getContext("2d")!;
  const curImgData = curCtx.getImageData(0, 0, curWidth, curHeight);
  const pixels = curImgData.data;

  // Miniatura para visualización en el modal
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 160;
  thumbCanvas.height = Math.round((160 * curHeight) / curWidth);
  const thumbCtx = thumbCanvas.getContext("2d");
  if (thumbCtx) {
    thumbCtx.drawImage(orientedCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbnailDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.7);

  if (!metadata && !expectedAssignmentId) {
    return {
      success: false,
      pageIndex,
      metadata: null,
      studentRut: "",
      assignmentId: 0,
      examId: 0,
      totalQuestions: 0,
      optionsCount: 4,
      answers: {},
      questionsDetail: [],
      confidenceAvg: 0,
      hasUncertainOrDouble: true,
      rawError: "No se detectó el código QR institucional de la hoja.",
      thumbnailDataUrl,
    };
  }

  const totalQuestions = metadata ? metadata.qc : 30;
  const optionsCount = metadata ? metadata.oc : 4;
  const studentRut = metadata ? metadata.rut : "GENERICO";
  const assignmentId = metadata ? metadata.aid : expectedAssignmentId || 0;
  const examId = metadata ? metadata.eid : 0;

  // 2. Detección de Marcadores Fiduciales en las 4 esquinas
  const corners = detectCornerMarkers(pixels, curWidth, curHeight);

  // Funciones de lectura de píxeles
  const getPixelDarkness = (px: number, py: number): number => {
    const x = Math.min(Math.max(0, Math.round(px)), curWidth - 1);
    const y = Math.min(Math.max(0, Math.round(py)), curHeight - 1);
    const idx = (y * curWidth + x) * 4;
    const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    return Math.max(0, 255 - lum);
  };

  // 3. Medición Segura del Blanco del Papel (muestreado en márgenes libres de texto)
  // Muestreamos en franjas donde solo hay papel blanco
  const paperSamples: number[] = [];
  const sampleSteps = 20;
  for (let i = 0; i < sampleSteps; i++) {
    // Margen izquierdo limpio (X=19mm) a lo largo de la página
    const yRatio = 0.25 + (i / sampleSteps) * 0.55;
    const ptLeft = mapBilinear(0.04, yRatio, corners);
    paperSamples.push(getPixelDarkness(ptLeft.x, ptLeft.y));
    // Margen derecho limpio (X=197mm)
    const ptRight = mapBilinear(0.96, yRatio, corners);
    paperSamples.push(getPixelDarkness(ptRight.x, ptRight.y));
  }
  paperSamples.sort((a, b) => a - b);
  // Tomamos el percentil 25 para garantizar blanco de papel puro sin tocar grafito
  const paperDarkness = paperSamples[Math.floor(paperSamples.length * 0.25)] || 22;

  // 4. Muestreo de Burbujas con Búsqueda de Pico Local (+-4px)
  const sampleBubbleDarkness = (centerX: number, centerY: number, radius: number): number => {
    let bestDarkness = -1;
    let bestX = centerX;
    let bestY = centerY;

    // Micro-búsqueda en ventana de +-4px para fijar el centro exacto del trazo del alumno
    for (let dy = -4; dy <= 4; dy += 2) {
      for (let dx = -4; dx <= 4; dx += 2) {
        const d = getPixelDarkness(centerX + dx, centerY + dy);
        if (d > bestDarkness) {
          bestDarkness = d;
          bestX = centerX + dx;
          bestY = centerY + dy;
        }
      }
    }

    // Muestrear círculo interior (52% del radio) para evitar tocar la línea perimetral
    const innerRadius = Math.max(2, Math.round(radius * 0.52));
    const rSq = innerRadius * innerRadius;
    let sum = 0;
    let count = 0;

    for (let dy = -innerRadius; dy <= innerRadius; dy++) {
      for (let dx = -innerRadius; dx <= innerRadius; dx++) {
        if (dx * dx + dy * dy <= rSq) {
          sum += getPixelDarkness(bestX + dx, bestY + dy);
          count++;
        }
      }
    }

    return count > 0 ? sum / count : 0;
  };

  // 5. Geometría Milimétrica Exacta (Sincronizada 1-a-1 con print-sheets/page.tsx)
  // Marcadores de Esquina:
  // TL: (11.0mm, 11.0mm)  --> u=0, v=0
  // TR: (205.0mm, 11.0mm) --> u=1, v=0
  // BL: (11.0mm, 267.0mm) --> u=0, v=1
  // BR: (205.0mm, 267.0mm) --> u=1, v=1
  const MARKER_SPAN_X_MM = 194.0; // 205.0 - 11.0
  const MARKER_SPAN_Y_MM = 256.0; // 267.0 - 11.0

  const mmToU = (mmX: number): number => (mmX - 11.0) / MARKER_SPAN_X_MM;
  const mmToV = (mmY: number): number => (mmY - 11.0) / MARKER_SPAN_Y_MM;

  // Radio de burbuja en píxeles (diámetro ~5mm -> radio 2.5mm)
  const ptA = mapBilinear(mmToU(100), mmToV(100), corners);
  const ptB = mapBilinear(mmToU(102.5), mmToV(100), corners);
  const bubbleRadiusPx = Math.max(3, Math.round(Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y)));

  // Distribución de Columnas y Filas
  const columnsCount = totalQuestions > 30 ? 3 : 2;
  const perCol = Math.ceil(totalQuestions / columnsCount);

  // Filas: área útil de preguntas de Y=74mm a Y=248mm (174mm)
  const GRID_Y_START_MM = 74.0;
  const GRID_Y_HEIGHT_MM = 174.0;
  const rowHeightMm = GRID_Y_HEIGHT_MM / perCol;

  const optionsList = ["A", "B", "C", "D", "E"].slice(0, optionsCount);
  const answers: Record<number, string> = {};
  const questionsDetail: QuestionReadResult[] = [];
  let totalConfidence = 0;
  let hasUncertainOrDouble = false;

  for (let qNum = 1; qNum <= totalQuestions; qNum++) {
    const colIdx = Math.floor((qNum - 1) / perCol);
    const rowIdx = (qNum - 1) % perCol;

    // Coordenada Y del centro de la fila
    const rowCenterYMm = GRID_Y_START_MM + (rowIdx + 0.5) * rowHeightMm;
    const rowV = mmToV(rowCenterYMm);

    // Coordenadas X milimétricas según cantidad de columnas
    let colStartXMm = 20.0;
    let optStartOffsetMm = 22.6; // 14mm (número) + 6mm (margen) + 2.6mm (mitad burbuja)
    let optStepMm = 14.0;        // 5.2mm + 8.8mm gap = 14.0mm

    if (columnsCount === 2) {
      colStartXMm = colIdx === 0 ? 20.0 : 114.0;
      optStartOffsetMm = 22.6;
      optStepMm = 14.0;
    } else {
      // 3 columnas
      if (colIdx === 0) colStartXMm = 20.0;
      else if (colIdx === 1) colStartXMm = 81.5;
      else colStartXMm = 143.0;

      optStartOffsetMm = 16.4; // 11mm (número) + 3mm (margen) + 2.4mm (mitad burbuja)
      optStepMm = 9.3;         // 4.8mm + 4.5mm gap = 9.3mm
    }

    const scores: Record<string, number> = {};
    let maxDelta = -1;
    let maxOpt = "";
    let secondDelta = -1;

    for (let optIdx = 0; optIdx < optionsCount; optIdx++) {
      const optLetter = optionsList[optIdx];
      const optXMm = colStartXMm + optStartOffsetMm + optIdx * optStepMm;
      const optU = mmToU(optXMm);
      const bubbleCenter = mapBilinear(optU, rowV, corners);

      const rawDarkness = sampleBubbleDarkness(bubbleCenter.x, bubbleCenter.y, bubbleRadiusPx);
      const netDelta = Math.max(0, rawDarkness - paperDarkness);
      const normalizedScore = Math.min(100, Math.round(netDelta * 1.35));
      scores[optLetter] = normalizedScore;

      if (netDelta > maxDelta) {
        secondDelta = maxDelta;
        maxDelta = netDelta;
        maxOpt = optLetter;
      } else if (netDelta > secondDelta) {
        secondDelta = netDelta;
      }
    }

    // Umbrales calibrados para alto contraste:
    // Burbuja vacía: delta <= 12
    // Burbuja marcada con lápiz o tinta: delta >= 20
    const FILL_DELTA_THRESHOLD = 20;
    const DIFF_DELTA_THRESHOLD = 10;

    let selectedOption: string | null = null;
    let status: "VALID" | "BLANK" | "DOUBLE_MARK" | "UNCERTAIN" = "BLANK";
    let confidence = 100;

    if (maxDelta >= FILL_DELTA_THRESHOLD) {
      if (maxDelta - secondDelta >= DIFF_DELTA_THRESHOLD) {
        selectedOption = maxOpt;
        status = "VALID";
        confidence = Math.min(100, Math.max(70, Math.round(((maxDelta - secondDelta) / maxDelta) * 100)));
        answers[qNum] = selectedOption;
      } else {
        // Marca dudosa o doble marca: sugerir la opción más oscura pero alertar
        selectedOption = maxOpt;
        status = "DOUBLE_MARK";
        confidence = 45;
        hasUncertainOrDouble = true;
        answers[qNum] = selectedOption;
      }
    } else {
      // En blanco
      selectedOption = null;
      status = "BLANK";
      confidence = 95;
    }

    totalConfidence += confidence;

    questionsDetail.push({
      questionNumber: qNum,
      selectedOption,
      status,
      confidence,
      optionsScores: scores,
    });
  }

  const confidenceAvg = Math.round(totalConfidence / totalQuestions);

  return {
    success: true,
    pageIndex,
    metadata,
    studentRut,
    assignmentId,
    examId,
    totalQuestions,
    optionsCount,
    answers,
    questionsDetail,
    confidenceAvg,
    hasUncertainOrDouble,
    thumbnailDataUrl,
  };
}
