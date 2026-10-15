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

  // 1. Extraer ImageData para decodificación QR
  const imageData = ctx.getImageData(0, 0, width, height);

  // 2. Localizar y decodificar Código QR
  const qrCode = jsQR(imageData.data, width, height, {
    inversionAttempts: "attemptBoth",
  });

  let metadata: OmrSheetMetadata | null = null;
  let qrRotation = 0; // 0, 90, 180, 270

  if (qrCode && qrCode.data) {
    try {
      const parsed = JSON.parse(qrCode.data);
      if (parsed.aid && parsed.qc) {
        metadata = {
          aid: Number(parsed.aid),
          rut: String(parsed.rut || ""),
          eid: Number(parsed.eid || 0),
          qc: Number(parsed.qc),
          oc: Number(parsed.oc || 4),
        };
      }
    } catch {
      // QR no tenía formato JSON esperado
    }
  }

  // Si no se encontró QR, intentamos buscar rotando el canvas en incrementos de 90° (por si se escaneó de lado o invertido)
  let orientedCanvas = canvas;
  let orientedCtx = ctx;

  if (!metadata) {
    // Probar rotación 180°
    const rot180Canvas = document.createElement("canvas");
    rot180Canvas.width = width;
    rot180Canvas.height = height;
    const rot180Ctx = rot180Canvas.getContext("2d");
    if (rot180Ctx) {
      rot180Ctx.translate(width / 2, height / 2);
      rot180Ctx.rotate(Math.PI);
      rot180Ctx.drawImage(canvas, -width / 2, -height / 2);
      const rotData = rot180Ctx.getImageData(0, 0, width, height);
      const qr180 = jsQR(rotData.data, width, height, { inversionAttempts: "attemptBoth" });
      if (qr180 && qr180.data) {
        try {
          const parsed = JSON.parse(qr180.data);
          if (parsed.aid && parsed.qc) {
            metadata = {
              aid: Number(parsed.aid),
              rut: String(parsed.rut || ""),
              eid: Number(parsed.eid || 0),
              qc: Number(parsed.qc),
              oc: Number(parsed.oc || 4),
            };
            orientedCanvas = rot180Canvas;
            orientedCtx = rot180Ctx;
            qrRotation = 180;
          }
        } catch {}
      }
    }
  }

  // Fallback si no hay QR: usar metadata esperada si se conoce
  const totalQuestions = metadata ? metadata.qc : 30;
  const optionsCount = metadata ? metadata.oc : 4;
  const studentRut = metadata ? metadata.rut : "GENERICO";
  const assignmentId = metadata ? metadata.aid : expectedAssignmentId || 0;
  const examId = metadata ? metadata.eid : 0;

  // Miniatura para visualización en el listado de resultados
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 160;
  thumbCanvas.height = Math.round((160 * height) / width);
  const thumbCtx = thumbCanvas.getContext("2d");
  if (thumbCtx) {
    thumbCtx.drawImage(orientedCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbnailDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.65);

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

  // 3. Obtener píxeles de la imagen orientada
  const curWidth = orientedCanvas.width;
  const curHeight = orientedCanvas.height;
  const curImgData = orientedCtx.getImageData(0, 0, curWidth, curHeight);
  const pixels = curImgData.data;

  // Función auxiliar para leer nivel de gris invertido (0 = blanco puro, 255 = negro puro)
  const getPixelDarkness = (px: number, py: number): number => {
    const x = Math.min(Math.max(0, Math.round(px)), curWidth - 1);
    const y = Math.min(Math.max(0, Math.round(py)), curHeight - 1);
    const idx = (y * curWidth + x) * 4;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];
    // Luminosidad estándar ITU-R BT.601
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return Math.max(0, 255 - luminance);
  };

  // Función para medir la oscuridad de una burbuja muestreando el centro circular
  const sampleBubbleDarkness = (centerX: number, centerY: number, radius: number): number => {
    let sum = 0;
    let count = 0;
    const rSq = radius * radius;
    for (let dy = -radius; dy <= radius; dy += 2) {
      for (let dx = -radius; dx <= radius; dx += 2) {
        if (dx * dx + dy * dy <= rSq) {
          sum += getPixelDarkness(centerX + dx, centerY + dy);
          count++;
        }
      }
    }
    return count > 0 ? sum / count : 0;
  };

  // 4. Parámetros geométricos de la grilla de burbujas (coordenadas relativas de la plantilla)
  // En nuestra plantilla:
  // - Grilla vertical: inicia aproximadamente en 34.5% y termina en 92.5% de la altura de la página.
  // - Grilla horizontal: inicia en 7.5% y termina en 92.5% del ancho de la página.
  const gridTopY = curHeight * 0.355;
  const gridBottomY = curHeight * 0.915;
  const gridLeftX = curWidth * 0.085;
  const gridRightX = curWidth * 0.915;
  const gridWidth = gridRightX - gridLeftX;
  const gridHeight = gridBottomY - gridTopY;

  const columnsCount = totalQuestions > 30 ? 3 : 2;
  const perCol = Math.ceil(totalQuestions / columnsCount);
  const colWidth = gridWidth / columnsCount;
  const rowHeight = gridHeight / perCol;
  const bubbleRadius = Math.max(4, Math.round(Math.min(colWidth, rowHeight) * 0.18));

  const optionsList = ["A", "B", "C", "D", "E"].slice(0, optionsCount);
  const answers: Record<number, string> = {};
  const questionsDetail: QuestionReadResult[] = [];
  let totalConfidence = 0;
  let hasUncertainOrDouble = false;

  for (let qNum = 1; qNum <= totalQuestions; qNum++) {
    const colIdx = Math.floor((qNum - 1) / perCol);
    const rowIdx = (qNum - 1) % perCol;

    const colStartX = gridLeftX + colIdx * colWidth;
    const rowCenterY = gridTopY + rowIdx * rowHeight + rowHeight * 0.5;

    // Dentro de la columna:
    // El número está al inicio (~20% del ancho de columna).
    // Las opciones se distribuyen en el restante 80%.
    const optionsStartX = colStartX + colWidth * 0.34;
    const optionsWidth = colWidth * 0.62;
    const optStep = optionsCount > 1 ? optionsWidth / (optionsCount - 1) : optionsWidth;

    const scores: Record<string, number> = {};
    let maxDarkness = -1;
    let maxOpt = "";
    let secondDarkness = -1;

    for (let optIdx = 0; optIdx < optionsCount; optIdx++) {
      const optLetter = optionsList[optIdx];
      const bubbleCenterX = optionsStartX + optIdx * optStep;
      const darkness = sampleBubbleDarkness(bubbleCenterX, rowCenterY, bubbleRadius);
      scores[optLetter] = Math.round(darkness);

      if (darkness > maxDarkness) {
        secondDarkness = maxDarkness;
        maxDarkness = darkness;
        maxOpt = optLetter;
      } else if (darkness > secondDarkness) {
        secondDarkness = darkness;
      }
    }

    // Umbral de discriminación:
    // Una hoja blanca tiene oscuridad ~15-40 (por ruido de escaneo/papel).
    // Una burbuja pintada con lápiz o pasta tiene oscuridad > 85.
    const FILL_THRESHOLD = 75;
    const DIFF_THRESHOLD = 28;

    let selectedOption: string | null = null;
    let status: "VALID" | "BLANK" | "DOUBLE_MARK" | "UNCERTAIN" = "BLANK";
    let confidence = 100;

    if (maxDarkness >= FILL_THRESHOLD) {
      if (maxDarkness - secondDarkness >= DIFF_THRESHOLD) {
        selectedOption = maxOpt;
        status = "VALID";
        confidence = Math.min(100, Math.round(((maxDarkness - secondDarkness) / maxDarkness) * 100));
        answers[qNum] = selectedOption;
      } else {
        // Posible doble marca o borrón incompleto
        selectedOption = maxOpt; // sugerencia de la más oscura
        status = "DOUBLE_MARK";
        confidence = 45;
        hasUncertainOrDouble = true;
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
