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
 * biometric.models.ts — Modelo de dominio biométrico (SIFv3)
 * ──────────────────────────────────────────────────────────────
 * Fuente única de verdad para todas las interfaces, tipos y enums
 * del módulo de captura biométrica facial.
 */

// ─── Ciclo de vida de inicialización ─────────────────────────────────────────

export type InitStep =
  | 'IDLE'
  | 'LOADING_WASM'
  | 'LOADING_MODELS'
  | 'READY'
  | 'FAILED'
  | 'TIMEOUT';

// ─── Resultados del Worker ────────────────────────────────────────────────────

export interface VisionResult {
  faceCount:       number;
  faceDetected:    boolean;
  earScore:        number;
  isBlinking:      boolean;
  headYaw:         number;
  headPitch:       number;
  headRoll:        number;       // ← NUEVO: rotación en eje Z (ISO 29794-5)
  blurScore:       number;
  brightnessOk:    boolean;
  framed:          boolean;
  antiSpoofScore:  number;
  microMotionScore:number;       // ← NUEVO: señal vital (0–1)
  glassesDetected: boolean;
  faceW:           number;       // fracción del ancho del frame
  faceH:           number;       // fracción del alto del frame
  interOcularPx:   number;       // ← NUEVO: px reales entre centros oculares
  qualityScore:    number;       // ← NUEVO: score ISO 29794-5 compuesto (0–100)
  /** Frames consecutivos sin micro-movimiento. Para debug anti-spoof. */
  staticFrames?:   number;
}

// ─── Mensajes del Worker ──────────────────────────────────────────────────────

export interface WorkerInput {
  type:    'ANALYZE';
  results: any;          // FaceLandmarkerResult (mantenemos any para evitar dep cíclica)
  image:   ImageBitmap;
  prevLandmarks?: Float32Array; // ← NUEVO: para micro-motion
  imageWidthPx:  number;        // ← NUEVO: ancho real del frame en px
}

export interface WorkerOutput {
  type:   'RESULT' | 'ERROR';
  data?:  VisionResult;
  error?: string;
}

// ─── Frame de sesión biométrica ───────────────────────────────────────────────

export interface BiometricFrame {
  ts:              number;
  ear:             number;
  blur:            number;
  yaw:             number;
  pitch:           number;
  roll:            number;       // ← NUEVO
  faceCount:       number;
  antiSpoof:       number;
  microMotion:     number;       // ← NUEVO
  qualityScore:    number;       // ← NUEVO
  livenessProgress:number;
  faceDetected:    boolean;
  singleFace:      boolean;
  isFramed:        boolean;
  isLit:           boolean;
  notBlurry:       boolean;
  antiSpoofOk:     boolean;
  rollOk:          boolean;      // ← NUEVO
  interOcularPx:   number;       // ← NUEVO
  fps:             number;
}

// ─── Agregados de sesión ──────────────────────────────────────────────────────

export interface BiometricSessionAggregates {
  totalFrames:       number;
  framesWithFace:    number;
  framesFramed:      number;
  avgEar:            number;
  minEar:            number;
  maxEar:            number;
  avgBlur:           number;
  minBlur:           number;
  maxBlur:           number;
  avgYaw:            number;
  avgPitch:          number;
  avgRoll:           number;     // ← NUEVO
  avgAntiSpoof:      number;
  avgMicroMotion:    number;     // ← NUEVO
  avgQualityScore:   number;     // ← NUEVO
  blinkCount:        number;
  headMoveCount:     number;
  livenessResets:    number;
  avgFps:            number;
  timeToCapture_ms:  number | null;
}

// ─── Sesión completa ──────────────────────────────────────────────────────────

export interface BiometricSession {
  id:            string;
  startedAt:     number;
  completedAt?:  number;
  outcome:       'captured' | 'abandoned' | 'timeout';
  deviceInfo: {
    userAgent:    string;
    screenW:      number;
    screenH:      number;
    platform:     string;
    language:     string;
    deviceMemory: number | null;   // ← NUEVO: GB RAM
    hardwareConcurrency: number;   // ← NUEVO: # CPUs
    deviceClass:  'high' | 'mid' | 'low'; // ← NUEVO
  };
  thresholdsUsed:  Record<string, number | string | boolean>;
  captureFrame?:   BiometricFrame;
  aggregates:      BiometricSessionAggregates;
  frameSamples:    BiometricFrame[];
}

// ─── Payload de envío al backend ──────────────────────────────────────────────

export interface BiometricSubmitPayload {
  /** Imagen capturada en base64 JPEG */
  imageBase64:     string;
  /** ID de sesión biométrica (UUID v4 criptográfico) */
  sessionId:       string;
  /** ID de proceso de onboarding del usuario (del backend) */
  onboardingId:    string;
  /** Métricas de calidad del frame de captura */
  qualityMetrics: {
    earScore:        number;
    blurScore:       number;
    antiSpoofScore:  number;
    microMotionScore:number;
    qualityScore:    number;
    headYaw:         number;
    headPitch:       number;
    headRoll:        number;
    interOcularPx:   number;
    livenessProgress:number;
    fps:             number;
  };
  /** Thresholds usados para que el backend valide el proceso */
  thresholdsUsed: Record<string, number>;
  /** Clase de dispositivo detectada */
  deviceClass: 'high' | 'mid' | 'low';
}

// ─── Respuesta del backend ────────────────────────────────────────────────────

export interface BiometricVerifyResponse {
  success:       boolean;
  message:       string;
  verificationId:string;         // ID persistido en el backend
  nextStep:      string;         // URL o nombre del siguiente paso del onboarding
  qualityReport?: {
    accepted:    boolean;
    reason?:     string;
    scoreServer: number;         // Score recompletado por el motor del servidor
  };
}

// ─── Debug ────────────────────────────────────────────────────────────────────

export interface DebugLog {
  ts:    number;
  level: 'info' | 'warn' | 'error' | 'ok';
  msg:   string;
}
