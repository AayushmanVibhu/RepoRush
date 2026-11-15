import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { rememberLearningEvent } from "@/lib/supermemory";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (
    typeof body.challengeId !== "string" ||
    !Array.isArray(body.results) ||
    !body.files
  ) {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  }
  const files = Object.entries(body.files as Record<string, unknown>);
  if (
    files.length > 100 ||
    files.some(
      ([path, value]) =>
        path.length > 300 ||
        typeof value !== "string" ||
        value.length > 250_000,
    )
  ) {
    return NextResponse.json(
      { error: "Submission exceeds size limits" },
      { status: 413 },
    );
  }
  const passed =
    body.results.length > 0 &&
    body.results.every((row: { pass?: boolean }) => row.pass === true);
  const now = new Date();
  const db = await getDatabase();
  await Promise.all([
    db.collection("submissions").insertOne({
      userId: session.user.id,
      challengeId: body.challengeId,
      files: body.files,
      results: body.results,
      passed,
      durationMs: Number(body.durationMs) || 0,
      submittedAt: now,
    }),
    db.collection("challengeProgress").updateOne(
      { userId: session.user.id, challengeId: body.challengeId },
      {
        $set: {
          files: body.files,
          status: passed ? "completed" : "in-progress",
          updatedAt: now,
          ...(passed ? { completedAt: now } : {}),
        },
        $inc: { attempts: 1 },
        $setOnInsert: { startedAt: now, revealedHints: 0 },
      },
      { upsert: true },
    ),
  ]);
  rememberLearningEvent(session.user.id, {
    challengeId: body.challengeId,
    type: passed ? "submission_passed" : "submission_failed",
    summary: passed
      ? "Completed the challenge successfully."
      : `${body.results.filter((row: { pass?: boolean }) => !row.pass).length} checks remained failing.`,
  }).catch(() => undefined);
  return NextResponse.json({ submitted: true, passed });
}
