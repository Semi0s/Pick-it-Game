import { NextResponse } from "next/server";
import { blockUser, unblockUser } from "@/lib/ugc-safety";

type BlockRequestBody = {
  userId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BlockRequestBody;
    const result = await blockUser(body.userId ?? "");

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to block user.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not block that player right now."
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as BlockRequestBody;
    const result = await unblockUser(body.userId ?? "");

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to unblock user.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not unblock that player right now."
      },
      { status: 500 }
    );
  }
}
