import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Rol = "ADMINISTRADORA" | "CAJERA";

interface AuthState {
  idPersona: string | null;
  nombre: string | null;
  rol: Rol | null;
  permisoCobrar: boolean;
  permisoInventario: boolean;
  permisoReportes: boolean;
  isAuthenticated: boolean;

  login: (user: {
    idPersona: string;
    nombre: string;
    rol: Rol;
    permisoCobrar?: boolean;
    permisoInventario?: boolean;
    permisoReportes?: boolean;
  }) => void;
  logout: () => Promise<void>;
  hydrateFromServer: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const PERMISSIONS: Record<Rol, string[]> = {
  ADMINISTRADORA: [
    "dashboard.ver",
    "caja.abrir",
    "caja.cerrar",
    "cobro.realizar",
    "inventario.ver",
    "inventario.editar",
    "inventario.carga_masiva",
    "proveedores.ver",
    "pedidos.ver",
    "devoluciones.ver",
    "devoluciones.registrar",
    "reportes.ver",
    "reportes.exportar",
    "configuracion.usuarios",
    "configuracion.roles",
    "bitacora.ver",
  ],
  CAJERA: [
    "caja.abrir",
    "caja.cerrar",
    "cobro.realizar",
    "devoluciones.ver",
    "devoluciones.registrar",
  ],
};

// Permisos granulares (Fase 9): cada flag apaga su módulo en el sidebar,
// incluso para ADMINISTRADORA. Por defecto true (tokens antiguos).
const GRANULAR_PERMISOS: Record<string, "permisoCobrar" | "permisoInventario" | "permisoReportes"> = {
  "cobro.realizar": "permisoCobrar",
  "inventario.ver": "permisoInventario",
  "inventario.editar": "permisoInventario",
  "inventario.carga_masiva": "permisoInventario",
  "proveedores.ver": "permisoInventario",
  "pedidos.ver": "permisoInventario",
  "reportes.ver": "permisoReportes",
  "reportes.exportar": "permisoReportes",
  "bitacora.ver": "permisoReportes",
  "facturacion.ver": "permisoReportes",
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      idPersona: null,
      nombre: null,
      rol: null,
      permisoCobrar: true,
      permisoInventario: true,
      permisoReportes: true,
      isAuthenticated: false,

      login: (user) =>
        set({
          idPersona: user.idPersona,
          nombre: user.nombre,
          rol: user.rol,
          permisoCobrar: user.permisoCobrar ?? true,
          permisoInventario: user.permisoInventario ?? true,
          permisoReportes: user.permisoReportes ?? true,
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
          permisoCobrar: true,
          permisoInventario: true,
          permisoReportes: true,
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
              permisoCobrar: user.permisoCobrar ?? true,
              permisoInventario: user.permisoInventario ?? true,
              permisoReportes: user.permisoReportes ?? true,
              isAuthenticated: true,
            });
          } else {
            set({
              idPersona: null,
              nombre: null,
              rol: null,
              permisoCobrar: true,
              permisoInventario: true,
              permisoReportes: true,
              isAuthenticated: false,
            });
          }
        } catch {
          // keep current state if server unreachable
        }
      },

      hasPermission: (permission: string) => {
        const state = get();
        if (!state.rol) return false;
        const base = PERMISSIONS[state.rol]?.includes(permission) ?? false;
        if (!base) return false;
        // Fase 9: si el permiso está gobernado por un flag granular, éste manda.
        const flag = GRANULAR_PERMISOS[permission];
        if (!flag) return true;
        return state[flag];
      },
    }),
    {
      name: "papeleria-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        idPersona: state.idPersona,
        nombre: state.nombre,
        rol: state.rol,
        permisoCobrar: state.permisoCobrar,
        permisoInventario: state.permisoInventario,
        permisoReportes: state.permisoReportes,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
