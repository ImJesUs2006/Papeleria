"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Vista previa interactiva de reportes (ordenar, filtrar,
// paginar en cliente y totalizar) antes de exportar.
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
  const [globalFilter, setGlobalFilter] = useState("");
  const [page, setPage] = useState(0);

  const columns = useMemo<ColumnDef<(string | number)[]>[]>(
    () =>
      data.headers.map((header, i) => ({
        id: String(i),
        accessorFn: (row) => row[i],
        header,
        cell: (info) => {
          const value = info.getValue();
          if (typeof value === "number" && data.numFmt[i]) {
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
          return String(av).localeCompare(String(bv), "es");
        },
      })),
    [data.headers, data.numFmt]
  );

  const table = useReactTable({
    data: data.rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString",
  });

  const totales = useMemo(
    () =>
      data.total.map((activo, i) =>
        activo
          ? data.rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0)
          : null
      ),
    [data.rows, data.total]
  );

  const filasFiltradas = table.getFilteredRowModel().rows;
  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas - 1);
  const filasPagina = filasFiltradas.slice(
    paginaActual * PAGE_SIZE,
    paginaActual * PAGE_SIZE + PAGE_SIZE
  );

  return (
    <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-surface-600">
        <div>
          <h3 className="font-bold text-gray-100 text-sm">{data.title}</h3>
          <p className="text-[11px] text-muted">
            {filasFiltradas.length} de {data.totalFilas} filas
            {data.truncado && " · vista previa truncada"}
          </p>
        </div>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
          <input
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setPage(0);
            }}
            placeholder="Filtrar vista previa..."
            className="w-full bg-surface-700 border border-surface-500 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-100 placeholder:text-muted/50 focus:border-neon-blue focus:outline-none"
          />
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
                  colSpan={data.headers.length}
                  className="px-4 py-10 text-center text-muted text-sm"
                >
                  Sin resultados para el filtro actual
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
                {data.headers.map((h, i) => (
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