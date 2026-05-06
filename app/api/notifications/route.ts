import { NextResponse } from "next/server";
import {
  fetchCurrentUserNotifications,
  markCurrentUserNotificationsRead
} from "@/lib/notifications";
import { logSafeSupabaseError } from "@/lib/supabase-errors";

export async function GET() {
  try {
    const result = await fetchCurrentUserNotifications();
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "This section is temporarily unavailable while the app database is being updated."
        },
        { status: 503 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    logSafeSupabaseError("notifications-route-get", error);
    return NextResponse.json(
      {
        ok: false,
        message: "This section is temporarily unavailable while the app database is being updated."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let notificationId: string | undefined;

  try {
    try {
      const body = (await request.json()) as { notificationId?: string };
      notificationId = body?.notificationId;
    } catch {
      notificationId = undefined;
    }

    const result = await markCurrentUserNotificationsRead(notificationId);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "This section is temporarily unavailable while the app database is being updated."
        },
        { status: 503 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    logSafeSupabaseError("notifications-route-post", error, { hasNotificationId: Boolean(notificationId) });
    return NextResponse.json(
      {
        ok: false,
        message: "This section is temporarily unavailable while the app database is being updated."
      },
      { status: 500 }
    );
  }
}
