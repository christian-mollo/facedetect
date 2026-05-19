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
 * BiometricSessionService v4.0 — Almacenamiento de sesiones biométricas
 * ───────────────────────────────────────────────────────────────────────
 * Activo solo cuando environment.biometricDebugMode = true.
 * Mejoras v4.0:
 *  - UUID criptográfico con crypto.randomUUID() (DT-03)
 *  - Datos migrados a sessionStorage (purga al cerrar pestaña) (CRIT-05)
 *  - Modelos importados desde biometric.models.ts (DT-05)
 *  - Métricas extendidas: roll, microMotion, qualityScore, interOcularPx
 *  - Detección mejorada de clase de dispositivo
 */
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  BIOMETRIC_THRESHOLDS,
  MAX_DEBUG_SESSIONS,
  DEBUG_SAMPLE_EVERY,
} from '../config/biometric.config';
import type {
  BiometricFrame,
  BiometricSession,
  BiometricSessionAggregates,
} from '../models/biometric.models';

// Re-exportar desde models para compatibilidad con imports existentes
export type { BiometricFrame, BiometricSession, BiometricSessionAggregates };

// ─── Constante de clave de storage ───────────────────────────────────────────
const SESSION_KEY = 'obf_biometric_sessions_v4';

// ─────────────────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class BiometricSessionService {

  private session: BiometricSession | null = null;
  private frameBuffer: BiometricFrame[]    = [];
  private frameCounter                     = 0;
  private blinkCount                       = 0;
  private headMoveCount                    = 0;
  private livenessResets                   = 0;
  private lastLivenessProgress             = 0;

  get isEnabled(): boolean { return environment.biometricDebugMode; }

  // ═══════════════════════════════════════════════════════════════
  //  INICIAR SESIÓN
  // ═══════════════════════════════════════════════════════════════
  startSession(thresholds: Partial<BiometricSession['thresholdsUsed']>): string {
    if (!this.isEnabled) return '';

    // v4.0: crypto.randomUUID() — criptográficamente seguro
    const id = crypto.randomUUID();

    this.session = {
      id,
      startedAt:  Date.now(),
      outcome:    'abandoned',
      deviceInfo: {
        userAgent:           navigator.userAgent,
        screenW:             screen.width,
        screenH:             screen.height,
        platform:            (navigator as any).userAgentData?.platform ?? navigator.platform ?? 'unknown',
        language:            navigator.language,
        deviceMemory:        (navigator as any).deviceMemory ?? null,       // ← v4.0
        hardwareConcurrency: navigator.hardwareConcurrency ?? 0,             // ← v4.0
        deviceClass:         this.classifyDevice(),                          // ← v4.0
      },
      thresholdsUsed: {
        ...BIOMETRIC_THRESHOLDS,
        ...thresholds,
      },
      aggregates:   this.emptyAggregates(),
      frameSamples: [],
    };

    this.frameBuffer          = [];
    this.frameCounter         = 0;
    this.blinkCount           = 0;
    this.headMoveCount        = 0;
    this.livenessResets       = 0;
    this.lastLivenessProgress = 0;
    return id;
  }

  // ═══════════════════════════════════════════════════════════════
  //  REGISTRAR FRAME
  // ═══════════════════════════════════════════════════════════════
  recordFrame(f: BiometricFrame): void {
    if (!this.isEnabled || !this.session) return;

    this.frameBuffer.push(f);
    this.frameCounter++;

    // Detectar parpadeos (transición EAR bajo umbral)
    if (f.ear > 0 && f.ear < 0.21 && this.frameCounter > 1) {
      const prev = this.frameBuffer[this.frameBuffer.length - 2];
      if (prev && prev.ear >= 0.21) this.blinkCount++;
    }

    // Detectar movimientos cefálicos significativos
    if (this.frameBuffer.length > 1) {
      const prev = this.frameBuffer[this.frameBuffer.length - 2];
      if (prev && Math.abs(f.yaw - prev.yaw) > 5 && Math.abs(f.yaw - prev.yaw) < 30) {
        this.headMoveCount++;
      }
    }

    // Detectar resets de liveness
    if (f.livenessProgress < this.lastLivenessProgress && this.lastLivenessProgress > 0) {
      this.livenessResets++;
    }
    this.lastLivenessProgress = f.livenessProgress;

    // Muestra cada N frames
    if (this.frameCounter % DEBUG_SAMPLE_EVERY === 0) {
      this.session.frameSamples.push({ ...f });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  CERRAR SESIÓN
  // ═══════════════════════════════════════════════════════════════
  closeSession(
    outcome: BiometricSession['outcome'],
    captureFrame?: BiometricFrame
  ): BiometricSession | null {
    if (!this.isEnabled || !this.session) return null;

    this.session.completedAt  = Date.now();
    this.session.outcome      = outcome;
    this.session.captureFrame = captureFrame;
    this.session.aggregates   = this.computeAggregates(captureFrame);

    this.persist(this.session);

    const closed      = { ...this.session };
    this.session      = null;
    this.frameBuffer  = [];
    return closed;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ACCESORES
  // ═══════════════════════════════════════════════════════════════
  getLastSession(): BiometricSession | null {
    if (!this.isEnabled) return null;
    const all = this.loadAll();
    return all.length > 0 ? all[all.length - 1] : null;
  }

  getAllSessions(): BiometricSession[] {
    return this.isEnabled ? this.loadAll() : [];
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXPORTAR Y LIMPIAR
  // ═══════════════════════════════════════════════════════════════
  exportJSON(): void {
    if (!this.isEnabled) return;
    const data = JSON.stringify(this.loadAll(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `biometric_sessions_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  clearAll(): void {
    if (!this.isEnabled) return;
    sessionStorage.removeItem(SESSION_KEY); // v4.0: sessionStorage
  }

  // ═══════════════════════════════════════════════════════════════
  //  INTERNOS
  // ═══════════════════════════════════════════════════════════════

  /** Clasifica el dispositivo según RAM y CPUs detectados */
  private classifyDevice(): 'high' | 'mid' | 'low' {
    const mem   = (navigator as any).deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (mem >= 8 && cores >= 8) return 'high';
    if (mem >= 4 && cores >= 4) return 'mid';
    return 'low';
  }

  private computeAggregates(captureFrame?: BiometricFrame): BiometricSessionAggregates {
    const frames = this.frameBuffer;
    if (frames.length === 0) return this.emptyAggregates();

    const withFace   = frames.filter(f => f.faceDetected);
    const framed     = frames.filter(f => f.isFramed);
    const validEar   = withFace.filter(f => f.ear   > 0).map(f => f.ear);
    const validBlur  = withFace.filter(f => f.blur  > 0).map(f => f.blur);
    const validYaw   = withFace.map(f => f.yaw);
    const validPitch = withFace.map(f => f.pitch);
    const validRoll  = withFace.map(f => f.roll ?? 0);                     // ← v4.0
    const validSpoof = withFace.map(f => f.antiSpoof);
    const validMotion = withFace.map(f => f.microMotion ?? 0);              // ← v4.0
    const validQuality = withFace.map(f => f.qualityScore ?? 0);            // ← v4.0
    const fpsList    = frames.filter(f => f.fps > 0).map(f => f.fps);

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const min = (arr: number[]) => arr.length ? Math.min(...arr) : 0;
    const max = (arr: number[]) => arr.length ? Math.max(...arr) : 0;

    const start = this.session?.startedAt ?? Date.now();
    const end   = captureFrame ? captureFrame.ts : 0;

    return {
      totalFrames:      frames.length,
      framesWithFace:   withFace.length,
      framesFramed:     framed.length,
      avgEar:           +avg(validEar).toFixed(3),
      minEar:           +min(validEar).toFixed(3),
      maxEar:           +max(validEar).toFixed(3),
      avgBlur:          +avg(validBlur).toFixed(1),
      minBlur:          +min(validBlur).toFixed(1),
      maxBlur:          +max(validBlur).toFixed(1),
      avgYaw:           +avg(validYaw).toFixed(1),
      avgPitch:         +avg(validPitch).toFixed(1),
      avgRoll:          +avg(validRoll).toFixed(1),                           // ← v4.0
      avgAntiSpoof:     +avg(validSpoof).toFixed(3),
      avgMicroMotion:   +avg(validMotion).toFixed(3),                         // ← v4.0
      avgQualityScore:  +avg(validQuality).toFixed(1),                        // ← v4.0
      blinkCount:       this.blinkCount,
      headMoveCount:    this.headMoveCount,
      livenessResets:   this.livenessResets,
      avgFps:           +avg(fpsList).toFixed(1),
      timeToCapture_ms: end > 0 ? end - start : null,
    };
  }

  private emptyAggregates(): BiometricSessionAggregates {
    return {
      totalFrames: 0, framesWithFace: 0, framesFramed: 0,
      avgEar: 0, minEar: 0, maxEar: 0,
      avgBlur: 0, minBlur: 0, maxBlur: 0,
      avgYaw: 0, avgPitch: 0, avgRoll: 0,
      avgAntiSpoof: 0, avgMicroMotion: 0, avgQualityScore: 0,
      blinkCount: 0, headMoveCount: 0, livenessResets: 0,
      avgFps: 0, timeToCapture_ms: null,
    };
  }

  /** v4.0: Persiste en sessionStorage en lugar de localStorage */
  private persist(session: BiometricSession): void {
    const all = this.loadAll();
    all.push(session);
    const trimmed = all.slice(-MAX_DEBUG_SESSIONS);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(trimmed));
    } catch (e) {
      // Si sessionStorage está lleno, mantener solo las últimas 50
      console.warn('[BiometricSession] sessionStorage lleno, trimming…');
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(trimmed.slice(-50)));
      } catch {
        console.error('[BiometricSession] No se pudo persistir la sesión.');
      }
    }
  }

  private loadAll(): BiometricSession[] {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
}
