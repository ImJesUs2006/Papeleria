import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo } = await params;
    const producto = await prisma.producto.findUnique({
      where: { codigoItem: codigo },
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
      precioCompra: producto.precioCompra != null ? Number(producto.precioCompra) : null,
      stockActual: producto.stockActual,
      stockMinimo: producto.stockMinimo,
      ubicacionEstante: producto.ubicacionEstante,
      proveedor: producto.proveedor,
      tipoImpresion: producto.tipoImpresion,
      codigoBarras: producto.codigoBarras,
      imagenMime: producto.imagenMime,
      imagenBase64: producto.imagenBase64,
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
  { params }: { params: Promise<{ codigo: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;
  const { codigo } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const existente = await prisma.producto.findUnique({
      where: { codigoItem: codigo },
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

    if (body.precioCompra !== undefined) {
      if (body.precioCompra === null || body.precioCompra === "") {
        data.precioCompra = null;
      } else {
        const compra = Number(body.precioCompra);
        if (!Number.isFinite(compra) || compra < 0) {
          return NextResponse.json(
            { error: "Precio de compra inválido" },
            { status: 400 }
          );
        }
        data.precioCompra = Math.round(compra * 100) / 100;
      }
    }

    // El precio de venta nunca puede quedar por debajo del de compra.
    const ventaFinal =
      data.precioUnitario !== undefined
        ? data.precioUnitario
        : Number(existente.precioUnitario);
    const compraFinal =
      data.precioCompra !== undefined
        ? data.precioCompra
        : existente.precioCompra != null
          ? Number(existente.precioCompra)
          : null;
    if (compraFinal != null && ventaFinal < compraFinal) {
      return NextResponse.json(
        { error: "El precio de venta no puede ser menor al de compra" },
        { status: 400 }
      );
    }

    if (body.tipoImpresion !== undefined) {
      const TIPOS = ["BLANCO_NEGRO", "COLOR", "PLOTTER"];
      if (body.tipoImpresion === null || body.tipoImpresion === "") {
        data.tipoImpresion = null;
      } else if (TIPOS.includes(body.tipoImpresion)) {
        data.tipoImpresion = body.tipoImpresion;
      } else {
        return NextResponse.json(
          { error: "Tipo de impresión inválido" },
          { status: 400 }
        );
      }
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

    if (body.favorito !== undefined) {
      data.favorito = body.favorito === true;
    }

    // Imagen del producto: data URL o base64 crudo. Límite ~1.5 MB.
    if (body.imagenBase64 !== undefined) {
      if (body.imagenBase64 === null || body.imagenBase64 === "") {
        data.imagenBase64 = null;
        data.imagenMime = null;
      } else {
        const MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
        let mime = typeof body.imagenMime === "string" ? body.imagenMime : "";
        let base64 = String(body.imagenBase64);

        // Acepta data URL: data:image/png;base64,.....
        const match = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mime = match[1];
          base64 = match[2];
        }
        if (!MIMES.includes(mime)) {
          return NextResponse.json(
            { error: "Formato de imagen no permitido (png, jpg, webp)" },
            { status: 400 }
          );
        }
        if (base64.length > 2_000_000) {
          return NextResponse.json(
            { error: "Imagen demasiado grande (máx ~1.5 MB)" },
            { status: 413 }
          );
        }
        data.imagenMime = mime;
        data.imagenBase64 = base64;
      }
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.update({
        where: { codigoItem: codigo },
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
      if (data.imagenBase64 !== undefined) {
        cambios.push(data.imagenBase64 ? "Imagen actualizada" : "Imagen eliminada");
      }

      if (cambios.length > 0) {
        await tx.bitacoraLog.create({
          data: {
            idUsuario: user.idPersona,
            accion: `Actualización de producto ${codigo}: ${cambios.join(", ")}`,
            moduloSistema: "INVENTARIO",
            jsonPayload: { codigoItem: codigo, cambios },
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
      favorito: actualizado.favorito,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar producto" },
      { status: 500 }
    );
  }
}