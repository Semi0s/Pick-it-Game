export function getPublicWebPushVapidKey() {
  return process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
}
