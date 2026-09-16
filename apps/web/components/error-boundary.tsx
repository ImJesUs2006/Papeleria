"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Etiqueta del área protegida, se muestra en el mensaje. */
  label?: string;
  /** Contenido alternativo; si no se indica, se usa la tarjeta por defecto. */
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Aísla fallos de render de una sección para que un módulo con datos
 * incompatibles no tumbe toda la vista (pantalla en blanco).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`, error, info);
    }
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="bg-neon-red/10 border border-neon-red/40 rounded-2xl px-5 py-4 text-sm text-gray-100">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-neon-red shrink-0" />
          <div className="min-w-0">
            <p className="font-bold">
              No se pudo mostrar {this.props.label ?? "esta sección"}
            </p>
            <p className="text-xs text-muted mt-0.5 break-words">
              {this.state.error?.message || "Error inesperado de renderizado"}
            </p>
          </div>
          <button
            onClick={this.reset}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-xs font-medium transition-colors shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      </div>
    );
  }
}
