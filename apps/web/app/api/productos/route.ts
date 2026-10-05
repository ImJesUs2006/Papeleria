import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { registrarMovimientosKardex } from "@/lib/kardex";
import {
  validateProductoInput,
  sanitizeText,
  normalizarFechaCaducidad,
} from "@/lib/validate-product";
import { tenantDb } from "@/lib/tenant";
import { claveCodigoBarras, claveProducto } from "@/lib/tenant-keys";

const ALLOWED_SORT = [
  "descripcion",
  "precioUnitario",
  "stockActual",
  "stockMinimo",
  "fechaCreacion",
  "ubicacionEstante",
  "proveedor",
] as const;

type SortField = (typeof ALLOWED_SORT)[number];

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  try {
    const { searchParams } = new URL(request.url);

    // --- Filters ---
    const q = searchParams.get("q") || "";
    const precioMin = searchParams.get("precioMin");
    const precioMax = searchParams.get("precioMax");
    const stockMin = searchParams.get("stockMin");
    const stockMax = searchParams.get("stockMax");
    const proveedor = searchParams.get("proveedor");
    const ubicacion = searchParams.get("ubicacion");
    const tipoImpresion = searchParams.get("tipoImpresion");
    const esServicio = searchParams.get("esServicio");
    const permiteDecimales = searchParams.get("permiteDecimales");
    const soloBajoStock = searchParams.get("bajoStock") === "true";
    const soloSinStock = searchParams.get("sinStock") === "true";

    // --- Sorting ---
    const sortParam = searchParams.get("sortBy") || "descripcion";
    const sortDir = searchParams.get("sortDir") === "desc" ? "desc" : "asc";
    const sortBy: SortField = ALLOWED_SORT.includes(sortParam as SortField)
      ? (sortParam as SortField)
      : "descripcion";

    // --- Pagination ---
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    // Build Prisma where clause
    const AND: Prisma.ProductoWhereInput[] = [];

    // Text search
    if (q.length >= 1) {
      AND.push({
        OR: [
          { codigoItem: { contains: q, mode: "insensitive" } },
          { descripcion: { contains: q, mode: "insensitive" } },
          { codigoBarras: { contains: q, mode: "insensitive" } },
          { proveedor: { contains: q, mode: "insensitive" } },
          { ubicacionEstante: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    // Price range
    if (precioMin) {
      const val = parseFloat(precioMin);
      if (!isNaN(val)) AND.push({ precioUnitario: { gte: val } });
    }
    if (precioMax) {
      const val = parseFloat(precioMax);
      if (!isNaN(val)) AND.push({ precioUnitario: { lte: val } });
    }

    // Stock range
    if (stockMin) {
      const val = parseInt(stockMin, 10);
      if (!isNaN(val)) AND.push({ stockActual: { gte: val } });
    }
    if (stockMax) {
      const val = parseInt(stockMax, 10);
      if (!isNaN(val)) AND.push({ stockActual: { lte: val } });
    }

    // Provider
    if (proveedor && proveedor.length >= 1) {
      AND.push({ proveedor: { contains: proveedor, mode: "insensitive" } });
    }

    // Location
    if (ubicacion && ubicacion.length >= 1) {
      AND.push({ ubicacionEstante: { contains: ubicacion, mode: "insensitive" } });
    }

    // Impression type
    if (tipoImpresion) {
      const tiposValidos = ["BLANCO_NEGRO", "COLOR", "PLOTTER"];
      if (tiposValidos.includes(tipoImpresion)) {
        AND.push({ tipoImpresion: tipoImpresion as any });
      }
    }

    // Zero stock filter
    if (soloSinStock) {
      AND.push({ stockActual: 0 });
    }

    // Fase 10: filtros por sello
    if (esServicio === "true") AND.push({ esServicio: true });
    if (esServicio === "false") AND.push({ esServicio: false });
    if (permiteDecimales === "true") AND.push({ permiteDecimales: true });
    if (permiteDecimales === "false") AND.push({ permiteDecimales: false });

    const where: Prisma.ProductoWhereInput = {
      activo: true,
      ...(AND.length > 0 ? { AND } : {}),
    };

    let [productos, total] = await Promise.all([
      prisma.producto.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
      }),
      prisma.producto.count({ where }),
    ]);

    // Post-query filter: low stock (Prisma can't compare two columns in a single query)
    if (soloBajoStock) {
      productos = productos.filter((p) => p.stockActual <= p.stockMinimo);
    }

    return NextResponse.json({
      data: productos.map((p) => ({
        codigoItem: p.codigoItem,
        descripcion: p.descripcion,
        precioUnitario: Number(p.precioUnitario),
        precioCompra: p.precioCompra != null ? Number(p.precioCompra) : null,
precioMayoreo: p.precioMayoreo != null ? Number(p.precioMayoreo) : null,
        imagenUrl: p.imagenUrl ?? null,
        stockActual: p.stockActual,
        stockMinimo: p.stockMinimo,
        permiteDecimales: p.permiteDecimales,
        esServicio: p.esServicio,
        idCategoria: p.idCategoria,
        ubicacionEstante: p.ubicacionEstante,
        proveedor: p.proveedor,
        tipoImpresion: p.tipoImpresion,
        codigoBarras: p.codigoBarras,
        fechaCaducidad: p.fechaCaducidad?.toISOString() ?? null,
        favorito: p.favorito,
        fechaCreacion: p.fechaCreacion,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error al buscar productos" },
      { status: 500 }
    );
  }
}

// Alta manual de un producto (solo administradora).
export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const validacion = validateProductoInput(body);
  if (!validacion.success) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const data = validacion.data;

  try {
    const existente = await prisma.producto.findUnique({
      where: claveProducto(data.codigoItem),
    });
    if (existente) {
      return NextResponse.json(
        { error: `Ya existe un producto con el código ${data.codigoItem}` },
        { status: 409 }
      );
    }

    if (data.codigoBarras) {
      const dupBarras = await prisma.producto.findUnique({
        where: claveCodigoBarras(data.codigoBarras),
      });
      if (dupBarras) {
        return NextResponse.json(
          { error: "Ese código de barras ya está asignado a otro producto" },
          { status: 409 }
        );
      }
    }

    const creado = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({
        data: {
          codigoItem: data.codigoItem,
          descripcion: sanitizeText(data.descripcion),
          precioUnitario: new Prisma.Decimal(data.precioUnitario),
precioCompra:
            data.precioCompra != null ? new Prisma.Decimal(data.precioCompra) : null,
          // Fase 12: mayoreo (0/null = sin precio de mayoreo) e imagen.
          precioMayoreo:
            data.precioMayoreo != null && data.precioMayoreo > 0
              ? new Prisma.Decimal(data.precioMayoreo)
              : null,
          imagenUrl: data.imagenUrl || null,
          stockActual: data.stockActual,
          stockMinimo: data.stockMinimo,
          permiteDecimales: data.permiteDecimales === true,
          esServicio: data.esServicio === true,
          codigoBarras: data.codigoBarras || null,
          ubicacionEstante: data.ubicacionEstante || null,
          proveedor: data.proveedor || null,
          tipoImpresion: data.tipoImpresion ?? null,
          fechaCaducidad: normalizarFechaCaducidad(data.fechaCaducidad),
          idCategoria:
            data.idCategoria != null && data.idCategoria !== ""
              ? await prisma.categoria
                  .findUnique({ where: { id: data.idCategoria } })
                  .then((c) => c?.id ?? null)
              : null,
        },
      });

      if (Number(producto.stockActual) > 0 && !producto.esServicio) {
        await registrarMovimientosKardex(tx, [
          {
            codigoItem: producto.codigoItem,
            tipo: "ENTRADA",
            cantidad: Number(producto.stockActual),
            motivo: "Inventario inicial (alta de producto)",
            idUsuario: user.idPersona,
          },
        ]);
      }

      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Alta de producto ${producto.codigoItem}`,
          moduloSistema: "INVENTARIO",
          jsonPayload: {
            codigoItem: producto.codigoItem,
            descripcion: producto.descripcion,
            precioUnitario: Number(producto.precioUnitario),
            stockActual: producto.stockActual,
          },
        },
      });

      return producto;
    });

    return NextResponse.json(
      {
        producto: {
          codigoItem: creado.codigoItem,
          descripcion: creado.descripcion,
          precioUnitario: Number(creado.precioUnitario),
          precioCompra: creado.precioCompra != null ? Number(creado.precioCompra) : null,
        precioMayoreo: creado.precioMayoreo != null ? Number(creado.precioMayoreo) : null,
        imagenUrl: creado.imagenUrl ?? null,
          stockActual: creado.stockActual,
          stockMinimo: creado.stockMinimo,
          permiteDecimales: creado.permiteDecimales,
          esServicio: creado.esServicio,
          idCategoria: creado.idCategoria,
          ubicacionEstante: creado.ubicacionEstante,
          proveedor: creado.proveedor,
          tipoImpresion: creado.tipoImpresion,
          codigoBarras: creado.codigoBarras,
          fechaCaducidad: creado.fechaCaducidad?.toISOString() ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "El código o código de barras ya existen" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Error al crear producto" },
      { status: 500 }
    );
  }
}
