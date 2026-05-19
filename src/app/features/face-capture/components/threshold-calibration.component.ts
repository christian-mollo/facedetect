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
 * ThresholdCalibrationComponent — Panel de calibración de umbrales en tiempo real
 * ──────────────────────────────────────────────────────────────────────────────
 * Permite ajustar cada umbral biométrico con un slider y ver el efecto
 * inmediatamente en los indicadores de validación.
 * Los presets se guardan y cargan desde ThresholdService (localStorage).
 */
import {
  Component, input, output, signal, computed,
  ChangeDetectionStrategy, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ThresholdService,
  ThresholdDef,
  ThresholdPreset,
  THRESHOLD_DEFS,
  DEFAULT_THRESHOLDS,
} from '../../../core/services/threshold.service';
import type { VisionService } from '../../../core/services/vision.service';

// Secciones de organización visual
const SECTIONS = ['Anti-suplantación', 'Orientación', 'Calidad', 'Encuadre', 'Prueba de Vida', 'Lentes'];

@Component({
  selector: 'app-threshold-calibration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cal-panel" role="dialog" aria-modal="true" aria-label="Panel de calibración de umbrales biométricos">

      <!-- ── Header ── -->
      <div class="cal-header">
        <div class="cal-title">
          <span class="cal-icon">⚙️</span>
          <span>Calibración de Umbrales</span>
          <span class="cal-badge" *ngIf="ts.hasChanges()">● Modificado</span>
        </div>
        <button class="cal-close" (click)="close.emit()" aria-label="Cerrar panel">✕</button>
      </div>

      <!-- ── Preset bar ── -->
      <div class="preset-bar">
        <input class="preset-input" [(ngModel)]="presetName" placeholder="Nombre del perfil…"
               aria-label="Nombre del perfil a guardar" maxlength="40" />
        <button class="btn-save-preset" (click)="savePreset()"
                [disabled]="!presetName.trim()"
                title="Guardar umbrales actuales como perfil">
          💾 Guardar
        </button>
        <button class="btn-reset" (click)="confirmReset()" title="Restaurar valores iniciales">
          ↺ Iniciales
        </button>
        <button class="btn-export" (click)="ts.exportPresetsJSON()" title="Exportar perfiles a JSON"
                [disabled]="ts.presets().length === 0">
          ↑ Exportar
        </button>
      </div>

      <!-- ── Presets guardados ── -->
      <div class="presets-section" *ngIf="ts.presets().length > 0">
        <div class="presets-label">Perfiles guardados</div>
        <div class="presets-list">
          <div *ngFor="let p of ts.presets()" class="preset-chip">
            <button class="preset-load" (click)="ts.applyPreset(p)" [title]="formatDate(p.createdAt)">
              {{ p.name }}
            </button>
            <button class="preset-del" (click)="ts.deletePreset(p.id)" aria-label="Eliminar perfil {{ p.name }}">✕</button>
          </div>
        </div>
      </div>

      <!-- ── Secciones de sliders ── -->
      <div class="cal-body">
        <div *ngFor="let section of sections" class="cal-section">

          <button class="section-header" (click)="toggleSection(section)"
                  [attr.aria-expanded]="isSectionOpen(section)">
            <span>{{ sectionIcon(section) }} {{ section }}</span>
            <span class="section-chevron" [class.open]="isSectionOpen(section)">›</span>
          </button>

          <div class="section-body" *ngIf="isSectionOpen(section)">
            <div *ngFor="let def of defsForSection(section)" class="threshold-row">

              <!-- Live metric indicator -->
              <div class="metric-bar">
                <span class="th-label">{{ def.label }}</span>
                <span class="th-value-display"
                      [class.th-ok]="isMetricOk(def)"
                      [class.th-err]="!isMetricOk(def)">
                  {{ currentValue(def) | number:'1.0-3' }}{{ def.unit }}
                </span>
              </div>

              <!-- Slider -->
              <div class="slider-row">
                <span class="slider-min">{{ def.min }}</span>
                <input type="range"
                       [min]="def.min" [max]="def.max" [step]="def.step"
                       [value]="ts.get(def.key)"
                       (input)="onSlider($event, def)"
                       class="slider"
                       [attr.aria-label]="def.label"
                       [attr.aria-valuemin]="def.min"
                       [attr.aria-valuemax]="def.max"
                       [attr.aria-valuenow]="ts.get(def.key)" />
                <span class="slider-max">{{ def.max }}</span>
                <span class="slider-curr">
                  {{ ts.get(def.key) | number:'1.0-3' }}
                  <span class="slider-unit">{{ def.unit }}</span>
                </span>
                <button class="reset-one" (click)="resetOne(def.key)"
                        [title]="'Default: ' + defaultVal(def.key)"
                        *ngIf="ts.get(def.key) !== defaultVal(def.key)">↺</button>
              </div>

              <!-- Descripción -->
              <div class="th-desc">{{ def.description }}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .cal-panel {
      position: fixed;
      bottom: 20px; right: 20px;
      width: 420px; max-height: calc(100vh - 140px);
      background: linear-gradient(180deg, #0f172a 0%, #1a2742 100%);
      border: 1px solid rgba(245,166,35,0.35);
      border-radius: 16px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.6);
      z-index: 200;
      display: flex; flex-direction: column;
      font-family: 'Inter', -apple-system, sans-serif;
      overflow: hidden;
      animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    /* Responsividad: En móvil vuelve a ser bottom sheet */
    @media (max-width: 768px) {
      .cal-panel {
        bottom: 0; left: 0; right: 0;
        width: 100%; max-width: none;
        max-height: 80dvh;
        border-radius: 20px 20px 0 0;
        border-left: none; border-right: none;
        animation: slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
    }

    @keyframes slideInUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    /* Header */
    .cal-header {
      flex-shrink: 0; padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(245,166,35,0.06);
    }
    .cal-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 14px; font-weight: 700; color: #F5A623;
    }
    .cal-badge {
      font-size: 11px; padding: 2px 8px; border-radius: 999px;
      background: rgba(245,166,35,0.2); color: #F5A623;
    }
    .cal-close {
      width: 28px; height: 28px; border-radius: 50%; border: none;
      background: rgba(255,255,255,0.1); color: #fff; cursor: pointer; font-size: 13px;
    }
    .cal-close:focus-visible { outline: 2px solid #F5A623; }
    .cal-icon { font-size: 16px; }

    /* Preset bar */
    .preset-bar {
      flex-shrink: 0; padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    }
    .preset-input {
      flex: 1; min-width: 120px; padding: 7px 10px; border-radius: 8px;
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
      color: #fff; font-size: 12px; outline: none;
    }
    .preset-input:focus { border-color: #F5A623; }
    .preset-input::placeholder { color: rgba(255,255,255,0.3); }
    .btn-save-preset, .btn-reset, .btn-export {
      padding: 7px 12px; border-radius: 8px; border: none; font-size: 12px;
      font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap;
    }
    .btn-save-preset { background: #F5A623; color: #000; }
    .btn-save-preset:hover:not(:disabled) { background: #E08E0B; }
    .btn-save-preset:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-reset { background: rgba(255,255,255,0.1); color: #fff; }
    .btn-reset:hover { background: rgba(255,255,255,0.18); }
    .btn-export { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
    .btn-export:hover:not(:disabled) { background: rgba(255,255,255,0.15); color: #fff; }
    .btn-export:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Presets lista */
    .presets-section {
      flex-shrink: 0; padding: 8px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .presets-label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: rgba(255,255,255,0.3); margin-bottom: 6px;
    }
    .presets-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .preset-chip { display: flex; align-items: center; border-radius: 999px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.15); }
    .preset-load {
      padding: 4px 10px; background: transparent; border: none;
      color: #e2e8f0; font-size: 12px; cursor: pointer; font-weight: 500;
    }
    .preset-load:hover { background: rgba(255,255,255,0.1); color: #F5A623; }
    .preset-del {
      padding: 4px 7px; background: transparent; border-left: 1px solid rgba(255,255,255,0.1);
      border-right: none; border-top: none; border-bottom: none;
      color: rgba(255,255,255,0.35); font-size: 11px; cursor: pointer;
    }
    .preset-del:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

    /* Cuerpo scrollable */
    .cal-body { flex: 1; overflow-y: auto; padding-bottom: 20px; }
    .cal-body::-webkit-scrollbar { width: 4px; }
    .cal-body::-webkit-scrollbar-thumb { background: rgba(245,166,35,0.3); border-radius: 4px; }

    /* Secciones */
    .cal-section { border-bottom: 1px solid rgba(255,255,255,0.05); }
    .section-header {
      width: 100%; padding: 12px 16px; background: transparent;
      border: none; color: #e2e8f0; font-size: 13px; font-weight: 600;
      display: flex; justify-content: space-between; align-items: center;
      cursor: pointer; text-align: left;
    }
    .section-header:hover { background: rgba(255,255,255,0.04); }
    .section-chevron { font-size: 18px; color: rgba(255,255,255,0.4); transition: transform 0.2s; }
    .section-chevron.open { transform: rotate(90deg); }
    .section-body { padding: 4px 14px 12px; display: flex; flex-direction: column; gap: 14px; }

    /* Cada fila de threshold */
    .threshold-row { display: flex; flex-direction: column; gap: 4px; }
    .metric-bar { display: flex; justify-content: space-between; align-items: center; }
    .th-label { font-size: 12px; font-weight: 600; color: #e2e8f0; }
    .th-value-display { font-size: 11px; font-family: 'Courier New', monospace; padding: 2px 7px;
      border-radius: 999px; font-weight: 700; }
    .th-ok  { background: rgba(16,185,129,0.2); color: #10b981; }
    .th-err { background: rgba(239,68,68,0.2);  color: #ef4444; }

    /* Slider */
    .slider-row {
      display: flex; align-items: center; gap: 6px;
    }
    .slider-min, .slider-max { font-size: 10px; color: rgba(255,255,255,0.3); width: 34px;
      flex-shrink: 0; text-align: center; }
    .slider {
      flex: 1; height: 4px; border-radius: 2px; cursor: pointer;
      accent-color: #F5A623;
    }
    .slider-curr {
      font-size: 12px; font-weight: 700; color: #F5A623; min-width: 48px;
      text-align: right; font-family: 'Courier New', monospace;
    }
    .slider-unit { font-size: 10px; color: rgba(245,166,35,0.7); }
    .reset-one {
      width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2);
      background: transparent; color: rgba(255,255,255,0.5); font-size: 13px;
      cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    }
    .reset-one:hover { border-color: #F5A623; color: #F5A623; background: rgba(245,166,35,0.1); }

    /* Descripción */
    .th-desc { font-size: 10px; color: rgba(255,255,255,0.3); line-height: 1.4; }
  `],
})
export class ThresholdCalibrationComponent {

  ts         = inject(ThresholdService);
  vision     = input<VisionService | null>(null);
  close      = output<void>();

  readonly sections = SECTIONS;
  readonly defs     = THRESHOLD_DEFS;

  presetName = '';

  private openSections = signal<Set<string>>(new Set(['Anti-spoofing', 'Pose']));

  defsForSection(section: string): ThresholdDef[] {
    return this.defs.filter(d => d.section === section);
  }

  onSlider(event: Event, def: ThresholdDef): void {
    const v = parseFloat((event.target as HTMLInputElement).value);
    this.ts.set(def.key, v);
  }

  defaultVal(key: string): number {
    return (DEFAULT_THRESHOLDS as any)[key];
  }

  resetOne(key: string): void {
    this.ts.set(key as any, this.defaultVal(key));
  }

  savePreset(): void {
    if (!this.presetName.trim()) return;
    this.ts.savePreset(this.presetName);
    this.presetName = '';
  }

  confirmReset(): void {
    if (confirm('¿Restaurar todos los umbrales a sus valores iniciales?')) {
      this.ts.resetToDefaults();
    }
  }

  toggleSection(section: string): void {
    this.openSections.update(s => {
      const next = new Set(s);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  }

  isSectionOpen(section: string): boolean {
    return this.openSections().has(section);
  }

  sectionIcon(section: string): string {
    const map: Record<string, string> = {
      'Anti-suplantación': '🔒', 'Orientación': '📐', 'Calidad': '🔍',
      'Encuadre': '👤', 'Prueba de Vida': '💓', 'Lentes': '🕶',
    };
    return map[section] ?? '⚙️';
  }

  /**
   * Formatea la fecha al estilo local.
   */
  formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es-BO', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  /**
   * Devuelve el valor de la métrica en vivo para comparar con el umbral del slider.
   * Conectado via input() al VisionService del componente padre.
   */
  currentValue(def: ThresholdDef): number {
    const v = this.vision();
    if (!v) return 0;
    const map: Record<string, () => number> = {
      ANTI_SPOOF:       () => v.rawAntiSpoof(),
      BLUR:             () => v.rawBlur(),
      EAR_OPEN:         () => v.rawEar(),
      MAX_YAW:          () => Math.abs(v.rawYaw()),
      MAX_PITCH:        () => Math.abs(v.rawPitch()),
      MAX_ROLL:         () => Math.abs(v.rawRoll()),
      GLASSES_Z:        () => v.hasGlasses() ? 1 : 0, // aproximación
      MIN_INTER_OCULAR: () => v.rawInterOcular(),
      BRIGHTNESS_MIN:   () => v.rawQualityScore() / 100, // proxy
      BRIGHTNESS_MAX:   () => v.rawQualityScore() / 100,
      MICRO_MOTION_MIN: () => v.rawMicroMotion(),
      MICRO_MOTION_MAX: () => v.rawMicroMotion(),
      MICRO_STATIC_N:   () => v.rawStaticFrames(),
      DEPTH_Z_RANGE:    () => v.rawQualityScore() / 100,
      MIN_FACE_H:       () => v.rawFaceH(),
      MAX_FACE_H:       () => v.rawFaceH(),
      BLINKS_REQUIRED:  () => 0,
      HEAD_MOVE_YAW:    () => Math.abs(v.rawYaw()),
      HEAD_MOVE_PITCH:  () => Math.abs(v.rawPitch()),
      NO_FACE_RESET:    () => 0,
    };
    return map[def.key]?.() ?? 0;
  }

  isMetricOk(def: ThresholdDef): boolean {
    const current   = this.currentValue(def);
    const threshold = this.ts.get(def.key);
    // Para umbrales máximos (MAX_*): métrica debe ser ≤ umbral
    if (def.key.startsWith('MAX_')) return current <= threshold;
    // Para umbrales mínimos: métrica debe ser ≥ umbral
    return current >= threshold;
  }
}
