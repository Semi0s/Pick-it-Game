"use client";

import Image from "next/image";
import { useCurrentUser } from "@/lib/use-current-user";

export function ProfileSummary() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        Loading profile...
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg bg-gray-100 p-5">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-lg border border-gray-200 bg-white"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent-light text-xl font-black text-accent-dark">
              {user.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{user.role}</p>
            <h2 className="truncate text-2xl font-black">{user.name}</h2>
            <p className="truncate text-sm font-medium text-gray-600">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Profile editing</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Phase 1 stores demo profile details from the invite list. Editable display names and avatar uploads
          will move into Supabase-backed profile settings in a later phase.
        </p>
      </div>
    </section>
  );
}
