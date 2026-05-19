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
 * biometric.config.ts — Fuente única de verdad para umbrales y constantes biométricas
 * ─────────────────────────────────────────────────────────────────────────────────────
 * ⚠️  REGLA: No duplicar estos valores en ningún otro archivo.
 *     Toda lógica de umbral debe importar desde aquí.
 *
 * Estándares de referencia:
 *  - ISO/IEC 29794-5 (Face Image Quality)
 *  - NIST FRVT (Face Recognition Vendor Testing)
 *  - ASFI Bolivia — Reglamento de Identidad Digital 2024
 */

// ─── Umbrales de detección ────────────────────────────────────────────────────

/**
 * Anti-spoofing: combinación de profundidad Z (55%) + micro-motion (30%) + nitidez (15%).
 * >= 0.70 requerido para aprobar.
 * Nota: si micro-motion acumulado es consistentemente 0 (foto/pantalla),
 * el score se penaliza adicionalmente vía MICRO_MOTION_PENALTY_THRESHOLD.
 */
export const ANTI_SPOOF_THRESHOLD = 0.70;

/**
 * Varianza laplaciana mínima para considerar imagen nítida.
 * Rango real en campo: 40–350. Bajo este valor = desenfoque.
 */
export const BLUR_THRESHOLD = 60;

/**
 * Eye Aspect Ratio (EAR) mínimo para ojo abierto.
 * Valores < EAR_OPEN → ojo cerrado/parpadeo.
 */
export const EAR_OPEN_THRESHOLD = 0.23;

/**
 * Número de parpadeos confirmados requeridos para aprobar liveness.
 */
export const BLINKS_REQUIRED = 2;

/**
 * Deltas de yaw/pitch (grados) para detectar movimiento cefálico válido.
 * Rango natural: 10–30°. Menor = ruido. Mayor = movimiento brusco/artefacto.
 */
export const HEAD_MOVE_YAW_DELTA   = 12;
export const HEAD_MOVE_PITCH_DELTA = 10;

/**
 * Frames consecutivos sin rostro antes de reiniciar el progreso de liveness.
 * A 30fps ≈ 1.5 segundos.
 */
export const NO_FACE_RESET_FRAMES = 45;

/**
 * Rango mínimo de profundidad Z de landmarks para considerar rostro 3D real.
 * Fotos planas: zRange ≈ 0.00–0.04. Rostro real: 0.12–0.25.
 */
export const DEPTH_Z_RANGE_REAL = 0.14;

// ─── Umbrales de pose (ISO/IEC 29794-5 §6.3) ─────────────────────────────────

/** Yaw máximo permitido (° grados). Fuera de rango → flecha de dirección. */
export const MAX_YAW_DEGREES   = 15;

/** Pitch máximo permitido (° grados). Fuera de rango → flecha de dirección. */
export const MAX_PITCH_DEGREES = 12;

/**
 * Roll máximo permitido (° grados).
 * ISO 29794-5 requiere < 8°, pero 8° resulta demasiado estricto en uso real.
 * Se usa 12° como umbral operativo para tolerar ligera inclinación natural.
 * Ajustar a 8° en vértice de producción bancaria estricta.
 */
export const MAX_ROLL_DEGREES  = 12;

// ─── Umbrales de calidad (ISO/IEC 29794-5 §6.4) ──────────────────────────────

/** Fracción mínima del alto del frame que debe ocupar el rostro. */
export const MIN_FACE_HEIGHT_RATIO = 0.25;

/** Fracción máxima del alto del frame (evitar recorte). */
export const MAX_FACE_HEIGHT_RATIO = 0.82;

/** Brillo mínimo/máximo (0–255) para iluminación aceptable. */
export const BRIGHTNESS_MIN = 50;
export const BRIGHTNESS_MAX = 240;

/**
 * Resolución inter-ocular mínima en píxeles reales.
 * ISO/IEC 29794-5 requiere mínimo 90px entre centros oculares.
 */
export const MIN_INTER_OCULAR_PX = 90;

// ─── Configuración de sesión y anti-spoofing avanzado ────────────────────────

/**
 * Milisegundos máximos para completar la verificación biométrica completa.
 * Pasado este tiempo → sesión expirada (timeout).
 */
export const SESSION_TIMEOUT_MS = 120_000; // 2 minutos

/**
 * Milisegundos máximos para inicializar el motor WASM.
 * Si supera este límite → mostrar error TIMEOUT al usuario.
 */
export const INIT_TIMEOUT_MS = 30_000; // 30 segundos

/**
 * Umbral Z para detectar lentes/anteojos.
 * Los montures de gafas crean diferencias de profundidad Z en la zona ocular.
 * Calibrado empíricamente: montures visibles generan diff 0.015–0.030.
 * Valor conservador para evitar falsos negativos con gafas de marco fino.
 */
export const GLASSES_Z_THRESHOLD = 0.016;

/**
 * Delta de intensidad mínimo/máximo en análisis de micro-movimiento frame a frame.
 * Usado para detectar señal vital (respiración, micro-vibraciones) vs. imagen estática.
 */
export const MICRO_MOTION_MIN = 0.0008;
export const MICRO_MOTION_MAX = 0.025;

/**
 * Número de frames consecutivos con micro-motion < MICRO_MOTION_MIN
 * antes de aplicar penalización de foto/pantalla estática al score anti-spoof.
 * A 15fps ≈ 2 segundos de inmovilidad total.
 */
export const MICRO_MOTION_STATIC_FRAMES = 30;

// ─── Configuración de sesión de debug ────────────────────────────────────────

/** Máximo de sesiones almacenadas en storage de debug (FIFO). */
export const MAX_DEBUG_SESSIONS = 100;

/** Guardar 1 frame muestra cada N frames en modo debug. */
export const DEBUG_SAMPLE_EVERY = 3;

// ─── Objeto consolidado (útil para serialización en payload al backend) ───────

export const BIOMETRIC_THRESHOLDS = {
  ANTI_SPOOF:        ANTI_SPOOF_THRESHOLD,
  BLUR:              BLUR_THRESHOLD,
  EAR_OPEN:          EAR_OPEN_THRESHOLD,
  BLINKS_REQUIRED,
  HEAD_MOVE_YAW:     HEAD_MOVE_YAW_DELTA,
  HEAD_MOVE_PITCH:   HEAD_MOVE_PITCH_DELTA,
  NO_FACE_RESET:     NO_FACE_RESET_FRAMES,
  MAX_YAW:           MAX_YAW_DEGREES,
  MAX_PITCH:         MAX_PITCH_DEGREES,
  MAX_ROLL:          MAX_ROLL_DEGREES,
  MIN_FACE_H_RATIO:  MIN_FACE_HEIGHT_RATIO,
  MIN_INTER_OCULAR:  MIN_INTER_OCULAR_PX,
  SESSION_TIMEOUT:   SESSION_TIMEOUT_MS,
  INIT_TIMEOUT:      INIT_TIMEOUT_MS,
} as const;

export type BiometricThresholds = typeof BIOMETRIC_THRESHOLDS;
