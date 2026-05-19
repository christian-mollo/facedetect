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
import { Component } from '@angular/core';
import { FaceCaptureComponent } from './features/face-capture/face-capture.component';

/**
 * Root App Component — Banco Fortaleza shell
 * Matches the brand identity extracted from bancofortaleza.com.bo:
 *  • Navy blue (#1C3B6E) header
 *  • Orange (#F5A623) brand accent
 *  • Light gray (#F4F5F7) page background
 *  • White surface cards
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FaceCaptureComponent],
  template: `
    <div class="app-shell">

      <!-- ── Header bar ──────────────────────────── -->
      <header class="app-header">
        <div class="brand">
          <div class="brand-icon">🏦</div>
          <div class="brand-text">
            <span class="banco">Banco</span>
            <span class="fortaleza">Fortaleza</span>
          </div>
        </div>
        <p class="brand-subtitle">Apertura Digital de Cuenta</p>
      </header>

      <!-- ── Step indicator ─────────────────────── -->
      <div class="step-dots">
        <div class="dot"></div>
        <div class="dot active"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>

      <!-- ── Page title ─────────────────────────── -->
      <div class="page-title-block">
        <h2>Verificación Biométrica</h2>
        <p>Coloca tu rostro dentro del óvalo y sigue las instrucciones en pantalla</p>
      </div>

      <!-- ── Face capture component ─────────────── -->
      <main>
        <app-face-capture></app-face-capture>
      </main>

    </div>
  `,
  styleUrl: './app.css'
})
export class App {}
