import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rememberLearningEvent, type LearningEvent } from "@/lib/supermemory";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const event = (await request.json()) as LearningEvent;
  if (
    typeof event.challengeId !== "string" ||
    event.challengeId.length > 100 ||
    typeof event.summary !== "string" ||
    event.summary.length > 1_000 ||
    !["challenge_started", "hint_revealed"].includes(event.type)
  ) {
    return NextResponse.json(
      { error: "Invalid learning event" },
      { status: 400 },
    );
  }
  const result = await rememberLearningEvent(session.user.id, event);
  return NextResponse.json(result);
}
