import { NextResponse } from "next/server";
import {
  fetchCurrentUserNotifications,
  markCurrentUserNotificationsRead
} from "@/lib/notifications";

export async function GET() {
  try {
    const result = await fetchCurrentUserNotifications();
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load notifications.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load notifications right now."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let notificationId: string | undefined;

    try {
      const body = (await request.json()) as { notificationId?: string };
      notificationId = body?.notificationId;
    } catch {
      notificationId = undefined;
    }

    const result = await markCurrentUserNotificationsRead(notificationId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to mark notifications as read.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not mark notifications as read right now."
      },
      { status: 500 }
    );
  }
}
