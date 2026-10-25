import { describe, expect, it } from "vitest";
import { CLIENTE_SCHEMA, enmascarar, faltantesFiscales, perfilDeCompra } from "@/lib/clientes";
import { validar } from "@/lib/validacion";

describe("validación del cliente", () => {
  it("normaliza y acepta datos fiscales completos y congruentes", () => {
    const r = validar(CLIENTE_SCHEMA, {
      nombre: " Distribuidora  Escolar ",
      telefono: "55 1234 5678",
      email: "Compras@Escolar.MX",
      rfc: "eku9003173c9",
      razonSocial: "ESCUELA KEMPER URGATE",
      regimenFiscal: "601",
      codigoPostalFiscal: "06600",
      usoCfdi: "g03",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos).toMatchObject({
        nombre: "Distribuidora Escolar",
        telefono: "5512345678",
        email: "compras@escolar.mx",
        rfc: "EKU9003173C9",
        usoCfdi: "G03",
      });
    }
  });

  it("rechaza régimen de persona física con RFC de empresa", () => {
    const r = validar(CLIENTE_SCHEMA, { nombre: "Ana", rfc: "EKU9003173C9", regimenFiscal: "605" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.campos.regimenFiscal).toMatch(/persona física/);
  });

  it("rechaza claves que no están en el catálogo y CP inválido", () => {
    const r = validar(CLIENTE_SCHEMA, { nombre: "Ana", regimenFiscal: "651", usoCfdi: "P01", codigoPostalFiscal: "123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.campos).sort()).toEqual(["codigoPostalFiscal", "regimenFiscal", "usoCfdi"]);
  });

  it("lista lo que falta para poder facturar", () => {
    expect(faltantesFiscales({ rfc: "EKU9003173C9" })).toHaveLength(4);
    expect(
      faltantesFiscales({ rfc: "X", razonSocial: "Y", regimenFiscal: "601", codigoPostalFiscal: "06600", usoCfdi: "G03" })
    ).toEqual([]);
  });
});

describe("enmascarado", () => {
  it("oculta la parte central de teléfono, correo y RFC", () => {
    expect(enmascarar.telefono("5512345678")).toBe("55••••5678");
    expect(enmascarar.email("juana@correo.com")).toBe("ju•••@correo.com");
    expect(enmascarar.rfc("GODE561231GR8")).toBe("GOD•••••••GR8");
    expect(enmascarar.telefono(null)).toBeNull();
  });
});

describe("perfil de compra", () => {
  const dia = (d: number) => new Date(2026, 9, d, 12);
  it("estima la frecuencia (mediana) y la próxima visita", () => {
    const p = perfilDeCompra(
      [
        { fechaHora: dia(1), total: 100 },
        { fechaHora: dia(8), total: 200 },
        { fechaHora: dia(15), total: 300 },
        { fechaHora: dia(22), total: 400 },
      ],
      dia(28)
    );
    expect(p).toMatchObject({ visitas: 4, totalComprado: 1000, ticketPromedio: 250, frecuenciaDias: 7, estado: "POR_VOLVER" });
    expect(p.proximaVisita?.getDate()).toBe(29);
  });

  it("marca atrasado al cliente que no ha vuelto", () => {
    const p = perfilDeCompra(
      [
        { fechaHora: dia(1), total: 1 },
        { fechaHora: dia(3), total: 1 },
        { fechaHora: dia(5), total: 1 },
      ],
      dia(25)
    );
    expect(p.estado).toBe("ATRASADO");
  });

  it("con pocas compras no inventa frecuencia", () => {
    expect(perfilDeCompra([{ fechaHora: dia(1), total: 50 }], dia(2))).toMatchObject({ frecuenciaDias: null, estado: "AL_DIA" });
    expect(perfilDeCompra([], dia(2)).estado).toBe("NUEVO");
  });
});

describe("Fase E · domicilio fiscal del cliente con el mismo editor del negocio", () => {
  it("el editor y la ficha del cliente se traducen sin perder datos", async () => {
    const { clienteADatosFiscales, datosFiscalesACliente } = await import("@/lib/cliente-fiscal");
    const cliente = {
      rfc: "EKU9003173C9",
      razonSocial: "ESCUELA KEMPER URGATE",
      regimenFiscal: "601",
      usoCfdi: "G03",
      codigoPostalFiscal: "42501",
      calle: "Av. de las Pruebas",
      numExt: "100",
      numInt: null,
      colonia: "Centro",
      municipio: "Pachuca de Soto",
      estado: "Hidalgo",
    };
    const editor = clienteADatosFiscales(cliente);
    expect(editor).toMatchObject({ usoCFDI: "G03", cp: "42501", calle: "Av. de las Pruebas" });
    expect(datosFiscalesACliente(editor)).toEqual(cliente);
  });

  it("valida los campos del domicilio", async () => {
    const { CLIENTE_SCHEMA } = await import("@/lib/clientes");
    const { validar } = await import("@/lib/validacion");
    expect(validar(CLIENTE_SCHEMA, { nombre: "Ana", calle: "x".repeat(121) }).ok).toBe(false);
    expect(validar(CLIENTE_SCHEMA, { nombre: "Ana", numExt: "12345678901" }).ok).toBe(false);
    expect(validar(CLIENTE_SCHEMA, { nombre: "Ana", calle: "Reforma", numExt: "10", colonia: "Juárez", municipio: "Cuauhtémoc", estado: "CDMX" }).ok).toBe(true);
  });
});
