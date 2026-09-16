import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { buildExcelBuffer } from "@/lib/excel";

const MODULOS_VALIDOS = [
  "PUNTO_VENTA",
  "INVENTARIO",
  "CAJA",
  "REPORTES",
  "CONFIGURACION",
  "BITACORA",
  "CARGA_MASIVA",
  "SYNC",
  "SETUP",
  "SEGURIDAD",
];

function parseFecha(valor: string): Date {
  const d = new Date(valor);
  if (isNaN(d.getTime())) return new Date(0);
  return d;
}

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const desdeParam = searchParams.get("desde");
    const hastaParam = searchParams.get("hasta");
    const modulo = searchParams.get("modulo");
    const exportar = searchParams.get("export") === "xlsx";

    const AND: any[] = [];

    if (desdeParam) {
      const inicio = parseFecha(desdeParam);
      if (desdeParam.length <= 10) inicio.setHours(0, 0, 0, 0);
      AND.push({ fechaHora: { gte: inicio } });
    }
    if (hastaParam) {
      const fin = parseFecha(hastaParam);
      if (hastaParam.length <= 10) fin.setHours(23, 59, 59, 999);
      AND.push({ fechaHora: { lte: fin } });
    }
    if (modulo && MODULOS_VALIDOS.includes(modulo)) {
      AND.push({ moduloSistema: modulo as any });
    }

    const logs = await prisma.bitacoraLog.findMany({
      where: { AND },
      orderBy: { fechaHora: "desc" },
      take: exportar ? 2000 : 100,
      include: {
        usuario: { select: { nombre: true, username: true, rol: true } },
      },
    });

    if (exportar) {
      const headers = [
        "Fecha",
        "Hora",
        "Módulo",
        "Acción",
        "Usuario",
        "Rol",
        "Detalle",
        "IP Origen",
      ];
      const data = logs.map((log) => [
        log.fechaHora.toLocaleDateString("es-MX"),
        log.fechaHora.toLocaleTimeString("es-MX"),
        log.moduloSistema,
        log.accion,
        log.usuario?.nombre ?? "Sistema",
        log.usuario?.rol ?? "-",
        log.jsonPayload ? JSON.stringify(log.jsonPayload) : log.detallesError ?? "",
        log.ipOrigen ?? "",
      ]);

      const buffer = await buildExcelBuffer(headers, data, "Bitacora");
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bitacora-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      data: logs.map((log) => ({
        idLog: log.idLog,
        fechaHora: log.fechaHora.toISOString(),
        moduloSistema: log.moduloSistema,
        accion: log.accion,
        usuario: log.usuario?.nombre ?? null,
        username: log.usuario?.username ?? null,
        rol: log.usuario?.rol ?? null,
        jsonPayload: log.jsonPayload,
        detallesError: log.detallesError,
        ipOrigen: log.ipOrigen,
      })),
      total: logs.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al consultar bitácora" },
      { status: 500 }
    );
  }
}