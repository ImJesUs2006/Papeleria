import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { normalizarFechaCaducidad } from "@/lib/validate-product";
import { registrarMovimientosKardex } from "@/lib/kardex";
import { tenantDb } from "@/lib/tenant";
import { claveProducto } from "@/lib/tenant-keys";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> }
) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  try {
    const { codigo } = await params;
    const producto = await prisma.producto.findUnique({
      where: claveProducto(codigo),
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
      precioMayoreo: producto.precioMayoreo != null ? Number(producto.precioMayoreo) : null,
      tasaIva: producto.tasaIva != null ? Number(producto.tasaIva) : null,
      exentoIva: producto.exentoIva === true,
      tasaIeps: producto.tasaIeps != null ? Number(producto.tasaIeps) : null,
      imagenUrl: producto.imagenUrl ?? null,
      stockActual: producto.stockActual,
      stockMinimo: producto.stockMinimo,
      permiteDecimales: producto.permiteDecimales,
      esServicio: producto.esServicio,
      idCategoria: producto.idCategoria,
      ubicacionEstante: producto.ubicacionEstante,
      proveedor: producto.proveedor,
      tipoImpresion: producto.tipoImpresion,
      codigoBarras: producto.codigoBarras,
      fechaCaducidad: producto.fechaCaducidad?.toISOString() ?? null,
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
  const prisma = tenantDb(auth.user.idNegocio);
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
      where: claveProducto(codigo),
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

    // ---- Fase 12: precio de mayoreo ----
    let mayoreoFinal: number | null =
      existente.precioMayoreo != null ? Number(existente.precioMayoreo) : null;
    if (body.precioMayoreo !== undefined) {
      if (body.precioMayoreo === null || body.precioMayoreo === "") {
        data.precioMayoreo = null;
        mayoreoFinal = null;
      } else {
        const mayoreo = Number(body.precioMayoreo);
        if (!Number.isFinite(mayoreo) || mayoreo < 0) {
          return NextResponse.json(
            { error: "Precio de mayoreo inválido" },
            { status: 400 }
          );
        }
        // 0 significa "sin precio de mayoreo" (el POS usa menudeo).
        if (mayoreo === 0) {
          data.precioMayoreo = null;
          mayoreoFinal = null;
        } else {
          if (mayoreo >= ventaFinal) {
            return NextResponse.json(
              { error: "El precio de mayoreo debe ser menor al de venta" },
              { status: 400 }
            );
          }
          data.precioMayoreo = Math.round(mayoreo * 100) / 100;
          mayoreoFinal = data.precioMayoreo;
        }
      }
    } else if (
      body.precioUnitario !== undefined &&
      mayoreoFinal != null &&
      mayoreoFinal >= ventaFinal
    ) {
      // Subió el precio de venta y el mayoreo quedó igual o por encima.
      return NextResponse.json(
        { error: "Actualiza el precio de mayoreo: ya no es menor al de venta" },
        { status: 400 }
      );
    }

    // ---- Impuestos por producto ----
    const porcentaje = (v: unknown): number | null | undefined => {
      if (v === null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : undefined;
    };
    if (body.exentoIva !== undefined) {
      data.exentoIva = body.exentoIva === true;
      if (data.exentoIva) data.tasaIva = null;
    }
    if (body.tasaIva !== undefined && data.exentoIva !== true) {
      const t = porcentaje(body.tasaIva);
      if (t === undefined) {
        return NextResponse.json({ error: "IVA inválido (0 a 100)" }, { status: 400 });
      }
      data.tasaIva = t;
    }
    if (body.tasaIeps !== undefined) {
      const t = porcentaje(body.tasaIeps);
      if (t === undefined) {
        return NextResponse.json({ error: "IEPS inválido (0 a 100)" }, { status: 400 });
      }
      data.tasaIeps = t === 0 ? null : t;
    }

    // ---- Fase 12: imagen del producto (Cloudinary) ----
    if (body.imagenUrl !== undefined) {
      const url = typeof body.imagenUrl === "string" ? body.imagenUrl.trim() : "";
      if (url === "") {
        data.imagenUrl = null;
      } else if (
        url.startsWith("data:image/") ||
        /^https:\/\/[\w.-]+\.cloudinary\.com\//i.test(url)
      ) {
        data.imagenUrl = url;
      } else {
        return NextResponse.json(
          { error: "La imagen debe ser una URL de Cloudinary o un data URI" },
          { status: 400 }
        );
      }
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
      if (
        !Number.isFinite(stock) ||
        stock < 0 ||
        Math.round(stock * 1000) / 1000 !== stock
      ) {
        return NextResponse.json(
          { error: "Stock inválido (máximo 3 decimales)" },
          { status: 400 }
        );
      }
      data.stockActual = stock;
    }

    if (body.stockMinimo !== undefined) {
      const min = Number(body.stockMinimo);
      if (
        !Number.isFinite(min) ||
        min < 0 ||
        Math.round(min * 1000) / 1000 !== min
      ) {
        return NextResponse.json(
          { error: "Stock mínimo inválido (máximo 3 decimales)" },
          { status: 400 }
        );
      }
      data.stockMinimo = min;
    }

    // Sellos de Fase 10: fraccionamiento (granel) y servicios sin inventario.
    if (body.permiteDecimales !== undefined) {
      data.permiteDecimales = body.permiteDecimales === true;
    }
    if (body.esServicio !== undefined) {
      data.esServicio = body.esServicio === true;
    }
    if (body.idCategoria !== undefined) {
      if (body.idCategoria === null || body.idCategoria === "") {
        data.idCategoria = null;
      } else {
        const categoria = await prisma.categoria.findUnique({
          where: { id: String(body.idCategoria) },
        });
        if (!categoria) {
          return NextResponse.json(
            { error: "La categoría seleccionada no existe" },
            { status: 400 }
          );
        }
        data.idCategoria = categoria.id;
      }
    }

    if (body.ubicacionEstante !== undefined) {
      data.ubicacionEstante = body.ubicacionEstante || null;
    }
    if (body.fechaCaducidad !== undefined) {
      if (body.fechaCaducidad === null || body.fechaCaducidad === "") {
        data.fechaCaducidad = null;
      } else {
        const fecha = normalizarFechaCaducidad(String(body.fechaCaducidad));
        if (!fecha) {
          return NextResponse.json(
            { error: "Fecha de caducidad inválida" },
            { status: 400 }
          );
        }
        data.fechaCaducidad = fecha;
      }
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

    const actualizado = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.update({
        where: claveProducto(codigo),
        data,
      });

      // Registra cambios relevantes en bitácora (sobre todo de precio/stock)
      const cambios: string[] = [];
      if (data.precioUnitario !== undefined && data.precioUnitario !== Number(existente.precioUnitario)) {
        cambios.push(
          `Precio ${Number(existente.precioUnitario).toFixed(2)} → ${data.precioUnitario.toFixed(2)}`
        );
      }
      const deltaStock =
        data.stockActual !== undefined
          ? Math.round((data.stockActual - Number(existente.stockActual)) * 1000) / 1000
          : 0;
      if (deltaStock !== 0) {
        cambios.push(`Stock ${existente.stockActual} → ${data.stockActual}`);
        // Kardex inmutable: todo cambio manual de existencia es un AJUSTE
        // con signo (recuento físico, merma, corrección).
        await registrarMovimientosKardex(tx, [
          {
            codigoItem: codigo,
            tipo: "AJUSTE",
            cantidad: deltaStock,
            motivo: "Ajuste manual de inventario",
            idUsuario: user.idPersona,
          },
        ]);
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
      permiteDecimales: actualizado.permiteDecimales,
      esServicio: actualizado.esServicio,
      idCategoria: actualizado.idCategoria,
      ubicacionEstante: actualizado.ubicacionEstante,
      proveedor: actualizado.proveedor,
      codigoBarras: actualizado.codigoBarras,
      fechaCaducidad: actualizado.fechaCaducidad?.toISOString() ?? null,
      favorito: actualizado.favorito,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar producto" },
      { status: 500 }
    );
  }
}