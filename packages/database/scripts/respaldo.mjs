// ============================================================
// npm run db:respaldo
//
// Respaldo completo de la base (todos los negocios) con pg_dump en formato
// comprimido (.dump), y rotación: conserva los N más recientes.
//   RESPALDOS_DIR        carpeta destino (por defecto <repo>/backups)
//   RESPALDOS_CONSERVAR  cuántos guardar (por defecto 14)
//   PG_CONTENEDOR        si no hay pg_dump instalado, usa el de este
//                        contenedor de Docker (por defecto papeleria-db)
// Programarlo una vez al día (Programador de tareas de Windows o cron) y,
// de preferencia, que RESPALDOS_DIR sea una carpeta sincronizada en la nube.
// Restaurar:  pg_restore --clean --if-exists -d "<DATABASE_URL>" archivo.dump
// ============================================================
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function leerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const archivo of [join(raiz, "packages", "database", ".env"), join(raiz, "apps", "web", ".env")]) {
    if (!existsSync(archivo)) continue;
    const linea = readFileSync(archivo, "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
    if (linea) return linea.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  }
  throw new Error("No encontré DATABASE_URL (variable de entorno o .env)");
}

const url = new URL(leerDatabaseUrl());
const baseDatos = url.pathname.replace(/^\//, "").split("?")[0];
const destino = process.env.RESPALDOS_DIR || join(raiz, "backups");
const conservar = Math.max(1, Number(process.env.RESPALDOS_CONSERVAR) || 14);
mkdirSync(destino, { recursive: true });

const d = new Date();
const dos = (x) => String(x).padStart(2, "0");
// Hora local del servidor: AAAAMMDD-HHMM.
const sello = `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`;
const archivo = join(destino, `respaldo-${baseDatos}-${sello}.dump`);

// pg_dump instalado → se usa directo; si no, el del contenedor de Docker.
const tienePgDump = spawnSync("pg_dump --version", { stdio: "ignore", shell: true }).status === 0;
const contenedor = process.env.PG_CONTENEDOR || "papeleria-db";
const usuario = decodeURIComponent(url.username);
const args = tienePgDump
  ? ["pg_dump", ["--format=custom", "--no-owner", "--dbname", url.toString()]]
  : ["docker", ["exec", "-e", `PGPASSWORD=${decodeURIComponent(url.password)}`, contenedor, "pg_dump", "--format=custom", "--no-owner", "-U", usuario, "-d", baseDatos]];

console.log(`Respaldando ${baseDatos} con ${tienePgDump ? "pg_dump" : `pg_dump del contenedor ${contenedor}`}…`);
const r = spawnSync(args[0], args[1], { maxBuffer: 1024 * 1024 * 1024, encoding: "buffer" });
if (r.status !== 0 || !r.stdout?.length) {
  console.error("✗ El respaldo falló:", r.error?.message ?? r.stderr?.toString().trim());
  process.exit(1);
}
await new Promise((ok, mal) => {
  const s = createWriteStream(archivo);
  s.on("finish", ok).on("error", mal);
  s.end(r.stdout);
});
console.log(`✓ ${archivo} (${(r.stdout.length / 1024 / 1024).toFixed(2)} MB)`);

// Rotación: borra los más viejos de esta base.
const propios = readdirSync(destino)
  .filter((f) => f.startsWith(`respaldo-${baseDatos}-`) && f.endsWith(".dump"))
  .map((f) => ({ f, t: statSync(join(destino, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const { f } of propios.slice(conservar)) {
  unlinkSync(join(destino, f));
  console.log(`  borrado por rotación: ${f}`);
}
console.log(`Se conservan ${Math.min(propios.length, conservar)} respaldo(s) en ${destino}`);
