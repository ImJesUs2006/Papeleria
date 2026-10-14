"use client";

import { bytesAbrirCajon, parsearPeso } from "./escpos";

// ============================================================
// Hardware del mostrador por Web Serial (Paso 8). Funciona en Chrome,
// Edge y la app de escritorio (Chromium). La configuración es POR EQUIPO
// (cada caja tiene su impresora y báscula), en este navegador.
//
//   impresora: "NAVEGADOR" (diálogo de impresión) | "ESCPOS" (directa)
//   abrirCajon: pulso al cajón al cobrar en efectivo (vía impresora)
// ============================================================

export interface HardwareEquipo {
  impresora: "NAVEGADOR" | "ESCPOS";
  baudiosImpresora: number;
  abrirCajon: boolean;
  usarBascula: boolean;
  baudiosBascula: number;
}

const CLAVE = "papeleria-hardware";
const PREDETERMINADO: HardwareEquipo = {
  impresora: "NAVEGADOR",
  baudiosImpresora: 9600,
  abrirCajon: false,
  usarBascula: false,
  baudiosBascula: 9600,
};

export function leerHardware(): HardwareEquipo {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? { ...PREDETERMINADO, ...JSON.parse(raw) } : PREDETERMINADO;
  } catch {
    return PREDETERMINADO;
  }
}

export function guardarHardware(h: HardwareEquipo) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(h));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Web Serial está disponible (navegador Chromium en contexto seguro). */
export function hayWebSerial(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

type Rol = "impresora" | "bascula";
const CLAVE_PUERTO = (rol: Rol) => `papeleria-puerto-${rol}`;

function serial(): any {
  if (!hayWebSerial()) throw new Error("Este navegador no permite puertos USB/serie (usa Chrome o Edge)");
  return (navigator as any).serial;
}

function idPuerto(puerto: any): string {
  const info = puerto.getInfo?.() ?? {};
  return `${info.usbVendorId ?? "x"}:${info.usbProductId ?? "x"}`;
}

/** Pide al usuario elegir el puerto (requiere un clic) y lo recuerda. */
export async function elegirPuerto(rol: Rol): Promise<string> {
  const puerto = await serial().requestPort();
  const id = idPuerto(puerto);
  try {
    localStorage.setItem(CLAVE_PUERTO(rol), id);
  } catch {
    /* almacenamiento no disponible */
  }
  return id;
}

/** Puerto ya autorizado para este rol (sin volver a preguntar). */
async function puertoGuardado(rol: Rol): Promise<any> {
  const puertos: any[] = await serial().getPorts();
  let id: string | null = null;
  try {
    id = localStorage.getItem(CLAVE_PUERTO(rol));
  } catch {
    /* almacenamiento no disponible */
  }
  const puerto = puertos.find((p) => idPuerto(p) === id) ?? (puertos.length === 1 ? puertos[0] : null);
  if (!puerto) {
    throw new Error(`No hay ${rol === "impresora" ? "impresora" : "báscula"} configurada en este equipo`);
  }
  return puerto;
}

/** Envía bytes a la impresora configurada. */
export async function enviarAImpresora(bytes: Uint8Array): Promise<void> {
  const h = leerHardware();
  const puerto = await puertoGuardado("impresora");
  await puerto.open({ baudRate: h.baudiosImpresora });
  try {
    const writer = puerto.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  } finally {
    await puerto.close();
  }
}

export async function abrirCajon(): Promise<void> {
  await enviarAImpresora(bytesAbrirCajon());
}

/**
 * Lee el peso de la báscula (kg). Envía "W" (protocolo común) y espera
 * una lectura estable hasta `timeoutMs`.
 */
export async function leerBascula(timeoutMs = 3000): Promise<number> {
  const h = leerHardware();
  const puerto = await puertoGuardado("bascula");
  await puerto.open({ baudRate: h.baudiosBascula });
  const reader = puerto.readable.getReader();
  try {
    const writer = puerto.writable?.getWriter();
    if (writer) {
      await writer.write(new TextEncoder().encode("W\r"));
      writer.releaseLock();
    }
    const decoder = new TextDecoder();
    let buffer = "";
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      const lectura = await Promise.race([
        reader.read(),
        new Promise<{ value?: undefined; done: true }>((r) =>
          setTimeout(() => r({ done: true }), Math.max(limite - Date.now(), 0))
        ),
      ]);
      if (lectura.value) buffer += decoder.decode(lectura.value, { stream: true });
      const renglones = buffer.split(/\r?\n|\r/);
      for (const r of renglones.reverse()) {
        const peso = parsearPeso(r);
        if (peso != null && peso > 0) return peso;
      }
      if (lectura.done) break;
    }
    throw new Error("La báscula no envió un peso estable");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await puerto.close().catch(() => {});
  }
}
