"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { CircleUserRound, Home, ListOrdered, Network, Trophy, UsersRound } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { signOutCurrentUser } from "@/lib/auth-client";
import { useCurrentUser } from "@/lib/use-current-user";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Home", ariaLabel: "Home", icon: Home },
  { href: "/groups", label: "Groups", ariaLabel: "Group Stage", icon: UsersRound },
  { href: "/leaderboard", label: "Scores", ariaLabel: "Leaderboard", icon: ListOrdered },
  { href: "/knockout", label: "Knockout", ariaLabel: "Knockout Stage", icon: Network },
  { href: "/trophies", label: "Trophies", ariaLabel: "Additional Trophies", icon: Trophy },
  { href: "/profile", label: "Profile", ariaLabel: "Profile", icon: CircleUserRound }
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

  if (isLoading || !user) {
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
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-4xl grid-cols-6 px-1 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.ariaLabel}
                className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] font-semibold sm:text-xs ${
                  isActive ? "bg-accent-light text-accent-dark" : "text-gray-600"
                }`}
              >
                <Icon aria-hidden className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
