"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/use-current-user";

type AdminGuardProps = {
  children: ReactNode;
};

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [isLoading, router, user]);

  if (isLoading || !user) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
        Checking admin access...
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
        Redirecting to dashboard...
      </div>
    );
  }

  return children;
}
