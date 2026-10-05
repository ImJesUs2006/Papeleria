import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";

    if (query.length < 2) {
      return NextResponse.json([]);
    }

    const productos = await prisma.producto.findMany({
      where: {
        activo: true,
        OR: [
          { codigoItem: { contains: query, mode: "insensitive" } },
          { descripcion: { contains: query, mode: "insensitive" } },
          { codigoBarras: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { descripcion: "asc" },
    });

    return NextResponse.json(
      productos.map((p) => ({
        codigoItem: p.codigoItem,
        descripcion: p.descripcion,
        precioUnitario: p.precioUnitario,
        precioMayoreo: p.precioMayoreo != null ? Number(p.precioMayoreo) : null,
        imagenUrl: p.imagenUrl ?? null,
        stockActual: p.stockActual,
        tipoImpresion: p.tipoImpresion,
        permiteDecimales: p.permiteDecimales,
        esServicio: p.esServicio,
      }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Error al buscar productos" },
      { status: 500 }
    );
  }
}
