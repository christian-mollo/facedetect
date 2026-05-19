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
 * BiometricApiService — Integración HTTP con el backend SIFv3
 * ────────────────────────────────────────────────────────────
 * Envía la imagen capturada y las métricas de calidad al endpoint
 * de verificación biométrica del identity-service (Spring Boot).
 *
 * Endpoint: POST /api/v1/identity/biometric-verify
 * Autenticación: Bearer token (Keycloak) esperado por el backend.
 */
import { Injectable, signal } from '@angular/core';
import type { BiometricSubmitPayload, BiometricVerifyResponse } from '../models/biometric.models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BiometricApiService {

  /** Estado de envío observable */
  isSubmitting = signal(false);
  submitError  = signal<string | null>(null);
  submitResult = signal<BiometricVerifyResponse | null>(null);

  /**
   * Envía la captura biométrica al backend.
   * @param payload  Imagen base64 + métricas de calidad + sessionId
   * @returns        Respuesta del servidor con verificationId y nextStep
   */
  async submitCapture(payload: BiometricSubmitPayload): Promise<BiometricVerifyResponse> {
    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.submitResult.set(null);

    try {
      const response = await fetch(`${this.apiBase}/api/v1/identity/biometric-verify`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          // El token de Keycloak debe ser inyectado por el shell de onboarding
          // a través del estado de la aplicación / localStorage seguro del token.
          // TODO: integrar con AuthService cuando este módulo se embeba en el shell.
          'X-Session-Id': payload.sessionId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => 'Sin detalles');
        throw new Error(`Error ${response.status}: ${errBody}`);
      }

      const result: BiometricVerifyResponse = await response.json();
      this.submitResult.set(result);
      return result;

    } catch (err: any) {
      const msg = err?.message ?? 'Error de red al enviar la captura biométrica.';
      this.submitError.set(msg);
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Envía telemetría anónima de la sesión biométrica al backend.
   * Usa sendBeacon para garantizar entrega incluso si el usuario navega.
   * No incluye imagen ni datos biométricos crudos.
   */
  reportTelemetry(event: {
    sessionId:   string;
    eventType:   'started' | 'captured' | 'abandoned' | 'timeout' | 'error';
    durationMs:  number;
    deviceClass: 'high' | 'mid' | 'low';
    outcome:     'success' | 'failure';
    failReason?: string;
  }): void {
    try {
      const blob = new Blob(
        [JSON.stringify({ ...event, ts: Date.now() })],
        { type: 'application/json' }
      );
      navigator.sendBeacon(`${this.apiBase}/api/v1/telemetry/biometric`, blob);
    } catch { /* sendBeacon es best-effort, ignorar errores */ }
  }

  private get apiBase(): string {
    return (environment as any).apiUrl ?? '';
  }
}
