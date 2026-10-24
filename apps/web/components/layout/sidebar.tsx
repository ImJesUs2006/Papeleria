"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  ScrollText,
  Truck,
  Users,
  LogOut,
  RotateCcw,
  FileText,
  PackageOpen,
  Tag,
  Boxes,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useConfigStore, usePersonalizacion } from "@/store/config";
import { ShortcutsHelp } from "./shortcuts-help";
import { SucursalSelector } from "./sucursal-selector";
import { CentroAlertas } from "@/components/alertas/centro-alertas";
import { Ayudante } from "@/components/ayudante/ayudante";
import type { FeatureFlags } from "@/lib/business-types";
import { cn } from "@/lib/utils";

const NAV_ITEMS: Array<{
  label: string;
  href: string;
  icon: typeof BarChart3;
  permission: string;
  flag?: keyof FeatureFlags;
  grupo: "Ventas" | "Inventario" | "Compras" | "Administración";
}> = [
  {
    label: "Dashboard",
    href: "/dashboard",
    grupo: "Ventas",
    icon: BarChart3,
    permission: "dashboard.ver",
    flag: "dashboard",
  },
  {
    label: "Cobro",
    href: "/cobro",
    grupo: "Ventas",
    icon: ShoppingCart,
    permission: "cobro.realizar",
  },
  {
    label: "Caja",
    href: "/caja",
    grupo: "Ventas",
    icon: LayoutDashboard,
    permission: "caja.abrir",
  },
  {
    label: "Apartados",
    href: "/apartados",
    grupo: "Ventas",
    icon: PackageOpen,
    permission: "cobro.realizar",
    flag: "apartados",
  },
  {
    label: "Devoluciones",
    href: "/devoluciones",
    grupo: "Ventas",
    icon: RotateCcw,
    permission: "devoluciones.ver",
  },
  {
    label: "Inventario",
    href: "/inventario",
    grupo: "Inventario",
    icon: Package,
    permission: "inventario.ver",
    flag: "inventario",
  },
  {
    label: "Proveedores",
    href: "/proveedores",
    grupo: "Compras",
    icon: Users,
    permission: "proveedores.ver",
    flag: "proveedores",
  },
  {
    label: "Pedidos",
    href: "/pedidos",
    grupo: "Compras",
    icon: Truck,
    permission: "pedidos.ver",
    flag: "proveedores",
  },
  {
    label: "Lotes y series",
    href: "/lotes",
    grupo: "Inventario",
    icon: Boxes,
    permission: "inventario.editar",
    flag: "lotesSeries",
  },
  {
    label: "Traspasos",
    href: "/traspasos",
    grupo: "Inventario",
    icon: Truck,
    permission: "inventario.editar",
  },
  {
    label: "Promociones",
    href: "/promociones",
    grupo: "Ventas",
    icon: Tag,
    permission: "inventario.editar",
  },
  {
    label: "Clientes",
    href: "/clientes",
    grupo: "Ventas",
    icon: Users,
    permission: "clientes.ver",
  },
  {
    label: "Reportes",
    href: "/reportes",
    grupo: "Administración",
    icon: BarChart3,
    permission: "reportes.ver",
    flag: "dashboard",
  },
  {
    label: "Bitácora",
    href: "/bitacora",
    grupo: "Administración",
    icon: ScrollText,
    permission: "bitacora.ver",
    flag: "bitacora",
  },
  {
    label: "Facturación",
    href: "/facturacion",
    grupo: "Administración",
    icon: FileText,
    permission: "facturacion.ver",
    flag: "facturacion",
  },
  {
    label: "Configuración",
    href: "/configuracion",
    grupo: "Administración",
    icon: Settings,
    permission: "configuracion.usuarios",
  },
];

const GRUPOS = ["Ventas", "Inventario", "Compras", "Administración"] as const;

/** Módulo apagable del que depende una pantalla (para bloquearla si se entra por URL). */
export function flagDeRuta(pathname: string): keyof FeatureFlags | undefined {
  return NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.flag;
}

export function Sidebar() {
  const pathname = usePathname();
  const { nombre, rol, hasPermission, logout } = useAuthStore();
  const { trust, isFeatureEnabled, config } = useConfigStore();
  const { vocabulario } = usePersonalizacion();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!hasPermission(item.permission)) return false;
    if (!item.flag) return true;
    // Mientras la config no se ha hidratado no ocultamos nada (evita parpadeo);
    // ya verificada/desconfiada, el flag manda.
    if (trust === "PENDIENTE") return true;
    return isFeatureEnabled(item.flag);
  });

  return (
    <aside className="w-64 h-screen bg-surface-800 border-r border-surface-600 flex flex-col">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-surface-600">
        <div className="flex items-center gap-3">
          {config?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.logo}
              alt={config.nombreNegocio}
              className="h-9 w-9 rounded-full object-cover border border-surface-500 shrink-0"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-neon-green/15 border border-neon-green/40 flex items-center justify-center shrink-0">
              <span className="text-neon-green font-black text-base">
                {(config?.nombreNegocio ?? "N").charAt(0)}
              </span>
            </div>
          )}
          <h1
            className="min-w-0 flex-1 text-base font-black tracking-tight text-gray-100 truncate"
            title={config?.nombreNegocio}
          >
            {config?.nombreNegocio ?? "Mi Negocio"}
          </h1>
          <CentroAlertas />
        </div>
        <p
          className="text-xs text-muted mt-1 text-ellipsis overflow-hidden whitespace-nowrap"
          title={config?.nombreNegocio}
        >
          {rol === "ADMINISTRADORA" ? "Panel Admin" : "Punto de Venta"} ·{" "}
          {config?.nombreNegocio ?? ""}
        </p>
        <SucursalSelector esAdmin={rol === "ADMINISTRADORA"} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Menú principal">
        {GRUPOS.map((grupo) => {
          const items = visibleItems.filter((i) => i.grupo === grupo);
          if (items.length === 0) return null;
          return (
            <div key={grupo} className="mb-2">
              <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted/70">{grupo}</p>
              <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={cn(
                  "group flex items-center gap-3 px-4 py-1.5 rounded-xl text-sm transition-all",
                  isActive
                    ? "bg-acento/20 text-acento shadow-neon"
                    : "text-muted hover:bg-surface-700 hover:text-gray-100"
                )}
              >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-neon-green rounded-r-full"
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                />
              )}
              <Icon className="h-5 w-5" />
              <span>{item.href === "/clientes" ? vocabulario.clientes : item.label}</span>
            </Link>
          );
        })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-4 border-t border-surface-600">
        <div className="flex items-center gap-3 px-3 mb-2">
          <div className="h-8 w-8 rounded-full bg-neon-blue/20 flex items-center justify-center text-neon-blue text-sm font-bold">
            {nombre?.charAt(0) ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-100 truncate">
              {nombre}
            </p>
            <p className="text-xs text-muted capitalize">
              {rol?.toLowerCase().replace("_", " ")}
            </p>
          </div>
        </div>
        <Ayudante />
        <ShortcutsHelp />
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted hover:text-neon-red hover:bg-surface-700 transition-all"
        >
          <LogOut className="h-4 w-4" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
