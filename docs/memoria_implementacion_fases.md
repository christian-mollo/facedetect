# Memoria Documental: Evolución del Componente Facedetect
## Histórico de Fases e Hitos de Desarrollo

Este documento consolida la memoria técnica de las fases completadas para el componente de captura biométrica dentro del ecosistema SIFv3.

### Fase 1: Cimientos y Captura Real-time
*   **Hito**: Implementación del motor de visión basado en MediaPipe.
*   **Logro**: Se logró la detección de puntos de referencia faciales (landmarks) con alta precisión en el navegador.
*   **Artefactos**: `vision.service.ts`, `face-capture.component.ts`.

### Fase 2: Prueba de Vida (Liveness Detection)
*   **Hito**: Introducción de validaciones de sujeto vivo.
*   **Logro**: Implementación de algoritmos EAR (Eye Aspect Ratio) para detección de parpadeos y cálculo de Yaw/Pitch para detección de movimientos de cabeza, previniendo el uso de fotos estáticas.
*   **Seguridad**: Bloqueo de captura si el usuario no demuestra actividad física.

### Fase 3: Hardening y Anti-spoofing 3D
*   **Hito**: Fortalecimiento contra ataques de presentación sofisticados.
*   **Logro**: Integración de análisis de profundidad (relieve facial) y detección de micro-movimientos (pulso/temblor) para diferenciar piel humana de superficies planas (pantallas/papel).
*   **Optimización**: Reducción de falsos positivos en entornos de baja iluminación.

### Fase 4: Calibración Dinámica y Telemetría
*   **Hito**: Gestión centralizada de umbrales cuantitativos.
*   **Logro**: Creación del `ThresholdService` que permite cambiar la sensibilidad de la captura sin redesplegar código.
*   **Analíticas**: Implementación de `reportTelemetry` para medir tiempos de captura y motivos de fallo en producción.

### Fase 5: Localización y UX de Grado Bancario
*   **Hito**: Internacionalización y refinamiento visual.
*   **Logro**: Traducción completa al español, mejora de la iconografía de guía y creación de paneles de diagnóstico para operadores técnicos.
*   **Estado Actual**: Componente listo para integración con el flujo de Onboarding Digital de Cuentas de Ahorro.

---
**Documento autogenerado para mantener la trazabilidad del proyecto.**
