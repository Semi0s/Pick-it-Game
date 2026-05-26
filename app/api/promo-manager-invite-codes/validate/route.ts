import { NextResponse } from "next/server";
import { validatePromoManagerInviteCodeAvailability } from "@/lib/promo-manager-invite-codes-server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code : "";
    const result = await validatePromoManagerInviteCodeAvailability(code);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: result.reason
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not validate promo invite code.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
