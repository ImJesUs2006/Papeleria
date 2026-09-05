import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const producto = await prisma.producto.findUnique({
      where: { codigoItem: params.codigo },
    });

    if (!producto) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      codigoItem: producto.codigoItem,
      descripcion: producto.descripcion,
      precioUnitario: Number(producto.precioUnitario),
      stockActual: producto.stockActual,
      tipoImpresion: producto.tipoImpresion,
      codigoBarras: producto.codigoBarras,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al buscar producto" },
      { status: 500 }
    );
  }
}

// Edición rápida (hoja de cálculo web) - solo administradora
export async function PATCH(
  request: Request,
  { params }: { params: { codigo: string } }
) {
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

  try {
    const existente = await prisma.producto.findUnique({
      where: { codigoItem: params.codigo },
    });
    if (!existente) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const data: Record<string, any> = {};

    if (body.descripcion !== undefined) {
      if (typeof body.descripcion !== "string" || !body.descripcion.trim()) {
        return NextResponse.json(
          { error: "Descripción inválida" },
          { status: 400 }
        );
      }
      data.descripcion = body.descripcion.trim();
    }

    if (body.precioUnitario !== undefined) {
      const precio = Number(body.precioUnitario);
      if (!Number.isFinite(precio) || precio < 0) {
        return NextResponse.json(
          { error: "Precio inválido" },
          { status: 400 }
        );
      }
      data.precioUnitario = Math.round(precio * 100) / 100;
    }

    if (body.stockActual !== undefined) {
      const stock = Number(body.stockActual);
      if (!Number.isInteger(stock) || stock < 0) {
        return NextResponse.json(
          { error: "Stock inválido" },
          { status: 400 }
        );
      }
      data.stockActual = stock;
    }

    if (body.stockMinimo !== undefined) {
      const min = Number(body.stockMinimo);
      if (!Number.isInteger(min) || min < 0) {
        return NextResponse.json(
          { error: "Stock mínimo inválido" },
          { status: 400 }
        );
      }
      data.stockMinimo = min;
    }

    if (body.ubicacionEstante !== undefined) {
      data.ubicacionEstante = body.ubicacionEstante || null;
    }
    if (body.proveedor !== undefined) {
      data.proveedor = body.proveedor || null;
    }
    if (body.codigoBarras !== undefined) {
      data.codigoBarras = body.codigoBarras || null;
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.update({
        where: { codigoItem: params.codigo },
        data,
      });

      // Registra cambios relevantes en bitácora (sobre todo de precio/stock)
      const cambios: string[] = [];
      if (data.precioUnitario !== undefined && data.precioUnitario !== Number(existente.precioUnitario)) {
        cambios.push(
          `Precio ${Number(existente.precioUnitario).toFixed(2)} → ${data.precioUnitario.toFixed(2)}`
        );
      }
      if (data.stockActual !== undefined && data.stockActual !== existente.stockActual) {
        cambios.push(`Stock ${existente.stockActual} → ${data.stockActual}`);
      }

      if (cambios.length > 0) {
        await tx.bitacoraLog.create({
          data: {
            idUsuario: user.idPersona,
            accion: `Actualización de producto ${params.codigo}: ${cambios.join(", ")}`,
            moduloSistema: "INVENTARIO",
            jsonPayload: { codigoItem: params.codigo, cambios },
          },
        });
      }

      return producto;
    });

    return NextResponse.json({
      codigoItem: actualizado.codigoItem,
      descripcion: actualizado.descripcion,
      precioUnitario: Number(actualizado.precioUnitario),
      stockActual: actualizado.stockActual,
      stockMinimo: actualizado.stockMinimo,
      ubicacionEstante: actualizado.ubicacionEstante,
      proveedor: actualizado.proveedor,
      codigoBarras: actualizado.codigoBarras,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar producto" },
      { status: 500 }
    );
  }
}