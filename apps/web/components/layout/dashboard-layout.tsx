"use client";

import { Sidebar } from "./sidebar";
import AuthGuard from "@/components/auth-guard";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-surface-900">{children}</main>
      </div>
    </AuthGuard>
  );
}
