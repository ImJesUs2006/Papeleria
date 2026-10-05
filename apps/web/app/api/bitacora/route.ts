import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildExcelBuffer } from "@/lib/excel";
import { tenantDb } from "@/lib/tenant";

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
  const prisma = tenantDb(auth.user.idNegocio);

  try {
    const { searchParams } = new URL(request.url);
    const desdeParam = searchParams.get("desde");
    const hastaParam = searchParams.get("hasta");
    const modulo = searchParams.get("modulo");
    const usuarioParam = searchParams.get("usuario");
    const exportar = searchParams.get("export") === "xlsx";
    // Paginación estricta (Fase 11): nunca descargar el log completo.
    // Se aceptan dos estilos de URL: `?page=1&limit=50` (remoto por páginas)
    // y `?offset=0&limit=50` (carga incremental, retrocompatible).
    const limite = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const offset = searchParams.get("offset")
      ? Math.max(Number(searchParams.get("offset")) || 0, 0)
      : (page - 1) * limite;

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
    // Fase 11: búsqueda por usuario (nombre o username).
    if (usuarioParam && usuarioParam.trim().length >= 1) {
      const porUsuario = {
        usuario: {
          is: {
            OR: [
              { nombre: { contains: usuarioParam.trim(), mode: "insensitive" as const } },
              { username: { contains: usuarioParam.trim(), mode: "insensitive" as const } },
            ],
          },
        },
      };
      AND.push(porUsuario);
    }

    const [logs, total] = await Promise.all([
      prisma.bitacoraLog.findMany({
        where: { AND },
        orderBy: { fechaHora: "desc" },
        take: exportar ? 2000 : limite,
        skip: exportar ? 0 : offset,
        include: {
          usuario: { select: { nombre: true, username: true, rol: true } },
        },
      }),
      prisma.bitacoraLog.count({ where: { AND } }),
    ]);

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
      total,
      offset,
      limite,
      page,
      totalPaginas: Math.max(1, Math.ceil(total / limite)),
      tieneMas: offset + logs.length < total,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al consultar bitácora" },
      { status: 500 }
    );
  }
}