"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UserNotification } from "@/lib/notifications";

type NotificationResponse =
  | { ok: true; notifications: UserNotification[]; unreadCount: number }
  | { ok: false; message?: string };

export function NotificationsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadNotifications(true);

    function handleFocus() {
      void loadNotifications(false);
    }

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (nextOpen) {
            void markAsRead();
          }
        }}
        className="relative rounded-full border border-gray-300 bg-white p-2 text-gray-700 transition hover:border-accent hover:bg-accent-light"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-gray-950">Notifications</p>
              <p className="text-xs font-semibold text-gray-500">Just the moments worth a nudge.</p>
            </div>
          </div>

          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {isLoading ? (
              <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">
                No notifications yet.
              </p>
            ) : (
              notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.href}
                  onClick={() => setIsOpen(false)}
                  className={`block rounded-md border px-3 py-3 transition ${
                    notification.readAt
                      ? "border-gray-200 bg-white text-gray-700"
                      : "border-accent-light bg-accent-light/40 text-gray-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{notification.title}</p>
                      <p className="mt-1 text-sm font-semibold text-gray-700">{notification.body}</p>
                    </div>
                    {!notification.readAt ? (
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {formatNotificationTimestamp(notification.createdAt)}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  async function loadNotifications(showLoading: boolean) {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const result = (await response.json()) as NotificationResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? "Could not load notifications." : result.message);
      }

      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (error) {
      console.error("Failed to load notifications.", error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }

  async function markAsRead() {
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const result = (await response.json()) as { ok: true } | { ok: false; message?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? "Could not mark notifications as read." : result.message);
      }

      setUnreadCount(0);
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? new Date().toISOString()
        }))
      );
    } catch (error) {
      console.error("Failed to mark notifications as read.", error);
    }
  }
}

function formatNotificationTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short"
  }).format(new Date(value));
}
