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
// environment.ts — Desarrollo / Evaluación
export const environment = {
  production: false,

  /**
   * biometricDebugMode: true → activa:
   *  - Panel de informe post-captura con métricas de sesión
   *  - Almacenamiento de sesiones en sessionStorage (NO localStorage)
   *  - Exportación de datos JSON para análisis de umbrales
   *
   * En producción este flag se reemplaza por environment.prod.ts (false)
   */
  biometricDebugMode: true,

  /**
   * URL base del backend SIFv3 (identity-service).
   * En desarrollo apunta al Spring Boot local.
   * En producción se reemplaza por la URL del API Gateway.
   */
  apiUrl: 'http://localhost:8080',
};
