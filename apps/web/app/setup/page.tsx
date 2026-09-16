"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { useAuthStore } from "@/store/auth";
import { Loader2 } from "lucide-react";

export default function SetupPage() {
  const router = useRouter();
  const rol = useAuthStore((s) => s.rol);
  const [setupPendiente, setSetupPendiente] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setSetupPendiente(d.setupPendiente === true);
        if (d.setupPendiente !== true) router.replace("/cobro");
      })
      .catch(() => setSetupPendiente(false));
  }, [router]);

  useEffect(() => {
    if (rol && rol !== "ADMINISTRADORA") {
      router.replace("/cobro");
    }
  }, [rol, router]);

  if (setupPendiente === null || rol === null) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-neon-green animate-spin" />
      </div>
    );
  }

  if (setupPendiente === false) return null;

  return <SetupWizard />;
}