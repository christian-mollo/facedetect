# Informe Técnico Ejecutivo: Componente de Identidad Digital (Facedetect)
## Proyecto: Onboarding Digital para Apertura de Cuenta de Ahorro

### 1. Resumen Ejecutivo
El componente **Facedetect** es el núcleo de seguridad y experiencia de usuario (UX) del proceso de Onboarding Digital de SIFv3. Su función principal es garantizar de forma irrefutable que el solicitante de una cuenta de ahorro es una **persona real y físicamente presente** (Prueba de Vida), capturando una imagen biométrica de alta calidad para su validación contra fuentes oficiales.

Este componente reduce drásticamente el riesgo de fraude por suplantación de identidad mediante el uso de algoritmos avanzados de visión artificial que operan directamente en el navegador del usuario, sin necesidad de instalaciones adicionales.

---

### 2. Objetivos Estratégicos
*   **Seguridad Transaccional**: Prevenir el uso de fotografías, videos o máscaras para engañar al sistema (Anti-spoofing).
*   **Eficiencia en el Registro**: Asegurar que la primera captura sea válida, evitando re-procesos y abandonos.
*   **Control Operativo**: Permitir ajustes dinámicos de sensibilidad según el riesgo o la calidad de los dispositivos del mercado.
*   **Cumplimiento Normativo**: Alineación con estándares internacionales de biometría (ISO 29794-5).

---

### 3. Capacidades Tecnológicas (Prueba de Vida y Anti-fraude)
Para asegurar la integridad del proceso, el sistema implementa múltiples capas de validación en tiempo real:

#### A. Liveness Detection (Detección de Vida)
El sistema exige acciones involuntarias o reactivas del usuario para confirmar su presencia física:
*   **Detección de Parpadeo (EAR - Eye Aspect Ratio)**: Monitorea la apertura ocular para confirmar parpadeos humanos naturales.
*   **Análisis de Movimiento Dinámico**: Solicita giros leves de cabeza (Yaw/Pitch) para verificar la tridimensionalidad del rostro.
*   **Micro-movimiento**: Detecta temblores o variaciones mínimas de facciones para diferenciar entre una imagen estática (foto) y un sujeto vivo.

#### B. Anti-Spoofing 3D
Utiliza mapas de profundidad y relieve facial para rechazar intentos de suplantación con:
*   **Fotografías impresas**: Se detecta la ausencia de relieve 3D.
*   **Pantallas digitales**: Se filtran texturas de píxeles y brillos artificiales.

#### C. Control de Calidad Automático
El sistema guía al usuario para obtener la captura perfecta mediante:
*   **Validación de Iluminación**: Evita rostros subexpuestos o quemados por luz excesiva.
*   **Validación de Nitidez (Blur)**: Rechaza capturas borrosas que dificultarían la identificación en el backend.
*   **Encuadre Inteligente**: Siluetas dinámicas que aseguran que el rostro esté a la distancia y posición correcta.

---

### 4. Sistema de Calibración Estratégica
Una ventaja competitiva de esta implementación es el **Threshold Management Service**. Este sistema permite a los administradores del banco:
1.  **Ajustar los umbrales de seguridad en tiempo real**: Sin necesidad de programar o actualizar la aplicación.
2.  **Crear Perfiles (Presets)**: Por ejemplo, un perfil "Estricto" para transacciones de alto riesgo vs. un perfil "Flexible" para dispositivos gama baja.
3.  **Monitorear Conversión**: A través de telemetría, se puede identificar si un umbral demasiado exigente está causando abandonos en el flujo.

---

### 5. Arquitectura e Integración
El componente está diseñado bajo una arquitectura de microservicios, integrada con:
*   **Identity Service (Spring Boot)**: Procesa la validación final y cruza datos con el motor biométrico central.
*   **Keycloak (IAM)**: Garantiza que cada sesión de captura esté cifrada y vinculada a un usuario autenticado.
*   **Observabilidad**: Reporta eventos de éxito, error o abandono para alimentar tableros de control de negocio (Analytics).

---

### 6. Conclusión
La implementación de este componente de Identidad Digital no solo moderniza el proceso de apertura de cuentas, sino que establece un estándar de seguridad bancaria clase mundial. La combinación de **Prueba de Vida activa**, **detección de fraude 3D** y **calibración dinámica** posiciona a la institución a la vanguardia tecnológica, reduciendo costos operativos asociados al fraude y mejorando significativamente la satisfacción del cliente final.

---
**Elaborado por**: Antigravity AI Engineering.
**Fecha**: Abril 2026.
