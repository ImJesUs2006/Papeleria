import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { claveValida, registrarPlataforma, requirePlataforma } from "@/lib/plataforma";
import { fechaCorte, libroRespaldo, mesesValidos } from "@/lib/bitacora-purga";
import { esObjetoJson } from "@/lib/validacion";

// POST /api/plataforma/bitacora/purgar { clave, meses } → purga la bitácora
// de la consola anterior a N meses, con respaldo en Excel y constancia.
// Pide otra vez la clave de plataforma: es irreversible.
export async function POST(request: Request) {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : null), () => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  if (!claveValida(body.clave)) return NextResponse.json({ error: "Clave de plataforma incorrecta" }, { status: 401 });
  const meses = mesesValidos(body.meses);
  const corte = fechaCorte(meses);

  const [antiguos, negocios] = await Promise.all([
    prisma.plataformaLog.findMany({ where: { fecha: { lt: corte } }, orderBy: { fecha: "asc" }, take: 50000 }),
    prisma.negocio.findMany({ select: { idNegocio: true, codigo: true } }),
  ]);
  if (antiguos.length === 0) return NextResponse.json({ ok: true, purgados: 0 });

  const codigo = new Map(negocios.map((n) => [n.idNegocio, n.codigo]));
  const respaldo = await libroRespaldo(
    `Bitácora de la consola · respaldo previo a la purga (${new Date().toLocaleDateString("es-MX")})`,
    antiguos.map((r) => ({
      fecha: r.fecha,
      negocio: r.idNegocio ? codigo.get(r.idNegocio) ?? r.idNegocio : null,
      accion: r.accion,
      detalle: r.detalle ? JSON.stringify(r.detalle).slice(0, 500) : null,
    })),
    corte
  );
  const { count } = await prisma.plataformaLog.deleteMany({ where: { id: { in: antiguos.map((r) => r.id) } } });
  await registrarPlataforma(`Purga de la bitácora de la consola: ${count} registros de hace más de ${meses} ${meses === 1 ? "mes" : "meses"}`);
  return NextResponse.json({
    ok: true,
    purgados: count,
    respaldoXlsx: respaldo.toString("base64"),
    archivo: `respaldo-consola-${new Date().toISOString().slice(0, 10)}.xlsx`,
  });
}
