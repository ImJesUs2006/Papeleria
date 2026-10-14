import { describe, expect, it } from "vitest";
import {
  normalizarPersonalizacion,
  presetPorGiro,
  validarAtributos,
  validarCamposProducto,
} from "@/lib/personalizacion";
import { tienePermiso, puedeCobrar } from "@/lib/permisos";
import { validarPerfil, valoresDePerfil, PerfilError } from "@/lib/perfiles";

// ============================================================
// Paso 4: vocabulario y campos por giro, permisos de módulo y perfiles.
// ============================================================

describe("plantillas por giro", () => {
  it("farmacia habla de medicamentos y pacientes y trae sus campos", () => {
    const p = presetPorGiro("FARMACIA");
    expect(p.vocabulario).toMatchObject({ producto: "Medicamento", cliente: "Paciente" });
    expect(p.camposProducto.map((c) => c.clave)).toContain("sustancia");
    expect(p.usarTipoImpresion).toBe(false);
  });

  it("solo la papelería muestra el tipo de impresión", () => {
    expect(presetPorGiro("PAPELERIA_RETAIL").usarTipoImpresion).toBe(true);
    expect(presetPorGiro("BOUTIQUE").usarTipoImpresion).toBe(false);
  });

  it("lo guardado manda y lo que falta sale de la plantilla", () => {
    const p = normalizarPersonalizacion(
      { vocabulario: { cliente: "Socio" }, etiquetasRol: { CAJERA: "Vendedor" } },
      "FERRETERIA"
    );
    expect(p.vocabulario.cliente).toBe("Socio");
    expect(p.vocabulario.producto).toBe("Artículo");
    expect(p.etiquetasRol).toEqual({ ADMINISTRADORA: "Administrador(a)", CAJERA: "Vendedor" });
  });

  it("sin nada guardado devuelve la plantilla", () => {
    expect(normalizarPersonalizacion(null, "BOUTIQUE")).toEqual(presetPorGiro("BOUTIQUE"));
  });
});

describe("campos personalizados", () => {
  it("genera la clave desde el nombre y valida listas", () => {
    const campos = validarCamposProducto([
      { etiqueta: "Sustancia activa", tipo: "texto" },
      { etiqueta: "Receta", tipo: "lista", opciones: ["No", "Sí", "No"] },
    ]);
    expect(campos[0].clave).toBe("sustancia_activa");
    expect(campos[1].opciones).toEqual(["No", "Sí"]);
  });

  it("rechaza definiciones inválidas", () => {
    expect(() => validarCamposProducto([{ etiqueta: "x" }])).toThrow(/2 letras/);
    expect(() => validarCamposProducto([{ etiqueta: "Talla", tipo: "lista", opciones: ["M"] }])).toThrow(/2 opciones/);
    expect(() =>
      validarCamposProducto([{ etiqueta: "Marca" }, { etiqueta: "marca" }])
    ).toThrow(/repetido/);
    expect(() => validarCamposProducto(Array.from({ length: 9 }, (_, i) => ({ etiqueta: `Campo ${i}` })))).toThrow(/Máximo/);
  });

  it("valida los valores de un producto contra los campos", () => {
    const campos = validarCamposProducto([
      { etiqueta: "Marca" },
      { etiqueta: "Piezas", tipo: "numero" },
      { etiqueta: "Receta", tipo: "lista", opciones: ["No", "Sí"] },
    ]);
    expect(validarAtributos({ marca: " Bic ", piezas: "12", receta: "Sí", ajeno: "x" }, campos)).toEqual({
      marca: "Bic",
      piezas: 12,
      receta: "Sí",
    });
    expect(() => validarAtributos({ piezas: "doce" }, campos)).toThrow(/número/);
    expect(() => validarAtributos({ receta: "Tal vez" }, campos)).toThrow(/opción/);
  });
});

describe("permisos de módulo", () => {
  it("la administradora tiene todo aunque sus casillas estén apagadas", () => {
    const admin = { rol: "ADMINISTRADORA", permisoInventario: false, permisoReportes: false };
    expect(tienePermiso(admin, "inventario")).toBe(true);
    expect(tienePermiso(admin, "reportes")).toBe(true);
  });

  it("a la cajera inventario y reportes se le conceden explícitamente", () => {
    expect(tienePermiso({ rol: "CAJERA" }, "inventario")).toBe(false);
    expect(tienePermiso({ rol: "CAJERA", permisoInventario: true }, "inventario")).toBe(true);
    expect(tienePermiso({ rol: "CAJERA", permisoReportes: true }, "inventario")).toBe(false);
  });

  it("el cobro está activo salvo que se retire", () => {
    expect(tienePermiso({ rol: "CAJERA" }, "cobrar")).toBe(true);
    expect(puedeCobrar({ rol: "CAJERA", permisoCobrar: false })).toBe(false);
  });
});

describe("perfiles", () => {
  it("un perfil nuevo de caja cobra pero no entra a inventario ni reportes", () => {
    expect(validarPerfil({ nombre: "Vendedor de piso" })).toEqual({
      nombre: "Vendedor de piso",
      rolBase: "CAJERA",
      permisoCobrar: true,
      permisoInventario: false,
      permisoReportes: false,
    });
  });

  it("copia rol base y permisos al usuario", () => {
    expect(
      valoresDePerfil({
        nombre: "Almacén",
        rolBase: "CAJERA",
        permisoCobrar: false,
        permisoInventario: true,
        permisoReportes: false,
      })
    ).toEqual({ rol: "CAJERA", permisoCobrar: false, permisoInventario: true, permisoReportes: false });
  });

  it("valida nombre, rol y tipos", () => {
    expect(() => validarPerfil({ nombre: "A" })).toThrow(PerfilError);
    expect(() => validarPerfil({ nombre: "Gerente", rolBase: "DUEÑO" })).toThrow(/Rol base/);
    expect(() => validarPerfil({ permisoInventario: "sí" }, true)).toThrow(/inválido/);
    expect(validarPerfil({ permisoReportes: true }, true)).toEqual({ permisoReportes: true });
  });
});
