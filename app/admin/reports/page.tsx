import { AppShell } from "@/components/AppShell";
import { AdminReportsClient } from "@/components/admin/AdminReportsClient";

export const dynamic = "force-dynamic";

export default function AdminReportsPage() {
  return (
    <AppShell>
      <AdminReportsClient />
    </AppShell>
  );
}
