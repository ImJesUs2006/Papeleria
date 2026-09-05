import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Rol = "ADMINISTRADORA" | "CAJERA";

interface AuthState {
  idPersona: string | null;
  nombre: string | null;
  rol: Rol | null;
  isAuthenticated: boolean;

  login: (user: { idPersona: string; nombre: string; rol: Rol }) => void;
  logout: () => Promise<void>;
  hydrateFromServer: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const PERMISSIONS: Record<Rol, string[]> = {
  ADMINISTRADORA: [
    "caja.abrir",
    "caja.cerrar",
    "cobro.realizar",
    "inventario.ver",
    "inventario.editar",
    "inventario.carga_masiva",
    "reportes.ver",
    "reportes.exportar",
    "configuracion.usuarios",
    "configuracion.roles",
    "bitacora.ver",
  ],
  CAJERA: ["caja.abrir", "caja.cerrar", "cobro.realizar"],
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      idPersona: null,
      nombre: null,
      rol: null,
      isAuthenticated: false,

      login: (user) =>
        set({
          idPersona: user.idPersona,
          nombre: user.nombre,
          rol: user.rol,
          isAuthenticated: true,
        }),

      logout: async () => {
        try {
          await fetch("/api/auth/login", { method: "DELETE" });
        } catch {
          // silent fail — cookie gets cleared server-side
        }
        set({
          idPersona: null,
          nombre: null,
          rol: null,
          isAuthenticated: false,
        });
      },

      hydrateFromServer: async () => {
        try {
          const res = await fetch("/api/auth/me");
          if (res.ok) {
            const user = await res.json();
            set({
              idPersona: user.idPersona,
              nombre: user.nombre,
              rol: user.rol,
              isAuthenticated: true,
            });
          } else {
            set({
              idPersona: null,
              nombre: null,
              rol: null,
              isAuthenticated: false,
            });
          }
        } catch {
          // keep current state if server unreachable
        }
      },

      hasPermission: (permission: string) => {
        const { rol } = get();
        if (!rol) return false;
        return PERMISSIONS[rol]?.includes(permission) ?? false;
      },
    }),
    {
      name: "papeleria-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        idPersona: state.idPersona,
        nombre: state.nombre,
        rol: state.rol,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
