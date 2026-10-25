import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken, VIGENCIA_ENLACE_MS } from "@/lib/recuperacion";
import { sesionAnteriorAlCambio } from "@/lib/auth";
import { correoValido } from "@/lib/correo";
import { contactoSoporte } from "@/lib/soporte";
import { avisoPrivacidad, datosResponsable, terminosCondiciones, VERSION_LEGAL } from "@/lib/legal";

vi.mock("@papeleria/database", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

afterEach(() => vi.unstubAllEnvs());

describe("recuperar la contraseña", () => {
  it("guarda solo el hash del token, siempre igual para el mismo token", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("el enlace vale una hora", () => {
    expect(VIGENCIA_ENLACE_MS).toBe(3_600_000);
  });
  it("un cambio de contraseña invalida las sesiones emitidas antes", () => {
    const cambio = new Date("2026-10-26T12:00:00Z");
    expect(sesionAnteriorAlCambio(Date.parse("2026-10-26T11:00:00Z") / 1000, cambio)).toBe(true);
    expect(sesionAnteriorAlCambio(Date.parse("2026-10-26T12:00:00Z") / 1000, cambio)).toBe(false);
    expect(sesionAnteriorAlCambio(Date.parse("2026-10-26T12:30:00Z") / 1000, cambio)).toBe(false);
    expect(sesionAnteriorAlCambio(undefined, cambio)).toBe(false);
    expect(sesionAnteriorAlCambio(123, null)).toBe(false);
  });
  it("valida el formato del correo", () => {
    expect(correoValido("ana@correo.com")).toBe(true);
    expect(correoValido("ana@correo")).toBe(false);
    expect(correoValido("ana correo@x.com")).toBe(false);
    expect(correoValido(5)).toBe(false);
  });
});

describe("contacto de soporte", () => {
  it("sin variables no muestra nada", () => {
    vi.stubEnv("SOPORTE_WHATSAPP", "");
    vi.stubEnv("SOPORTE_CORREO", "");
    expect(contactoSoporte()).toEqual({ whatsapp: null, correo: null, horario: null });
  });
  it("normaliza el WhatsApp a dígitos y descarta correos inválidos", () => {
    vi.stubEnv("SOPORTE_WHATSAPP", "+52 1 55 1234 5678");
    vi.stubEnv("SOPORTE_CORREO", "no-es-correo");
    vi.stubEnv("SOPORTE_HORARIO", "L a S 9-19 h");
    expect(contactoSoporte()).toEqual({ whatsapp: "5215512345678", correo: null, horario: "L a S 9-19 h" });
  });
});

describe("avisos legales", () => {
  it("la versión es una fecha", () => {
    expect(VERSION_LEGAL).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("usan los datos del responsable y su correo para derechos ARCO", () => {
    vi.stubEnv("LEGAL_RESPONSABLE", "Soluciones POS SA de CV");
    vi.stubEnv("LEGAL_CORREO", "privacidad@pos.mx");
    const r = datosResponsable();
    const aviso = JSON.stringify(avisoPrivacidad(r));
    expect(aviso).toContain("Soluciones POS SA de CV");
    expect(aviso).toContain("privacidad@pos.mx");
    expect(aviso).toMatch(/ARCO/);
    expect(JSON.stringify(terminosCondiciones(r))).toContain("Soluciones POS SA de CV");
  });
  it("sin datos del responsable usa un texto genérico (no se rompe)", () => {
    vi.stubEnv("LEGAL_RESPONSABLE", "");
    vi.stubEnv("LEGAL_CORREO", "");
    vi.stubEnv("SOPORTE_CORREO", "");
    const aviso = avisoPrivacidad(datosResponsable());
    expect(aviso.length).toBeGreaterThan(5);
    expect(JSON.stringify(aviso)).toContain("medios de contacto publicados");
  });
});
