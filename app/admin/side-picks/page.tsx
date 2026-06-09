import { AppShell } from "@/components/AppShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminSidePicksClient } from "@/components/admin/AdminSidePicksClient";

export const dynamic = "force-dynamic";

export default function AdminSidePicksPage() {
  return (
    <AppShell>
      <AdminGuard>
        <AdminSidePicksClient />
      </AdminGuard>
    </AppShell>
  );
}
