import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { _interno, tenantDb } from "@/lib/tenant";
import { NegocioError, validarAltaNegocio } from "@/lib/negocios";

// ============================================================
// Multi-tenant: reglas del cliente con alcance de negocio y guardia
// estática para que ninguna ruta use el cliente global.
// (El aislamiento contra Postgres real se verifica con
//  `npm run verificar:aislamiento -w @papeleria/web`.)
// ============================================================

const { whereUnico, sellarData, modelos } = _interno;
const info = (m: string) => modelos().get(m)!;

describe("tenant · filtro único", () => {
  it("traduce el código de producto a la llave compuesta del negocio", () => {
    expect(whereUnico(info("Producto"), { codigoItem: "001" }, "neg-a")).toEqual({
      idNegocio_codigoItem: { idNegocio: "neg-a", codigoItem: "001" },
      idNegocio: "neg-a",
    });
  });

  it("traduce código de barras y username", () => {
    expect(whereUnico(info("Producto"), { codigoBarras: "750" }, "neg-a")).toMatchObject({
      idNegocio_codigoBarras: { idNegocio: "neg-a", codigoBarras: "750" },
    });
    expect(whereUnico(info("Usuario"), { username: "admin" }, "neg-a")).toMatchObject({
      idNegocio_username: { idNegocio: "neg-a", username: "admin" },
    });
  });

  it("conserva filtros extra y agrega el negocio a llaves uuid", () => {
    expect(
      whereUnico(info("Proveedor"), { idProveedor: "p1", activo: true }, "neg-a")
    ).toEqual({ idProveedor: "p1", activo: true, idNegocio: "neg-a" });
  });

  it("no deja colar el negocio de otro en una llave compuesta explícita", () => {
    const w = whereUnico(
      info("Producto"),
      { idNegocio_codigoItem: { idNegocio: "neg-b", codigoItem: "001" } },
      "neg-a"
    );
    expect(w.idNegocio_codigoItem.idNegocio).toBe("neg-a");
    expect(w.idNegocio).toBe("neg-a");
  });

  it("la configuración se resuelve por el negocio de la sesión", () => {
    expect(whereUnico(info("ConfiguracionNegocio"), {}, "neg-a")).toEqual({ idNegocio: "neg-a" });
  });
});

describe("tenant · sellado de escrituras", () => {
  it("sella idNegocio aunque el llamador mande otro", () => {
    expect(sellarData("Cliente", { nombre: "Ana", idNegocio: "neg-b" }, "neg-a")).toEqual({
      nombre: "Ana",
      idNegocio: "neg-a",
    });
  });

  it("sella las filas anidadas (líneas de devolución, items de pedido)", () => {
    const d = sellarData(
      "Devolucion",
      { folioVenta: "F-1", lineas: { create: [{ codigoItem: "001", cantidad: 1 }] } },
      "neg-a"
    );
    expect(d.idNegocio).toBe("neg-a");
    expect(d.lineas.create[0].idNegocio).toBe("neg-a");

    const p = sellarData(
      "PedidoProveedor",
      { idProveedor: "p1", items: { createMany: { data: [{ codigoItem: "001" }] } } },
      "neg-a"
    );
    expect(p.items.createMany.data[0].idNegocio).toBe("neg-a");
  });

  it("sella cada fila de un createMany", () => {
    const filas = sellarData("MovimientoKardex", [{ codigoItem: "1" }, { codigoItem: "2" }], "neg-a");
    expect(filas.every((f: any) => f.idNegocio === "neg-a")).toBe(true);
  });

  it("TODAS las tablas tienen idNegocio: ninguna queda fuera del alcance", () => {
    // Incluye `Negocio` (su llave es idNegocio): un negocio solo ve su propia fila.
    const sinDueno = [...modelos().entries()].filter(([, i]) => !i.esTenant).map(([n]) => n);
    expect(sinDueno).toEqual([]);
  });

  it("exige idNegocio", () => {
    expect(() => tenantDb("")).toThrow(/idNegocio/);
  });
});

describe("alta de negocios · validación", () => {
  const base = {
    codigo: "Papeleria-Centro",
    nombre: "Papelería Centro",
    admin: { nombre: "Ana", username: "admin", password: "secreto-123" },
  };

  it("normaliza el código a minúsculas", () => {
    expect(validarAltaNegocio(base).codigo).toBe("papeleria-centro");
  });

  it("rechaza códigos, usuarios y contraseñas inválidos", () => {
    expect(() => validarAltaNegocio({ ...base, codigo: "a b" })).toThrow(NegocioError);
    expect(() => validarAltaNegocio({ ...base, codigo: "ab" })).toThrow(NegocioError);
    expect(() =>
      validarAltaNegocio({ ...base, admin: { ...base.admin, username: "a" } })
    ).toThrow(NegocioError);
    expect(() =>
      validarAltaNegocio({ ...base, admin: { ...base.admin, password: "corta" } })
    ).toThrow(/8 caracteres/);
  });
});

// ---- Guardia estática ---------------------------------------------------

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.tsx?$/.test(n) ? [ruta] : [];
  });
}

describe("tenant · ninguna ruta usa el cliente global", () => {
  const raiz = join(__dirname, "..");
  // Únicos puntos previos a (o por encima de) la sesión de un negocio.
  const PERMITIDOS = new Set(
    [
      "app/api/auth/login/route.ts",
      "app/api/negocios/route.ts",
      "lib/auth.ts",
      "lib/tenant.ts",
    ].map((p) => p.split("/").join(sep))
  );
  const IMPORTA_GLOBAL =
    /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*"@papeleria\/database"|import\("@papeleria\/database"\)/;

  it("solo login, alta de negocios, sesión y tenant importan `prisma`", () => {
    const infractores = [...archivos(join(raiz, "app")), ...archivos(join(raiz, "lib"))]
      .map((f) => relative(raiz, f))
      .filter((f) => !PERMITIDOS.has(f))
      .filter((f) => IMPORTA_GLOBAL.test(readFileSync(join(raiz, f), "utf8")));
    expect(infractores).toEqual([]);
  });
});
