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
 * VisionService v4.1 — Motor biométrico híbrido (SIFv3)
 * Mejoras v4.1:
 *  - Validaciones convertidas a computed() reactivos a ThresholdService
 *  - Envío de CONFIGURE al Worker cuando el usuario ajusta un umbral
 *  - Compatibilidad con el panel de calibración en tiempo real
 */

import { Injectable, signal, computed, OnDestroy, effect, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BiometricSessionService } from './biometric-session.service';
import { ThresholdService } from './threshold.service';
import {
  FilesetResolver,
  FaceLandmarker,
  FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import {
  INIT_TIMEOUT_MS,
  BIOMETRIC_THRESHOLDS,
} from '../config/biometric.config';
import type { DebugLog, InitStep, BiometricFrame } from '../models/biometric.models';

@Injectable({ providedIn: 'root' })
export class VisionService implements OnDestroy {

  private worker: Worker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private isEngineInitializing = false;
  private workerBusy = false;       // Throttle: evita acumular bitmaps

  // ── Liveness state ────────────────────────────────────────────────────────
  private blinkEvents      = 0;
  private movementDetected = false;
  private lastYaw:   number | null = null;
  private lastPitch: number | null = null;

  private session = inject(BiometricSessionService);
  private ts      = inject(ThresholdService);        // ThresholdService

  constructor() {
    this.initSystem();
    // Enviar CONFIGURE al Worker cada vez que cambien los umbrales
    effect(() => {
      const t = this.ts.values();
      this.worker?.postMessage({ type: 'CONFIGURE', thresholds: t });
    });
  }

  // ── Inicialización ────────────────────────────────────────────────────────
  workerReady    = signal(false);
  initStep       = signal<InitStep>('IDLE');
  initDurationMs = signal(0);
  workerError    = signal<string | null>(null);
  workerFps      = signal(0);

  // ── Validaciones biométricas ──────────────────────────────────────────────
  faceDetected     = signal(false);
  singleFace       = signal(false);
  isFramed         = signal(false);
  isLit            = signal(false);
  hasGlasses       = signal(false);
  livenessProgress = signal(0);

  // ── Computed: se recalculan al instante cuando cambia un slider ───────────
  notBlurry     = computed(() => this.rawBlur()        >= this.ts.get('BLUR'));
  antiSpoofOk   = computed(() => this.rawAntiSpoof()   >= this.ts.get('ANTI_SPOOF'));
  rollOk        = computed(() => Math.abs(this.rawRoll()) <= this.ts.get('MAX_ROLL'));
  interOcularOk = computed(() => this.rawInterOcular() >= this.ts.get('MIN_INTER_OCULAR'));

  // ── Métricas brutas ───────────────────────────────────────────────────────
  rawEar          = signal(0);
  rawBlur         = signal(0);
  rawYaw          = signal(0);
  rawPitch        = signal(0);
  rawRoll         = signal(0);           // ← v4.0
  rawAntiSpoof    = signal(0);
  rawMicroMotion  = signal(0);           // ← v4.0
  rawQualityScore = signal(0);           // ← v4.0
  rawFaceCount    = signal(0);
  rawBrightness   = signal(false);
  rawFaceW        = signal(0);
  rawFaceH        = signal(0);
  rawInterOcular  = signal(0);           // ← v4.0
  rawStaticFrames = signal(0);           // ← v4.1: para calibración de inercia de foto

  // ── Debug ─────────────────────────────────────────────────────────────────
  debugLogs = signal<DebugLog[]>([]);

  // ── Derivados ─────────────────────────────────────────────────────────────
  livenessOk = computed(() =>
    this.livenessProgress() >= 100 && this.faceDetected()
  );

  canCapture = computed(() =>
    this.workerReady()    &&
    this.faceDetected()   &&
    this.singleFace()     &&
    this.isFramed()       &&
    this.isLit()          &&
    this.notBlurry()      &&
    this.antiSpoofOk()    &&
    !this.hasGlasses()    &&
    this.rollOk()         &&    // ← v4.0: roll dentro de tolerancia ISO
    this.interOcularOk()  &&    // ← v4.0: resolución inter-ocular mínima
    this.livenessOk()
  );

  // Guías de pose: yaw, pitch, roll (ahora reactivos a la calibración)
  needsLeft   = computed(() => this.faceDetected() && this.rawYaw()   >  this.ts.get('MAX_YAW'));
  needsRight  = computed(() => this.faceDetected() && this.rawYaw()   < -this.ts.get('MAX_YAW'));
  needsUp     = computed(() => this.faceDetected() && this.rawPitch() < -this.ts.get('MAX_PITCH'));
  needsDown   = computed(() => this.faceDetected() && this.rawPitch() >  this.ts.get('MAX_PITCH'));
  needsTiltCorrect = computed(() =>
    this.faceDetected() && Math.abs(this.rawRoll()) > this.ts.get('MAX_ROLL')
  );

  // ── Estado interno ────────────────────────────────────────────────────────
  private frameTs: number[]   = [];
  private noFaceFrames        = 0;
  private initTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  // ─────────────────────────────────────────────────────────────────────────
  //  INICIALIZACIÓN
  // ─────────────────────────────────────────────────────────────────────────
  private async initSystem() {
    if (this.isEngineInitializing) return;
    this.isEngineInitializing = true;

    const t0 = performance.now();
    this.initStep.set('LOADING_WASM');
    this.log('info', 'Iniciando sistema biométrico v4.0…');

    // Timeout de seguridad: si el motor no carga en 30s → mostrar error
    this.initTimeoutHandle = setTimeout(() => {
      if (this.initStep() !== 'READY') {
        this.initStep.set('TIMEOUT');
        this.workerError.set('Tiempo de carga agotado. Verifica tu conexión e intenta de nuevo.');
        this.log('error', '⏱ Timeout de inicialización WASM');
        this.isEngineInitializing = false;
      }
    }, INIT_TIMEOUT_MS);

    try {
      // 1. Inicializar Worker de análisis (hilo secundario)
      if (typeof Worker !== 'undefined') {
        this.worker = new Worker(
          new URL('../workers/vision.worker', import.meta.url),
          { type: 'module' }
        );
        this.worker.onmessage = ({ data }) => this.handleWorkerMessage(data);
        this.worker.onerror   = (err) => {
          this.log('error', `Worker error: ${err.message}`);
          this.workerBusy = false; // Liberar throttle si el worker falló
        };
      }

      // 2. Cargar motor MediaPipe WASM (hilo principal, GPU delegate)
      const vision = await FilesetResolver.forVisionTasks('/wasm');
      this.initStep.set('LOADING_MODELS');
      this.log('info', 'Motor WASM cargado. Cargando modelo facial…');

      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/face_landmarker.task',
          delegate: 'GPU',
        },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 2,
      });

      // Cancelar timeout de seguridad
      if (this.initTimeoutHandle) {
        clearTimeout(this.initTimeoutHandle);
        this.initTimeoutHandle = null;
      }

      const duration = Math.round(performance.now() - t0);
      this.initDurationMs.set(duration);
      this.workerReady.set(true);
      this.initStep.set('READY');
      this.log('ok', `✅ Sistema biométrico v4.0 listo (${duration}ms)`);

      if (environment.biometricDebugMode) {
        this.session.startSession({
          ...BIOMETRIC_THRESHOLDS,
          engine: 'MediaPipe-Hybrid-v4.0',
        });
      }

    } catch (err: any) {
      if (this.initTimeoutHandle) {
        clearTimeout(this.initTimeoutHandle);
        this.initTimeoutHandle = null;
      }
      const msg = err?.message ?? String(err);
      this.log('error', `Error de inicialización: ${msg}`);
      this.initStep.set('FAILED');
      this.workerError.set(msg);
    } finally {
      this.isEngineInitializing = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PROCESAMIENTO DE FRAMES
  // ─────────────────────────────────────────────────────────────────────────
  async processFrame(videoEl: HTMLVideoElement) {
    if (!this.workerReady() || !this.faceLandmarker || !this.worker) return;
    if (this.workerBusy) return; // Throttling: descartar frame si el Worker aún analiza

    let bitmap: ImageBitmap | null = null;

    try {
      const timestamp = performance.now();
      const results: FaceLandmarkerResult = this.faceLandmarker.detectForVideo(videoEl, timestamp);

      if (results.faceLandmarks.length > 0) {
        // Crear bitmap y enviar al Worker con el ancho real del frame
        bitmap = await createImageBitmap(videoEl);
        this.workerBusy = true;
        this.worker.postMessage(
          {
            type:         'ANALYZE',
            results,
            image:        bitmap,
            imageWidthPx: videoEl.videoWidth || 640,
          },
          [bitmap] // Transferir propiedad del bitmap (zero-copy)
        );
        bitmap = null; // El worker es ahora el dueño
      } else {
        this.processResult({ faceCount: 0 } as any);
      }

    } catch (e: any) {
      // v4.0: error explícito — ya no silenciado
      this.log('warn', `Frame drop: ${e?.message ?? 'error de bitmap'}`);
      this.workerBusy = false;
      if (bitmap) {
        try { bitmap.close(); } catch { /* ignorar */ }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  MENSAJES DEL WORKER
  // ─────────────────────────────────────────────────────────────────────────
  private handleWorkerMessage(msg: any) {
    this.workerBusy = false; // Liberar throttle
    if (msg.type === 'RESULT') {
      this.processResult(msg.data);
    } else if (msg.type === 'ERROR') {
      this.log('error', `Error en motor de análisis: ${msg.error}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PROCESAR RESULTADO
  // ─────────────────────────────────────────────────────────────────────────
  private processResult(data: any) {
    this.trackFps();
    this.rawFaceCount.set(data.faceCount);

    if (data.faceCount === 0) {
      this.applyEmpty();
      return;
    }

    this.noFaceFrames = 0;
    this.faceDetected.set(true);
    this.singleFace.set(data.faceCount === 1);
    this.isFramed.set(data.framed);
    this.isLit.set(data.brightnessOk);
    this.hasGlasses.set(data.glassesDetected);
    // [v4.1] notBlurry, antiSpoofOk, rollOk, interOcularOk son computed()
    // Ya no requieren .set() manual; se recalculan vía raw values.

    // Suavizado EMA de pose (alpha=0.4) — evita parpadeo en flechas
    const alpha        = 0.4;
    const smoothYaw   = this.rawYaw()   * (1 - alpha) + data.headYaw   * alpha;
    const smoothPitch = this.rawPitch() * (1 - alpha) + data.headPitch * alpha;
    const smoothRoll  = this.rawRoll()  * (1 - alpha) + (data.headRoll ?? 0) * alpha; // ← v4.0

    this.rawEar.set(data.earScore);
    this.rawBlur.set(data.blurScore);
    this.rawYaw.set(smoothYaw);
    this.rawPitch.set(smoothPitch);
    this.rawRoll.set(smoothRoll);                        // ← v4.0
    this.rawAntiSpoof.set(data.antiSpoofScore);
    this.rawMicroMotion.set(data.microMotionScore ?? 0); // ← v4.0
    this.rawQualityScore.set(data.qualityScore ?? 0);   // ← v4.0
    this.rawBrightness.set(data.brightnessOk);
    this.rawFaceW.set(data.faceW);
    this.rawFaceH.set(data.faceH);
    this.rawInterOcular.set(data.interOcularPx ?? 0);  // ← v4.0
    this.rawStaticFrames.set(data.staticFrames ?? 0);   // ← v4.1

    // ── Liveness híbrido v4.0 ────────────────────────────────────────────
    // Paso 1: Detección de parpadeo (hasta 50%)
    // Paso 1: Detección de parpadeo (hasta 50% de la barra)
    if (data.isBlinking && this.blinkEvents < this.ts.get('BLINKS_REQUIRED')) {
      this.blinkEvents++;
      this.updateLiveness();
      const blinksReq = this.ts.get('BLINKS_REQUIRED');
      this.log('info', `👁 Parpadeo detectado (${this.blinkEvents}/${blinksReq})`);
    }

    // Paso 2: Detección de movimiento cefálico (hasta 50%)
    if (!this.movementDetected && this.lastYaw !== null) {
      const deltaYaw   = Math.abs(data.headYaw   - this.lastYaw);
      const deltaPitch = Math.abs(data.headPitch - this.lastPitch!);
      if (deltaYaw > this.ts.get('HEAD_MOVE_YAW') || deltaPitch > this.ts.get('HEAD_MOVE_PITCH')) {
        this.movementDetected = true;
        this.updateLiveness();
        this.log('info', `🔄 Movimiento cefálico detectado`);
      }
    }
    this.lastYaw   = data.headYaw;
    this.lastPitch = data.headPitch;

    // ── Registro de sesión debug ─────────────────────────────────────────
    if (environment.biometricDebugMode) {
      this.session.recordFrame({
        ts:              Date.now(),
        ear:             this.rawEar(),
        blur:            this.rawBlur(),
        yaw:             smoothYaw,
        pitch:           smoothPitch,
        roll:            smoothRoll,            // ← v4.0
        faceCount:       data.faceCount,
        antiSpoof:       data.antiSpoofScore,
        microMotion:     data.microMotionScore ?? 0, // ← v4.0
        qualityScore:    data.qualityScore ?? 0,     // ← v4.0
        livenessProgress:this.livenessProgress(),
        faceDetected:    true,
        singleFace:      data.faceCount === 1,
        isFramed:        data.framed,
        isLit:           data.brightnessOk,
        notBlurry:       this.notBlurry(),
        antiSpoofOk:     this.antiSpoofOk(),
        rollOk:          this.rollOk(),
        interOcularPx:   data.interOcularPx ?? 0,   // ← v4.0
        fps:             this.workerFps(),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  private updateLiveness() {
    const fromBlinks   = this.blinkEvents * (50 / this.ts.get('BLINKS_REQUIRED'));
    const fromMovement = this.movementDetected ? 50 : 0;
    this.livenessProgress.set(Math.min(100, fromBlinks + fromMovement));
  }

  private applyEmpty() {
    this.noFaceFrames++;
    this.faceDetected.set(false);
    this.singleFace.set(false);
    this.isFramed.set(false);
    this.isLit.set(false);
    this.hasGlasses.set(false);
    // notBlurry, antiSpoofOk, rollOk son computed() y se vacían vía raw stats en processResult

    if (this.noFaceFrames >= this.ts.get('NO_FACE_RESET') && this.livenessProgress() > 0) {
      this.resetLiveness();
    }
  }

  private trackFps() {
    const now = performance.now();
    this.frameTs.push(now);
    this.frameTs = this.frameTs.filter(t => now - t < 1000);
    this.workerFps.set(this.frameTs.length);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  API PÚBLICA
  // ─────────────────────────────────────────────────────────────────────────
  log(level: DebugLog['level'], msg: string) {
    this.debugLogs.update(l => [...l.slice(-49), { ts: Date.now(), level, msg }]);
    const fn = level === 'error' ? console.error
             : level === 'warn'  ? console.warn
             : console.log;
    fn(`[VisionService v4.0] ${msg}`);
  }

  resetLiveness() {
    this.livenessProgress.set(0);
    this.blinkEvents      = 0;
    this.movementDetected = false;
    this.noFaceFrames     = 0;
    this.lastYaw          = null;
    this.lastPitch        = null;
    this.log('info', '🔁 Liveness reiniciado');
  }

  closeSession(captureFrame?: BiometricFrame) {
    if (!environment.biometricDebugMode) return null;
    return this.session.closeSession('captured', captureFrame);
  }

  destroy() { this.ngOnDestroy(); }

  ngOnDestroy() {
    if (this.initTimeoutHandle) clearTimeout(this.initTimeoutHandle);
    if (this.worker)            this.worker.terminate();
    if (this.faceLandmarker)    this.faceLandmarker.close();
    if (environment.biometricDebugMode) this.session.closeSession('abandoned');
  }
}
