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
 * DebugPanelComponent v4.0 — Panel de diagnóstico técnico
 * Agregado: roll, microMotion, qualityScore, interOcular
 * Umbrales sincronizados con biometric.config.ts
 */
import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ANTI_SPOOF_THRESHOLD, BLUR_THRESHOLD, EAR_OPEN_THRESHOLD, MAX_ROLL_DEGREES, MIN_INTER_OCULAR_PX } from '../../../core/config/biometric.config';

export interface DebugLog {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'ok';
  msg: string;
}

@Component({
  selector: 'app-debug-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="debug-panel" role="dialog" aria-label="Panel de diagnóstico técnico" aria-modal="true">
      <div class="debug-header">
        <span>🔬 Diagnóstico — SIFv3 v4.0</span>
        <button class="debug-close" (click)="close.emit()" aria-label="Cerrar panel de diagnóstico">✕</button>
      </div>

      <div class="debug-section">
        <div class="debug-section-title">Módulo</div>
        <div class="debug-row">
          <span class="dk">Estado</span>
          <span class="dv" [class.dv-ok]="initStep() === '✅ Listo'"
                [class.dv-err]="initStep().includes('Error') || initStep().includes('Timeout')">
            {{ initStep() }}
          </span>
        </div>
        <div class="debug-row" *ngIf="initDuration() > 0">
          <span class="dk">Carga WASM</span><span class="dv">{{ initDuration() }} ms</span>
        </div>
        <div class="debug-row">
          <span class="dk">FPS (procesados)</span>
          <span class="dv" [class.dv-ok]="fps() >= 10"
                [class.dv-warn]="fps() > 0 && fps() < 10">{{ fps() }}</span>
        </div>
      </div>

      <div class="debug-section">
        <div class="debug-section-title">Calidad ISO 29794-5</div>
        <div class="debug-row">
          <span class="dk">Score Calidad</span>
          <span class="dv" [class.dv-ok]="qualityScore() >= 70"
                [class.dv-warn]="qualityScore() >= 50 && qualityScore() < 70"
                [class.dv-err]="qualityScore() < 50 && faceCount() > 0">
            {{ qualityScore() }}/100
          </span>
        </div>
        <div class="debug-row">
          <span class="dk">Inter-ocular (px)</span>
          <span class="dv" [class.dv-ok]="interOcular() >= MIN_INTER_OCULAR_PX"
                [class.dv-err]="interOcular() < MIN_INTER_OCULAR_PX && faceCount() > 0">
            {{ interOcular() }}<span class="dv-hint"> (≥{{ MIN_INTER_OCULAR_PX }}px)</span>
          </span>
        </div>
        <div class="debug-row">
          <span class="dk">Roll (inclinación)</span>
          <span class="dv" [class.dv-ok]="absRoll() <= MAX_ROLL_DEGREES"
                [class.dv-warn]="absRoll() > MAX_ROLL_DEGREES">
            {{ roll() }}°<span class="dv-hint"> (max ±{{ MAX_ROLL_DEGREES }}°)</span>
          </span>
        </div>
      </div>

      <div class="debug-section">
        <div class="debug-section-title">Métricas en tiempo real</div>
        <div class="debug-row">
          <span class="dk">Rostros</span>
          <span class="dv" [class.dv-ok]="faceCount() === 1"
                [class.dv-err]="faceCount() !== 1 && faceCount() > 0">{{ faceCount() }}</span>
        </div>
        <div class="debug-row">
          <span class="dk">EAR (Ojos)</span>
          <span class="dv" [class.dv-ok]="ear() > EAR_OPEN_THRESHOLD"
                [class.dv-warn]="ear() <= EAR_OPEN_THRESHOLD && ear() > 0">
            {{ ear() | number:'1.3-3' }}<span class="dv-hint"> (≥{{ EAR_OPEN_THRESHOLD }})</span>
          </span>
        </div>
        <div class="debug-row">
          <span class="dk">Blur (Nitidez)</span>
          <span class="dv" [class.dv-ok]="blur() > BLUR_THRESHOLD"
                [class.dv-err]="blur() <= BLUR_THRESHOLD && blur() > 0">
            {{ blur() | number:'1.1-1' }}<span class="dv-hint"> (≥{{ BLUR_THRESHOLD }})</span>
          </span>
        </div>
        <div class="debug-row">
          <span class="dk">Yaw / Pitch</span>
          <span class="dv">{{ yaw() }}° / {{ pitch() }}°</span>
        </div>
        <div class="debug-row">
          <span class="dk">Anti-spoof</span>
          <span class="dv" [class.dv-ok]="antiSpoof() >= ANTI_SPOOF_THRESHOLD"
                [class.dv-err]="antiSpoof() < ANTI_SPOOF_THRESHOLD && faceCount() > 0">
            {{ antiSpoof() | number:'1.3-3' }}<span class="dv-hint"> (≥{{ ANTI_SPOOF_THRESHOLD }})</span>
          </span>
        </div>
        <div class="debug-row">
          <span class="dk">Micro-motion</span>
          <span class="dv" [class.dv-ok]="microMotion() >= 0.5"
                [class.dv-warn]="microMotion() > 0 && microMotion() < 0.5">
            {{ microMotion() | number:'1.3-3' }}
          </span>
        </div>
        <div class="debug-row">
          <span class="dk">Liveness</span>
          <span class="dv" [class.dv-ok]="liveness() >= 100">{{ liveness() }}%</span>
        </div>
      </div>

      <div class="debug-section debug-log-section">
        <div class="debug-section-title">Log de eventos</div>
        <div class="debug-log-scroll" role="log" aria-live="polite" aria-label="Log de eventos biométricos">
          <div *ngFor="let log of logs()" class="log-entry"
               [class.log-ok]="log.level==='ok'"
               [class.log-warn]="log.level==='warn'"
               [class.log-err]="log.level==='error'">
            <span class="log-time">{{ formatTime(log.ts) }}</span>
            <span class="log-msg">{{ log.msg }}</span>
          </div>
          <div *ngIf="logs().length === 0" class="log-empty">Sin eventos aún…</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .debug-panel {
      position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
      width: 100%; max-width: 480px;
      background: #0f172a; border: 1px solid rgba(245,166,35,0.3); border-bottom: none;
      border-radius: 16px 16px 0 0; box-shadow: 0 -8px 40px rgba(0,0,0,0.5);
      z-index: 100; max-height: 70dvh; display: flex; flex-direction: column;
      font-family: 'Courier New', monospace; font-size: 12px;
    }
    .debug-header {
      padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex; justify-content: space-between; align-items: center;
      color: #F5A623; font-weight: 700; font-size: 13px; font-family: 'Inter', sans-serif;
      flex-shrink: 0;
    }
    .debug-close {
      background: rgba(255,255,255,0.08); border: none; color: #fff;
      width: 26px; height: 26px; border-radius: 50%; cursor: pointer;
    }
    .debug-close:focus-visible { outline: 2px solid #F5A623; }
    .debug-section { padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
    .debug-section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: rgba(255,255,255,0.35); margin-bottom: 6px;
    }
    .debug-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .dk { color: rgba(255,255,255,0.55); }
    .dv { color: #e2e8f0; font-weight: 600; text-align: right; }
    .dv-ok   { color: #10b981 !important; }
    .dv-warn { color: #F5A623 !important; }
    .dv-err  { color: #ef4444 !important; }
    .dv-hint { color: rgba(255,255,255,0.3); font-weight: 400; font-size: 10px; }

    .debug-log-section { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
    .debug-log-scroll {
      flex: 1; overflow-y: auto; padding: 0 16px 12px;
      display: flex; flex-direction: column; gap: 2px;
    }
    .log-entry { display: flex; gap: 8px; padding: 2px 0; color: rgba(255,255,255,0.6); }
    .log-ok .log-msg { color: #10b981; }
    .log-warn .log-msg { color: #F5A623; }
    .log-err .log-msg { color: #ef4444; }
    .log-time { color: rgba(255,255,255,0.25); flex-shrink: 0; }
    .log-empty { color: rgba(255,255,255,0.2); padding: 8px 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DebugPanelComponent {
  // Exponer constantes al template
  readonly ANTI_SPOOF_THRESHOLD = ANTI_SPOOF_THRESHOLD;
  readonly BLUR_THRESHOLD       = BLUR_THRESHOLD;
  readonly EAR_OPEN_THRESHOLD   = EAR_OPEN_THRESHOLD;
  readonly MAX_ROLL_DEGREES     = MAX_ROLL_DEGREES;
  readonly MIN_INTER_OCULAR_PX  = MIN_INTER_OCULAR_PX;

  initStep     = input.required<string>();
  initDuration = input<number>(0);
  fps          = input<number>(0);
  faceCount    = input<number>(0);
  ear          = input<number>(0);
  blur         = input<number>(0);
  yaw          = input<number>(0);
  pitch        = input<number>(0);
  roll         = input<number>(0);         // ← v4.0
  antiSpoof    = input<number>(0);
  microMotion  = input<number>(0);         // ← v4.0
  qualityScore = input<number>(0);         // ← v4.0
  interOcular  = input<number>(0);         // ← v4.0
  liveness     = input<number>(0);
  logs         = input<DebugLog[]>([]);

  close = output<void>();

  get absRoll(): () => number {
    return () => Math.abs(this.roll());
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('es-BO', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
}
