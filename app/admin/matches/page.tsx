import { AppShell } from "@/components/AppShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminMatchesClient } from "@/components/admin/AdminMatchesClient";
import { logTestingResetEnvDiagnostics } from "@/lib/admin/destructive-tools";

export const dynamic = "force-dynamic";

export default function AdminMatchesPage() {
  logTestingResetEnvDiagnostics("adminMatchesPage");

  return (
    <AppShell>
      <AdminGuard>
        <AdminMatchesClient />
      </AdminGuard>
    </AppShell>
  );
}
