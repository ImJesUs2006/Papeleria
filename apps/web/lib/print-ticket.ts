"use client";

// ============================================================
// Impresión de tickets al tamaño real del rollo térmico (58 u 80 mm).
//
// Se imprime una COPIA limpia del ticket dentro de un <iframe> oculto que
// tiene el ancho del rollo. Ahí se mide el alto del contenido y se declara
// `@page { size: <ancho>mm <alto>mm }`, así el navegador no usa carta.
//
// Antes salía en tamaño carta por tres razones:
//   1. `size: 80mm auto` es inválido (auto no se combina con una medida) y
//      el navegador ignoraba la regla completa;
//   2. los estilos globales se cargaban DESPUÉS y volvían a poner el ticket
//      en posición absoluta con la altura del recuadro de vista previa;
//   3. el iframe medía 0 px, así que no había forma de saber el alto.
// ============================================================

export type AnchoTicketImpresion = "58mm" | "80mm";

const PX_POR_MM = 96 / 25.4;

/** Hojas de estilo de la app (Tailwind) para que el ticket conserve su formato. */
function cssDelDoc(): string {
  const partes: string[] = [];
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    if (link.href) partes.push(`<link rel="stylesheet" href="${link.href}">`);
  });
  document.querySelectorAll<HTMLStyleElement>("style").forEach((el) => {
    if (el.textContent) partes.push(`<style>${el.textContent}</style>`);
  });
  return partes.join("\n");
}

/** Copia del ticket sin animaciones ni posicionamiento de la vista previa. */
function copiaLimpia(elemento: HTMLElement): HTMLElement {
  const clon = elemento.cloneNode(true) as HTMLElement;
  for (const el of [clon, ...Array.from(clon.querySelectorAll<HTMLElement>("*"))]) {
    el.style.removeProperty("transform");
    el.style.removeProperty("opacity");
    el.style.removeProperty("position");
    el.style.removeProperty("top");
    el.style.removeProperty("bottom");
  }
  return clon;
}

/** Alto de la página en mm para un contenido de `altoPx` (con margen, mínimo 40 mm). */
export function altoPaginaMm(altoPx: number, margenMm = 6): number {
  return Math.max(40, Math.ceil(altoPx / PX_POR_MM + margenMm));
}

export function imprimirTicket(
  elemento: HTMLElement | null | undefined,
  ancho: AnchoTicketImpresion = "80mm"
) {
  if (!elemento) return;

  const anchoMM = ancho === "58mm" ? 58 : 80;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Ancho real del rollo (para que el texto acomode igual que en el papel)
  // y fuera de la vista.
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${anchoMM}mm`,
    height: "2000px",
    border: "0",
    visibility: "hidden",
    pointerEvents: "none",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  doc.open();
  // Los estilos de la app van PRIMERO y los del ticket DESPUÉS: así ganan.
  doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ticket</title>
${cssDelDoc()}
<style id="ticket-base">
  html, body { margin: 0 !important; padding: 0 !important; width: ${anchoMM}mm !important;
    background: #fff !important; color: #000 !important; }
  * { box-sizing: border-box; }
  .ticket-hoja { width: ${anchoMM}mm; padding: 3mm 3mm 2mm; }
  .ticket-hoja > * {
    position: static !important; inset: auto !important; transform: none !important;
    width: 100% !important; max-width: 100% !important; height: auto !important;
    min-height: 0 !important; overflow: visible !important; margin: 0 !important;
    padding: 0 !important; box-shadow: none !important; border: none !important;
    border-radius: 0 !important; background: #fff !important; display: block !important;
  }
  .ticket-hoja, .ticket-hoja * {
    visibility: visible !important; color: #000 !important; text-shadow: none !important;
    overflow-wrap: anywhere; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .ticket-hoja .truncate { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
  .ticket-hoja [class*="max-w-"] { max-width: none !important; }
  @media print {
    body * { visibility: visible !important; }
    .print-label-area { position: static !important; width: 100% !important; max-width: 100% !important; }
  }
</style>
</head>
<body>
  <div class="ticket-hoja"></div>
</body>
</html>`);
  doc.close();
  doc.querySelector(".ticket-hoja")?.appendChild(doc.importNode(copiaLimpia(elemento), true));

  const limpiar = () => setTimeout(() => iframe.remove(), 500);

  const imprimir = () => {
    try {
      const hoja = doc.querySelector<HTMLElement>(".ticket-hoja");
      const alto = altoPaginaMm(hoja?.getBoundingClientRect().height ?? 0);
      const pagina = doc.createElement("style");
      pagina.textContent = `@page { size: ${anchoMM}mm ${alto}mm; margin: 0; }`;
      doc.head.appendChild(pagina);
      win.focus();
      win.print();
    } catch {
      // Navegadores sin API de impresión: sin efecto.
    }
    limpiar();
  };

  // Espera a que carguen las hojas de estilo para medir el alto real.
  const hojas = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  Promise.all(
    hojas.map(
      (l) =>
        new Promise<void>((ok) => {
          if (l.sheet) return ok();
          l.addEventListener("load", () => ok(), { once: true });
          l.addEventListener("error", () => ok(), { once: true });
          setTimeout(ok, 1500);
        })
    )
  ).then(() => setTimeout(imprimir, 60));
}
