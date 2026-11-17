import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { loadGradingChallenge, resolveWorkspace } from "@/lib/challenge-catalog";
import { isChallengeId } from "@/lib/challenge-model";
import {
  ownedSandbox,
  pullFiles,
  runVerifiedTests,
  sandboxConfigured,
  startSession,
  stopSession,
  syncEditor,
} from "@/lib/linux-sandbox";
import { SandboxProblem, validateFiles } from "@/lib/sandbox-policy";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "Sign in to use Linux." },
      { status: 401 },
    );
  return NextResponse.json(
    { configured: sandboxConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "Sign in to use Linux." },
      { status: 401 },
    );
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  try {
    const text = await request.text();
    if (text.length > 2000000)
      throw new SandboxProblem("Workspace is too large.", 413);
    const body = JSON.parse(text);
    const challengeId: unknown = body.challengeId;
    if (!isChallengeId(challengeId)) throw new SandboxProblem("Invalid challenge ID.");
    const userId = session.user.id;
    switch (body.action) {
      case "status":
        await ownedSandbox(userId, challengeId);
        return NextResponse.json({ active: true });
      case "start": {
        const target = await resolveWorkspace(challengeId, userId, body.revision);
        return NextResponse.json(
          await startSession(userId, target.details, validateFiles(body.files)),
        );
      }
      case "stop":
        await stopSession(userId, challengeId);
        return NextResponse.json({ stopped: true });
      case "sync":
        return NextResponse.json(
          await syncEditor(
            userId,
            challengeId,
            validateFiles(body.files),
            validateFiles(body.base),
          ),
        );
      case "pull":
        return NextResponse.json({
          files: await pullFiles(userId, challengeId),
        });
      case "run": {
        const target = await resolveWorkspace(challengeId, userId, body.revision);
        const { challenge, plan, legacy } = await loadGradingChallenge(target);
        const files = validateFiles(body.files);
        const grading = plan
          ? await runVerifiedTests(userId, challenge, files, plan)
          : {
              results: legacy!.evaluate(files).map((row) => ({ ...row, kind: "static" as const })),
              durationMs: 0,
              output: "Static checks only for this challenge.",
            };
        await (
          await getDatabase()
        )
          .collection("testRuns")
          .insertOne({
            userId,
            challengeId,
            ...(challenge.revision ? { challengeRevision: challenge.revision } : {}),
            at: new Date(),
            results: grading.results,
            output: grading.output.slice(-6000),
          });
        return NextResponse.json(grading);
      }
      case "input": {
        if (typeof body.data !== "string" || body.data.length > 8192)
          throw new SandboxProblem("Terminal input exceeds limits.");
        const { sandbox, row } = await ownedSandbox(userId, challengeId, true);
        await sandbox.pty.sendInput(
          row.pid!,
          new TextEncoder().encode(body.data),
        );
        return NextResponse.json({ sent: true });
      }
      case "resize": {
        if (
          !Number.isInteger(body.cols) ||
          !Number.isInteger(body.rows) ||
          body.cols < 10 ||
          body.cols > 400 ||
          body.rows < 2 ||
          body.rows > 200
        )
          throw new SandboxProblem("Invalid terminal size.");
        const { sandbox, row } = await ownedSandbox(userId, challengeId);
        await sandbox.pty.resize(row.pid!, {
          cols: body.cols,
          rows: body.rows,
        });
        return NextResponse.json({ resized: true });
      }
      default:
        throw new SandboxProblem("Unknown Linux action.");
    }
  } catch (error) {
    const known = error instanceof SandboxProblem;
    return NextResponse.json(
      {
        error: known
          ? error.message
          : "The sandbox service could not complete this operation. Retry or start a new session.",
      },
      { status: known ? error.status : 502 },
    );
  }
}
