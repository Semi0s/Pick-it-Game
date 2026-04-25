import { NextResponse } from "next/server";
import { addLeaderboardEventReaction, removeLeaderboardEventReaction } from "@/lib/leaderboard-reactions";

type ReactionRequestBody = {
  eventId?: string;
  emoji?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReactionRequestBody;
    const result = await addLeaderboardEventReaction(body.eventId?.trim() ?? "", body.emoji?.trim() ?? "");

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to add leaderboard reaction.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not add the reaction right now."
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as ReactionRequestBody;
    const result = await removeLeaderboardEventReaction(body.eventId?.trim() ?? "", body.emoji?.trim() ?? "");

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to remove leaderboard reaction.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not remove the reaction right now."
      },
      { status: 500 }
    );
  }
}
