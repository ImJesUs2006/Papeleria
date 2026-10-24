import type { Prisma } from "@papeleria/database";
import type { TipoNegocio } from "./business-types";
import { CATALOGOS_EJEMPLO } from "./catalogos-ejemplo";
import { moverStock } from "./existencias";
import { registrarMovimientosKardex } from "./kardex";
import { registrarEntradaLote } from "./lotes";
import { validarEscalas } from "./precios";
import { claveProducto } from "./tenant-keys";

type Tx = Prisma.TransactionClient;

/**
 * Carga el catálogo de ejemplo del giro en el negocio (`tx` con alcance de
 * negocio). Es idempotente: no duplica categorías (mismo nombre) ni
 * productos (mismo código). Devuelve cuánto creó.
 */
export async function cargarCatalogoEjemplo(
  tx: Tx,
  tipo: TipoNegocio,
  ctx: { idUsuario: string; idSucursal: string | null }
) {
  const catalogo = CATALOGOS_EJEMPLO[tipo];
  if (!catalogo) return { categorias: 0, productos: 0 };

  const idsCategoria = new Map<string, string>();
  let categoriasCreadas = 0;
  let orden = (await tx.categoria.findFirst({ orderBy: { orden: "desc" }, select: { orden: true } }))?.orden ?? 0;
  for (const c of catalogo.categorias) {
    const existe = await tx.categoria.findFirst({
      where: { nombre: { equals: c.nombre, mode: "insensitive" } },
      select: { id: true },
    });
    if (existe) {
      idsCategoria.set(c.nombre, existe.id);
      continue;
    }
    const creada = await tx.categoria.create({ data: { nombre: c.nombre, color: c.color, orden: ++orden } });
    idsCategoria.set(c.nombre, creada.id);
    categoriasCreadas++;
  }

  let productosCreados = 0;
  const hoy = new Date();
  for (const p of catalogo.productos) {
    const existe = await tx.producto.findUnique({ where: claveProducto(p.codigo), select: { codigoItem: true } });
    if (existe) continue;
    const escalas = p.escalas ? validarEscalas(p.escalas, p.precio) : [];
    await tx.producto.create({
      data: {
        codigoItem: p.codigo,
        descripcion: p.descripcion,
        precioUnitario: p.precio,
        precioCompra: p.costo > 0 ? p.costo : null,
        costoPromedio: p.costo > 0 ? p.costo : null,
        stockActual: 0,
        stockMinimo: p.minimo,
        esServicio: p.esServicio === true,
        permiteDecimales: p.permiteDecimales === true,
        usaLotes: p.usaLotes === true,
        exentoIva: p.exentoIva === true,
        idCategoria: idsCategoria.get(p.categoria) ?? null,
        ...(escalas.length ? { escalasPrecio: escalas as any } : {}),
        ...(p.atributos ? { atributos: p.atributos } : {}),
      },
    });
    productosCreados++;

    if (p.esServicio || p.stock <= 0) continue;
    if (p.usaLotes && ctx.idSucursal) {
      const caducidad = new Date(hoy);
      caducidad.setDate(caducidad.getDate() + (p.caducidadDias ?? 180));
      await registrarEntradaLote(tx, {
        codigoItem: p.codigo,
        idSucursal: ctx.idSucursal,
        numeroLote: "EJ-001",
        caducidad,
        cantidad: p.stock,
        idUsuario: ctx.idUsuario,
      });
    } else {
      await moverStock(tx, { codigoItem: p.codigo, delta: p.stock, idSucursal: ctx.idSucursal });
      await registrarMovimientosKardex(tx, [
        {
          codigoItem: p.codigo,
          tipo: "ENTRADA",
          cantidad: p.stock,
          motivo: "Catálogo de ejemplo",
          idUsuario: ctx.idUsuario,
          idSucursal: ctx.idSucursal,
        },
      ]);
    }
  }

  return { categorias: categoriasCreadas, productos: productosCreados };
}
