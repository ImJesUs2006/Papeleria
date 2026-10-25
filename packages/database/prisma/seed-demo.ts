import type { PrismaClient } from "@prisma/client";

// ============================================================
// Datos de DEMOSTRACIÓN (Fase D): un producto de cada tipo y clientes con
// datos fiscales FICTICIOS (RFC de prueba que publica el SAT) para probar
// mayoreo, paquetes, granel, servicios, lotes, series, variantes y la
// facturación. Idempotente: si ya existen, no se duplican ni se pisan.
// Códigos DEMO-*; se pueden quitar desde Inventario.
// ============================================================

const DIA = 86_400_000;

interface ProductoDemo {
  codigoItem: string;
  descripcion: string;
  categoria: string;
  precioUnitario: number;
  precioCompra?: number;
  stock?: number;
  escalasPrecio?: Array<{ desde: number; precio: number; nombre?: string }>;
  unidadCompra?: string;
  piezasPorUnidad?: number;
  permiteDecimales?: boolean;
  unidadVenta?: string;
  esServicio?: boolean;
  usaLotes?: boolean;
  usaSeries?: boolean;
  lotes?: Array<{ numeroLote: string; dias: number; cantidad: number }>;
  series?: string[];
}

const PRODUCTOS: ProductoDemo[] = [
  {
    codigoItem: "DEMO-CUAD",
    descripcion: "Cuaderno profesional 100 hojas (demo mayoreo)",
    categoria: "Escolar",
    precioUnitario: 45,
    precioCompra: 30,
    stock: 60,
    escalasPrecio: [
      { desde: 12, precio: 40, nombre: "Docena" },
      { desde: 50, precio: 36, nombre: "Caja" },
    ],
  },
  {
    codigoItem: "DEMO-PAPAS",
    descripcion: "Papas fritas 45 g (demo paquete de 24)",
    categoria: "Botanas",
    precioUnitario: 22,
    precioCompra: 15,
    stock: 48,
    unidadCompra: "Paquete",
    piezasPorUnidad: 24,
    escalasPrecio: [{ desde: 12, precio: 20, nombre: "Mayoreo" }],
  },
  {
    codigoItem: "DEMO-LISTON",
    descripcion: "Listón satinado 1 cm (demo granel por metro)",
    categoria: "Mercería",
    precioUnitario: 6,
    precioCompra: 2.5,
    stock: 120.5,
    permiteDecimales: true,
    unidadVenta: "m",
  },
  {
    codigoItem: "DEMO-COPIA",
    descripcion: "Copia blanco y negro (demo servicio)",
    categoria: "Servicios",
    precioUnitario: 1.5,
    esServicio: true,
  },
  {
    codigoItem: "DEMO-PEGA",
    descripcion: "Pegamento blanco 250 ml (demo lotes)",
    categoria: "Escolar",
    precioUnitario: 28,
    precioCompra: 18,
    usaLotes: true,
    lotes: [
      { numeroLote: "L-DEMO-01", dias: 20, cantidad: 10 },
      { numeroLote: "L-DEMO-02", dias: 200, cantidad: 25 },
    ],
  },
  {
    codigoItem: "DEMO-CALC",
    descripcion: "Calculadora científica (demo series)",
    categoria: "Electrónica",
    precioUnitario: 350,
    precioCompra: 240,
    usaSeries: true,
    series: ["CALC-DEMO-0001", "CALC-DEMO-0002", "CALC-DEMO-0003", "CALC-DEMO-0004", "CALC-DEMO-0005"],
  },
  {
    codigoItem: "DEMO-PLAY",
    descripcion: "Playera escolar (demo variantes)",
    categoria: "Uniformes",
    precioUnitario: 120,
    precioCompra: 70,
  },
];

const TALLAS = ["CH", "M", "G"];
const COLORES = ["Blanco", "Azul"];

export async function sembrarDemo(
  prisma: PrismaClient,
  ctx: { idNegocio: string; idSucursal: string; idUsuario: string }
) {
  const { idNegocio, idSucursal, idUsuario } = ctx;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // Categorías por nombre.
  const categorias = new Map<string, string>();
  for (const nombre of [...new Set(PRODUCTOS.map((p) => p.categoria))]) {
    const existente = await prisma.categoria.findFirst({ where: { idNegocio, nombre } });
    const c = existente ?? (await prisma.categoria.create({ data: { idNegocio, nombre } }));
    categorias.set(nombre, c.id);
  }

  const entrada = async (codigoItem: string, cantidad: number, motivo: string) => {
    if (cantidad <= 0) return;
    await prisma.existencia.upsert({
      where: { idSucursal_codigoItem: { idSucursal, codigoItem } },
      update: { stock: { increment: cantidad } },
      create: { idNegocio, idSucursal, codigoItem, stock: cantidad },
    });
    await prisma.producto.update({
      where: { idNegocio_codigoItem: { idNegocio, codigoItem } },
      data: { stockActual: { increment: cantidad } },
    });
    await prisma.movimientoKardex.create({
      data: { idNegocio, codigoItem, cantidadCambio: cantidad, tipo: "ENTRADA", motivo, idUsuario, idSucursal },
    });
  };

  let creados = 0;
  for (const p of PRODUCTOS) {
    const llave = { idNegocio_codigoItem: { idNegocio, codigoItem: p.codigoItem } };
    if (await prisma.producto.findUnique({ where: llave })) continue;
    await prisma.producto.create({
      data: {
        idNegocio,
        codigoItem: p.codigoItem,
        descripcion: p.descripcion,
        precioUnitario: p.precioUnitario,
        precioCompra: p.precioCompra ?? null,
        costoPromedio: p.precioCompra ?? null,
        escalasPrecio: p.escalasPrecio ?? undefined,
        unidadCompra: p.unidadCompra ?? null,
        piezasPorUnidad: p.piezasPorUnidad ?? 1,
        permiteDecimales: p.permiteDecimales ?? false,
        unidadVenta: p.unidadVenta ?? null,
        esServicio: p.esServicio ?? false,
        usaLotes: p.usaLotes ?? false,
        usaSeries: p.usaSeries ?? false,
        grupoVariante: p.codigoItem === "DEMO-PLAY" ? "DEMO-PLAY" : null,
        stockActual: 0,
        stockMinimo: p.esServicio ? 0 : p.usaSeries ? 1 : 5,
        idCategoria: categorias.get(p.categoria),
      },
    });
    creados++;
    if (p.stock) await entrada(p.codigoItem, p.stock, "Semilla de demostración");
    for (const l of p.lotes ?? []) {
      await prisma.lote.create({
        data: {
          idNegocio,
          idSucursal,
          codigoItem: p.codigoItem,
          numeroLote: l.numeroLote,
          caducidad: new Date(hoy.getTime() + l.dias * DIA),
          cantidad: l.cantidad,
        },
      });
      await entrada(p.codigoItem, l.cantidad, `Semilla de demostración · lote ${l.numeroLote}`);
    }
    if (p.series?.length) {
      await prisma.numeroSerie.createMany({
        data: p.series.map((serie) => ({ idNegocio, idSucursal, codigoItem: p.codigoItem, serie })),
      });
      await entrada(p.codigoItem, p.series.length, "Semilla de demostración · series");
    }
  }

  // Variantes de la playera: talla × color, 4 piezas de cada una.
  const modelo = PRODUCTOS.find((p) => p.codigoItem === "DEMO-PLAY")!;
  for (const talla of TALLAS) {
    for (const color of COLORES) {
      const codigoItem = `DEMO-PLAY-${talla}-${color.toUpperCase()}`;
      if (await prisma.producto.findUnique({ where: { idNegocio_codigoItem: { idNegocio, codigoItem } } })) continue;
      await prisma.producto.create({
        data: {
          idNegocio,
          codigoItem,
          descripcion: `Playera escolar · ${talla} · ${color}`,
          precioUnitario: modelo.precioUnitario,
          precioCompra: modelo.precioCompra,
          costoPromedio: modelo.precioCompra,
          grupoVariante: "DEMO-PLAY",
          atributosVariante: { Talla: talla, Color: color },
          stockActual: 0,
          stockMinimo: 2,
          idCategoria: categorias.get(modelo.categoria),
        },
      });
      creados++;
      await entrada(codigoItem, 4, "Semilla de demostración · variante");
    }
  }

  // Clientes con datos fiscales FICTICIOS (RFC de prueba del SAT).
  const clientes = [
    {
      nombre: "Escuela Kemper Urgate (demo fiscal)",
      telefono: "5512345678",
      email: "facturacion@ejemplo.com",
      rfc: "EKU9003173C9",
      razonSocial: "ESCUELA KEMPER URGATE",
      regimenFiscal: "601",
      codigoPostalFiscal: "42501",
      usoCfdi: "G03",
      notas: "Cliente de demostración con datos fiscales ficticios para probar facturación.",
      puntosFidelidad: 0,
    },
    {
      nombre: "Xochitl Casas Chavez (demo puntos)",
      telefono: "5598765432",
      email: "xochitl@ejemplo.com",
      rfc: "CACX7605101P8",
      razonSocial: "XOCHITL CASAS CHAVEZ",
      regimenFiscal: "612",
      codigoPostalFiscal: "10740",
      usoCfdi: "G01",
      notas: "Persona física de demostración con 150 puntos para probar el monedero.",
      puntosFidelidad: 150,
    },
  ];
  for (const c of clientes) {
    const existe = await prisma.cliente.findFirst({ where: { idNegocio, rfc: c.rfc } });
    if (!existe) await prisma.cliente.create({ data: { idNegocio, ...c } });
  }

  return { productos: creados, clientes: clientes.length };
}
