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
 * ThresholdService — Gestión reactiva de umbrales biométricos
 * ────────────────────────────────────────────────────────────
 * Permite ajustar y guardar umbrales en tiempo real sin rebuild.
 * Los presets se guardan en localStorage (son configuración, no datos biométricos).
 */
import { Injectable, signal, computed } from '@angular/core';
import {
  ANTI_SPOOF_THRESHOLD, BLUR_THRESHOLD, EAR_OPEN_THRESHOLD,
  BLINKS_REQUIRED, HEAD_MOVE_YAW_DELTA, HEAD_MOVE_PITCH_DELTA,
  NO_FACE_RESET_FRAMES, MAX_YAW_DEGREES, MAX_PITCH_DEGREES,
  MAX_ROLL_DEGREES, MIN_FACE_HEIGHT_RATIO, MAX_FACE_HEIGHT_RATIO,
  BRIGHTNESS_MIN, BRIGHTNESS_MAX, GLASSES_Z_THRESHOLD,
  MICRO_MOTION_MIN, MICRO_MOTION_MAX, MICRO_MOTION_STATIC_FRAMES,
  MIN_INTER_OCULAR_PX, DEPTH_Z_RANGE_REAL,
} from '../config/biometric.config';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ThresholdValues {
  ANTI_SPOOF:       number;
  BLUR:             number;
  EAR_OPEN:         number;
  BLINKS_REQUIRED:  number;
  HEAD_MOVE_YAW:    number;
  HEAD_MOVE_PITCH:  number;
  NO_FACE_RESET:    number;
  MAX_YAW:          number;
  MAX_PITCH:        number;
  MAX_ROLL:         number;
  MIN_FACE_H:       number;
  MAX_FACE_H:       number;
  BRIGHTNESS_MIN:   number;
  BRIGHTNESS_MAX:   number;
  GLASSES_Z:        number;
  MICRO_MOTION_MIN: number;
  MICRO_MOTION_MAX: number;
  MICRO_STATIC_N:   number;
  MIN_INTER_OCULAR: number;
  DEPTH_Z_RANGE:    number;
}

export interface ThresholdPreset {
  id:        string;
  name:      string;
  createdAt: number;
  values:    ThresholdValues;
}

export interface ThresholdDef {
  key:         keyof ThresholdValues;
  label:       string;
  description: string;
  unit:        string;
  min:         number;
  max:         number;
  step:        number;
  section:     string;
}

// ─── Definición de umbrales (metadatos para la UI) ────────────────────────────

export const THRESHOLD_DEFS: ThresholdDef[] = [
  // Anti-suplantación
  { key: 'ANTI_SPOOF',       label: 'Mínimo Anti-suplantación', unit: '',    min: 0.40, max: 0.95, step: 0.01, section: 'Anti-suplantación',  description: 'Score combinado (profundidad+movimiento) para considerar rostro real' },
  { key: 'DEPTH_Z_RANGE',    label: 'Relieve 3D mínimo',        unit: '',    min: 0.05, max: 0.30, step: 0.01, section: 'Anti-suplantación',  description: 'Rango de profundidad mínimo para rostro tridimensional real' },
  { key: 'MICRO_STATIC_N',   label: 'Inercia de foto',          unit: 'fr',  min: 10, max: 90, step: 5, section: 'Anti-suplantación',  description: 'Cuadros sin micro-movimiento antes de penalizar como foto/pantalla' },
  { key: 'MICRO_MOTION_MIN', label: 'Micro-movimiento mín',     unit: '',  min: 0.0001, max: 0.003, step: 0.0001, section: 'Anti-suplantación', description: 'Variación mínima de facciones por cuadro (detección de pulso/temblor)' },
  // Pose
  { key: 'MAX_YAW',   label: 'Giro lateral máx',    unit: '°', min: 5,  max: 30, step: 1, section: 'Orientación', description: 'Grados máximos de giro horizontal de la cabeza' },
  { key: 'MAX_PITCH', label: 'Giro vertical máx',   unit: '°', min: 5,  max: 25, step: 1, section: 'Orientación', description: 'Grados máximos de inclinación vertical de la cabeza' },
  { key: 'MAX_ROLL',  label: 'Inclinación lateral máx', unit: '°', min: 5,  max: 20, step: 1, section: 'Orientación', description: 'Grados máximos de inclinación del cuello hacia los hombros' },
  // Calidad de imagen
  { key: 'BLUR',          label: 'Nitidez mínima',  unit: '',    min: 20,  max: 200, step: 5,  section: 'Calidad', description: 'Nivel mínimo de detalle (evitar fotos borrosas)' },
  { key: 'BRIGHTNESS_MIN',label: 'Brillo mínimo',   unit: '',    min: 20,  max: 100, step: 5,  section: 'Calidad', description: 'Luminosidad mínima necesaria en el rostro' },
  { key: 'BRIGHTNESS_MAX',label: 'Brillo máximo',   unit: '',    min: 180, max: 255, step: 5,  section: 'Calidad', description: 'Luminosidad máxima para evitar sobreexposición' },
  // Encuadre facial
  { key: 'MIN_FACE_H',      label: 'Tamaño de rostro mín', unit: '%', min: 0.10, max: 0.50, step: 0.01, section: 'Encuadre', description: 'Porcentaje mínimo del visor que debe ocupar el rostro' },
  { key: 'MAX_FACE_H',      label: 'Tamaño de rostro máx', unit: '%', min: 0.50, max: 1.00, step: 0.01, section: 'Encuadre', description: 'Porcentaje máximo del visor para evitar recortes' },
  { key: 'MIN_INTER_OCULAR',label: 'Distancia interpupilar',unit: 'px', min: 40,   max: 150,  step: 5,    section: 'Encuadre', description: 'Mínimo de píxeles entre ojos (ISO 29794-5)' },
  // Prueba de Vida
  { key: 'EAR_OPEN',        label: 'Apertura ocular (EAR)',unit: '',       min: 0.15, max: 0.35, step: 0.01, section: 'Prueba de Vida', description: 'Relación mínima de apertura del ojo (ojo abierto)' },
  { key: 'BLINKS_REQUIRED', label: 'Parpadeos requeridos', unit: '',    min: 1,    max: 5,    step: 1,    section: 'Prueba de Vida', description: 'Cantidad de parpadeos para confirmar sujeto vivo' },
  { key: 'HEAD_MOVE_YAW',   label: 'Giro lateral req.',    unit: '°', min: 5, max: 30, step: 1,     section: 'Prueba de Vida', description: 'Grados de giro horizontal requeridos para prueba de vida' },
  { key: 'HEAD_MOVE_PITCH', label: 'Giro vertical req.',   unit: '°', min: 5, max: 20, step: 1,   section: 'Prueba de Vida', description: 'Grados de giro vertical requeridos para prueba de vida' },
  { key: 'NO_FACE_RESET',   label: 'Reinicio por ausencia', unit: 'fr', min: 10, max: 120, step: 5, section: 'Prueba de Vida', description: 'Cuadros sin rostro antes de reiniciar el progreso' },
  // Lentes
  { key: 'GLASSES_Z',label: 'Sensibilidad lentes', unit: '', min: 0.008, max: 0.060, step: 0.002, section: 'Lentes', description: 'Umbral de profundidad para detectar monturas de gafas' },
];

// ─── Valores por defecto (desde config estático) ──────────────────────────────

export const DEFAULT_THRESHOLDS: ThresholdValues = {
  ANTI_SPOOF:       ANTI_SPOOF_THRESHOLD,
  BLUR:             BLUR_THRESHOLD,
  EAR_OPEN:         EAR_OPEN_THRESHOLD,
  BLINKS_REQUIRED:  BLINKS_REQUIRED,
  HEAD_MOVE_YAW:    HEAD_MOVE_YAW_DELTA,
  HEAD_MOVE_PITCH:  HEAD_MOVE_PITCH_DELTA,
  NO_FACE_RESET:    NO_FACE_RESET_FRAMES,
  MAX_YAW:          MAX_YAW_DEGREES,
  MAX_PITCH:        MAX_PITCH_DEGREES,
  MAX_ROLL:         MAX_ROLL_DEGREES,
  MIN_FACE_H:       MIN_FACE_HEIGHT_RATIO,
  MAX_FACE_H:       MAX_FACE_HEIGHT_RATIO,
  BRIGHTNESS_MIN:   BRIGHTNESS_MIN,
  BRIGHTNESS_MAX:   BRIGHTNESS_MAX,
  GLASSES_Z:        GLASSES_Z_THRESHOLD,
  MICRO_MOTION_MIN: MICRO_MOTION_MIN,
  MICRO_MOTION_MAX: MICRO_MOTION_MAX,
  MICRO_STATIC_N:   MICRO_MOTION_STATIC_FRAMES,
  MIN_INTER_OCULAR: MIN_INTER_OCULAR_PX,
  DEPTH_Z_RANGE:    DEPTH_Z_RANGE_REAL,
};

// ─── Service ──────────────────────────────────────────────────────────────────

const PRESETS_KEY = 'obf_threshold_presets_v1';

@Injectable({ providedIn: 'root' })
export class ThresholdService {

  // Valores activos (reactivos)
  private _values = signal<ThresholdValues>({ ...DEFAULT_THRESHOLDS });
  readonly values = this._values.asReadonly();

  // Presets guardados
  private _presets = signal<ThresholdPreset[]>(this.loadPresetsFromStorage());
  readonly presets = this._presets.asReadonly();

  // ¿algún valor difiere del default?
  hasChanges = computed(() => {
    const v = this._values();
    return Object.keys(DEFAULT_THRESHOLDS).some(
      k => Math.abs((v as any)[k] - (DEFAULT_THRESHOLDS as any)[k]) > 0.00001
    );
  });

  // ─── Lectura ──────────────────────────────────────────────────────────────
  get<K extends keyof ThresholdValues>(key: K): number {
    return this._values()[key];
  }

  // ─── Escritura ────────────────────────────────────────────────────────────
  set<K extends keyof ThresholdValues>(key: K, value: number): void {
    this._values.update(prev => ({ ...prev, [key]: value }));
  }

  resetToDefaults(): void {
    this._values.set({ ...DEFAULT_THRESHOLDS });
  }

  // ─── Presets ──────────────────────────────────────────────────────────────
  savePreset(name: string): ThresholdPreset {
    const preset: ThresholdPreset = {
      id:        crypto.randomUUID(),
      name:      name.trim() || `Preset ${Date.now()}`,
      createdAt: Date.now(),
      values:    { ...this._values() },
    };
    this._presets.update(prev => [...prev, preset]);
    this.persistPresets();
    return preset;
  }

  applyPreset(preset: ThresholdPreset): void {
    this._values.set({ ...preset.values });
  }

  deletePreset(id: string): void {
    this._presets.update(prev => prev.filter(p => p.id !== id));
    this.persistPresets();
  }

  exportPresetsJSON(): void {
    const data = JSON.stringify(this._presets(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `biometric_presets_${Date.now()}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  importPresetsJSON(json: string): number {
    try {
      const imported: ThresholdPreset[] = JSON.parse(json);
      if (!Array.isArray(imported)) return 0;
      const valid = imported.filter(p => p.id && p.name && p.values);
      this._presets.update(prev => {
        const ids = new Set(prev.map(p => p.id));
        return [...prev, ...valid.filter(p => !ids.has(p.id))];
      });
      this.persistPresets();
      return valid.length;
    } catch { return 0; }
  }

  // ─── Internos ─────────────────────────────────────────────────────────────
  private persistPresets(): void {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(this._presets()));
    } catch { /* localStorage lleno */ }
  }

  private loadPresetsFromStorage(): ThresholdPreset[] {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
}
