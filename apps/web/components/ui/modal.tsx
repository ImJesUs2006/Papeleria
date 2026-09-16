"use client";

import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHotkeys } from "@/hooks/use-hotkeys";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, subtitle, children, className }: ModalProps) {
  // Esc cierra el modal.
  useHotkeys(
    {
      Escape: () => onClose(),
    },
    { enabled: open, allowInInputs: true }
  );

  // Bloquea el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "bg-surface-800 border border-surface-600 rounded-3xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto",
              className
            )}
          >
            {(title || subtitle) && (
              <div className="flex items-start justify-between mb-5">
                <div>
                  {title && <h3 className="font-black text-gray-100">{title}</h3>}
                  {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="h-9 w-9 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}