import { create } from "zustand";

// ============================================================
// Notificaciones deslizantes (toasts) de toda la aplicación.
// Para avisos FUERA de las ventanas emergentes: producto agregado,
// cambios guardados, errores de una acción. No bloquean la pantalla y
// se van solas. Uso: `notificar.exito("Producto agregado")`.
// ============================================================

export type TipoNotificacion = "exito" | "error" | "aviso" | "info";

export interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  titulo: string;
  detalle?: string;
}

interface Estado {
  notificaciones: Notificacion[];
  agregar: (n: Omit<Notificacion, "id">, duracionMs?: number) => number;
  quitar: (id: number) => void;
}

let siguienteId = 1;
const MAXIMO_VISIBLES = 4;
const DURACION: Record<TipoNotificacion, number> = {
  exito: 2600,
  info: 3200,
  aviso: 4500,
  error: 6000,
};

export const useNotificaciones = create<Estado>((set) => ({
  notificaciones: [],
  agregar: (n, duracionMs) => {
    const id = siguienteId++;
    set((s) => {
      // Mismo mensaje repetido (escanear el mismo producto varias veces):
      // se reemplaza en vez de apilar copias.
      const sinRepetido = s.notificaciones.filter(
        (x) => !(x.titulo === n.titulo && x.tipo === n.tipo)
      );
      return { notificaciones: [...sinRepetido, { ...n, id }].slice(-MAXIMO_VISIBLES) };
    });
    setTimeout(
      () => set((s) => ({ notificaciones: s.notificaciones.filter((x) => x.id !== id) })),
      duracionMs ?? DURACION[n.tipo]
    );
    return id;
  },
  quitar: (id) => set((s) => ({ notificaciones: s.notificaciones.filter((x) => x.id !== id) })),
}));

const atajo =
  (tipo: TipoNotificacion) =>
  (titulo: string, detalle?: string) =>
    useNotificaciones.getState().agregar({ tipo, titulo, detalle });

/** Atajos para usar fuera de componentes React. */
export const notificar = {
  exito: atajo("exito"),
  error: atajo("error"),
  aviso: atajo("aviso"),
  info: atajo("info"),
};
