import { AppShell } from "@/components/AppShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminHomeClient } from "@/components/admin/AdminHomeClient";

export default function AdminPage() {
  return (
    <AppShell>
      <AdminGuard>
        <AdminHomeClient />
      </AdminGuard>
    </AppShell>
  );
}
