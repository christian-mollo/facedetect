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
import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-session-report',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="session-report" *ngIf="report()">
      <button class="sr-header" (click)="toggleReport()">
        <span class="sr-title">📊 Informe de Sesión Biométrica</span>
        <span class="sr-env-badge">MODO EVALUACIÓN</span>
        <span class="sr-toggle">{{ reportOpen() ? '▲' : '▼' }}</span>
      </button>
      
      <div class="sr-body" *ngIf="reportOpen()">
        <div class="sr-section">
          <p class="sr-section-title">Resumen de Sesión</p>
          <div class="sr-row"><span class="sr-k">ID</span><span class="sr-v sr-mono">{{ report().id }}</span></div>
          <div class="sr-row"><span class="sr-k">Duración total</span><span class="sr-v">{{ formatDuration(report().aggregates.timeToCapture_ms) }}</span></div>
          <div class="sr-row"><span class="sr-k">FPS promedio</span><span class="sr-v">{{ report().aggregates.avgFps }}</span></div>
        </div>

        <div class="sr-section" *ngIf="report().captureFrame">
          <p class="sr-section-title">📸 Métricas de Captura</p>
          <div class="sr-metric" [class.sr-metric-ok]="report().captureFrame.ear >= 0.23">
            <div class="sr-m-label">👁️ EAR (Ojos)</div>
            <div class="sr-m-val">{{ report().captureFrame.ear | number:'1.3-3' }}</div>
            <div class="sr-m-bar-wrap"><div class="sr-m-bar" [style.width.%]="report().captureFrame.ear*200"></div></div>
          </div>
          <div class="sr-metric" [class.sr-metric-ok]="report().captureFrame.blur >= 60">
            <div class="sr-m-label">🔍 Nitidez (Blur)</div>
            <div class="sr-m-val">{{ report().captureFrame.blur | number:'1.1-1' }}</div>
            <div class="sr-m-bar-wrap"><div class="sr-m-bar" [style.width.%]="(report().captureFrame.blur/300)*100"></div></div>
          </div>
          <div class="sr-metric" [class.sr-metric-ok]="report().captureFrame.antiSpoofScore >= 0.65">
            <div class="sr-m-label">🛡️ Score Anti-Spoof</div>
            <div class="sr-m-val">{{ (report().captureFrame.antiSpoofScore * 100) | number:'1.0-0' }}%</div>
            <div class="sr-m-bar-wrap"><div class="sr-m-bar" [style.width.%]="report().captureFrame.antiSpoofScore*100"></div></div>
          </div>
        </div>

        <div class="sr-actions">
          <button class="sr-export-btn" (click)="export.emit()">📥 Descargar JSON</button>
          <button class="sr-view-btn" (click)="showJsonModal.set(true)">🔍 Ver Datos JSON</button>
        </div>
      </div>
    </div>

    <!-- ── MODAL DE INSPECCIÓN JSON ──────────────────────────── -->
    <div class="sr-modal-overlay" *ngIf="showJsonModal()" (click)="showJsonModal.set(false)">
      <div class="sr-modal-card" (click)="$event.stopPropagation()">
        <header class="sr-modal-header">
          <p class="sr-modal-title">Estructura de Datos Biométricos</p>
          <button class="sr-modal-close" (click)="showJsonModal.set(false)">✕</button>
        </header>
        <div class="sr-modal-body">
          <pre class="sr-json-viewer"><code>{{ report() | json }}</code></pre>
        </div>
        <footer class="sr-modal-footer">
          <p class="sr-modal-note">Estos datos son enviados al IdentityController del Backend.</p>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .session-report { background: #fff; border-top: 3px solid #F5A623; border-radius: 0 0 20px 20px; overflow: hidden; }
    .sr-header {
      display: flex; align-items: center; gap: 10px; padding: 14px 18px;
      background: linear-gradient(135deg, #1C3B6E 0%, #0f2349 100%);
      cursor: pointer; border: none; width: 100%; text-align: left; color: #fff;
    }
    .sr-title { font-size: 13px; font-weight: 700; flex: 1; }
    .sr-env-badge { padding: 3px 8px; border-radius: 999px; background: #F5A623; font-size: 9px; font-weight: 700; }
    .sr-body { padding: 0; max-height: 50dvh; overflow-y: auto; display: flex; flex-direction: column; }
    .sr-section { padding: 14px 18px; border-bottom: 1px solid #F0F2F5; }
    .sr-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #9CA3AF; margin-bottom: 10px; }
    .sr-row { display: flex; justify-content: space-between; padding: 5px 0; }
    .sr-k { font-size: 12px; color: #6B7080; }
    .sr-v { font-size: 12px; font-weight: 700; color: #1C3B6E; }
    .sr-v.sr-mono { font-family: monospace; font-size: 10px; }
    .sr-metric { padding: 10px 12px; border-radius: 10px; border: 1.5px solid #E2E6ED; background: #F9FAFB; margin-bottom: 7px; }
    .sr-metric-ok { background: #F0FDF4; border-color: #86EFAC; }
    .sr-m-label { font-size: 11px; font-weight: 600; }
    .sr-m-val { font-size: 14px; font-weight: 800; text-align: right; }
    .sr-m-bar-wrap { height: 4px; background: #E2E6ED; border-radius: 999px; overflow: hidden; margin-top: 4px; }
    .sr-m-bar { height: 100%; background: #1C3B6E; transition: width 0.6s ease; }
    .sr-metric-ok .sr-m-bar { background: #22c55e; }
    .sr-actions { padding: 14px 18px; display: flex; gap: 10px; justify-content: center; }
    .sr-export-btn {
      padding: 10px 18px; border-radius: 999px; border: 1.5px solid #E2E6ED;
      background: #fff; color: #1C3B6E; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;
    }
    .sr-export-btn:hover { background: #F9FAFB; border-color: #1C3B6E; }
    .sr-view-btn {
      padding: 10px 18px; border-radius: 999px; border: none;
      background: #1C3B6E; color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;
    }
    .sr-view-btn:hover { background: #0f2349; transform: translateY(-1px); }

    /* Estilos del Modal */
    .sr-modal-overlay {
      position: fixed; inset: 0; background: rgba(13, 27, 46, 0.85); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .sr-modal-card {
      background: #fff; width: 100%; max-width: 600px; max-height: 80dvh;
      border-radius: 20px; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);
      animation: modalUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes modalUp { from { transform: translateY(40px); opacity:0; } to { transform: translateY(0); opacity:1; } }
    .sr-modal-header { padding: 18px 24px; background: #F9FAFB; border-bottom: 1px solid #E2E6ED; display: flex; justify-content: space-between; align-items: center; }
    .sr-modal-title { font-size: 14px; font-weight: 800; color: #1C3B6E; }
    .sr-modal-close { border: none; background: #E2E6ED; color: #6B7080; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; transition: all 0.2s; }
    .sr-modal-close:hover { background: #EF4444; color: #fff; }
    .sr-modal-body { padding: 0; overflow: auto; flex: 1; background: #0d1b2e; }
    .sr-json-viewer { margin: 0; padding: 24px; color: #86EFAC; font-family: 'Fira Code', 'Monaco', monospace; font-size: 12px; line-height: 1.6; }
    .sr-modal-footer { padding: 14px 24px; background: #F9FAFB; border-top: 1px solid #E2E6ED; }
    .sr-modal-note { font-size: 11px; color: #9CA3AF; text-align: center; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionReportComponent {
  report = input.required<any>();
  export = output<void>();

  reportOpen = signal(true);
  showJsonModal = signal(false);
  toggleReport() { this.reportOpen.update(v => !v); }

  formatDuration(ms: number): string {
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
  }
}
