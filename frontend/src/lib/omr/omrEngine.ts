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
  debugOverlayUrl?: string;
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
 * Busca los 4 marcadores de esquina (cuadrados negros de 10x10mm) en los 4 cuadrantes.
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
    return 255 - lum;
  };

  // Cuadrante: define el rango [minX, maxX, minY, maxY]
  const findMarkerInQuadrant = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): Point | null => {
    // 1. Estimar fondo papel en la zona interior del cuadrante
    let bgSum = 0;
    let bgCount = 0;
    const stepSample = 6;
    for (let y = minY + 10; y < maxY - 10; y += stepSample) {
      for (let x = minX + 10; x < maxX - 10; x += stepSample) {
        bgSum += getDarkness(x, y);
        bgCount++;
      }
    }
    const bgDarkness = bgCount > 0 ? bgSum / bgCount : 30;
    const darkThreshold = Math.max(90, bgDarkness + 60);

    // 2. Mapa de densidad / centro de masa de píxeles oscuros
    // Ignoramos los primeros 3 píxeles del borde para evitar sombras de la tapa del escáner
    let sumX = 0;
    let sumY = 0;
    let darkPixels = 0;

    const marginIgnore = Math.max(3, Math.round(Math.min(width, height) * 0.005));
    const safeMinX = Math.max(marginIgnore, minX);
    const safeMaxX = Math.min(width - marginIgnore, maxX);
    const safeMinY = Math.max(marginIgnore, minY);
    const safeMaxY = Math.min(height - marginIgnore, maxY);

    for (let y = safeMinY; y < safeMaxY; y += 2) {
      for (let x = safeMinX; x < safeMaxX; x += 2) {
        const d = getDarkness(x, y);
        if (d >= darkThreshold) {
          sumX += x;
          sumY += y;
          darkPixels++;
        }
      }
    }

    // El marcador es un cuadrado de 10mm (~2-5% del ancho de página).
    // Con muestreo de paso 2, esperamos al menos 40-100 píxeles oscuros
    const minExpectedPixels = Math.max(25, Math.round((width * height) * 0.00003));
    if (darkPixels >= minExpectedPixels) {
      const cx = sumX / darkPixels;
      const cy = sumY / darkPixels;

      // Refinar centro analizando el perfil central
      let refSumX = 0;
      let refSumY = 0;
      let refCount = 0;
      const searchR = Math.round(Math.min(width, height) * 0.04);

      for (let dy = -searchR; dy <= searchR; dy += 2) {
        for (let dx = -searchR; dx <= searchR; dx += 2) {
          const px = Math.round(cx + dx);
          const py = Math.round(cy + dy);
          if (getDarkness(px, py) >= darkThreshold) {
            refSumX += px;
            refSumY += py;
            refCount++;
          }
        }
      }

      if (refCount >= minExpectedPixels) {
        return { x: refSumX / refCount, y: refSumY / refCount };
      }

      return { x: cx, y: cy };
    }

    return null;
  };

  const qW = Math.round(width * 0.22);
  const qH = Math.round(height * 0.22);

  const tl = findMarkerInQuadrant(0, qW, 0, qH);
  const tr = findMarkerInQuadrant(width - qW, width, 0, qH);
  const bl = findMarkerInQuadrant(0, qW, height - qH, height);
  const br = findMarkerInQuadrant(width - qW, width, height - qH, height);

  let detectedCount = 0;
  if (tl) detectedCount++;
  if (tr) detectedCount++;
  if (bl) detectedCount++;
  if (br) detectedCount++;

  // Fallbacks geométricos por afinidad si se detectaron 3 esquinas
  let finalTl = tl;
  let finalTr = tr;
  let finalBl = bl;
  let finalBr = br;

  if (detectedCount === 3) {
    if (!finalBr && finalTl && finalTr && finalBl) {
      finalBr = { x: finalTr.x + finalBl.x - finalTl.x, y: finalTr.y + finalBl.y - finalTl.y };
    } else if (!finalBl && finalTl && finalTr && finalBr) {
      finalBl = { x: finalTl.x + finalBr.x - finalTr.x, y: finalTl.y + finalBr.y - finalTr.y };
    } else if (!finalTr && finalTl && finalBl && finalBr) {
      finalTr = { x: finalTl.x + finalBr.x - finalBl.x, y: finalTl.y + finalBr.y - finalBl.y };
    } else if (!finalTl && finalTr && finalBl && finalBr) {
      finalTl = { x: finalTr.x + finalBl.x - finalBr.x, y: finalTr.y + finalBl.y - finalBr.y };
    }
  }

  // Fallback estándar si no se pudieron encontrar los marcadores (coordenadas nominales relativas al papel)
  // En hoja Letter (216x279mm): centro de marcadores nominal en X=11mm, Y=11mm y X=205mm, Y=267mm
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
 * Interpola bilinealmente las coordenadas (u, v) en [0, 1] hacia el plano de la imagen.
 * u = 0 (borde izquierdo marcador), u = 1 (borde derecho marcador)
 * v = 0 (borde superior marcador), v = 1 (borde inferior marcador)
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

  // Miniatura para visualización en el listado de resultados
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

  // Funciones de lectura de píxeles y muestreo
  const getPixelDarkness = (px: number, py: number): number => {
    const x = Math.min(Math.max(0, Math.round(px)), curWidth - 1);
    const y = Math.min(Math.max(0, Math.round(py)), curHeight - 1);
    const idx = (y * curWidth + x) * 4;
    const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    return Math.max(0, 255 - lum);
  };

  // Muestrea el nivel de blanco de papel local en un punto (cx, cy)
  const samplePaperWhite = (cx: number, cy: number): number => {
    let sum = 0;
    let count = 0;
    for (let dy = -3; dy <= 3; dy += 2) {
      for (let dx = -3; dx <= 3; dx += 2) {
        sum += getPixelDarkness(cx + dx, cy + dy);
        count++;
      }
    }
    return count > 0 ? sum / count : 25;
  };

  // Muestrea el centro interior de una burbuja circular (evitando tocar el borde perimetral)
  const sampleBubbleDarkness = (centerX: number, centerY: number, radius: number): number => {
    // Buscar el pico más oscuro en un radio pequeño (+- 3px) para compensar desalineación física
    let bestDarkness = -1;
    let bestX = centerX;
    let bestY = centerY;

    for (let dy = -3; dy <= 3; dy += 2) {
      for (let dx = -3; dx <= 3; dx += 2) {
        const d = getPixelDarkness(centerX + dx, centerY + dy);
        if (d > bestDarkness) {
          bestDarkness = d;
          bestX = centerX + dx;
          bestY = centerY + dy;
        }
      }
    }

    // Muestrear círculo interior con radio reducido (55% del radio de la burbuja)
    const innerRadius = Math.max(2, Math.round(radius * 0.55));
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

  // 3. Geometría Calibrada en Milímetros (Hoja Letter 216 x 279 mm)
  // Centros de Marcadores de Esquina:
  // TL: (11.0mm, 11.0mm)  --> u=0, v=0
  // TR: (205.0mm, 11.0mm) --> u=1, v=0
  // BL: (11.0mm, 267.0mm) --> u=0, v=1
  // BR: (205.0mm, 267.0mm) --> u=1, v=1
  const MARKER_SPAN_X_MM = 205.0 - 11.0; // 194 mm
  const MARKER_SPAN_Y_MM = 267.0 - 11.0; // 256 mm

  const mmToU = (mmX: number): number => (mmX - 11.0) / MARKER_SPAN_X_MM;
  const mmToV = (mmY: number): number => (mmY - 11.0) / MARKER_SPAN_Y_MM;

  // Estimación del radio de la burbuja en píxeles (burbuja de 5mm de diámetro = 2.5mm de radio)
  const ptA = mapBilinear(mmToU(100), mmToV(100), corners);
  const ptB = mapBilinear(mmToU(102.5), mmToV(100), corners);
  const bubbleRadiusPx = Math.max(3, Math.round(Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y)));

  // Parámetros de la Grilla de Respuestas
  const columnsCount = totalQuestions > 30 ? 3 : 2;
  const perCol = Math.ceil(totalQuestions / columnsCount);

  // Altura del área de preguntas: desde Y=76mm hasta Y=248mm (172mm útiles)
  const GRID_Y_START_MM = 76.0;
  const GRID_Y_HEIGHT_MM = 172.0;
  const rowHeightMm = GRID_Y_HEIGHT_MM / perCol;

  const optionsList = ["A", "B", "C", "D", "E"].slice(0, optionsCount);
  const answers: Record<number, string> = {};
  const questionsDetail: QuestionReadResult[] = [];
  let totalConfidence = 0;
  let hasUncertainOrDouble = false;

  for (let qNum = 1; qNum <= totalQuestions; qNum++) {
    const colIdx = Math.floor((qNum - 1) / perCol);
    const rowIdx = (qNum - 1) % perCol;

    // Coordenada Y en milímetros del centro de la fila
    const rowCenterYMm = GRID_Y_START_MM + (rowIdx + 0.5) * rowHeightMm;
    const rowV = mmToV(rowCenterYMm);

    // Coordenadas X en milímetros para cada columna
    let colStartXMm = 22.5;
    let optStartOffsetMm = 22.0;
    let optStepMm = 14.0;

    if (columnsCount === 2) {
      colStartXMm = colIdx === 0 ? 22.5 : 112.5;
      optStartOffsetMm = 22.0;
      optStepMm = optionsCount > 4 ? 10.5 : 14.0;
    } else {
      // 3 columnas
      if (colIdx === 0) colStartXMm = 22.5;
      else if (colIdx === 1) colStartXMm = 81.5;
      else colStartXMm = 140.5;

      optStartOffsetMm = 15.0;
      optStepMm = optionsCount > 4 ? 7.5 : 9.5;
    }

    // Muestrear nivel base del papel en el espacio blanco previo a las opciones
    const paperRefU = mmToU(colStartXMm + 8.0);
    const paperPt = mapBilinear(paperRefU, rowV, corners);
    const paperDarkness = samplePaperWhite(paperPt.x, paperPt.y);

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
      // Oscuridad relativa contra el fondo del papel blanco
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

    // Umbrales calibrados para alto contraste (bordes finos y letras claras):
    // Burbuja vacía: delta <= 12
    // Burbuja marcada con lápiz o tinta: delta >= 28
    const FILL_DELTA_THRESHOLD = 26;
    const DIFF_DELTA_THRESHOLD = 14;

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
        // Marca dudosa o doble marca: sugerir la opción más oscura pero advertir al profesor
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
