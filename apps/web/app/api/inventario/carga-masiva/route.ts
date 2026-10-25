import { NextResponse } from "next/server";
import { Prisma } from "@papeleria/database";
import { parseExcelBuffer } from "@/lib/excel";
import { getSession } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import { tenantDb } from "@/lib/tenant";
import { moverStock, stockEnSucursal } from "@/lib/existencias";
import { registrarMovimientosKardex } from "@/lib/kardex";
import { claveProducto } from "@/lib/tenant-keys";
import { mapearColumnas, validarRenglon, type ErrorCarga, type ProductoCarga } from "@/lib/carga-masiva";

// ============================================================
// POST /api/inventario/carga-masiva (multipart: file=.xlsx|.csv)
// Alta o actualización de productos desde Excel. Las columnas se reconocen
// con sinónimos (lib/carga-masiva) y al ACTUALIZAR solo se tocan las que
// vienen en el archivo. La existencia es la de la sucursal activa.
// ============================================================

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tienePermiso(session, "inventario")) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  const prisma = tenantDb(session.idNegocio);

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Envía el archivo como formulario (multipart/form-data)" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
  const nombre = file.name.toLowerCase();
  if (![".xlsx", ".csv"].some((ext) => nombre.endsWith(ext))) {
    return NextResponse.json({ error: "Formato no soportado. Usa .xlsx o .csv" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo supera el límite de 10 MB" }, { status: 413 });

  let hoja: Awaited<ReturnType<typeof parseExcelBuffer>>;
  try {
    hoja = await parseExcelBuffer(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo leer el archivo: ${e.message}` }, { status: 400 });
  }
  const { headers, rows, sheetName } = hoja;

  const mapa = mapearColumnas(headers);
  const campos = new Set(Object.values(mapa));
  if (!campos.has("codigoItem") || !campos.has("descripcion") || !campos.has("precioUnitario")) {
    return NextResponse.json({
      totalRows: rows.length,
      successCount: 0,
      errorCount: 1,
      errors: [
        {
          row: 1,
          field: "headers",
          message: `Faltan columnas obligatorias (Código, Descripción, Precio de venta). Encabezados leídos: ${headers.join(", ")}. Descarga la plantilla para ver los nombres.`,
        },
      ],
    });
  }

  const productos: ProductoCarga[] = [];
  const errores: ErrorCarga[] = [];
  const vistos = new Set<string>();
  rows.forEach((row, i) => {
    const { errores: e, producto } = validarRenglon(row, mapa, i + 2);
    if (producto && vistos.has(producto.codigoItem)) {
      errores.push({ row: i + 2, field: "codigoItem", message: `Código repetido en el archivo: ${producto.codigoItem}` });
      return;
    }
    errores.push(...e);
    if (producto) {
      vistos.add(producto.codigoItem);
      productos.push(producto);
    }
  });

  let creados = 0;
  let actualizados = 0;
  if (productos.length > 0) {
    const idSucursal = session.idSucursal ?? null;
    const motivo = `Carga masiva Excel (${file.name})`.slice(0, 190);
    try {
      await prisma.$transaction(
        async (tx) => {
          // Categorías por nombre (sin distinguir mayúsculas); las nuevas se crean.
          const categorias = new Map<string, string>();
          for (const c of await tx.categoria.findMany({ select: { id: true, nombre: true } })) {
            categorias.set(c.nombre.toLowerCase(), c.id);
          }
          let orden = categorias.size;
          const idCategoria = async (n: string | null | undefined) => {
            if (!n) return null;
            const llave = n.toLowerCase();
            if (!categorias.has(llave)) {
              const nueva = await tx.categoria.create({ data: { nombre: n, orden: orden++ } });
              categorias.set(llave, nueva.id);
            }
            return categorias.get(llave)!;
          };

          for (const p of productos) {
            const previo = await tx.producto.findUnique({
              where: claveProducto(p.codigoItem),
              select: { stockActual: true, esServicio: true, usaLotes: true, usaSeries: true },
            });
            const datos: Prisma.ProductoUncheckedUpdateInput = {
              descripcion: p.descripcion,
              precioUnitario: p.precioUnitario,
              activo: true,
            };
            const opcionales = [
              "precioCompra", "stockMinimo", "permiteDecimales", "esServicio", "usaLotes", "usaSeries",
              "unidadVenta", "unidadCompra", "piezasPorUnidad", "codigoBarras", "ubicacionEstante",
              "proveedor", "fechaCaducidad",
            ] as const;
            for (const k of opcionales) if (p[k] !== undefined) (datos as any)[k] = p[k];
            if (p.escalasPrecio !== undefined) datos.escalasPrecio = p.escalasPrecio.length ? (p.escalasPrecio as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
            if (p.categoria !== undefined) datos.idCategoria = await idCategoria(p.categoria);

            if (!previo) {
              await tx.producto.create({
                data: { ...(datos as Prisma.ProductoUncheckedCreateInput), codigoItem: p.codigoItem, stockActual: 0 },
              });
              creados++;
            } else {
              await tx.producto.update({ where: claveProducto(p.codigoItem), data: datos });
              actualizados++;
            }

            // Existencia: solo si vino en el archivo y el producto la lleva "suelta".
            const esServicio = p.esServicio ?? previo?.esServicio ?? false;
            const conLotesOSeries = (p.usaLotes ?? previo?.usaLotes) || (p.usaSeries ?? previo?.usaSeries);
            if (p.stockActual === undefined || esServicio || conLotesOSeries) continue;
            const anterior = idSucursal
              ? (await stockEnSucursal(tx, idSucursal, [p.codigoItem])).get(p.codigoItem) ?? 0
              : Number(previo?.stockActual ?? 0);
            const delta = Math.round((p.stockActual - anterior) * 1000) / 1000;
            if (delta === 0) continue;
            await moverStock(tx, { codigoItem: p.codigoItem, delta, idSucursal });
            await registrarMovimientosKardex(tx, [
              { codigoItem: p.codigoItem, tipo: previo ? "AJUSTE" : "ENTRADA", cantidad: delta, motivo, idUsuario: session.idPersona, idSucursal },
            ]);
          }
        },
        { timeout: 120_000, maxWait: 10_000 }
      );
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json(
          { error: "Un código de barras del archivo ya pertenece a otro producto. Revisa la columna Código de barras." },
          { status: 409 }
        );
      }
      console.error("[carga-masiva]", e);
      return NextResponse.json({ error: "No se pudo guardar la carga masiva; no se aplicó ningún cambio" }, { status: 500 });
    }
  }

  await prisma.bitacoraLog.create({
    data: {
      idUsuario: session.idPersona,
      accion: `Carga masiva Excel: ${creados} nuevos, ${actualizados} actualizados, ${errores.length} errores`,
      moduloSistema: "CARGA_MASIVA",
      jsonPayload: {
        totalRows: rows.length,
        creados,
        actualizados,
        errorCount: errores.length,
        fileName: file.name,
        sheetName,
        columnas: Object.entries(mapa).map(([excel, campo]) => `${excel} -> ${campo}`),
      },
    },
  });

  return NextResponse.json({
    totalRows: rows.length,
    successCount: productos.length,
    creados,
    actualizados,
    errorCount: errores.length,
    errors: errores.slice(0, 50),
    columnasIgnoradas: headers.filter((h) => !(h in mapa)),
  });
}
