import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabase, getMongoClient } from "@/lib/mongodb";
import { rememberLearningEvent } from "@/lib/supermemory";
import { runVerifiedTests } from "@/lib/linux-sandbox";
import {
  challengeError,
  loadGradingChallenge,
  resolveWorkspace,
  saveWorkspaceProgress,
} from "@/lib/challenge-catalog";
import { SandboxProblem, validateFiles } from "@/lib/sandbox-policy";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const submittedFiles = validateFiles(body?.files);
    const userId = session.user.id;
    const target = await resolveWorkspace(
      body.challengeId,
      userId,
      body.revision,
    );
    if (
      body.baseUpdatedAt !== undefined &&
      (target.progress?.updatedAt?.toISOString() ?? null) !== body.baseUpdatedAt
    ) {
      throw new SandboxProblem(
        "The saved workspace changed. Reopen the challenge before submitting.",
        409,
      );
    }
    const { challenge, legacy, plan } = await loadGradingChallenge(target);
    const grading = plan
      ? await runVerifiedTests(userId, challenge, submittedFiles, plan)
      : {
          results: legacy!
            .evaluate(submittedFiles)
            .map((row) => ({ ...row, kind: "static" as const })),
          durationMs: 0,
          output: "Static checks only for this challenge.",
        };
    const passed =
      grading.results.length > 0 &&
      grading.results.every((row) => row.pass && !row.skipped);
    const db = await getDatabase();
    const now = await (
      await getMongoClient()
    ).withSession((session) =>
      session.withTransaction(async () => {
        const savedAt = await saveWorkspaceProgress(
          userId,
          target,
          submittedFiles,
          { passed },
          body.baseUpdatedAt,
          session,
        );
        await db.collection("submissions").insertOne(
          {
            userId,
            challengeId: challenge.id,
            ...(challenge.revision
              ? { challengeRevision: challenge.revision }
              : {}),
            files: submittedFiles,
            results: grading.results,
            passed,
            durationMs: grading.durationMs,
            gradingMode: challenge.gradingMode,
            output: grading.output.slice(-6000),
            submittedAt: savedAt,
          },
          { session },
        );
        return savedAt;
      }),
    );
    await rememberLearningEvent(userId, {
      challengeId: challenge.id,
      type: passed ? "submission_passed" : "submission_failed",
      summary: passed
        ? "Completed the challenge successfully."
        : `${grading.results.filter((row) => !row.pass).length} checks remained failing.`,
    }).catch(() => undefined);
    return NextResponse.json({
      submitted: true,
      passed,
      updatedAt: now,
      ...grading,
    });
  } catch (error) {
    if (error instanceof SandboxProblem) return challengeError(error);
    console.error(
      "[challenge-submission]",
      error instanceof Error ? error.name : "SubmissionError",
    );
    return NextResponse.json(
      { error: "Could not verify this submission. Please retry." },
      { status: 502 },
    );
  }
}
