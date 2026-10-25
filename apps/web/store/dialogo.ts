import { create } from "zustand";

// ============================================================
// Diálogos propios de la aplicación (en lugar de window.confirm/prompt).
// Uso: `if (!(await confirmar({ titulo: "¿Eliminar?", peligro: true }))) return;`
//      `const motivo = await pedirTexto({ titulo: "Motivo" });` → null si cancela.
// Uno a la vez: si llega otro, el anterior se cancela.
// ============================================================

export interface OpcionesConfirmar {
  titulo: string;
  mensaje?: string;
  /** Texto del botón principal (por defecto "Aceptar"). */
  aceptar?: string;
  cancelar?: string;
  /** Botón principal en rojo (borrar, suspender, cancelar facturas). */
  peligro?: boolean;
}

export interface OpcionesTexto extends OpcionesConfirmar {
  etiqueta?: string;
  valorInicial?: string;
  placeholder?: string;
  tipo?: "text" | "password" | "number";
  /** Devuelve el mensaje de error o null si el valor es válido. */
  validar?: (valor: string) => string | null;
}

type Pendiente =
  | { tipo: "confirmar"; opciones: OpcionesConfirmar; resolver: (v: boolean) => void }
  | { tipo: "texto"; opciones: OpcionesTexto; resolver: (v: string | null) => void };

interface Estado {
  actual: Pendiente | null;
  abrir: (p: Pendiente) => void;
  cerrar: (valor: boolean | string | null) => void;
}

export const useDialogo = create<Estado>((set, get) => ({
  actual: null,
  abrir: (p) => {
    get().cerrar(null);
    set({ actual: p });
  },
  cerrar: (valor) => {
    const a = get().actual;
    if (!a) return;
    set({ actual: null });
    if (a.tipo === "confirmar") a.resolver(valor === true);
    else a.resolver(typeof valor === "string" ? valor : null);
  },
}));

export function confirmar(opciones: OpcionesConfirmar): Promise<boolean> {
  return new Promise((resolver) => useDialogo.getState().abrir({ tipo: "confirmar", opciones, resolver }));
}

export function pedirTexto(opciones: OpcionesTexto): Promise<string | null> {
  return new Promise((resolver) => useDialogo.getState().abrir({ tipo: "texto", opciones, resolver }));
}
