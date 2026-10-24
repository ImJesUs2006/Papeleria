import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { CONFIG_PROPIA } from "@/lib/snapshots";
import type { Progreso } from "@/lib/ayudante";

// GET /api/ayudante/progreso → qué "Primeros pasos" ya cumplió el negocio.
// Solo cuenta filas (nada sensible), por eso basta con tener sesión.
export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = tenantDb(auth.user.idNegocio);

  const [config, categorias, productos, cajeras, cajas, ventas, cortes] = await Promise.all([
    db.configuracionNegocio.findUnique({ where: CONFIG_PROPIA, select: { setupPendiente: true } }),
    db.categoria.count(),
    db.producto.count(),
    db.usuario.count({ where: { rol: "CAJERA", activa: true } }),
    db.sesionCaja.count(),
    db.venta.count(),
    db.sesionCaja.count({ where: { estado: "CERRADA" } }),
  ]);

  const progreso: Progreso = {
    configuracion: config ? !config.setupPendiente : false,
    categorias: categorias > 0,
    productos: productos > 0,
    cajera: cajeras > 0,
    caja: cajas > 0,
    venta: ventas > 0,
    corte: cortes > 0,
  };
  return NextResponse.json({ progreso });
}
