import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { Prisma } from "@prisma/client";

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
        stockActual: p.stockActual,
        stockMinimo: p.stockMinimo,
        ubicacionEstante: p.ubicacionEstante,
        proveedor: p.proveedor,
        tipoImpresion: p.tipoImpresion,
        codigoBarras: p.codigoBarras,
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
