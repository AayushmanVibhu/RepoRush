import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

type Params = { params: Promise<{ challengeId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { challengeId } = await params;
  const db = await getDatabase();
  const progress = await db
    .collection("challengeProgress")
    .findOne(
      { userId: session.user.id, challengeId },
      { projection: { _id: 0 } },
    );
  return NextResponse.json({ progress });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { challengeId } = await params;
  const body = await request.json();
  if (
    !body.files ||
    typeof body.files !== "object" ||
    Array.isArray(body.files)
  ) {
    return NextResponse.json(
      { error: "A file map is required" },
      { status: 400 },
    );
  }
  const entries = Object.entries(body.files);
  if (
    entries.length > 100 ||
    entries.some(
      ([path, value]) =>
        path.length > 300 ||
        typeof value !== "string" ||
        value.length > 250_000,
    )
  ) {
    return NextResponse.json(
      { error: "Workspace exceeds save limits" },
      { status: 413 },
    );
  }
  const now = new Date();
  const db = await getDatabase();
  await db.collection("challengeProgress").updateOne(
    { userId: session.user.id, challengeId },
    {
      $set: {
        files: body.files,
        // Completion is awarded only by the server-verified submissions endpoint.
        status: "in-progress",
        updatedAt: now,
      },
      $setOnInsert: {
        userId: session.user.id,
        challengeId,
        startedAt: now,
        revealedHints: 0,
        attempts: 0,
      },
    },
    { upsert: true },
  );
  return NextResponse.json({ saved: true, updatedAt: now });
}
