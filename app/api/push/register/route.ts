import { NextResponse } from "next/server";
import {
  registerCurrentUserPushToken,
  type PushPermissionState,
  type PushPlatform
} from "@/lib/push-notifications";

type PushRegistrationRequestBody = {
  token?: string;
  platform?: PushPlatform;
  permissionState?: PushPermissionState;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PushRegistrationRequestBody;
    const result = await registerCurrentUserPushToken({
      token: body.token?.trim() ?? "",
      platform: (body.platform ?? "web") as PushPlatform,
      permissionState: body.permissionState
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to register push token.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not register push notifications right now."
      },
      { status: 500 }
    );
  }
}
