/**
 * @license
 * MIT License
 * 
 * Copyright (c) 2026 Christian Mollo <gnuchrismo@gmail.com>
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 * Author: Christian Mollo
 * Email: gnuchrismo@gmail.com
 */
/**
 * vision.worker.ts — Analizador de Calidad Biométrica v4.0 (SIFv3)
 * ─────────────────────────────────────────────────────────────────
 * Arquitectura: Recibe FaceLandmarkerResult del hilo principal y
 * ejecuta la pipeline de análisis matemático/óptico en segundo plano.
 *
 * Mejoras v4.0:
 *  - Roll facial (ISO/IEC 29794-5 §6.3)
 *  - Micro-motion temporal para liveness de alta seguridad
 *  - Distancia inter-ocular en píxeles reales
 *  - Score de calidad compuesto (ISO 29794-5)
 *  - Umbrales importados desde biometric.config.ts (sin valores hard-coded)
 */

import {
  ANTI_SPOOF_THRESHOLD,
  BLUR_THRESHOLD,
  EAR_OPEN_THRESHOLD,
  DEPTH_Z_RANGE_REAL,
  BRIGHTNESS_MIN,
  BRIGHTNESS_MAX,
  MIN_FACE_HEIGHT_RATIO,
  MAX_FACE_HEIGHT_RATIO,
  MICRO_MOTION_MIN,
  MICRO_MOTION_MAX,
  MICRO_MOTION_STATIC_FRAMES,
  MIN_INTER_OCULAR_PX,
  MAX_ROLL_DEGREES,
  GLASSES_Z_THRESHOLD,
} from '../config/biometric.config';

import type { WorkerOutput, VisionResult } from '../models/biometric.models';

// ─── Índices de landmarks MediaPipe 478 puntos ────────────────────────────────
const LEFT_EYE_EAR   = [33,  160, 158, 133, 153, 144];
const RIGHT_EYE_EAR  = [362, 385, 387, 263, 373, 380];
const NOSE_TIP       = 1;
const CHIN           = 152;
const LEFT_EAR_PT    = 234;
const RIGHT_EAR_PT   = 454;
const FOREHEAD       = 10;
// Centros oculares (iris): MediaPipe 478 include iris landmarks
const LEFT_IRIS_CENTER  = 473; // iris izquierdo centro
const RIGHT_IRIS_CENTER = 468; // iris derecho centro

// ─── Historial de landmarks para micro-motion ─────────────────────────────────
let prevLandmarkSnapshot: Float32Array | null = null;

/**
 * Contador de frames consecutivos con micro-motion ≈ 0.
 * Si llega a MICRO_MOTION_STATIC_FRAMES, el score anti-spoof se penaliza:
 * indica que la fuente es una imagen estática (foto/pantalla sin movimiento).
 */
let staticFrameCount = 0;

/**
 * Configuración dinámica de umbrales (actualizable via mensaje CONFIGURE).
 * Se inicializa con los valores estáticos importados desde biometric.config.
 * El hilo principal la actualiza en tiempo real cuando el usuario mueve un slider.
 */
let cfg = {
  ANTI_SPOOF:       ANTI_SPOOF_THRESHOLD,
  BLUR:             BLUR_THRESHOLD,
  EAR_OPEN:         EAR_OPEN_THRESHOLD,
  DEPTH_Z_RANGE:    DEPTH_Z_RANGE_REAL,
  MAX_ROLL:         MAX_ROLL_DEGREES,
  GLASSES_Z:        GLASSES_Z_THRESHOLD,
  MIN_INTER_OCULAR: MIN_INTER_OCULAR_PX,
  BRIGHTNESS_MIN:   BRIGHTNESS_MIN,
  BRIGHTNESS_MAX:   BRIGHTNESS_MAX,
  MICRO_MOTION_MIN: MICRO_MOTION_MIN,
  MICRO_MOTION_MAX: MICRO_MOTION_MAX,
  MICRO_STATIC_N:   MICRO_MOTION_STATIC_FRAMES,
  MIN_FACE_H:       MIN_FACE_HEIGHT_RATIO,
  MAX_FACE_H:       MAX_FACE_HEIGHT_RATIO,
};

// ─── Handler principal ────────────────────────────────────────────────────────
self.onmessage = async (ev: MessageEvent) => {
  const { type, results, image, imageWidthPx } = ev.data;

  // Actualización dinámica de umbrales desde el hilo principal (ThresholdService)
  if (type === 'CONFIGURE' && ev.data.thresholds) {
    cfg = { ...cfg, ...ev.data.thresholds };
    return;
  }

  if (type === 'ANALYZE' && results && image) {
    try {
      const result = await analyze(results, image, imageWidthPx ?? 640);
      postMsg({ type: 'RESULT', data: result });
    } catch (err: any) {
      postErr(err?.message ?? 'Error en análisis post-procesamiento');
    } finally {
      image.close();
    }
  }
};

// ─── Pipeline de análisis ─────────────────────────────────────────────────────
async function analyze(
  results: any,
  image: ImageBitmap,
  imageWidthPx: number
): Promise<VisionResult> {

  const faceCount = results.faceLandmarks?.length ?? 0;
  if (faceCount === 0) return emptyResult();

  const lm = results.faceLandmarks[0];

  // 1. Métricas geométricas (rápidas, sin canvas)
  const earScore          = computeEAR(lm);
  const { yaw, pitch }    = computeHeadPose(lm);
  const roll              = computeRoll(lm);           // ← NUEVO v4.0
  const framed            = checkFraming(lm);
  const interOcularPx     = computeInterOcularPx(lm, imageWidthPx); // ← NUEVO v4.0
  const glassesDetected   = detectGlasses(lm);

  // 2. Métricas de calidad sobre el área del rostro (requiere canvas)
  const faceBox = getFaceBoundingBox(lm, image.width, image.height);
  const { blurScore, brightnessOk, facePixelData } =
    await computeQualityFace(image, faceBox);

  // 3. Profundidad 3D (anti-spoofing por geometría)
  const zDepthScore = computeFaceDepth(lm);

  // 4. Micro-motion temporal (señal vital)
  const currSnapshot     = snapshotLandmarks(lm);
  const microMotionScore = computeMicroMotion(prevLandmarkSnapshot, currSnapshot);
  prevLandmarkSnapshot   = currSnapshot;

  // Acumular contador de frames estáticos para penalizar fotos/pantallas
  // Si el rostro no muestra ningún micro-movimiento durante N frames consecutivos
  // → asumimos fuente estática (foto impresa, pantalla, video pregrabado)
  if (microMotionScore < 0.15) {
    staticFrameCount = Math.min(staticFrameCount + 1, cfg['MICRO_STATIC_N'] + 10);
  } else {
    staticFrameCount = Math.max(0, staticFrameCount - 2); // decaimiento rápido al moverse
  }
  const effectiveMicroMotion = staticFrameCount >= cfg['MICRO_STATIC_N']
    ? 0   // penalización total: N frames sin movimiento → score forzado a 0
    : microMotionScore;

  // 5. Score anti-spoof compuesto:
  //    - Profundidad 3D (55%): foto plana → forzar a 0
  //    - Micro-motion efectivo (30%): foto/pantalla estática → 0 después de N frames
  //    - Nitidez normalizada (15%): foto impresa de alta calidad puede ser alta
  const antiSpoofScore = Math.min(1,
    zDepthScore          * 0.55 +
    effectiveMicroMotion * 0.30 +
    (blurScore / 300)    * 0.15
  );

  // 6. Score de calidad ISO 29794-5 compuesto (0–100)
  const qualityScore = computeISOQualityScore({
    blurScore,
    brightnessOk,
    framed,
    yaw,
    pitch,
    roll,
    interOcularPx,
    antiSpoofScore,
    earScore,
  });

  return {
    faceCount,
    faceDetected:    true,
    earScore,
    isBlinking:      earScore < EAR_OPEN_THRESHOLD,
    headYaw:         Math.round(yaw),
    headPitch:       Math.round(pitch),
    headRoll:        Math.round(roll),
    blurScore:       Math.round(blurScore),
    brightnessOk,
    framed,
    antiSpoofScore,
    microMotionScore,
    glassesDetected,
    faceW:           faceBox.w / image.width,
    faceH:           faceBox.h / image.height,
    interOcularPx,
    qualityScore,
    staticFrames:    staticFrameCount,
  };
}

// ─── Bounding box ─────────────────────────────────────────────────────────────
function getFaceBoundingBox(lm: any[], iw: number, ih: number) {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return {
    x: Math.max(0, minX - w * 0.1) * iw,
    y: Math.max(0, minY - h * 0.1) * ih,
    w: Math.min(1, w * 1.2) * iw,
    h: Math.min(1, h * 1.2) * ih,
  };
}

// ─── Vectores 3D ─────────────────────────────────────────────────────────────
function v3(lm: any[], i: number) { return { x: lm[i].x, y: lm[i].y, z: lm[i].z ?? 0 }; }
function d3(a: any, b: any)       { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2); }

// ─── EAR (Eye Aspect Ratio) ───────────────────────────────────────────────────
function eyeEAR(lm: any[], idx: number[]): number {
  const [p1, p2, p3, p4, p5, p6] = idx.map(i => v3(lm, i));
  const h = d3(p1, p4);
  return h > 0 ? (d3(p2, p6) + d3(p3, p5)) / (2 * h) : 0;
}

function computeEAR(lm: any[]): number {
  return (eyeEAR(lm, LEFT_EYE_EAR) + eyeEAR(lm, RIGHT_EYE_EAR)) / 2;
}

// ─── Head Pose (Yaw / Pitch) ──────────────────────────────────────────────────
function computeHeadPose(lm: any[]) {
  const nose     = v3(lm, NOSE_TIP);
  const leftEar  = v3(lm, LEFT_EAR_PT);
  const rightEar = v3(lm, RIGHT_EAR_PT);
  const forehead = v3(lm, FOREHEAD);
  const chin     = v3(lm, CHIN);

  const dL  = Math.abs(nose.x - leftEar.x);
  const dR  = Math.abs(nose.x - rightEar.x);
  const yaw = ((dL - dR) / (dL + dR)) * 100;

  const faceH  = Math.abs(chin.y - forehead.y) || 1;
  const pitch  = ((nose.y - forehead.y) / faceH - 0.45) * 100;

  return { yaw, pitch };
}

/**
 * Roll (rotación en eje Z) — ISO/IEC 29794-5 §6.3
 * Mide la inclinación lateral de la cabeza usando el ángulo
 * entre los centros de los iris izquierdo y derecho.
 *
 * Usa los puntos de iris de MediaPipe (478 landmarks mode).
 * Si el modelo no retorna landmark 468/473, usa los cantos externos del ojo.
 */
function computeRoll(lm: any[]): number {
  /**
   * BUG FIX v4.1: Usar outer eye corners (33=izq, 263=der) garantizados en el
   * face mesh de 468 puntos. Los iris landmarks (468, 473) son puntos opcionales
   * que solo existen en configuraciones con `outputFacialTransformationMatrixes`
   * activado, y su ausencia provoca roll artificialmente incorrecto.
   *
   * Los outer eye corners son estables, simétricos y dan un eje horizontal real.
   */
  const leftPt  = lm[33];   // Outer left eye corner (lateral canthus izq)
  const rightPt = lm[263];  // Outer right eye corner (lateral canthus der)
  const dx = rightPt.x - leftPt.x;
  const dy = rightPt.y - leftPt.y;
  // atan2 en coordenadas de imagen: positivo = cabeza inclinada hacia la derecha
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

// ─── Distancia inter-ocular en píxeles reales ─────────────────────────────────
/**
 * ISO/IEC 29794-5 requiere mínimo 90px entre centros oculares.
 * Convierte la distancia normalizada de landmarks a píxeles reales.
 */
function computeInterOcularPx(lm: any[], imageWidthPx: number): number {
  const leftPt  = lm[LEFT_IRIS_CENTER]  ?? lm[33];
  const rightPt = lm[RIGHT_IRIS_CENTER] ?? lm[263];
  const dxNorm  = Math.abs(rightPt.x - leftPt.x);
  return Math.round(dxNorm * imageWidthPx);
}


// ─── Detección de lentes ──────────────────────────────────────────────────────
/**
 * Detecta presencia de lentes/anteojos usando análisis Z multi-punto.
 *
 * BUG FIX v4.1:
 *   - Umbral reducido de 0.038 → GLASSES_Z_THRESHOLD (0.016)
 *     Montures visibles generan diff ≈ 0.015–0.030 en unidades normalizadas.
 *   - 6 puntos de referencia ocular en lugar de 2 → menos falsos negativos.
 *   - Comparación cruzada: zona ocular vs zona de mejilla (sin gafas).
 *
 * Limitación: gafas de contacto o montura ultradelgada pueden no detectarse.
 */
function detectGlasses(lm: any[]): boolean {
  // Puntos en la zona del monture de gafas
  const noseBridge = lm[168].z;  // entre los ojos (puente nasal donde descansa el monture)
  const leftInner  = lm[133].z;  // canto medial izquierdo (arco interno del ojo izq)
  const leftOuter  = lm[33].z;   // canto lateral izquierdo
  const rightInner = lm[362].z;  // canto medial derecho
  const rightOuter = lm[263].z;  // canto lateral derecho
  const glabella   = lm[6].z;    // entre las cejas (arriba del monture)

  // Puntos de referencia fuera de la zona de gafas
  const leftCheek  = lm[116].z;
  const rightCheek = lm[345].z;
  const chin       = lm[CHIN].z;

  // Diferencias en la zona ocular vs. puente nasal
  const diffL_inner  = Math.abs(noseBridge - leftInner);
  const diffR_inner  = Math.abs(noseBridge - rightInner);
  const diffL_outer  = Math.abs(noseBridge - leftOuter);
  const diffR_outer  = Math.abs(noseBridge - rightOuter);

  // Diferencia puente nasal vs zona de mejilla/mentón (sin gafas)
  const cheekAvg       = (leftCheek + rightCheek + chin) / 3;
  const bridgeToCheek  = Math.abs(noseBridge - cheekAvg);
  const glabellaToNose = Math.abs(glabella - noseBridge);

  return diffL_inner    > cfg['GLASSES_Z'] ||
         diffR_inner    > cfg['GLASSES_Z'] ||
         diffL_outer    > cfg['GLASSES_Z'] ||
         diffR_outer    > cfg['GLASSES_Z'] ||
         bridgeToCheek  > cfg['GLASSES_Z'] * 1.5 ||
         glabellaToNose > cfg['GLASSES_Z'];
}


// ─── Profundidad Z (anti-spoof geométrico) ────────────────────────────────────
function computeFaceDepth(lm: any[]): number {
  const points = [lm[NOSE_TIP].z, lm[FOREHEAD].z, lm[CHIN].z, lm[LEFT_EAR_PT].z, lm[RIGHT_EAR_PT].z];
  const zRange = Math.max(...points) - Math.min(...points);
  return Math.min(1, zRange / cfg['DEPTH_Z_RANGE']);
}

// ─── Framing check ────────────────────────────────────────────────────────────
function checkFraming(lm: any[]): boolean {
  const top      = lm[FOREHEAD].y;
  const bottom   = lm[CHIN].y;
  const left     = lm[LEFT_EAR_PT].x;
  const right    = lm[RIGHT_EAR_PT].x;
  const centerX  = (left + right) / 2;
  const centerY  = (top + bottom) / 2;

  const sizedOk    = (bottom - top) > cfg['MIN_FACE_H'] && (bottom - top) < cfg['MAX_FACE_H'];
  const centered   = Math.abs(centerX - 0.5) < 0.20 && Math.abs(centerY - 0.5) < 0.28;
  const notClipped = left > -0.05 && right < 1.05 && top > -0.05 && bottom < 1.05;

  return sizedOk && centered && notClipped;
}

// ─── Calidad de imagen (sobre área del rostro) ────────────────────────────────
async function computeQualityFace(img: ImageBitmap, box: { x: number; y: number; w: number; h: number }) {
  const S = 64;
  const c = new OffscreenCanvas(S, S);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, S, S);
  const imgData = ctx.getImageData(0, 0, S, S);
  const { data } = imgData;

  const gray: number[] = [];
  let totalL = 0;
  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray.push(g);
    totalL += g;
  }
  const avgL = totalL / gray.length;

  return {
    blurScore:    laplacianVariance(gray, S, S),
    brightnessOk: avgL > cfg['BRIGHTNESS_MIN'] && avgL < cfg['BRIGHTNESS_MAX'],
    facePixelData: imgData,
  };
}

// ─── Varianza laplaciana (nitidez) ────────────────────────────────────────────
function laplacianVariance(gray: number[], w: number, h: number): number {
  const lap: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c   = gray[y * w + x];
      const val = gray[(y - 1) * w + x] + gray[(y + 1) * w + x]
                + gray[y * w + x - 1]   + gray[y * w + x + 1] - 4 * c;
      lap.push(val);
    }
  }
  const mean = lap.reduce((a, b) => a + b, 0) / lap.length;
  return lap.reduce((a, b) => a + (b - mean) ** 2, 0) / lap.length;
}

// ─── Micro-motion temporal (análisis de señal vital) ─────────────────────────
/**
 * Detecta micro-movimientos naturales entre frames consecutivos.
 * Un rostro vivo tiene delta de landmarks de 0.0008–0.025 por frame.
 * Un ataque con foto estática o pantalla sin movimiento tendrá delta ≈ 0.
 *
 * @returns Score 0–1. 1 = señal vital clara. 0 = imagen estática.
 */
function computeMicroMotion(
  prev: Float32Array | null,
  curr: Float32Array
): number {
  if (!prev || prev.length !== curr.length) return 0.5; // primer frame: score neutro

  let totalDelta = 0;
  for (let i = 0; i < prev.length; i++) {
    totalDelta += Math.abs(curr[i] - prev[i]);
  }
  const avgDelta = totalDelta / curr.length;

  // Dentro del rango natural → señal vital = 1
  if (avgDelta >= cfg['MICRO_MOTION_MIN'] && avgDelta <= cfg['MICRO_MOTION_MAX']) return 1;
  // Demasiado quieto (foto/pantalla fija) → 0
  if (avgDelta < cfg['MICRO_MOTION_MIN']) return avgDelta / cfg['MICRO_MOTION_MIN'];
  // Demasiado movimiento (sacudida brusca) → degradar score
  return Math.max(0, 1 - (avgDelta - MICRO_MOTION_MAX) / 0.05);
}

/**
 * Genera un snapshot compacto de coordenadas X,Y de los landmarks.
 * Solo coordenadas X e Y (descartamos Z para comparar posición 2D).
 */
function snapshotLandmarks(lm: any[]): Float32Array {
  const arr = new Float32Array(lm.length * 2);
  for (let i = 0; i < lm.length; i++) {
    arr[i * 2]     = lm[i].x;
    arr[i * 2 + 1] = lm[i].y;
  }
  return arr;
}

// ─── Score de calidad ISO 29794-5 compuesto ───────────────────────────────────
/**
 * Calcula un score de calidad normalizado (0–100) similar al NFIQ2.
 * Pesos basados en ISO/IEC 29794-5 Annex A.
 */
function computeISOQualityScore(params: {
  blurScore:      number;
  brightnessOk:   boolean;
  framed:         boolean;
  yaw:            number;
  pitch:          number;
  roll:           number;
  interOcularPx:  number;
  antiSpoofScore: number;
  earScore:       number;
}): number {
  const {
    blurScore, brightnessOk, framed,
    yaw, pitch, roll,
    interOcularPx, antiSpoofScore, earScore
  } = params;

  let score = 100;

  // Penalizaciones
  if (!brightnessOk)          score -= 20;
  if (!framed)                score -= 15;
  if (blurScore < BLUR_THRESHOLD) score -= Math.min(20, (BLUR_THRESHOLD - blurScore) / 3);
  if (Math.abs(yaw)   > 10)   score -= Math.min(15, Math.abs(yaw)   - 10);
  if (Math.abs(pitch) > 8)    score -= Math.min(10, Math.abs(pitch)  - 8);
  if (Math.abs(roll)  > MAX_ROLL_DEGREES) score -= Math.min(10, Math.abs(roll) - MAX_ROLL_DEGREES);
  if (interOcularPx < MIN_INTER_OCULAR_PX) score -= 15;
  if (antiSpoofScore < ANTI_SPOOF_THRESHOLD) score -= 20;
  if (earScore < EAR_OPEN_THRESHOLD) score -= 5; // ojos casi cerrados

  return Math.max(0, Math.round(score));
}

// ─── Resultado vacío ──────────────────────────────────────────────────────────
function emptyResult(): VisionResult {
  return {
    faceCount: 0, faceDetected: false, earScore: 0, isBlinking: false,
    headYaw: 0, headPitch: 0, headRoll: 0, blurScore: 0, brightnessOk: false,
    framed: false, antiSpoofScore: 0, microMotionScore: 0, glassesDetected: false,
    faceW: 0, faceH: 0, interOcularPx: 0, qualityScore: 0,
  };
}

// ─── Helpers de mensajería ────────────────────────────────────────────────────
function postMsg(m: WorkerOutput) { (self as any).postMessage(m); }
function postErr(err: string)     { postMsg({ type: 'ERROR', error: err }); }
