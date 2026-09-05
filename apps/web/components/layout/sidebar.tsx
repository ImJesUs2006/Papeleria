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
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: BarChart3,
    permission: "dashboard.ver",
  },
  {
    label: "Cobro",
    href: "/cobro",
    icon: ShoppingCart,
    permission: "cobro.realizar",
  },
  {
    label: "Caja",
    href: "/caja",
    icon: LayoutDashboard,
    permission: "caja.abrir",
  },
  {
    label: "Inventario",
    href: "/inventario",
    icon: Package,
    permission: "inventario.ver",
  },
  {
    label: "Proveedores",
    href: "/proveedores",
    icon: Users,
    permission: "proveedores.ver",
  },
  {
    label: "Pedidos",
    href: "/pedidos",
    icon: Truck,
    permission: "pedidos.ver",
  },
  {
    label: "Reportes",
    href: "/reportes",
    icon: BarChart3,
    permission: "reportes.ver",
  },
  {
    label: "Bitácora",
    href: "/bitacora",
    icon: ScrollText,
    permission: "bitacora.ver",
  },
  {
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
    permission: "configuracion.usuarios",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { nombre, rol, hasPermission, logout } = useAuthStore();

  const visibleItems = NAV_ITEMS.filter((item) =>
    hasPermission(item.permission)
  );

  return (
    <aside className="w-64 h-screen bg-surface-800 border-r border-surface-600 flex flex-col">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-surface-600">
        <h1 className="text-xl font-black tracking-tight">
          <span className="text-neon-green">Pape</span>
          <span className="text-gray-100">lería</span>
        </h1>
        <p className="text-xs text-muted mt-1">
          {rol === "ADMINISTRADORA" ? "Panel Admin" : "Punto de Venta"}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "text-neon-green bg-neon-green/10"
                  : "text-muted hover:text-gray-100 hover:bg-surface-700"
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
              <span>{item.label}</span>
            </Link>
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
