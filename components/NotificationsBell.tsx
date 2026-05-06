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
          setIsOpen((current) => !current);
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pb-4 pt-24 sm:pt-28">
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-gray-950">Notifications</p>
                <p className="text-xs font-semibold text-gray-500">
                  {notifications.length} unread notification{notifications.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notifications.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAllAsRead()}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:border-accent hover:bg-accent-light hover:text-accent-dark"
                  >
                    Mark all read
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600"
                  aria-label="Close notifications"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[calc(100vh-9rem)] space-y-2 overflow-y-auto pr-1 sm:max-h-[28rem]">
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
                    onClick={() => {
                      markNotificationAsRead(notification.id);
                      setIsOpen(false);
                    }}
                    className="block rounded-md border border-accent-light bg-accent-light/40 px-3 py-2.5 text-gray-900 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{notification.title}</p>
                        <p className="mt-1 text-sm font-semibold text-gray-700">{notification.body}</p>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {formatNotificationTimestamp(notification.createdAt)}
                        </p>
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent" />
                      </div>
                    </div>
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
        console.warn("Notifications are temporarily unavailable.", {
          status: response.status,
          message: result.ok ? "Could not load notifications." : result.message
        });
        setNotifications([]);
        setUnreadCount(0);
        return;
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

  function markNotificationAsRead(notificationId: string) {
    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    setUnreadCount((current) => Math.max(0, current - 1));

    void fetch("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ notificationId }),
      keepalive: true
    }).catch((error) => {
      console.error("Failed to mark notification as read.", error);
    });
  }

  async function markAllAsRead() {
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const result = (await response.json()) as { ok: true } | { ok: false; message?: string };
      if (!response.ok || !result.ok) {
        console.warn("Notifications mark-read is temporarily unavailable.", {
          status: response.status,
          message: result.ok ? "Could not mark notifications as read." : result.message
        });
        return;
      }

      setUnreadCount(0);
      setNotifications([]);
    } catch (error) {
      console.error("Failed to mark notifications as read.", error);
    }
  }
}

function formatNotificationTimestamp(value: string) {
  return formatDateTimeWithZone(value);
}
