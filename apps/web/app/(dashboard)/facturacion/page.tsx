"use client";

import { motion } from "framer-motion";
import { FileText, Construction } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function FacturacionPage() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-2xl font-black text-gray-100 mb-1">Facturación</h2>
          <p className="text-sm text-muted">CFDI y comprobantes fiscales</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-surface-800 border border-surface-600 rounded-2xl p-10 flex flex-col items-center text-center gap-4"
        >
          <div className="h-16 w-16 rounded-2xl bg-neon-cyan/10 flex items-center justify-center">
            <Construction className="h-8 w-8 text-neon-cyan" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-100 mb-1">
              Módulo en construcción
            </h3>
            <p className="text-sm text-muted max-w-md leading-relaxed">
              La emisión de facturas electrónicas (CFDI 4.0) estará disponible
              en una próxima iteración. Mientras tanto, la venta continúa
              operando con ticket simple.
            </p>
          </div>
          <span className="flex items-center gap-2 text-xs text-muted bg-surface-700 border border-surface-500 rounded-xl px-3 py-2">
            <FileText className="h-3.5 w-3.5" />
            Próximamente
          </span>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}