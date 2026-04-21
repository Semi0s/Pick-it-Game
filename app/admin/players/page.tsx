import { AppShell } from "@/components/AppShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPlayersClient } from "@/components/admin/AdminPlayersClient";

export default function AdminPlayersPage() {
  return (
    <AppShell>
      <AdminGuard>
        <AdminPlayersClient />
      </AdminGuard>
    </AppShell>
  );
}
