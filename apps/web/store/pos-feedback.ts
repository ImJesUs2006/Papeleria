import { create } from "zustand";

export interface PosToast {
  id: number;
  mensaje: string;
  tipo: "ok" | "warn" | "error";
}

interface PosFeedbackState {
  toasts: PosToast[];
  push: (mensaje: string, tipo?: PosToast["tipo"]) => void;
  dismiss: (id: number) => void;
}

let siguienteId = 1;
const VIDA_MS = 2600;

/** Mini sistema de "snackbars" del POS (Fase 12): feedback al agregar productos. */
export const usePosFeedback = create<PosFeedbackState>((set) => ({
  toasts: [],
  push: (mensaje, tipo = "ok") => {
    const id = siguienteId++;
    set((state) => ({ toasts: [...state.toasts, { id, mensaje, tipo }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), VIDA_MS);
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));