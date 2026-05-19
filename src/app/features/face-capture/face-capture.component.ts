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
 * FaceCaptureComponent v4.0 — Captura biométrica SIFv3
 * ──────────────────────────────────────────────────────────────
 * Mejoras v4.0:
 *  - Botón "Confirmar" con handler HTTP completo (CRIT-01)
 *  - Guarda de memory leaks en autoEnhanceTimer (HIGH-05)
 *  - WCAG 2.1 AA: aria-live, roles, reduced-motion (HIGH-03)
 *  - Adaptive frame skip según FPS del dispositivo (ADV-05)
 *  - Métricas extendidas: roll, microMotion, qualityScore
 *  - Nuevo computed: needsTiltCorrect para guía de roll
 */
import {
  Component, ElementRef, OnInit, OnDestroy,
  ViewChild, signal, computed, ChangeDetectionStrategy, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DebugPanelComponent } from './components/debug-panel.component';
import { SessionReportComponent } from './components/session-report.component';
import { ThresholdCalibrationComponent } from './components/threshold-calibration.component';
import { CameraService } from '../../core/services/camera.service';
import { VisionService } from '../../core/services/vision.service';
import { BiometricSessionService, BiometricSession } from '../../core/services/biometric-session.service';
import { BiometricApiService } from '../../core/services/biometric-api.service';
import { ThresholdService } from '../../core/services/threshold.service';
import { environment } from '../../../environments/environment';
import type { BiometricSubmitPayload } from '../../core/models/biometric.models';
import { BIOMETRIC_THRESHOLDS } from '../../core/config/biometric.config';

@Component({
  selector: 'app-face-capture',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DebugPanelComponent, SessionReportComponent, ThresholdCalibrationComponent],
  templateUrl: './face-capture.component.html',
  styleUrls: ['./face-capture.component.css']
})
export class FaceCaptureComponent implements OnInit, OnDestroy {

  @ViewChild('video',  { static: false }) videoRef!:  ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private cameraService  = inject(CameraService);
  public  visionService  = inject(VisionService);
  private sessionService = inject(BiometricSessionService);
  private biometricApi   = inject(BiometricApiService);
  public  ts             = inject(ThresholdService);      // ← v4.1: Calibración dinámica

  // ── Flag de entorno ───────────────────────────────────────────
  readonly debugMode = environment.biometricDebugMode;

  // ── Validaciones (delegadas al VisionService) ─────────────────
  faceDetected     = this.visionService.faceDetected;
  singleFace       = this.visionService.singleFace;
  isFramed         = this.visionService.isFramed;
  isLit            = this.visionService.isLit;
  notBlurry        = this.visionService.notBlurry;
  livenessOk       = this.visionService.livenessOk;
  hasGlasses       = this.visionService.hasGlasses;
  rollOk           = this.visionService.rollOk;            // ← v4.0
  interOcularOk    = this.visionService.interOcularOk;    // ← v4.0
  livenessProgress = this.visionService.livenessProgress;
  antiSpoofOk      = this.visionService.antiSpoofOk;
  canCapture       = this.visionService.canCapture;
  workerReady      = this.visionService.workerReady;
  initStep         = this.visionService.initStep;
  workerError      = this.visionService.workerError;
  cameraError      = this.cameraService.error;

  // ── Métricas debug ────────────────────────────────────────────
  rawEar          = this.visionService.rawEar;
  rawBlur         = this.visionService.rawBlur;
  rawYaw          = this.visionService.rawYaw;
  rawPitch        = this.visionService.rawPitch;
  rawRoll         = this.visionService.rawRoll;             // ← v4.0
  rawAntiSpoof    = this.visionService.rawAntiSpoof;
  rawMicroMotion  = this.visionService.rawMicroMotion;     // ← v4.0
  rawQualityScore = this.visionService.rawQualityScore;    // ← v4.0
  rawFaceCount    = this.visionService.rawFaceCount;
  rawBrightness   = this.visionService.rawBrightness;
  rawFaceW        = this.visionService.rawFaceW;
  rawFaceH        = this.visionService.rawFaceH;
  rawInterOcular  = this.visionService.rawInterOcular;     // ← v4.0
  workerFps       = this.visionService.workerFps;
  debugLogs       = this.visionService.debugLogs;
  initDuration    = this.visionService.initDurationMs;

  /** Signal del resultado de envío — expuesto para el template (patrón Angular correcto) */
  submitResult    = this.biometricApi.submitResult;
  isApiSubmitting = this.biometricApi.isSubmitting;

  // ── Guías de pose (yaw + pitch + roll v4.0) ───────────────────
  needsLeft        = this.visionService.needsLeft;
  needsRight       = this.visionService.needsRight;
  needsUp          = this.visionService.needsUp;
  needsDown        = this.visionService.needsDown;
  needsTiltCorrect = this.visionService.needsTiltCorrect;  // ← v4.0

  showGuide = computed(() =>
    this.workerReady() && (
      !this.isFramed() ||
      this.needsLeft()  || this.needsRight() ||
      this.needsUp()    || this.needsDown()  ||
      this.needsTiltCorrect()                 // ← v4.0
    )
  );

  needsCloser = computed(() =>
    this.faceDetected() && !this.isFramed() &&
    !this.needsLeft() && !this.needsRight() &&
    !this.needsUp()   && !this.needsDown()
  );

  // ── UI state ─────────────────────────────────────────────────
  capturedImage    = signal<string | null>(null);
  isCapturing      = signal(false);
  isConfirming     = signal(false);                        // ← v4.0
  confirmError     = signal<string | null>(null);          // ← v4.0
  debugOpen        = signal(false);
  calibrationOpen  = signal(false);                        // ← v4.1: Panel de calibración
  sessionReport    = signal<BiometricSession | null>(null);
  reportOpen       = signal(true);

  // ── Controles de iluminación ──────────────────────────────────
  lightPanelOpen   = signal(false);
  brightness       = signal(1.0);
  contrast         = signal(1.0);
  autoEnhance      = signal(false);

  videoFilter = computed(() =>
    `brightness(${this.brightness()}) contrast(${this.contrast()})`
  );
  isFilterModified = computed(() =>
    this.brightness() !== 1.0 || this.contrast() !== 1.0
  );

  // ── Hint contextual (WCAG: texto + ícono, no solo color) ─────
  hint = computed(() => {
    if (!this.workerReady())        return '📦 Cargando módulo biométrico…';
    if (this.cameraError())         return '⚠️ ' + this.cameraError();
    if (!this.faceDetected())       return '👤 Coloca tu rostro dentro del óvalo';
    if (!this.singleFace())         return '⚠️ Se detectó más de un rostro';
    if (!this.isFramed())           return '↔️ Centra tu rostro y acércate';
    if (!this.isLit())              return '💡 Mejora la iluminación del entorno';
    if (!this.notBlurry())          return '🔍 Mantén el dispositivo quieto';
    if (this.hasGlasses())          return '🚫 Por favor, quítate los lentes';
    if (!this.rollOk())             return '↩️ Endereza la cabeza (no la inclines)'; // ← v4.0
    if (!this.interOcularOk())      return '🔭 Acércate más a la cámara';           // ← v4.0
    if (!this.antiSpoofOk())        return '🚫 Muéstrate en persona, no en foto';
    if (!this.livenessOk()) {
      return this.livenessProgress() < 50
        ? '👁️ Parpadea lentamente'
        : '🔄 Gira la cabeza levemente';
    }
    return '✅ ¡Listo! Pulsa Capturar';
  });

  hintRole = computed<'status' | 'alert'>(() =>
    this.cameraError() || this.rawFaceCount() > 1 ? 'alert' : 'status'
  );

  ovalColor = computed((): string => {
    if (this.rawFaceCount() > 1)                             return '#EF4444';
    if (this.canCapture())                                   return '#F5A623';
    if (this.faceDetected() && this.isFramed())              return '#1C3B6E';
    return 'rgba(255,255,255,0.35)';
  });

  ovalDash = computed((): string => {
    if (this.canCapture() || (this.faceDetected() && this.isFramed())) return '0';
    return '10 5';
  });

  initPhaseLabel = computed(() => {
    const map: Record<string, string> = {
      'IDLE':           '⏳ Preparando módulo…',
      'LOADING_WASM':   '⚙️ Cargando motor WASM…',
      'LOADING_MODELS': '📦 Cargando modelos locales…',
      'READY':          `✅ Listo (${this.initDuration()} ms)`,
      'TIMEOUT':        '⏱ Timeout — recarga la página',
      'FAILED':         '❌ Error',
    };
    return map[this.initStep()] ?? this.initStep();
  });

  // ── Loop RAF ──────────────────────────────────────────────────
  private animationId: number | null = null;
  private frameCounter = 0;
  private autoEnhanceTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Adaptive frame skip — v4.0 (ADV-05)
   * Ajusta la carga de trabajo según el FPS observado:
   *  - >= 24 fps → analizar 1 de cada 2 frames (normal)
   *  - 15–23 fps → 1 de cada 3 frames
   *  - <  15 fps → 1 de cada 4 frames (dispositivo lento)
   */
  private get adaptiveSkip(): number {
    const fps = this.workerFps();
    if (fps < 15) return 4;
    if (fps < 24) return 3;
    return 2;
  }

  // ──────────────────────────────────────────────────────────────
  async ngOnInit() {
    const stream = await this.cameraService.startCamera('user');
    if (stream) {
      setTimeout(() => {
        const v = this.videoRef?.nativeElement;
        if (v) {
          v.srcObject = stream;
          v.play().then(() => {
            this.startLoop();
            this.startAutoEnhanceWatcher();
          }).catch(err => {
            this.visionService.log('error', `Error al reproducir video: ${err?.message}`);
          });
        }
      }, 0);
    }
  }

  ngOnDestroy() {
    this.stopLoop();
    // v4.0: guardia explícita para el timer (HIGH-05)
    if (this.autoEnhanceTimer !== null) {
      clearInterval(this.autoEnhanceTimer);
      this.autoEnhanceTimer = null;
    }
    this.cameraService.stopCamera();
    this.visionService.destroy();
  }

  private startLoop() {
    const loop = async () => {
      if (this.capturedImage()) {
        this.animationId = null;
        return;
      }
      this.frameCounter++;
      if (this.frameCounter % this.adaptiveSkip === 0 && this.workerReady()) {
        const v = this.videoRef?.nativeElement;
        if (v) await this.visionService.processFrame(v);
      }
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  private stopLoop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private startAutoEnhanceWatcher() {
    if (this.autoEnhanceTimer !== null) return; // Guard doble inicio
    this.autoEnhanceTimer = setInterval(() => {
      if (this.autoEnhance() && !this.isLit() && this.brightness() < 1.8) {
        const next = Math.min(1.8, +(this.brightness() + 0.1).toFixed(1));
        this.brightness.set(next);
        this.applyVideoFilter();
        this.visionService.log('info', `🔆 Auto-brillo → ${next}x`);
      }
    }, 2000);
  }

  // ── Captura ───────────────────────────────────────────────────
  async onCapture() {
    if (!this.canCapture() || this.isCapturing()) return;
    this.isCapturing.set(true);

    try {
      const video  = this.videoRef.nativeElement;
      const canvas = this.canvasRef.nativeElement;
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D no disponible');

      // Aplicar filtro CSS e invertir horizontalmente (mirror)
      ctx.filter = this.videoFilter();
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0);
      ctx.restore();
      ctx.filter = 'none';

      this.capturedImage.set(canvas.toDataURL('image/jpeg', 0.95));

      video.pause();
      this.stopLoop();

      // Capturar métricas del frame y cerrar sesión debug
      if (this.debugMode) {
        const captureFrame = {
          ts:              Date.now(),
          ear:             this.rawEar(),
          blur:            this.rawBlur(),
          yaw:             this.rawYaw(),
          pitch:           this.rawPitch(),
          roll:            this.rawRoll(),            // ← v4.0
          faceCount:       this.rawFaceCount(),
          antiSpoof:       this.rawAntiSpoof(),
          microMotion:     this.rawMicroMotion(),     // ← v4.0
          qualityScore:    this.rawQualityScore(),    // ← v4.0
          livenessProgress:this.livenessProgress(),
          faceDetected:    this.faceDetected(),
          singleFace:      this.singleFace(),
          isFramed:        this.isFramed(),
          isLit:           this.isLit(),
          notBlurry:       this.notBlurry(),
          antiSpoofOk:     this.antiSpoofOk(),
          rollOk:          this.rollOk(),             // ← v4.0
          interOcularPx:   this.rawInterOcular(),    // ← v4.0
          fps:             this.workerFps(),
        };
        const report = this.visionService.closeSession(captureFrame);
        if (report) this.sessionReport.set(report);
      }

      this.visionService.log('ok', `📸 Captura exitosa`);
    } catch (err: any) {
      this.visionService.log('error', `Captura fallida: ${err.message}`);
    } finally {
      this.isCapturing.set(false);
    }
  }

  /** v4.0: Envío HTTP al backend con indicador de estado */
  async onConfirm() {
    const image = this.capturedImage();
    if (!image || this.isConfirming()) return;

    this.isConfirming.set(true);
    this.confirmError.set(null);

    try {
      const payload: BiometricSubmitPayload = {
        imageBase64:  image,
        sessionId:    crypto.randomUUID(),
        onboardingId: this.getOnboardingId(),
        qualityMetrics: {
          earScore:        this.rawEar(),
          blurScore:       this.rawBlur(),
          antiSpoofScore:  this.rawAntiSpoof(),
          microMotionScore:this.rawMicroMotion(),
          qualityScore:    this.rawQualityScore(),
          headYaw:         this.rawYaw(),
          headPitch:       this.rawPitch(),
          headRoll:        this.rawRoll(),
          interOcularPx:   this.rawInterOcular(),
          livenessProgress:this.livenessProgress(),
          fps:             this.workerFps(),
        },
        thresholdsUsed: BIOMETRIC_THRESHOLDS as Record<string, number>,
        deviceClass:   this.classifyDevice(),
      };

      const result = await this.biometricApi.submitCapture(payload);

      // Telemetría: evento de captura exitosa
      this.biometricApi.reportTelemetry({
        sessionId:  payload.sessionId,
        eventType:  'captured',
        durationMs: Date.now() - (this.sessionReport()?.startedAt ?? Date.now()),
        deviceClass: payload.deviceClass,
        outcome:    'success',
      });

      this.visionService.log('ok', `✅ Verificación enviada: ${result.verificationId}`);
      // TODO: navegar al siguiente paso según result.nextStep
      // this.router.navigate([result.nextStep]);

    } catch (err: any) {
      const msg = err?.message ?? 'Error al enviar la verificación';
      this.confirmError.set(msg);
      this.visionService.log('error', `Envío fallido: ${msg}`);

      this.biometricApi.reportTelemetry({
        sessionId:   crypto.randomUUID(),
        eventType:   'error',
        durationMs:  0,
        deviceClass: this.classifyDevice(),
        outcome:     'failure',
        failReason:  msg,
      });
    } finally {
      this.isConfirming.set(false);
    }
  }

  onRetake() {
    this.capturedImage.set(null);
    this.sessionReport.set(null);
    this.confirmError.set(null);    // ← v4.0
    this.visionService.resetLiveness();

    setTimeout(() => {
      const v = this.videoRef?.nativeElement;
      if (v) {
        v.play().catch(() => {});
        if (!this.animationId) this.startLoop();
      }
    }, 50);
  }

  exportSession() { this.sessionService.exportJSON(); }

  // ── Iluminación ───────────────────────────────────────────────
  toggleAutoEnhance() {
    this.autoEnhance.update(v => !v);
    this.visionService.log('info', `Auto-brillo: ${this.autoEnhance() ? 'ON' : 'OFF'}`);
  }
  onBrightnessChange(val: string) {
    this.brightness.set(+parseFloat(val).toFixed(1));
    this.applyVideoFilter();
  }
  onContrastChange(val: string) {
    this.contrast.set(+parseFloat(val).toFixed(1));
    this.applyVideoFilter();
  }
  resetFilter() {
    this.brightness.set(1.0);
    this.contrast.set(1.0);
    this.autoEnhance.set(false);
    this.applyVideoFilter();
    this.visionService.log('info', 'Filtros reiniciados');
  }
  private applyVideoFilter() {
    const v = this.videoRef?.nativeElement;
    if (v) v.style.filter = this.videoFilter();
  }

  // ── Debug ─────────────────────────────────────────────────────
  toggleDebug() {
    this.debugOpen.update(v => !v);
    if (this.debugOpen()) this.calibrationOpen.set(false);
  }

  toggleCalibration() {
    this.calibrationOpen.update(v => !v);
    if (this.calibrationOpen()) {
      this.debugOpen.set(false);
      this.lightPanelOpen.set(false);
    }
  }

  toggleLightPanel() {
    this.lightPanelOpen.update(v => !v);
    if (this.lightPanelOpen()) this.calibrationOpen.set(false);
  }

  toggleReport() {
    this.reportOpen.update(v => !v);
  }

  closeCalibration() { this.calibrationOpen.set(false); }

  resetLiveness() { this.visionService.resetLiveness(); }

  // ── Helpers privados ──────────────────────────────────────────
  /** Obtiene el ID de onboarding del contexto del shell o URL */
  private getOnboardingId(): string {
    // El shell de onboarding debe inyectar este valor vía query param o state.
    // Fallback temporal para pruebas standalone.
    const params = new URLSearchParams(window.location.search);
    return params.get('onboardingId') ?? 'STANDALONE_TEST';
  }

  private classifyDevice(): 'high' | 'mid' | 'low' {
    const mem   = (navigator as any).deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (mem >= 8 && cores >= 8) return 'high';
    if (mem >= 4 && cores >= 4) return 'mid';
    return 'low';
  }
}
