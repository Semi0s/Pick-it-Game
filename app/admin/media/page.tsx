import { AppShell } from "@/components/AppShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminMediaClient } from "@/components/admin/AdminMediaClient";

export const dynamic = "force-dynamic";

export default function AdminMediaPage() {
  return (
    <AppShell>
      <AdminGuard>
        <AdminMediaClient />
      </AdminGuard>
    </AppShell>
  );
}
