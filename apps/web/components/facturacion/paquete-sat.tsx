"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { notificar } from "@/store/notificaciones";
import type { PaqueteFactura } from "@/lib/factura-manual";
import { cn } from "@/lib/utils";
import { confirmar } from "@/store/dialogo";

interface Respuesta {
  factura: {
    idFactura: string;
    folio: string;
    folioVenta: string;
    estado: "PENDIENTE" | "EMITIDA" | "CANCELADA";
    folioFiscal: string | null;
    fechaTimbrado: string | null;
  };
  paquete: PaqueteFactura;
  portal: string;
}

const dinero = (n: number) => `$${n.toFixed(2)}`;

function Copiable({ etiqueta, valor }: { etiqueta: string; valor: string | number | null | undefined }) {
  const [copiado, setCopiado] = useState(false);
  const texto = valor == null || valor === "" ? "—" : String(valor);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto.split(" · ")[0]);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1200);
    } catch {
      notificar.error("No se pudo copiar");
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-700/60 px-3 py-1.5">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{etiqueta}</p>
        <p className="break-anywhere text-sm font-semibold text-gray-100">{texto}</p>
      </div>
      {texto !== "—" && (
        <button
          type="button"
          onClick={copiar}
          aria-label={`Copiar ${etiqueta}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-surface-500 text-muted hover:text-gray-100"
        >
          {copiado ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

/**
 * Datos de la factura listos para capturarse en el portal gratuito del SAT
 * (copiar campo por campo) y registro del folio fiscal al timbrarla.
 */
export function PaqueteSat({
  idFactura,
  onClose,
  onCambio,
}: {
  idFactura: string | null;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [uuid, setUuid] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    if (!idFactura) return;
    setDatos(null);
    const res = await fetch(`/api/facturas/${idFactura}`, { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      notificar.error("No se pudo abrir la factura", d.error);
      onClose();
      return;
    }
    setDatos(d);
  }, [idFactura, onClose]);

  useEffect(() => {
    setUuid("");
    cargar();
  }, [cargar]);

  const enviar = async (cuerpo: object, exito: string) => {
    if (!idFactura) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/facturas/${idFactura}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo guardar");
      notificar.exito(exito);
      onCambio();
      await cargar();
    } catch (e: any) {
      notificar.error(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const f = datos?.factura;
  const p = datos?.paquete;

  return (
    <Modal
      open={idFactura !== null}
      onClose={onClose}
      title={f ? `Factura ${f.folio}` : "Factura"}
      subtitle={f ? `Ticket ${f.folioVenta}` : undefined}
      className="max-w-3xl"
    >
      {!datos || !p || !f ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparando datos…
        </p>
      ) : (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {f.estado === "EMITIDA" ? (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> Timbrada · folio fiscal {f.folioFiscal}
            </p>
          ) : f.estado === "CANCELADA" ? (
            <p className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-300">
              <XCircle className="h-4 w-4" /> Cancelada
            </p>
          ) : (
            <ol className="grid gap-2 text-xs text-gray-200 sm:grid-cols-3">
              {[
                "Abre el portal del SAT e inicia sesión con tu e.firma o contraseña.",
                "Captura los datos de abajo (botón de copiar en cada uno).",
                "Al timbrar, pega aquí el folio fiscal (UUID) que te da el SAT.",
              ].map((t, i) => (
                <li key={i} className="rounded-xl border border-surface-600 p-2">
                  <b>{i + 1}.</b> {t}
                </li>
              ))}
            </ol>
          )}

          <section>
            <h4 className="mb-2 text-xs font-black uppercase tracking-wider text-muted">Emisor (tu negocio)</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <Copiable etiqueta="RFC" valor={p.emisor.rfc} />
              <Copiable etiqueta="Razón social" valor={p.emisor.razonSocial} />
              <Copiable etiqueta="Régimen fiscal" valor={p.emisor.regimenFiscal} />
              <Copiable etiqueta="Lugar de expedición (C.P.)" valor={p.emisor.lugarExpedicion} />
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-black uppercase tracking-wider text-muted">Receptor (cliente)</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <Copiable etiqueta="RFC" valor={p.receptor.rfc} />
              <Copiable etiqueta="Nombre / razón social" valor={p.receptor.razonSocial} />
              <Copiable etiqueta="Régimen fiscal" valor={p.receptor.regimenFiscal} />
              <Copiable etiqueta="Código postal fiscal" valor={p.receptor.codigoPostal} />
              <Copiable etiqueta="Uso de CFDI" valor={p.receptor.usoCfdi} />
              {p.receptor.email && <Copiable etiqueta="Correo para enviarla" valor={p.receptor.email} />}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-black uppercase tracking-wider text-muted">Comprobante</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <Copiable etiqueta="Tipo" valor={p.comprobante.tipo} />
              <Copiable etiqueta="Método de pago" valor={p.comprobante.metodoPago} />
              <Copiable etiqueta="Forma de pago" valor={p.comprobante.formaPago} />
              <Copiable etiqueta="Moneda" valor={p.comprobante.moneda} />
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-black uppercase tracking-wider text-muted">
              Conceptos ({p.conceptos.length})
            </h4>
            <div className="space-y-2">
              {p.conceptos.map((c, i) => (
                <div key={i} className="rounded-xl border border-surface-600 p-2">
                  <p className="mb-1 text-sm font-bold text-gray-100">{c.descripcion}</p>
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    <Copiable etiqueta="Clave prod/serv" valor={c.claveProdServ} />
                    <Copiable etiqueta="Clave unidad" valor={c.claveUnidad} />
                    <Copiable etiqueta="Cantidad" valor={c.cantidad} />
                    <Copiable etiqueta="Valor unitario (sin IVA)" valor={c.valorUnitario} />
                    <Copiable etiqueta="Importe" valor={c.importe.toFixed(2)} />
                    <Copiable etiqueta="IVA trasladado" valor={c.iva != null ? c.iva.toFixed(2) : "Exento / 0%"} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              01010101 es la clave genérica que acepta el SAT; si conoces la clave exacta del producto, úsala en el
              portal.
            </p>
          </section>

          <section className="grid gap-2 sm:grid-cols-4">
            <Copiable etiqueta="Subtotal" valor={dinero(p.totales.subtotal)} />
            <Copiable etiqueta="IVA" valor={dinero(p.totales.iva)} />
            <Copiable etiqueta="IEPS" valor={dinero(p.totales.ieps)} />
            <Copiable etiqueta="Total" valor={dinero(p.totales.total)} />
          </section>

          {f.estado === "PENDIENTE" && (
            <div className="space-y-2 rounded-xl border border-surface-600 p-3">
              <a
                href={datos.portal}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-acento px-3 py-2 text-sm font-bold text-btn-ink"
              >
                <ExternalLink className="h-4 w-4" /> Abrir portal de facturación del SAT
              </a>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Folio fiscal (UUID) que te dio el SAT</span>
                <div className="flex gap-2">
                  <input
                    value={uuid}
                    maxLength={36}
                    onChange={(e) => setUuid(e.target.value.trim())}
                    placeholder="1A2B3C4D-1234-ABCD-1234-1A2B3C4D5E6F"
                    className="input-dark min-w-0 flex-1 font-mono text-sm uppercase"
                  />
                  <button
                    type="button"
                    disabled={enviando || uuid.length !== 36}
                    onClick={() => enviar({ folioFiscal: uuid }, `Factura ${f.folio} timbrada`)}
                    className={cn(
                      "shrink-0 rounded-lg px-3 text-sm font-bold",
                      uuid.length === 36 ? "bg-emerald-600 text-white" : "bg-surface-600 text-muted"
                    )}
                  >
                    Registrar
                  </button>
                </div>
              </label>
            </div>
          )}

          {f.estado !== "CANCELADA" && (
            <button
              type="button"
              disabled={enviando}
              onClick={async () => {
                if (
                  await confirmar({
                    titulo: `¿Marcar la factura ${f.folio} como cancelada?`,
                    mensaje: f.estado === "EMITIDA" ? "Recuerda cancelarla también en el portal del SAT." : undefined,
                    aceptar: "Cancelar factura",
                    cancelar: "Volver",
                    peligro: true,
                  })
                ) {
                  enviar({ cancelar: true }, `Factura ${f.folio} cancelada`);
                }
              }}
              className="text-xs font-semibold text-rose-300 hover:underline"
            >
              Cancelar factura
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
