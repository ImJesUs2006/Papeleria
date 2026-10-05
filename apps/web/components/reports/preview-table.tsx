"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Vista previa interactiva de reportes: ordena, pagina en
// cliente y totaliza antes de exportar. El filtrado NO vive
// aquí —los filtros reales (fechas, usuario, módulo) se aplican
// en el servidor al construir la consulta paginada.
// ============================================================

export interface PreviewData {
  title: string;
  headers: string[];
  numFmt: (string | null)[];
  total: boolean[];
  rows: (string | number)[][];
  totalFilas: number;
  truncado: boolean;
}

const PAGE_SIZE = 25;

export function ReportsPreviewTable({ data }: { data: PreviewData }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(0);

  // Toda celda puede venir nula/undefined de una respuesta parcial:
  // se normaliza una sola vez para que el render nunca reviente.
  const headers = useMemo(() => (data.headers ?? []).map((h) => h ?? ""), [data.headers]);
  const numFmt = useMemo(() => data.numFmt ?? [], [data.numFmt]);
  const totalFlags = useMemo(() => data.total ?? [], [data.total]);
  const rows = useMemo(
    () =>
      (data.rows ?? []).map((fila) =>
        Array.isArray(fila) ? (fila.map((celda) => celda ?? "") as (string | number)[]) : []
      ),
    [data.rows]
  );

  const columns = useMemo<ColumnDef<(string | number)[]>[]>(
    () =>
      headers.map((header, i) => ({
        id: String(i),
        accessorFn: (row) => row[i],
        header,
        cell: (info) => {
          const value = info.getValue();
          if (typeof value === "number" && numFmt[i]) {
            return value.toLocaleString("es-MX", {
              style: "currency",
              currency: "MXN",
            });
          }
          if (typeof value === "number") return value.toLocaleString("es-MX");
          return String(value ?? "");
        },
        sortingFn: (a, b, id) => {
          const av = a.getValue(id);
          const bv = b.getValue(id);
          if (typeof av === "number" && typeof bv === "number") return av - bv;
          return String(av ?? "").localeCompare(String(bv ?? ""), "es");
        },
      })),
    [headers, numFmt]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totales = useMemo(
    () =>
      totalFlags.map((activo, i) =>
        activo
          ? rows.reduce((s, r) => s + (typeof r[i] === "number" ? (Number(r[i]) || 0) : 0), 0)
          : null
      ),
    [rows, totalFlags]
  );

  const filasOrdenadas = table.getSortedRowModel().rows;
  const totalPaginas = Math.max(1, Math.ceil(filasOrdenadas.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas - 1);
  const filasPagina = filasOrdenadas.slice(
    paginaActual * PAGE_SIZE,
    paginaActual * PAGE_SIZE + PAGE_SIZE
  );
  const titulo = typeof data.title === "string" ? data.title : "Vista previa";
  const totalFilas = Number(data.totalFilas) || 0;

  return (
    <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-surface-600">
        <div>
          <h3 className="font-bold text-gray-100 text-sm">{titulo}</h3>
          <p className="text-[11px] text-muted">
            {filasOrdenadas.length} de {totalFilas} filas
            {data.truncado && " · vista previa truncada"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-700 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-muted font-semibold cursor-pointer select-none hover:text-gray-100 transition-colors whitespace-nowrap"
                    >
                      <span className="flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp className="h-3 w-3 text-neon-green" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="h-3 w-3 text-neon-green" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {filasPagina.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(headers.length, 1)}
                  className="px-4 py-10 text-center text-muted text-sm"
                >
                  Sin resultados para los filtros aplicados
                </td>
              </tr>
            ) : (
              filasPagina.map((row, i) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-surface-700/60 transition-colors hover:bg-surface-700/40",
                    i % 2 === 1 && "bg-surface-700/10"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5 text-gray-200 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {totales.some((t) => t !== null) && (
            <tfoot className="sticky bottom-0 bg-surface-700 border-t-2 border-neon-green/40">
              <tr>
                {headers.map((_h, i) => (
                  <td key={i} className="px-4 py-3 text-xs font-black text-gray-100 whitespace-nowrap">
                    {i === 0
                      ? "TOTAL"
                      : totales[i] !== null
                        ? totales[i]!.toLocaleString("es-MX", {
                            style: "currency",
                            currency: "MXN",
                          })
                        : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2 py-3 border-t border-surface-600">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={paginaActual <= 0}
            className="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-500 text-xs text-muted hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Anterior
          </button>
          <span className="text-xs text-muted">
            {paginaActual + 1} / {totalPaginas}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPaginas - 1, p + 1))}
            disabled={paginaActual >= totalPaginas - 1}
            className="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-500 text-xs text-muted hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

export function PreviewSkeleton() {
  return (
    <div className="bg-surface-800 border border-surface-600 rounded-2xl p-6 flex items-center justify-center gap-2 text-muted text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Generando vista previa...
    </div>
  );
}