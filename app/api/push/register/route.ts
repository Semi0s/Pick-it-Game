import { NextResponse } from "next/server";
import { registerCurrentUserPushToken, type PushPlatform } from "@/lib/push-notifications";

type PushRegistrationRequestBody = {
  token?: string;
  platform?: PushPlatform;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PushRegistrationRequestBody;
    const result = await registerCurrentUserPushToken({
      token: body.token?.trim() ?? "",
      platform: (body.platform ?? "web") as PushPlatform
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
