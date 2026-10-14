import { DashboardLayout } from "@/components/layout/dashboard-layout";

// Marco compartido de todos los módulos. Al vivir en el layout del grupo,
// el menú, la verificación de sesión y la configuración se montan UNA vez y
// persisten entre navegaciones (antes cada página los volvía a montar y a
// consultar al servidor en cada cambio de módulo).
export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
