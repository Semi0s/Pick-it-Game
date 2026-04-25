import { AppShell } from "@/components/AppShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminGroupsClient } from "@/components/admin/AdminGroupsClient";

export default function AdminGroupsPage() {
  return (
    <AppShell>
      <AdminGuard>
        <AdminGroupsClient />
      </AdminGuard>
    </AppShell>
  );
}
