"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateTimeWithZone } from "@/lib/date-time";
import type { UserNotification } from "@/lib/notifications";

type NotificationResponse =
  | { ok: true; notifications: UserNotification[]; unreadCount: number }
  | { ok: false; message?: string };

export function NotificationsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    void loadNotifications(true);

    function handleFocus() {
      void loadNotifications(false);
    }

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative">
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
        <div className="fixed inset-0 z-50 flex items-end bg-black/35 md:items-start md:justify-end md:p-6">
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative w-full rounded-t-2xl bg-white p-4 shadow-2xl md:mt-14 md:max-w-sm md:rounded-2xl md:p-5">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-gray-200 md:hidden" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-gray-950">Notifications</p>
                <p className="text-xs font-semibold text-gray-500">Just the moments worth a nudge.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1 md:max-h-[28rem]">
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
  return formatDateTimeWithZone(value);
}
