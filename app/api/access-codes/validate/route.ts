import { NextResponse } from "next/server";
import { validateAccessCodeAvailability } from "@/lib/access-codes-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const preview = (body.code ?? "").replace(/\s+/g, "").trim().toLowerCase();
    console.info("[access-code:validate] Validating access code.", {
      hasCode: Boolean(preview),
      codePreview: preview ? `${preview.slice(0, 4)}...` : null
    });

    const result = await validateAccessCodeAvailability(body.code ?? "");

    if (!result.ok) {
      console.warn("[access-code:validate] Access code unavailable.", {
        reason: result.reason
      });
      return NextResponse.json(result, { status: 200 });
    }

    console.info("[access-code:validate] Access code is available.");
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Could not validate access code.", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Could not validate that code right now."
      },
      { status: 500 }
    );
  }
}
