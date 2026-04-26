"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { CircleUserRound, SquareCheckBig, UsersRound } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { NotificationsBell } from "@/components/NotificationsBell";
import { signOutCurrentUser } from "@/lib/auth-client";
import { getAccessLevelLabel, shouldShowAccessBadge } from "@/lib/access-levels";
import { useCurrentUser } from "@/lib/use-current-user";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { href: "/groups", label: "My Picks", ariaLabel: "My Picks", icon: SquareCheckBig },
  { href: "/my-groups", label: "My Groups", ariaLabel: "My Groups", icon: UsersRound },
  { href: "/leaderboard", label: "The Arena", ariaLabel: "The Arena", icon: ArenaIcon },
  { href: "/profile", label: "My Profile", ariaLabel: "My Profile", icon: CircleUserRound }
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && user?.needsLegalAcceptance) {
      const nextPath = pathname?.startsWith("/") ? pathname : "/dashboard";
      router.replace(`/legal/accept?next=${encodeURIComponent(nextPath)}`);
    }
  }, [isLoading, pathname, router, user]);

  useEffect(() => {
    if (!isLoading && user && !user.needsLegalAcceptance && user.needsProfileSetup) {
      router.replace("/profile-setup");
    }
  }, [isLoading, router, user]);

  if (isLoading || !user || user.needsProfileSetup || user.needsLegalAcceptance) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-5">
        <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
          Loading PICK-IT!...
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24 text-gray-950">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="min-w-0">
            <h1 className="truncate text-xl font-black leading-tight">{APP_NAME}</h1>
            <p className="truncate text-xs font-semibold text-accent-dark">{APP_TAGLINE}</p>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            {shouldShowAccessBadge(user) ? (
              <span className="rounded-md bg-accent-light px-2 py-1 text-xs font-bold uppercase text-accent-dark">
                {getAccessLevelLabel(user)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await signOutCurrentUser();
                router.replace("/login");
                router.refresh();
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-4xl grid-cols-4 px-1 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.ariaLabel}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-2 py-2.5 text-xs font-bold sm:text-sm ${
                  isActive ? "bg-accent-light text-accent-dark" : "text-gray-600"
                }`}
              >
                <Icon aria-hidden className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function ArenaIcon({ className, ...props }: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5.5" />
      <rect x="5" y="5" width="14" height="14" rx="3.5" />
      <rect x="7" y="8" width="10" height="8" rx="1.5" />
      <path d="M12 8v8" />
      <circle cx="12" cy="12" r="1.75" />
      <path d="M7 6.5h10" />
      <path d="M7 17.5h10" />
      <path d="M6.5 7v10" />
      <path d="M17.5 7v10" />
      <path d="M7 10h1.5v4H7" />
      <path d="M17 10h-1.5v4H17" />
    </svg>
  );
}
