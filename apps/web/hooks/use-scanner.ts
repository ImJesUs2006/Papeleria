"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Los lectores de barras USB se comportan como teclado HID:
// disparan MÚLTIPLES caracteres en <50ms y terminan con Enter.
// El tecleo humano promedio va a >100ms entre teclas.
const SCANNER_THRESHOLD_MS = 50;
const SCAN_TIMEOUT_MS = 1400; // si no llega Enter tras una ráfaga, el escaneo falló
const HEALTH_IDLE_MS = 4000; // inactividad para marcar el lector como "inactivo"

export type ScannerHealth = "online" | "idle";

interface UseScannerDetection {
  inputRef: React.RefObject<HTMLInputElement>;
  isScannerInput: boolean;
  scannerHealth: ScannerHealth;
  isFocused: boolean;
  focusInput: () => void;
}

export function useScannerDetection(
  onScan: (code: string) => void,
  onScanFail?: () => void
): UseScannerDetection {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isScannerInput, setIsScannerInput] = useState(false);
  const [scannerHealth, setScannerHealth] = useState<ScannerHealth>("idle");
  const [isFocused, setIsFocused] = useState<boolean>(false);

  const lastKeyTime = useRef<number>(0);
  const lastScanAt = useRef<number>(0);
  const burstStart = useRef<number | null>(null);
  const buffer = useRef<string>("");
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScanRef = useRef(onScan);
  const onScanFailRef = useRef(onScanFail);
  onScanRef.current = onScan;
  onScanFailRef.current = onScanFail;

  const handleScanSuccess = useCallback((code: string) => {
    lastScanAt.current = Date.now();
    setScannerHealth("online");
    setIsScannerInput(false);
    buffer.current = "";
    burstStart.current = null;
    if (failTimer.current) {
      clearTimeout(failTimer.current);
      failTimer.current = null;
    }
    onScanRef.current(code);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isFocused && e.key !== "Tab") {
        // El lector emite al input oculto que debe estar enfocado.
        // Si no está enfocado, ignoramos (evita dobles capturas).
        return;
      }

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTime.current;

      if (timeSinceLastKey < SCANNER_THRESHOLD_MS) {
        // Ráfaga -> es el lector de barras
        if (burstStart.current === null) {
          burstStart.current = now;
          setIsScannerInput(true);
          // Si la ráfaga no termina con Enter, el escaneo falló.
          if (failTimer.current) clearTimeout(failTimer.current);
          failTimer.current = setTimeout(() => {
            setIsScannerInput(false);
            burstStart.current = null;
            buffer.current = "";
            setScannerHealth("idle");
            onScanFailRef.current?.();
          }, SCAN_TIMEOUT_MS);
        }
        buffer.current += e.key;
      } else {
        // Escape manual (teclado) entre teclas
        buffer.current += e.key;
        burstStart.current = null;
        setIsScannerInput(false);
        if (failTimer.current) {
          clearTimeout(failTimer.current);
          failTimer.current = null;
        }
      }

      lastKeyTime.current = now;

      if (e.key === "Enter" && buffer.current.length > 0) {
        e.preventDefault();
        const code = buffer.current.replace("Enter", "").trim();
        if (code) handleScanSuccess(code);
        else buffer.current = "";
        burstStart.current = null;
        setIsScannerInput(false);
        if (failTimer.current) {
          clearTimeout(failTimer.current);
          failTimer.current = null;
        }
      }
    },
    [isFocused, handleScanSuccess]
  );

  // Salud del lector: si no hubo ráfaga en HEALTH_IDLE_MS, marcarlo "idle"
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastScanAt.current > HEALTH_IDLE_MS) {
        setScannerHealth("idle");
      } else {
        setScannerHealth("online");
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const focusHandler = () => {
      setIsFocused(true);
      inputRef.current?.focus();
    };
    const blurHandler = () => setIsFocused(false);

    document.addEventListener("keydown", handleKeyDown);
    inputRef.current?.addEventListener("focus", focusHandler);
    inputRef.current?.addEventListener("blur", blurHandler);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      inputRef.current?.removeEventListener("focus", focusHandler);
      inputRef.current?.removeEventListener("blur", blurHandler);
      if (failTimer.current) clearTimeout(failTimer.current);
    };
  }, [handleKeyDown]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return {
    inputRef,
    isScannerInput,
    scannerHealth,
    isFocused,
    focusInput,
  };
}