import { AppShell } from "@/components/AppShell";

export default function MyGroupsPage() {
  return (
    <AppShell>
      <section className="space-y-5">
        <div className="rounded-lg bg-gray-100 p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">My Groups</p>
          <h2 className="mt-2 text-3xl font-black leading-tight">Create private pools with your people.</h2>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            This future feature will let each player create and manage up to three different groups.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-lg font-bold">What’s coming</h3>
          <ul className="mt-3 space-y-2 text-sm font-semibold text-gray-700">
            <li>Create up to 3 separate groups.</li>
            <li>Invite different friends and family to each one.</li>
            <li>Track standings inside each private pool.</li>
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
