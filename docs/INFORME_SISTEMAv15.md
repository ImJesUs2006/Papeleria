# Informe del Sistema — Fase 15

**Proyecto:** Papelería → SaaS de Punto de Venta e Inventario multi-negocio
**Fecha:** 2026-10-26
**Alcance:** Tercera revisión del usuario. **Fase G**: correcciones (bitácora y borrado de usuarios, caja, vista de tarjetas, diálogos, impuestos y programa de puntos). **Fase H**: preparación para vender (recuperar contraseña, aviso de privacidad y términos, respaldos y soporte). Pruebas conjuntas y subida a `main`.

---

## 1. Resumen ejecutivo

Con el sistema completo en lo funcional, esta etapa corrige los detalles que el usuario encontró al usarlo y agrega lo que necesita un producto para venderse: que la gente pueda recuperar su cuenta sola, que haya reglas claras de privacidad, que la información esté respaldada y que el soporte pueda ayudar sin pedir contraseñas.

**Estado de verificación final (rama combinada G + H)**

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos | `cd apps/web; npx tsc --noEmit` | Sin errores |
| Pruebas unitarias | `cd apps/web; npx vitest run` | **414/414** en 39 archivos (Fase 14: 391 en 37) |
| Aislamiento entre negocios | `npm run verificar:aislamiento -w @papeleria/web` | Verificado contra Postgres real |
| E2E (Playwright) | `npx playwright test` | **7/7** |
| Lint | `npx next lint` | Sin errores (2 avisos preexistentes en `inventario/page.tsx`) |
| Build | `npx next build` | Compilación exitosa, 86 páginas |
| Auditoría visual | `npm run auditoria:visual` | 0 hallazgos en 15 pantallas × 4 temas × 2 anchos |
| Recorrido Fase G | Script Playwright (API + pantallas) | **39/39** |
| Recorrido Fase H | Script Playwright (API + pantallas) | **47/47** |
| Recorridos D, E, F repetidos | Mismos scripts del informe 14 | 46/46, 25/25, 39/39 |
| Integración entre fases | Escenarios cruzados | 44/44 |
| Barrido de API | 95 rutas × cuerpos inválidos × 3 roles | **0 respuestas 500** |
| Aislamiento y permisos | Cajera restringida, anónimo, negocio ajeno | 128/128 |
| Pantallas × usuario × giro | 16 pantallas × 4 usuarios | 0 problemas |
| Día completo / concurrencia | Scripts de QA | 37/37 · 11/11 |
| Migraciones sobre copia de la base real | `prisma migrate deploy` | G y H aplicadas, sin pérdida de datos |

---

## 2. Fase G — correcciones

### 2.1 Bitácora y eliminar usuarios

Decisión del usuario: **no se borran registros sueltos** (una bitácora editable deja de servir como prueba); en su lugar:

- **Eliminar a una persona con historial la anonimiza** (`lib/usuarios.ts → anonimizarUsuario`): su nombre y usuario se reemplazan por «Usuario eliminado» / `eliminado-xxxxxxxx`, se quitan de los textos de la bitácora, la contraseña deja de servir y desaparece de las listas (`Usuario.eliminadoEn`). Sus ventas y cortes se conservan (obligación fiscal y auditoría). Sin historial se borra como antes.
- **Purga flexible solo del Dueño(a)**: desde 1 mes (1, 3, 6, 12, 24), con contraseña, respaldo en **Excel** descargado antes de borrar y constancia de la purga (`lib/bitacora-purga.ts`).
- **La consola de plataforma también purga su bitácora**, confirmando con la clave de plataforma (`POST /api/plataforma/bitacora/purgar`).

### 2.2 Caja

En efectivo **no se cobra sin capturar lo que entregó el cliente** (o tocar «Exacto»). El botón dice qué falta («Captura lo recibido» / «Lo recibido no alcanza»), el pago dividido exige el efectivo recibido y el servidor lo vuelve a validar en línea (`lib/pagos.ts`, opción `exigirRecibido`). Las ventas hechas sin conexión que ya están en cola no se rechazan al sincronizar.

### 2.3 Inventario y diálogos

- Botón **Quitar** en la vista de tarjetas.
- **Diálogos de la app** (`store/dialogo.ts` + `components/dialogo-host.tsx`, con `confirmar()` y `pedirTexto()`) en lugar de los 20 `confirm/prompt/alert` del navegador: inventario, lotes, series, variantes, clientes, promociones, categorías, perfiles, usuarios, cajón, facturas, reportes, báscula y la consola.

### 2.4 Impuestos

Diagnóstico: el cálculo respetaba la configuración, pero la pantalla confundía y no había forma de "no cobrar IVA". Se rediseñó (`components/configuracion/impuestos-panel.tsx`):

1. **¿Cobras impuestos (IVA)?** Sí / No. Con «No» todas las líneas van a tasa 0, aunque el producto tenga tasa propia o IEPS (`ConfiguracionNegocio.cobraImpuestos`; aplica en cobro, apartados, ventas sin conexión y carrito).
2. **Tasa**: 16 %, 8 % (frontera), 0 % u otra.
3. **Tus precios ya incluyen IVA / son sin IVA**, con un **ejemplo en vivo**: «Un producto de $100 → el cliente paga $116 (IVA $16)».
4. Aviso de cuántos productos tienen tasa propia y botón **«Que todos usen la tasa del negocio»**.

*Defecto encontrado al reproducir:* en un negocio que no había pasado por el asistente, **guardar Configuración respondía 500** (no existía su fila). Ahora es `upsert`.

### 2.5 Programa de puntos

Un solo interruptor **«Programa de puntos (monedero)»**: apagado oculta sus campos y quita el pago con puntos; encendido muestra las tasas. Los métodos de pago se muestran con nombres legibles.

---

## 3. Fase H — preparación para vender

### 3.1 Recuperar la contraseña

- «¿Olvidaste tu contraseña?» en el login → `/recuperar` → enlace por correo → `/recuperar/[token]`.
- El enlace **vale 1 hora y un solo uso**; en la base solo se guarda su hash SHA-256 (`RecuperacionClave`). Un enlace nuevo invalida los anteriores.
- **Misma respuesta exista o no el usuario** (no revela cuentas) y **límite** de 5 solicitudes cada 15 min.
- **Cambiar la contraseña cierra las sesiones abiertas** con la anterior (`passwordCambiadaEn` vs. emisión del token); quien cambia la suya recibe una sesión nueva y sigue trabajando.
- Correo por usuario opcional (Configuración → Usuarios, icono de sobre). Envío por **SMTP** (`nodemailer`); sin SMTP la pantalla indica pedir el restablecimiento a la administradora y, en desarrollo, el enlace aparece en la consola del servidor.

### 3.2 Aviso de privacidad y términos

- Páginas públicas `/privacidad` y `/terminos` (`lib/legal.ts`), redactadas como **plantilla para México** (responsable y encargado, datos tratados, finalidades, transferencias, derechos ARCO, cookies técnicas, conservación; servicio, cuentas, uso aceptable, propiedad de la información, facturación, disponibilidad y respaldos, soporte, responsabilidad, ley aplicable). Los datos del responsable salen de `LEGAL_RESPONSABLE`, `LEGAL_DOMICILIO`, `LEGAL_CORREO`.
- El **Dueño(a) los acepta en nombre del negocio** la primera vez que entra y cada vez que cambia `VERSION_LEGAL` (`Negocio.terminosVersion/AceptadosEn/AceptadosPor`). Queda en la bitácora.
- **Deben revisarse con un abogado antes de vender.**

### 3.3 Respaldos

- **Del servidor:** `npm run db:respaldo` — `pg_dump` comprimido de toda la base (instalado o el del contenedor Docker), en `backups/` o `RESPALDOS_DIR`, conservando los 14 más recientes. `packages/database/scripts/programar-respaldo.ps1` lo programa a diario en Windows. Restauración documentada con `pg_restore`. Probado: el archivo generado se lista completo con `pg_restore --list`.
- **De cada negocio:** el Dueño(a) descarga un Excel con productos, clientes, proveedores, ventas, detalle de ventas y usuarios (sin contraseñas) en **Configuración → Seguridad y datos**.

### 3.4 Soporte

- **Entrar como soporte** desde la ficha del negocio en la consola: sesión de **1 hora** como su Dueño(a), con **aviso fijo en pantalla** y botón Salir. No puede transferir la propiedad, reiniciar el sistema, purgar la bitácora, descargar el respaldo, aceptar términos ni cambiar el permiso de soporte. La entrada y la salida quedan en la bitácora del negocio y en la de la consola.
- El **Dueño(a) puede bloquearlo** (Configuración → Seguridad y datos), y ve los últimos accesos.
- **Contacto de soporte** (WhatsApp, correo, horario) en el login y en el Ayudante, desde `SOPORTE_WHATSAPP`, `SOPORTE_CORREO`, `SOPORTE_HORARIO`.

### 3.5 Nueva pestaña «Seguridad y datos»

Respaldo descargable, acceso del soporte técnico y estado de aceptación de términos, en Configuración.

---

## 4. Modelo de datos (migraciones)

```
20261026120000_fase_g_impuestos_usuarios   configuracion_negocio.cobraImpuestos, usuarios.eliminadoEn
20261026180000_fase_h_cuentas_soporte      usuarios.email, negocios (términos y permitirSoporte), tabla recuperaciones_clave
```

**En otra computadora o en la base real:** `npm run db:deploy`. Probado sobre una copia de la base real: sin pérdida de datos. Después de aplicarlas, el Dueño(a) verá una sola vez el aviso para aceptar términos y privacidad.

---

## 5. Pruebas

- **Unitarias nuevas:** `tests/fase-g.test.ts` (efectivo recibido, negocio sin impuestos, anonimización de textos, antigüedades de purga) y `tests/fase-h.test.ts` (hash de enlaces, cierre de sesiones al cambiar contraseña, correo, contacto de soporte, avisos legales). Se ajustaron las de ventas para capturar el efectivo recibido.
- **E2E:** el flujo de cobro toca «Exacto» como haría la cajera; el ayudante de pruebas acepta los términos si aparecen.
- **Recorridos con navegador** de G (39) y H (47) y repetición de los de D, E, F, integración y barridos de QA (sección 1).

Ajustes a los scripts de QA por cambios intencionales: rutas públicas nuevas (`/auth/recuperar`, `/auth/restablecer`, `/soporte`) y `GET /legal` de solo lectura; el pago mixto con efectivo envía lo recibido; la comprobación del reporte del día ahora suma las filas.

---

## 6. Notas y riesgos

1. **Textos legales**: plantilla; revisarlos con un abogado y completar `LEGAL_*` antes de vender.
2. **Correo**: sin SMTP la recuperación depende de la administradora. Para Gmail/Outlook usar una contraseña de aplicación.
3. **Respaldos del servidor**: el script debe programarse en la máquina donde corre la base; en hosting administrado, activar además sus respaldos automáticos.
4. **Modo soporte**: las acciones que el soporte hace dentro del negocio quedan a nombre del Dueño(a); la entrada y salida sí quedan marcadas como soporte.
5. **Pendientes para después del piloto**: timbrado con PAC, cobro de suscripciones y verificación en dos pasos.

---

## 7. Conclusión

El sistema queda listo para una prueba piloto con negocios reales: la caja no deja pasar cobros sin el efectivo recibido, los impuestos se configuran en tres preguntas con ejemplo, nadie depende de la base de datos para recuperar su cuenta, la información se respalda en dos niveles, hay reglas claras de privacidad y el soporte puede ayudar con permiso y dejando rastro. Compila, pasa 414 pruebas unitarias, 7 E2E y todos los recorridos y barridos sin errores 500.
