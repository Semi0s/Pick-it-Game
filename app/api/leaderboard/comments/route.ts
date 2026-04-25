import { NextResponse } from "next/server";
import { addLeaderboardEventComment } from "@/lib/leaderboard-comments";

type CommentRequestBody = {
  eventId?: string;
  body?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CommentRequestBody;
    const result = await addLeaderboardEventComment(body.eventId?.trim() ?? "", body.body ?? "");

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to add leaderboard comment.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not add the comment right now."
      },
      { status: 500 }
    );
  }
}
