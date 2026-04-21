import { AppShell } from "@/components/AppShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminMatchesClient } from "@/components/admin/AdminMatchesClient";

export default function AdminMatchesPage() {
  return (
    <AppShell>
      <AdminGuard>
        <AdminMatchesClient />
      </AdminGuard>
    </AppShell>
  );
}
