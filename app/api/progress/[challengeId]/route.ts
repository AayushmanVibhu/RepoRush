import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  challengeCatalogSource,
  challengeError,
  legacyWorkspace,
  readWorkspaceProgress,
  resolveWorkspace,
  saveWorkspaceProgress,
  checkLegacyRevision,
} from "@/lib/challenge-catalog";
import { SandboxProblem, validateFiles } from "@/lib/sandbox-policy";

type Params = { params: Promise<{ challengeId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { challengeId } = await params;
  try {
    const progress = await readWorkspaceProgress(session.user.id, challengeId);
    if (challengeCatalogSource() === "legacy") {
      checkLegacyRevision(
        legacyWorkspace(challengeId).legacy!,
        progress?.challengeRevision,
      );
    }
    if (!progress) return NextResponse.json({ progress: null });
    const { _id, ...saved } = progress;
    return NextResponse.json({ progress: saved });
  } catch (error) {
    return challengeError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { challengeId } = await params;
  try {
    const body = await request.json().catch(() => null);
    const files = validateFiles(body?.files);
    if (body.baseUpdatedAt != null && typeof body.baseUpdatedAt !== "string") {
      throw new SandboxProblem("Invalid workspace timestamp.");
    }
    const target = await resolveWorkspace(
      challengeId,
      session.user.id,
      body.revision,
    );
    const updatedAt = await saveWorkspaceProgress(
      session.user.id,
      target,
      files,
      undefined,
      body.baseUpdatedAt,
    );
    return NextResponse.json({ saved: true, updatedAt });
  } catch (error) {
    return challengeError(error);
  }
}
