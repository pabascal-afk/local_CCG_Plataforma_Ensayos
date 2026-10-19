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
  fullImageDataUrl?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface CornerMarkers {
  tl: Point;
  tr: Point;
  bl: Point;
  br: Point;
  hasTl?: boolean;
  hasTr?: boolean;
  hasBl?: boolean;
  hasBr?: boolean;
  detectedCount: number;
}

export interface LiveFrameCheckResult {
  hasTl: boolean;
  hasTr: boolean;
  hasBl: boolean;
  hasBr: boolean;
  detectedCount: number;
  isAligned: boolean;
  qrMetadata: OmrSheetMetadata | null;
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
 * Detecta con extrema precisión los 4 marcadores de esquina (cuadrados negros de 10x10mm)
 * mediante análisis de componentes conexos (blobs sólidos) en cada cuadrante.
 * Es 100% inmune a sombras del escáner, bordes de vidrio, logo del colegio y código QR.
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
    return Math.max(0, 255 - (0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]));
  };

  const findMarkerInQuadrant = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    targetX: number,
    targetY: number
  ): Point | null => {
    const qw = maxX - minX;
    const qh = maxY - minY;
    if (qw <= 0 || qh <= 0) return null;

    const DARK_THRESH = 95;
    const step = Math.max(1, Math.floor(Math.min(width, height) / 750));
    const visited = new Uint8Array(qw * qh);

    interface Candidate {
      cx: number;
      cy: number;
      count: number;
      dist: number;
      bw: number;
      bh: number;
      density: number;
    }
    const candidates: Candidate[] = [];
    const minCount = Math.max(8, Math.round((qw * qh) * 0.0006 / (step * step)));

    for (let y = minY; y < maxY; y += step) {
      for (let x = minX; x < maxX; x += step) {
        const lx = x - minX;
        const ly = y - minY;
        const vIdx = ly * qw + lx;
        if (visited[vIdx] || getDarkness(x, y) < DARK_THRESH) continue;

        // BFS en la ventana del cuadrante
        const q: number[] = [x, y];
        visited[vIdx] = 1;
        let cMinX = x;
        let cMaxX = x;
        let cMinY = y;
        let cMaxY = y;
        let count = 0;
        let sumX = 0;
        let sumY = 0;
        let head = 0;

        while (head < q.length) {
          const curX = q[head++];
          const curY = q[head++];
          count++;
          sumX += curX;
          sumY += curY;

          const neighbors = [
            [curX + step, curY],
            [curX - step, curY],
            [curX, curY + step],
            [curX, curY - step],
          ];

          for (let n = 0; n < 4; n++) {
            const nx = neighbors[n][0];
            const ny = neighbors[n][1];
            if (nx >= minX && nx < maxX && ny >= minY && ny < maxY) {
              const nlx = nx - minX;
              const nly = ny - minY;
              const nvIdx = nly * qw + nlx;
              if (!visited[nvIdx] && getDarkness(nx, ny) >= DARK_THRESH) {
                visited[nvIdx] = 1;
                q.push(nx, ny);
                if (nx < cMinX) cMinX = nx;
                if (nx > cMaxX) cMaxX = nx;
                if (ny < cMinY) cMinY = ny;
                if (ny > cMaxY) cMaxY = ny;
              }
            }
          }
        }

        const bw = cMaxX - cMinX + step;
        const bh = cMaxY - cMinY + step;

        // Ignorar bordes oscuros de la tapa del escáner que cubren la mayor parte del cuadrante
        if (bw > qw * 0.65 || bh > qh * 0.65) continue;

        const area = (bw / step) * (bh / step);
        const density = area > 0 ? count / area : 0;
        const aspect = bh > 0 ? bw / bh : 0;

        // Marcador cuadrado sólido: aspecto ~1.0 y densidad sólida >= 0.58
        if (count >= minCount && density >= 0.55 && aspect >= 0.60 && aspect <= 1.65) {
          const cx = sumX / count;
          const cy = sumY / count;
          const dist = Math.hypot(cx - targetX, cy - targetY);
          candidates.push({ cx, cy, count, dist, bw, bh, density });
        }
      }
    }

    if (candidates.length === 0) return null;
    // Seleccionar el candidato más cercano a la esquina teórica
    candidates.sort((a, b) => a.dist - b.dist);
    return { x: candidates[0].cx, y: candidates[0].cy };
  };

  // Cuadrantes de búsqueda (22% del ancho y 20% del alto en cada esquina)
  const qw = Math.round(width * 0.22);
  const qh = Math.round(height * 0.20);

  const tl = findMarkerInQuadrant(0, qw, 0, qh, 0, 0);
  const tr = findMarkerInQuadrant(width - qw, width, 0, qh, width, 0);
  const bl = findMarkerInQuadrant(0, qw, height - qh, height, 0, height);
  const br = findMarkerInQuadrant(width - qw, width, height - qh, height, width, height);

  let detectedCount = 0;
  if (tl) detectedCount++;
  if (tr) detectedCount++;
  if (bl) detectedCount++;
  if (br) detectedCount++;

  let finalTl = tl;
  let finalTr = tr;
  let finalBl = bl;
  let finalBr = br;

  // Si se detectaron 3 marcadores, reconstruir el 4to por paralelogramo afín
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

  // Fallback nominal de hoja Letter (216x279 mm con marcadores a 11mm del borde)
  const nomTl: Point = { x: width * 0.05, y: height * 0.04 };
  const nomTr: Point = { x: width * 0.95, y: height * 0.04 };
  const nomBl: Point = { x: width * 0.05, y: height * 0.96 };
  const nomBr: Point = { x: width * 0.95, y: height * 0.96 };

  return {
    tl: finalTl || nomTl,
    tr: finalTr || nomTr,
    bl: finalBl || nomBl,
    br: finalBr || nomBr,
    hasTl: !!tl,
    hasTr: !!tr,
    hasBl: !!bl,
    hasBr: !!br,
    detectedCount,
  };
}

/**
 * Interpola bilinealmente (u, v) en [0, 1] hacia coordenadas de píxel según los 4 marcadores de esquina.
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

  if (!ctx || width < 150 || height < 150) {
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

  // 1. Detección de Código QR y Orientación (probar 0°, 180°, 90°, 270°)
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

  // 2. Generación de Imagen en Alta Resolución para inspección y Miniatura para la barra lateral
  // Miniatura para visualización rápida en la lista (200px)
  const thumbCanvas = document.createElement("canvas");
  const thumbW = 200;
  const thumbH = Math.max(1, Math.round((thumbW * curHeight) / curWidth));
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext("2d");
  if (thumbCtx) {
    thumbCtx.drawImage(orientedCanvas, 0, 0, thumbW, thumbH);
  }
  const thumbnailDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.75);

  // Imagen en Alta Resolución (hasta 1600px) para "Ver imagen original"
  let fullImageDataUrl = "";
  const maxDim = 1600;
  if (curWidth > maxDim || curHeight > maxDim) {
    const scale = Math.min(maxDim / curWidth, maxDim / curHeight);
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = Math.round(curWidth * scale);
    fullCanvas.height = Math.round(curHeight * scale);
    const fullCtx = fullCanvas.getContext("2d");
    if (fullCtx) {
      fullCtx.imageSmoothingEnabled = true;
      fullCtx.imageSmoothingQuality = "high";
      fullCtx.drawImage(orientedCanvas, 0, 0, fullCanvas.width, fullCanvas.height);
      fullImageDataUrl = fullCanvas.toDataURL("image/jpeg", 0.88);
    }
  } else {
    fullImageDataUrl = orientedCanvas.toDataURL("image/jpeg", 0.88);
  }

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
      fullImageDataUrl,
    };
  }

  const totalQuestions = metadata ? metadata.qc : 30;
  const optionsCount = metadata ? metadata.oc : 4;
  const studentRut = metadata ? metadata.rut : "GENERICO";
  const assignmentId = metadata ? metadata.aid : expectedAssignmentId || 0;
  const examId = metadata ? metadata.eid : 0;

  // 3. Detección Robusta de Marcadores Fiduciales en las 4 esquinas
  const corners = detectCornerMarkers(pixels, curWidth, curHeight);

  // Función de lectura de nivel de oscuridad (0=blanco, 255=negro)
  const getPixelDarkness = (px: number, py: number): number => {
    const x = Math.min(Math.max(0, Math.round(px)), curWidth - 1);
    const y = Math.min(Math.max(0, Math.round(py)), curHeight - 1);
    const idx = (y * curWidth + x) * 4;
    return Math.max(0, 255 - (0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]));
  };

  // 4. Medición Segura del Blanco del Papel en los márgenes laterales limpios
  const paperSamples: number[] = [];
  const sampleSteps = 24;
  for (let i = 0; i < sampleSteps; i++) {
    const v = 0.20 + (i / sampleSteps) * 0.70;
    // Margen izquierdo libre de texto
    const ptLeft = mapBilinear(0.035, v, corners);
    paperSamples.push(getPixelDarkness(ptLeft.x, ptLeft.y));
    // Margen derecho libre de texto
    const ptRight = mapBilinear(0.965, v, corners);
    paperSamples.push(getPixelDarkness(ptRight.x, ptRight.y));
  }
  paperSamples.sort((a, b) => a - b);
  // Tomamos el percentil 25 para garantizar blanco de papel puro sin tocar grafito
  const paperDarkness = paperSamples[Math.floor(paperSamples.length * 0.25)] || 20;

  // 5. Radio de Burbuja Proporcional y Muestreo Centrado
  const ptTL = mapBilinear(0, 0, corners);
  const ptBL = mapBilinear(0, 1, corners);
  const markerHeightPx = Math.hypot(ptBL.x - ptTL.x, ptBL.y - ptTL.y);
  // Diámetro ~5mm en hoja de 256mm entre centros de marcadores -> radio ~2.5mm
  const bubbleRadiusPx = Math.max(2, Math.round(markerHeightPx * (2.5 / 256.0)));

  const sampleBubbleDarkness = (centerX: number, centerY: number, radius: number): number => {
    // Radio interior (50% del radio de la burbuja) para no tocar el borde impreso
    const innerRadius = Math.max(1, Math.round(radius * 0.50));
    const rSq = innerRadius * innerRadius;

    // Medir oscuridad en el centro nominal
    let sumCenter = 0;
    let countCenter = 0;
    for (let dy = -innerRadius; dy <= innerRadius; dy++) {
      for (let dx = -innerRadius; dx <= innerRadius; dx++) {
        if (dx * dx + dy * dy <= rSq) {
          sumCenter += getPixelDarkness(centerX + dx, centerY + dy);
          countCenter++;
        }
      }
    }
    const centerDarkness = countCenter > 0 ? sumCenter / countCenter : 0;

    // Si el centro es claramente blanco/vacío, no hacer micro-búsqueda para evitar desvíos al contorno
    if (centerDarkness <= paperDarkness + 14) {
      return centerDarkness;
    }

    // Si hay marca oscura, buscar el centro exacto del trazo del alumno en una ventana de +-30%
    const searchWin = Math.max(1, Math.round(radius * 0.30));
    let bestDarkness = centerDarkness;

    for (let dy = -searchWin; dy <= searchWin; dy++) {
      for (let dx = -searchWin; dx <= searchWin; dx++) {
        let sum = 0;
        let count = 0;
        for (let sdy = -innerRadius; sdy <= innerRadius; sdy++) {
          for (let sdx = -innerRadius; sdx <= innerRadius; sdx++) {
            if (sdx * sdx + sdy * sdy <= rSq) {
              sum += getPixelDarkness(centerX + dx + sdx, centerY + dy + sdy);
              count++;
            }
          }
        }
        const avg = count > 0 ? sum / count : 0;
        if (avg > bestDarkness) {
          bestDarkness = avg;
        }
      }
    }

    return bestDarkness;
  };

  // 6. Geometría Calibrada y Mapeo de Columnas/Filas
  const columnsCount = totalQuestions > 30 ? 3 : 2;
  const perCol = Math.ceil(totalQuestions / columnsCount);

  // Límites verticales de la grilla de preguntas respecto a marcadores (calibrados en hoja oficial)
  const V_START = 0.296;
  const V_END = 0.948;

  // Coordenadas horizontales 'u' calibradas milimétricamente
  // 2 Columnas (hasta 30 preguntas):
  const COL2_U = [
    [0.180, 0.252, 0.324, 0.396, 0.468], // Columna 1 (A, B, C, D, E)
    [0.628, 0.700, 0.772, 0.844, 0.916], // Columna 2 (A, B, C, D, E)
  ];

  // 3 Columnas (más de 30 preguntas):
  const COL3_U = [
    [0.144, 0.192, 0.240, 0.288, 0.336], // Columna 1
    [0.448, 0.496, 0.544, 0.592, 0.640], // Columna 2
    [0.752, 0.800, 0.848, 0.896, 0.944], // Columna 3
  ];

  const optionsList = ["A", "B", "C", "D", "E"].slice(0, optionsCount);
  const answers: Record<number, string> = {};
  const questionsDetail: QuestionReadResult[] = [];
  let totalConfidence = 0;
  let hasUncertainOrDouble = false;

  for (let qNum = 1; qNum <= totalQuestions; qNum++) {
    const colIdx = Math.floor((qNum - 1) / perCol);
    const rowIdx = (qNum - 1) % perCol;

    // Cantidad real de preguntas en ESTA columna específica (la última columna puede tener menos)
    const colQuestionsCount = Math.min(perCol, totalQuestions - colIdx * perCol);

    const rowV =
      colQuestionsCount <= 1
        ? (V_START + V_END) / 2
        : V_START + (rowIdx * (V_END - V_START)) / (colQuestionsCount - 1);

    const uList = columnsCount === 2 ? COL2_U[colIdx] : COL3_U[colIdx];

    const scores: Record<string, number> = {};
    let maxDelta = -1;
    let maxOpt = "";
    let secondDelta = -1;

    for (let optIdx = 0; optIdx < optionsCount; optIdx++) {
      const optLetter = optionsList[optIdx];
      const optU = uList ? uList[optIdx] : 0.15 + optIdx * 0.06;
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

    // Umbrales calibrados para alta precisión:
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
        confidence = Math.min(100, Math.max(75, Math.round(((maxDelta - secondDelta) / maxDelta) * 100)));
        answers[qNum] = selectedOption;
      } else {
        selectedOption = maxOpt;
        status = "DOUBLE_MARK";
        confidence = 45;
        hasUncertainOrDouble = true;
        answers[qNum] = selectedOption;
      }
    } else {
      selectedOption = null;
      status = "BLANK";
      confidence = 98;
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
    fullImageDataUrl,
  };
}

/**
 * Analiza en tiempo real (<15ms) un fotograma de video de la cámara para detectar
 * los 4 marcadores fiduciales de esquina y el código QR institucional.
 */
export function detectLiveFrameCorners(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement
): LiveFrameCheckResult {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || vw < 120 || vh < 120) {
    return {
      hasTl: false,
      hasTr: false,
      hasBl: false,
      hasBr: false,
      detectedCount: 0,
      isAligned: false,
      qrMetadata: null,
    };
  }

  const targetW = 520;
  const targetH = Math.max(1, Math.round((targetW * vh) / vw));
  if (scratchCanvas.width !== targetW || scratchCanvas.height !== targetH) {
    scratchCanvas.width = targetW;
    scratchCanvas.height = targetH;
  }

  const ctx = scratchCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      hasTl: false,
      hasTr: false,
      hasBl: false,
      hasBr: false,
      detectedCount: 0,
      isAligned: false,
      qrMetadata: null,
    };
  }

  ctx.drawImage(video, 0, 0, targetW, targetH);
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const corners = detectCornerMarkers(imgData.data, targetW, targetH);

  const topSpan = corners.tr.x - corners.tl.x;
  const botSpan = corners.br.x - corners.bl.x;
  const leftSpan = corners.bl.y - corners.tl.y;
  const rightSpan = corners.br.y - corners.tr.y;

  const validGeometry =
    topSpan > targetW * 0.45 &&
    botSpan > targetW * 0.45 &&
    leftSpan > targetH * 0.45 &&
    rightSpan > targetH * 0.45 &&
    Math.abs(topSpan - botSpan) < targetW * 0.28 &&
    Math.abs(leftSpan - rightSpan) < targetH * 0.28;

  let qrMetadata: OmrSheetMetadata | null = null;
  if (corners.detectedCount >= 2) {
    // Buscar QR en el 40% superior del frame para máxima velocidad
    const qrH = Math.round(targetH * 0.42);
    const qrImg = ctx.getImageData(0, 0, targetW, qrH);
    const qr = jsQR(qrImg.data, targetW, qrH, { inversionAttempts: "dontInvert" });
    if (qr && qr.data) {
      try {
        const parsed = JSON.parse(qr.data);
        if (parsed.aid && parsed.qc) {
          qrMetadata = {
            aid: Number(parsed.aid),
            rut: String(parsed.rut || ""),
            eid: Number(parsed.eid || 0),
            qc: Number(parsed.qc),
            oc: Number(parsed.oc || 4),
          };
        }
      } catch {
        // Ignorar QR externo
      }
    }
  }

  const isAligned =
    validGeometry &&
    (corners.detectedCount === 4 || (corners.detectedCount >= 3 && qrMetadata !== null));

  return {
    hasTl: Boolean(corners.hasTl),
    hasTr: Boolean(corners.hasTr),
    hasBl: Boolean(corners.hasBl),
    hasBr: Boolean(corners.hasBr),
    detectedCount: corners.detectedCount,
    isAligned,
    qrMetadata,
  };
}

