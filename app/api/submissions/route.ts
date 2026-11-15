import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { rememberLearningEvent } from "@/lib/supermemory";
import { getChallenge, runVerifiedTests } from "@/lib/linux-sandbox";
import {
  executionPlan,
  SandboxProblem,
  validateFiles,
} from "@/lib/sandbox-policy";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (typeof body.challengeId !== "string" || !body.files) {
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
  let grading;
  try {
    const challenge = getChallenge(body.challengeId);
    const submittedFiles = validateFiles(body.files);
    grading = executionPlan(challenge.id)
      ? await runVerifiedTests(session.user.id, challenge, submittedFiles)
      : {
          results: challenge.evaluate(submittedFiles),
          durationMs: 0,
          output: "Static checks only for this challenge.",
        };
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SandboxProblem
            ? error.message
            : "Could not verify this submission. Please retry.",
      },
      { status: error instanceof SandboxProblem ? error.status : 502 },
    );
  }
  const passed =
    grading.results.length > 0 && grading.results.every((row) => row.pass);
  const now = new Date();
  const db = await getDatabase();
  await Promise.all([
    db.collection("submissions").insertOne({
      userId: session.user.id,
      challengeId: body.challengeId,
      files: body.files,
      results: grading.results,
      passed,
      durationMs: grading.durationMs,
      gradingMode: executionPlan(body.challengeId) ? "sandbox" : "static",
      output: grading.output.slice(-6000),
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
  await rememberLearningEvent(session.user.id, {
    challengeId: body.challengeId,
    type: passed ? "submission_passed" : "submission_failed",
    summary: passed
      ? "Completed the challenge successfully."
      : `${grading.results.filter((row) => !row.pass).length} checks remained failing.`,
  }).catch(() => undefined);
  return NextResponse.json({ submitted: true, passed, ...grading });
}
