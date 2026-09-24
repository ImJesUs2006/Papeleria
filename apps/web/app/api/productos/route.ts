import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import {
  validateProductoInput,
  sanitizeText,
  IMAGEN_MIMES_PERMITIDOS,
  IMAGEN_BASE64_MAX,
} from "@/lib/validate-product";

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
        precioCompra: p.precioCompra != null ? Number(p.precioCompra) : null,
        stockActual: p.stockActual,
        stockMinimo: p.stockMinimo,
        ubicacionEstante: p.ubicacionEstante,
        proveedor: p.proveedor,
        tipoImpresion: p.tipoImpresion,
        codigoBarras: p.codigoBarras,
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

  // Normaliza la imagen (acepta data URL o base64 crudo).
  let imagenMime: string | null = null;
  let imagenBase64: string | null = null;
  if (data.imagenBase64) {
    let base64: string = data.imagenBase64;
    let mime: string | null = data.imagenMime ?? null;
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mime = match[1];
      base64 = match[2];
    }
    if (!mime || !(IMAGEN_MIMES_PERMITIDOS as readonly string[]).includes(mime)) {
      return NextResponse.json(
        { error: "Formato de imagen no permitido (png, jpg, webp)" },
        { status: 400 }
      );
    }
    if (base64.length > IMAGEN_BASE64_MAX) {
      return NextResponse.json(
        { error: "Imagen demasiado grande (máx ~2 MB)" },
        { status: 413 }
      );
    }
    imagenMime = mime;
    imagenBase64 = base64;
  }

  try {
    const existente = await prisma.producto.findUnique({
      where: { codigoItem: data.codigoItem },
    });
    if (existente) {
      return NextResponse.json(
        { error: `Ya existe un producto con el código ${data.codigoItem}` },
        { status: 409 }
      );
    }

    if (data.codigoBarras) {
      const dupBarras = await prisma.producto.findUnique({
        where: { codigoBarras: data.codigoBarras },
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
          stockActual: data.stockActual,
          stockMinimo: data.stockMinimo,
          codigoBarras: data.codigoBarras || null,
          ubicacionEstante: data.ubicacionEstante || null,
          proveedor: data.proveedor || null,
          tipoImpresion: data.tipoImpresion ?? null,
          imagenMime,
          imagenBase64,
        },
      });

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
        codigoItem: creado.codigoItem,
        descripcion: creado.descripcion,
        precioUnitario: Number(creado.precioUnitario),
        precioCompra: creado.precioCompra != null ? Number(creado.precioCompra) : null,
        stockActual: creado.stockActual,
        stockMinimo: creado.stockMinimo,
        ubicacionEstante: creado.ubicacionEstante,
        proveedor: creado.proveedor,
        tipoImpresion: creado.tipoImpresion,
        codigoBarras: creado.codigoBarras,
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
