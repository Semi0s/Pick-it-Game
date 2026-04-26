"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import {
  registerCurrentBrowserPushNotifications,
  sendCurrentUserPasswordReset,
  updateCurrentUserNotificationPreferences,
  uploadCurrentUserAvatar
} from "@/lib/auth-client";
import { getAccessLevelDescription, getAccessLevelLabel } from "@/lib/access-levels";
import { useCurrentUser } from "@/lib/use-current-user";

export function ProfileSummary() {
  const { user, isLoading, refresh } = useCurrentUser();
  const [passwordMessage, setPasswordMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  if (isLoading || !user) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        Loading profile...
      </div>
    );
  }

  const acceptedTermsLabel = user.acceptedEulaAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZoneName: "short"
      }).format(new Date(user.acceptedEulaAt))
    : "Not accepted yet";

  return (
    <section className="space-y-5">
      <div className="rounded-lg bg-gray-100 p-5">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size="lg" className="rounded-lg" />
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black">{user.name}</h2>
            <p className="mt-1 text-sm font-bold text-accent-dark">
              {getAccessLevelLabel(user)}
              {getAccessLevelDescription(user) ? ` · ${getAccessLevelDescription(user)}` : ""}
            </p>
            <p className="truncate text-sm font-medium text-gray-600">{user.email}</p>
          </div>
        </div>
        <div className="mt-4">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              setIsUploadingAvatar(true);
              setPasswordMessage(null);
              setNotificationMessage(null);
              const result = await uploadCurrentUserAvatar(file);
              setPasswordMessage({ tone: result.ok ? "success" : "error", text: result.message });
              if (result.ok) {
                await refresh();
              }
              setIsUploadingAvatar(false);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={isUploadingAvatar}
            onClick={() => avatarInputRef.current?.click()}
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
          >
            {isUploadingAvatar ? "Uploading..." : user.avatarUrl ? "Update Avatar" : "Upload Avatar"}
          </button>
          <p className="mt-2 text-xs font-semibold text-gray-500">Optional. If upload fails, your initials stay in place.</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Profile editing</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your invite gets you in the door. After that, your display name and username belong to you. Super admins can
          still make corrections later if something needs cleanup.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Terms of Use</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Current required version: <span className="font-bold text-gray-900">{user.requiredEulaVersion ?? "Not configured"}</span>
        </p>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Accepted version: <span className="font-bold text-gray-900">{user.acceptedEulaVersion ?? "Not accepted yet"}</span>
        </p>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Accepted on: <span className="font-bold text-gray-900">{acceptedTermsLabel}</span>
        </p>
        <a
          href="/legal/accept"
          className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
        >
          View Current Terms
        </a>
      </div>

      {user.role === "admin" ? (
        <div className="rounded-lg border border-accent-light bg-accent-light/40 p-4">
          <h3 className="text-lg font-bold">Super admin access</h3>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Groups is your main operational hub, with deeper player and manager tools available when you need them.
          </p>
          <a
            href="/admin/players"
            className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            Open Player Management
          </a>
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Notifications</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Opt in to the big moments only: Perfect Picks, Daily Winner, major jumps up the table, and new comments on
          your activity.
        </p>
        <button
          type="button"
          disabled={isUpdatingNotifications}
          onClick={async () => {
            setIsUpdatingNotifications(true);
            setNotificationMessage(null);
            const result = await updateCurrentUserNotificationPreferences(!(user.notificationsEnabled ?? false));
            setNotificationMessage({
              tone: result.ok ? "success" : "error",
              text: result.message ?? "Something went wrong."
            });
            if (result.ok) {
              await refresh();
            }
            setIsUpdatingNotifications(false);
          }}
          className={`mt-4 inline-flex rounded-md border px-4 py-3 text-sm font-bold transition ${
            user.notificationsEnabled
              ? "border-accent bg-accent-light text-accent-dark"
              : "border-gray-300 bg-white text-gray-800 hover:border-accent hover:bg-accent-light"
          } disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500`}
        >
          {isUpdatingNotifications
            ? "Updating..."
            : user.notificationsEnabled
              ? "Notifications On"
              : "Turn On Notifications"}
        </button>
        {notificationMessage ? (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold ${
              notificationMessage.tone === "success"
                ? "border-accent-light bg-accent-light text-accent-dark"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {notificationMessage.text}
          </p>
        ) : null}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-700">
            Enable push notifications for this browser or device.
          </p>
          <button
            type="button"
            disabled={isRegisteringPush || !(user.notificationsEnabled ?? false)}
            onClick={async () => {
              setIsRegisteringPush(true);
              setNotificationMessage(null);
              const result = await registerCurrentBrowserPushNotifications();
              setNotificationMessage({
                tone: result.ok ? "success" : "error",
                text:
                  !(user.notificationsEnabled ?? false) && !result.ok
                    ? "Turn on leaderboard notifications first."
                    : (result.message ?? "Something went wrong.")
              });
              if (result.ok) {
                await refresh();
              }
              setIsRegisteringPush(false);
            }}
            className={`mt-3 inline-flex rounded-md border px-4 py-3 text-sm font-bold transition ${
              user.pushNotificationsEnabled
                ? "border-accent bg-accent-light text-accent-dark"
                : "border-gray-300 bg-white text-gray-800 hover:border-accent hover:bg-accent-light"
            } disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500`}
          >
            {isRegisteringPush
              ? "Enabling..."
              : user.pushNotificationsEnabled
                ? "Push Enabled"
                : "Enable Push Notifications"}
          </button>
          <p className="mt-2 text-xs font-semibold text-gray-500">
            We only use push for Perfect Picks, Daily Winners, big jumps up the table, and new comments.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Password</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Send yourself a password reset email if you want to change how you sign in.
        </p>
        {passwordMessage ? (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold ${
              passwordMessage.tone === "success"
                ? "border-accent-light bg-accent-light text-accent-dark"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {passwordMessage.text}
          </p>
        ) : null}
        <button
          type="button"
          disabled={isSendingReset}
          onClick={async () => {
            setIsSendingReset(true);
            setPasswordMessage(null);
            const result = await sendCurrentUserPasswordReset(user.email);
            setPasswordMessage({
              tone: result.ok ? "success" : "error",
              text: result.message ?? "Something went wrong."
            });
            setIsSendingReset(false);
          }}
          className="mt-4 w-full rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
        >
          {isSendingReset ? "Sending..." : "Reset My Password"}
        </button>
      </div>
    </section>
  );
}
