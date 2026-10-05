"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Loader2,
  Receipt,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * FASE 12 · Emisión y listado de facturas (CFDI 4.0).
 *
 * Reglas que la UI refleja (el servidor las vuelve a validar):
 *  - Solo clientes registrados con RFC o razón social.
 *  - Solo tickets pagados y no facturados antes.
 *  - Los importes los pone el servidor.
 */

interface FacturaRow {
  idFactura: string;
  folio: string;
  fechaEmision: string;
  folioVenta: string;
  idCliente: string;
  nombreCliente: string;
  rfcCliente: string | null;
  subtotal: number;
  iva: number;
  totalNeto: number;
  usoCfdi: string;
  estado: string;
}

interface VentaRow {
  folioVenta: string;
  fechaHora: string;
  totalNeto: number;
  idCliente: string | null;
  nombreCliente: string | null;
  facturada: boolean;
}

interface ClienteRow {
  idCliente: string;
  nombre: string;
  rfc: string | null;
  razonSocial: string | null;
}

const money = (v: unknown): string => `$${(Number(v) || 0).toFixed(2)}`;
const fecha = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-MX");
};

export function FacturacionEmitir() {
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [idCliente, setIdCliente] = useState("");
  const [folioVenta, setFolioVenta] = useState("");
  const [usoCfdi, setUsoCfdi] = useState("S01");
  const [tickets, setTickets] = useState<VentaRow[]>([]);
  const [buscandoTickets, setBuscandoTickets] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [resCli, resFac] = await Promise.all([
        fetch("/api/clientes?limit=200", { cache: "no-store" }),
        fetch("/api/facturas?limit=50", { cache: "no-store" }),
      ]);
      setClientes(resCli.ok ? ((await resCli.json()).clientes ?? []) : []);
      setFacturas(resFac.ok ? ((await resFac.json()).data ?? []) : []);
      setError(null);
    } catch {
      setError("No se pudo cargar la información de facturación");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Reutiliza el historial del cliente (GET /api/clientes/[id]) y descarta
  // los tickets ya facturados: no hay endpoint de ventas por cliente.
  useEffect(() => {
    if (!idCliente) {
      setTickets([]);
      return;
    }
    let viva = true;
    (async () => {
      setBuscandoTickets(true);
      try {
        const res = await fetch(`/api/clientes/${encodeURIComponent(idCliente)}`, {
          cache: "no-store",
        });
        const data = res.ok ? await res.json() : { ventas: [] };
        const facturados = new Set(facturas.map((f) => f.folioVenta));
        const filas: VentaRow[] = (data.ventas ?? [])
          .filter((v: any) => v.estado === "COMPLETADA")
          .filter((v: any) => !facturados.has(v.folioVenta))
          .map((v: any) => ({
            folioVenta: v.folioVenta ?? "",
            fechaHora: v.fechaHora ?? "",
            totalNeto: Number(v.totalNeto) || 0,
            idCliente,
            nombreCliente: data.cliente?.nombre ?? null,
            facturada: false,
          }));
        if (viva) {
          setTickets(filas);
          setFolioVenta("");
        }
      } catch {
        if (viva) setTickets([]);
      } finally {
        if (viva) setBuscandoTickets(false);
      }
    })();
    return () => {
      viva = false;
    };
  }, [idCliente, facturas]);

  const clienteElegido = clientes.find((c) => c.idCliente === idCliente) ?? null;
  const clienteSinDatos = Boolean(clienteElegido && !clienteElegido.rfc && !clienteElegido.razonSocial);
  const ticketElegido = tickets.find((t) => t.folioVenta === folioVenta) ?? null;

  const filtrados = clientes.filter((c) => {
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return true;
    return (
      c.nombre.toLowerCase().includes(q) ||
      (c.rfc ?? "").toLowerCase().includes(q) ||
      (c.razonSocial ?? "").toLowerCase().includes(q)
    );
  });

  const puedeEmitir = Boolean(idCliente && folioVenta && !clienteSinDatos && !emitiendo);

  const emitir = async () => {
    if (!puedeEmitir) return;
    setEmitiendo(true);
    setAviso(null);
    setExito(null);
    try {
      const res = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idCliente, folioVenta, usoCfdi }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAviso(data.error || "No se pudo emitir la factura");
        return;
      }
      setExito(
        `Factura ${data.data.folio} emitida por ${money(data.data.totalNeto)}` +
          (data.data.ticketReasignado ? " · el ticket se asignó a este cliente" : "")
      );
      setFolioVenta("");
      await cargar();
    } catch {
      setAviso("No se pudo emitir la factura");
    } finally {
      setEmitiendo(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Emisión */}
      <section className="rounded-2xl border border-surface-600 bg-surface-800/60 p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted mb-4">
          <Receipt className="h-4 w-4 text-neon-cyan" />
          Emitir comprobante
        </h3>

        <label className="block text-xs text-muted mb-1">Cliente registrado</label>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            value={busquedaCliente}
            onChange={(e) => setBusquedaCliente(e.target.value)}
            placeholder="Buscar por nombre o RFC"
            className="w-full rounded-lg border border-surface-500 bg-surface-700 py-2 pl-8 pr-3 text-sm text-gray-100 placeholder:text-muted"
          />
        </div>

        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted py-3">
            No hay clientes que coincidan. Registra al cliente primero.
          </p>
        ) : (
          <select
            value={idCliente}
            onChange={(e) => setIdCliente(e.target.value)}
            className="w-full rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 mb-1"
          >
            <option value="">Selecciona un cliente…</option>
            {filtrados.map((c) => (
              <option key={c.idCliente} value={c.idCliente}>
                {c.razonSocial || c.nombre}
                {c.rfc ? ` · ${c.rfc}` : " · sin RFC"}
              </option>
            ))}
          </select>
        )}

        {clienteSinDatos && (
          <p className="mt-1 text-xs text-neon-yellow flex items-start gap-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Este cliente no tiene RFC ni razón social: actualiza su ficha para poder facturar.
          </p>
        )}

        <label className="block text-xs text-muted mt-4 mb-1">Ticket a facturar</label>
        {!idCliente ? (
          <p className="text-sm text-muted">Elige un cliente para ver sus tickets.</p>
        ) : buscandoTickets ? (
          <Skeleton className="h-10 w-full" />
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted">
            Este cliente no tiene tickets pendientes de facturar.
          </p>
        ) : (
          <select
            value={folioVenta}
            onChange={(e) => setFolioVenta(e.target.value)}
            className="w-full rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100"
          >
            <option value="">Selecciona un ticket…</option>
            {tickets.map((t) => (
              <option key={t.folioVenta} value={t.folioVenta}>
                {t.folioVenta} · {fecha(t.fechaHora)} · {money(t.totalNeto)}
              </option>
            ))}
          </select>
        )}

        <label className="block text-xs text-muted mt-4 mb-1">Uso de CFDI (SAT)</label>
        <select
          value={usoCfdi}
          onChange={(e) => setUsoCfdi(e.target.value)}
          className="w-full rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100"
        >
          <option value="S01">S01 · Ingreso</option>
          <option value="G03">G03 · Gastos en general</option>
          <option value="D01">D01 · Honorarios médicos</option>
          <option value="P01">P01 · Por definir</option>
        </select>
        <p className="text-[11px] text-muted mt-1">
          Forma de pago: PUE (pago en una sola exhibición).
        </p>

        {aviso && (
          <p className="mt-3 text-sm text-neon-red flex items-start gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {aviso}
          </p>
        )}
        {exito && (
          <p className="mt-3 text-sm text-neon-green flex items-start gap-1.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            {exito}
          </p>
        )}

        <button
          type="button"
          onClick={emitir}
          disabled={!puedeEmitir}
          className={cn(
            "mt-4 w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors",
            puedeEmitir
              ? "border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20"
              : "border-surface-500 bg-surface-700 text-muted/60 cursor-not-allowed"
          )}
        >
          {emitiendo ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Emitiendo…
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              {ticketElegido ? `Facturar ${money(ticketElegido.totalNeto)}` : "Emitir factura"}
            </>
          )}
        </button>
      </section>

      {/* Listado */}
      <section className="rounded-2xl border border-surface-600 bg-surface-800/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
            <FileText className="h-4 w-4 text-neon-green" />
            Facturas emitidas
          </h3>
          <span className="text-xs text-muted">{facturas.length}</span>
        </div>

        {error && (
          <p className="text-sm text-neon-red flex items-center gap-1.5 mb-3">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : facturas.length === 0 ? (
          <p className="text-sm text-muted py-4">
            Aún no se ha emitido ninguna factura.
          </p>
        ) : (
          <ul className="divide-y divide-surface-600">
            {facturas.map((f) => (
              <li key={f.idFactura} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-100">{f.folio}</p>
                  <p className="text-xs text-muted truncate">
                    {f.nombreCliente || "Cliente"}
                    {f.rfcCliente ? ` · ${f.rfcCliente}` : ""}
                  </p>
                  <p className="text-[11px] text-muted">
                    Ticket {f.folioVenta} · {fecha(f.fechaEmision)} · Uso {f.usoCfdi}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-neon-green">{money(f.totalNeto)}</p>
                  <p className="text-[11px] text-muted">Subtotal {money(f.subtotal)}</p>
                  <p className="text-[11px] text-muted">IVA {money(f.iva)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default FacturacionEmitir;