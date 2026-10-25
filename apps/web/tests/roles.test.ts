import { describe, expect, it } from "vitest";
import { MATRIZ_PERMISOS, nivelDe, RolError, validarGestion } from "@/lib/roles";

// ============================================================
// Fase F: tipos de usuario y quién puede tocar a quién.
// ============================================================

const dueno = { idPersona: "d", rol: "ADMINISTRADORA", isRoot: true, activa: true };
const admin = { idPersona: "a", rol: "ADMINISTRADORA", isRoot: false, activa: true };
const cajera = { idPersona: "c", rol: "CAJERA", isRoot: false, permisoInventario: false, permisoReportes: false };

const intenta = (actorId: string, actorEsDueno: boolean, objetivo: any, cambio: any) => () =>
  validarGestion({ actorId, actorEsDueno, objetivo, cambio });

describe("nivel de cada usuario", () => {
  it("dueño, administrador, encargado y cajero", () => {
    expect(nivelDe(dueno)).toBe("DUENO");
    expect(nivelDe(admin)).toBe("ADMIN");
    expect(nivelDe({ rol: "CAJERA", permisoInventario: true })).toBe("ENCARGADO");
    expect(nivelDe(cajera)).toBe("CAJERO");
  });

  it("solo el dueño maneja administradores, reinicia y transfiere", () => {
    for (const accion of ["Crear, degradar o quitar administradores", "Reiniciar o restaurar el sistema", "Transferir la propiedad del negocio"]) {
      expect(MATRIZ_PERMISOS.find((f) => f.accion === accion)?.niveles).toEqual(["DUENO"]);
    }
  });
});

describe("quién puede tocar a quién", () => {
  it("el dueño crea y maneja administradores", () => {
    expect(intenta("d", true, null, { rolNuevo: "ADMINISTRADORA" })).not.toThrow();
    expect(intenta("d", true, admin, { desactivar: true })).not.toThrow();
    expect(intenta("d", true, admin, { clave: true })).not.toThrow();
  });

  it("un administrador maneja cajeros pero no administradores", () => {
    expect(intenta("a", false, cajera, { desactivar: true })).not.toThrow();
    expect(intenta("a", false, null, { rolNuevo: "CAJERA" })).not.toThrow();
    expect(intenta("a", false, null, { rolNuevo: "ADMINISTRADORA" })).toThrow(RolError);
    expect(intenta("a", false, cajera, { rolNuevo: "ADMINISTRADORA" })).toThrow(/Solo el dueño/);
    expect(intenta("a", false, { ...admin, idPersona: "otro" }, { clave: true })).toThrow(RolError);
  });

  it("un administrador puede editar su propio nombre, no degradarse", () => {
    expect(intenta("a", false, admin, {})).not.toThrow();
    expect(intenta("a", false, admin, { rolNuevo: "CAJERA" })).toThrow(RolError);
  });

  it("nadie toca al dueño, y el dueño no se quita el rol sin transferir", () => {
    expect(intenta("a", false, dueno, { clave: true })).toThrow(/solo la modifica el propio/);
    expect(intenta("d", true, dueno, {})).not.toThrow();
    expect(intenta("d", true, dueno, { rolNuevo: "CAJERA" })).toThrow(/transfiere la propiedad/);
    expect(intenta("d", true, dueno, { desactivar: true })).toThrow(/transfiere la propiedad/);
  });
});
