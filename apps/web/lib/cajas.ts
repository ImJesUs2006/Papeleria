import type { PrismaClient } from "@papeleria/database";

// ============================================================
// Multi-caja (Paso 5): cada usuario opera SU caja. Las ventas,
// devoluciones, apartados y abonos van a la caja abierta de quien cobra,
// no a "la última caja abierta del negocio". Varias cajas pueden estar
// abiertas a la vez (en una o varias sucursales).
// `db` es el cliente con alcance de negocio (lib/tenant).
// ============================================================

type EstadoCaja = "ABIERTA" | "EN_CIERRE";

export async function cajaDelUsuario(
  db: Pick<PrismaClient, "sesionCaja">,
  idUsuario: string,
  estados: EstadoCaja[] = ["ABIERTA"]
) {
  return db.sesionCaja.findFirst({
    where: { idUsuario, estado: { in: estados } },
    orderBy: { horaApertura: "desc" },
  });
}
