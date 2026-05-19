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
 * CameraService
 * ─────────────────────────────────────────────────────────────────
 * Manages WebRTC camera lifecycle via getUserMedia.
 * Handles:
 *  • Permission errors (NotAllowedError / OverconstrainedError)
 *  • Mobile facingMode (user/environment)
 *  • iOS Safari constraints (no frameRate in some versions)
 *  • Secure stream cleanup (no retained tracks)
 * ─────────────────────────────────────────────────────────────────
 */

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CameraService {

  private stream: MediaStream | null = null;

  isActive = signal(false);
  error    = signal<string | null>(null);

  async startCamera(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream | null> {
    this.error.set(null);

    // Try high-quality first, fall back for Safari/iOS
    const constraint_sets: MediaStreamConstraints[] = [
      {
        video: {
          facingMode,
          width:  { ideal: 1280 },
          height: { ideal: 720  },
          frameRate: { ideal: 30 }
        },
        audio: false
      },
      {
        video: { facingMode },
        audio: false
      }
    ];

    for (const constraints of constraint_sets) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.isActive.set(true);
        return this.stream;
      } catch (err: any) {
        const friendly = this.mapError(err);
        // If it's a real error (not just overconstraint), bail out
        if (err.name !== 'OverconstrainedError') {
          this.error.set(friendly);
          return null;
        }
        // Otherwise try next constraint set
      }
    }

    this.error.set('No se pudo iniciar la cámara en este dispositivo.');
    return null;
  }

  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.isActive.set(false);
  }

  private mapError(err: DOMException): string {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Permiso de cámara denegado. Revisa la configuración del navegador.';
      case 'NotFoundError':
        return 'No se encontró cámara en este dispositivo.';
      case 'NotReadableError':
        return 'La cámara está siendo usada por otra aplicación.';
      case 'SecurityError':
        return 'El acceso a la cámara no está permitido en esta conexión (requiere HTTPS).';
      default:
        return `Error de cámara: ${err.message}`;
    }
  }
}
