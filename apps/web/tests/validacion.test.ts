import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  validar,
  validarCodigoPostal,
  validarCurp,
  validarEmail,
  validarRfc,
  validarTelefono,
  zDinero,
  zEntero,
  zRfcOpcional,
  zTelefonoOpcional,
  zTexto,
} from "@/lib/validacion";

// RFC de los certificados de prueba que publica el SAT (dígito verificador real).
const RFC_SAT = [
  "EKU9003173C9",
  "XIA190128J61",
  "CACX7605101P8",
  "FUNK671228PH6",
  "IAÑL750210963",
  "KICR630120NX3",
  "WATM640917J45",
];

describe("RFC", () => {
  it("acepta los RFC de prueba del SAT y los genéricos", () => {
    for (const r of [...RFC_SAT, "XAXX010101000", "XEXX010101000"]) expect(validarRfc(r).ok).toBe(true);
  });
  it("normaliza minúsculas, espacios y guiones", () => {
    expect(validarRfc(" eku-900317 3c9 ")).toEqual({ ok: true, valor: "EKU9003173C9" });
  });
  it("rechaza dígito verificador incorrecto", () => {
    const r = validarRfc("EKU9003173C8");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/verificador/);
  });
  it("rechaza fechas imposibles", () => {
    const r = validarRfc("GODE561331GR8");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fecha/);
  });
  it("rechaza longitudes y caracteres inválidos", () => {
    for (const r of ["", "ABC", "EKU9003173C9X", "EKU90031$3C9"]) expect(validarRfc(r).ok).toBe(false);
  });
});

describe("CURP", () => {
  it("acepta una CURP con dígito verificador correcto", () => {
    expect(validarCurp("hegg560427mvzrrl04")).toEqual({ ok: true, valor: "HEGG560427MVZRRL04" });
  });
  it("rechaza dígito verificador, entidad o fecha inválidos", () => {
    expect(validarCurp("HEGG560427MVZRRL05").ok).toBe(false);
    expect(validarCurp("HEGG560427MXXRRL04").ok).toBe(false);
    expect(validarCurp("HEGG561327MVZRRL04").ok).toBe(false);
  });
});

describe("contacto", () => {
  it("teléfono: 10 dígitos, admite formato y +52", () => {
    expect(validarTelefono("(55) 1234-5678")).toEqual({ ok: true, valor: "5512345678" });
    expect(validarTelefono("+52 55 1234 5678")).toEqual({ ok: true, valor: "5512345678" });
    expect(validarTelefono("12345").ok).toBe(false);
    expect(validarTelefono("55-1234-567a").ok).toBe(false);
  });
  it("correo y código postal", () => {
    expect(validarEmail("Ventas@Proveedor.MX")).toEqual({ ok: true, valor: "ventas@proveedor.mx" });
    expect(validarEmail("sin-arroba.com").ok).toBe(false);
    expect(validarCodigoPostal("06600").ok).toBe(true);
    expect(validarCodigoPostal("6600").ok).toBe(false);
  });
});

describe("esquemas reutilizables", () => {
  const esquema = z.object({
    nombre: zTexto("El nombre", 20),
    precio: zDinero("El precio"),
    dias: zEntero("Los días", 0, 365),
    rfc: zRfcOpcional,
    telefono: zTelefonoOpcional,
  });

  it("limpia y convierte valores válidos", () => {
    const r = validar(esquema, { nombre: "  Papelera   Sur ", precio: "$1,250.456", dias: "30", rfc: "", telefono: "55 1234 5678" });
    expect(r).toEqual({
      ok: true,
      datos: { nombre: "Papelera Sur", precio: 1250.46, dias: 30, rfc: null, telefono: "5512345678" },
    });
  });

  it("explica el primer error en español y por campo", () => {
    const r = validar(esquema, { nombre: "", precio: -1, dias: 3.5, rfc: "MALO", telefono: "1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("El nombre es obligatorio");
      expect(Object.keys(r.campos).sort()).toEqual(["dias", "nombre", "precio", "rfc", "telefono"]);
      expect(r.campos.dias).toMatch(/entero/);
    }
  });

  it("no acepta texto en campos numéricos", () => {
    const r = validar(esquema, { nombre: "A", precio: "doce", dias: "x" });
    expect(r.ok).toBe(false);
  });
});
