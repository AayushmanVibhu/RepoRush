import { auth } from "@/lib/auth";
import {
  challengeCatalogSource,
  challengeError,
  learnerFiles,
  legacyDraftRevision,
  legacyWorkspace,
  publishedSnapshot,
  resolveWorkspace,
} from "@/lib/challenge-catalog";
import { SandboxProblem } from "@/lib/sandbox-policy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { challengeId } = await params;
    const query = new URL(request.url).searchParams;
    const snapshotHash = query.get("snapshot");
    const source = challengeCatalogSource();
    if (source === "legacy") {
      if (snapshotHash !== null)
        throw new SandboxProblem(
          "The active catalog changed. Reload the challenge library.",
          409,
        );
      const resolved = legacyWorkspace(challengeId);
      return Response.json({
        source,
        challenge: resolved.details,
        draftRevision: legacyDraftRevision(resolved.legacy!),
        files: await learnerFiles(resolved),
      });
    }
    if (snapshotHash !== null) {
      return Response.json(
        await publishedSnapshot(challengeId, {
          snapshotHash,
          version: query.get("version"),
        }),
      );
    }
    const draftHash = query.get("draftHash");
    const requested =
      draftHash === null
        ? undefined
        : { version: query.get("draftVersion"), snapshotHash: draftHash };
    const resolved = await resolveWorkspace(
      challengeId,
      session.user.id,
      requested,
      { imported: query.has("legacyDraft") },
    );
    return Response.json({
      source,
      challenge: resolved.details,
      progress: resolved.progress
        ? {
            files: resolved.progress.files,
            updatedAt: resolved.progress.updatedAt,
          }
        : null,
    });
  } catch (error) {
    return challengeError(error);
  }
}
