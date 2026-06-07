import { NextResponse } from "next/server";
import { submitUgcReport, type SubmitUgcReportInput } from "@/lib/ugc-safety";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<SubmitUgcReportInput>;
    const result = await submitUgcReport({
      targetType: body.targetType!,
      targetId: body.targetId ?? "",
      groupId: body.groupId ?? null,
      reason: body.reason!,
      details: body.details ?? null,
      contextUrl: body.contextUrl ?? null
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to submit UGC report.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not submit that report right now."
      },
      { status: 500 }
    );
  }
}
