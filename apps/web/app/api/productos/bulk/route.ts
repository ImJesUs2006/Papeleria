import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import {
  calcularAjustePrecios,
  validarCodigosSeleccion,
} from "@/lib/bulk-ops";

// ============================================================
// POST /api/productos/bulk — Operaciones masivas (Fase 10):
//   { accion: "borrar", codigos[] }        → baja lógica (activo=false)
//   { accion: "ajustarPrecio", codigos[], tipo: "PORCENTAJE"|"MONTO_FIJO", valor }
//                                         → re-precio en lote (% o $ fijos)
// Solo administradora; cada operación queda en bitácora.
// ============================================================

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const accion = body?.accion;
  const validacion = validarCodigosSeleccion(body?.codigos);
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const codigos = validacion.codigos;

  try {
    if (accion === "ajustarPrecio") {
      const tipo = body?.tipo === "MONTO_FIJO" ? "MONTO_FIJO" : "PORCENTAJE";
      const valor = Number(body?.valor);
      if (!Number.isFinite(valor)) {
        return NextResponse.json(
          { error: tipo === "MONTO_FIJO" ? "Monto de ajuste inválido" : "Porcentaje de ajuste inválido" },
          { status: 400 }
        );
      }

      const productos = await prisma.producto.findMany({
        where: {
          codigoItem: { in: codigos },
          activo: true,
          esServicio: false,
        },
        select: {
          codigoItem: true,
          precioUnitario: true,
          precioCompra: true,
        },
      });

      let resultado;
      try {
        resultado = calcularAjustePrecios(
          productos.map((p) => ({
            codigoItem: p.codigoItem,
            precioUnitario: Number(p.precioUnitario),
            precioCompra: p.precioCompra != null ? Number(p.precioCompra) : null,
          })),
          { tipo, valor }
        );
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }

      // Los servicios no se re-precian en lote (se registra en el omitido).
      const serviciosSeleccionados = codigos.filter(
        (c) => !productos.some((p) => p.codigoItem === c)
      );
      for (const c of serviciosSeleccionados) {
        resultado.omitidos.push({ codigoItem: c, motivo: "Es un servicio; usa edición individual" });
      }

      if (resultado.aplicados.length === 0) {
        return NextResponse.json(
          { error: "No se pudo ajustar ningún precio (revisa omisiones)" },
          { status: 400 }
        );
      }

      const etiqueta =
        tipo === "MONTO_FIJO"
          ? `Ajuste de precios en lote (${valor > 0 ? "+" : ""}$${valor}): ${resultado.aplicados.length} productos`
          : `Ajuste de precios en lote (${valor > 0 ? "+" : ""}${valor}%): ${resultado.aplicados.length} productos`;

      const actualizados = await prisma.$transaction(async (tx) => {
        for (const a of resultado.aplicados) {
          await tx.producto.update({
            where: { codigoItem: a.codigoItem },
            data: { precioUnitario: a.precioNuevo },
          });
        }
        await tx.bitacoraLog.create({
          data: {
            idUsuario: user.idPersona,
            accion: etiqueta,
            moduloSistema: "INVENTARIO",
            jsonPayload: {
              tipo,
              valor,
              aplicados: resultado.aplicados,
              omitidos: resultado.omitidos,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        return resultado;
      });

      return NextResponse.json({ aplicados: actualizados.aplicados, omitidos: actualizados.omitidos });
    }

    if (accion === "borrar") {
      // Confirmación explícita: evita bajas por accidente desde un clic.
      if (body?.confirmar !== true) {
        return NextResponse.json(
          { error: "Confirma la baja masiva enviando confirmar: true" },
          { status: 400 }
        );
      }

      const seleccionados = await prisma.producto.findMany({
        where: { codigoItem: { in: codigos } },
        select: { codigoItem: true, esServicio: true },
      });
      const mapa = new Map(seleccionados.map((p) => [p.codigoItem, Boolean(p.esServicio)]));

      // Baja lógica: el producto deja de venderse pero conserva su historia
      // (kardex, líneas de venta, devoluciones y apartados) intacta.
      await prisma.$transaction(async (tx) => {
        for (const c of codigos) {
          await tx.producto.update({
            where: { codigoItem: c },
            data: { activo: false },
          });
        }
        await tx.bitacoraLog.create({
          data: {
            idUsuario: user.idPersona,
            accion: `Baja masiva de productos: ${codigos.length}`,
            moduloSistema: "INVENTARIO",
            jsonPayload: {
              codigos,
              servicios: codigos.filter((c) => mapa.get(c)),
            },
          },
        });
      });

      return NextResponse.json({ bajados: codigos.length });
    }

    return NextResponse.json(
      { error: "Acción no válida (borrar | ajustarPrecio)" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Error al procesar la operación masiva" },
      { status: 500 }
    );
  }
}