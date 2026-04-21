import { AppShell } from "@/components/AppShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminInvitesClient } from "@/components/admin/AdminInvitesClient";

export default function AdminInvitesPage() {
  return (
    <AppShell>
      <AdminGuard>
        <AdminInvitesClient />
      </AdminGuard>
    </AppShell>
  );
}
