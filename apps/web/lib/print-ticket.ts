"use client";

// ============================================================
// Impresión térmica estricta (Fase 11).
//
// El navegador ignora `@page ticket57/ticket80` de la hoja de
// estilos principal y siempre imprime en carta. Para respetar el
// ancho real del rodillo (58mm o 80mm), imprimimos el contenido
// dentro de un <iframe> OCULTO cuyo propio documento declara
// `@page { size: 58mm|80mm auto; margin: 0 }`. Se copian los
// estilos del documento padre y se dispara
// `iframe.contentWindow.print()`, eliminando el iframe al terminar.
// ============================================================

export type AnchoTicketImpresion = "58mm" | "80mm";

function cssDelDoc (): string {
  const partes: string[] = [];

  // Copia <link rel="stylesheet"> (estilos globales de Next).
  document.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]'
  ).forEach((link) => {
    if (link.href) partes.push(`<link rel="stylesheet" href="${link.href}">`);
  });

  // Copia <style> inline del documento padre.
  document.querySelectorAll<HTMLStyleElement>("style").forEach((el) => {
    if (el.textContent) partes.push(`<style>${el.textContent}</style>`);
  });

  return partes.join("\n");
}

/**
 * Imprime el contenido de `elemento` en papel térmico estricto.
 * - `elemento`: nodo DOM del ticket (`.print-label-area`).
 * - `ancho`: "58mm" | "80mm" según la configuración del negocio.
 */
export function imprimirTicket(
  elemento: HTMLElement | null | undefined,
  ancho: AnchoTicketImpresion = "80mm"
) {
  if (!elemento) return;

  const anchoMM = ancho === "58mm" ? 58 : 80;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    top: "-9999px",
    left: "-9999px",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
    pointerEvents: "none",
  } as CSSStyleDeclaration);
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ticket</title>
<style>
  /* Ancho estricto del rodillo térmico. */
  @page { size: ${anchoMM}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff !important; color: #000 !important; }
  * { box-sizing: border-box; }
  .print-doc-render { width: ${anchoMM}mm; margin: 0 auto; }
  /* Si el documento padre esconde .print-label-area en pantalla,
     aquí debe revelarse siempre. */
  .print-label-area {
    position: static !important;
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    background: #fff !important;
    color: #000 !important;
    padding: 2mm !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
  }
  .print-ticket-57, .print-ticket-80 {
    width: 100% !important;
    max-width: 100% !important;
  }
  .print-ticket-57 *, .print-ticket-80 * {
    max-width: 100% !important;
    overflow-wrap: break-word !important;
    color: #000 !important;
    text-shadow: none !important;
  }
</style>
${cssDelDoc()}
</head>
<body>
  <div class="print-doc-render">${elemento.outerHTML}</div>
</body>
</html>`);
  doc.close();

  const win = iframe.contentWindow;
  const limpiar = () => {
    setTimeout(() => iframe.remove(), 50);
  };

  const imprimir = () => {
    try {
      win.focus();
      win.print();
    } catch {
      // Navegadores sin API de impresión: sin efecto.
    }
    limpiar();
  };

  if (doc.readyState === "complete") {
    setTimeout(imprimir, 60);
  } else {
    win.addEventListener("load", () => setTimeout(imprimir, 60), { once: true });
  }
}