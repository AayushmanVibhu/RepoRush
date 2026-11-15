import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { stopSession } from "@/lib/linux-sandbox";

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = await request.json();
    if (body.confirmation !== "DELETE MY PROGRESS")
      return NextResponse.json(
        { error: "Confirm progress deletion first." },
        { status: 400 },
      );
    const userId = session.user.id;
    const db = await getDatabase();
    const linux = await db
      .collection<{ _id: string; challengeId?: string }>("linuxSessions")
      .findOne({ _id: userId });
    if (linux?.challengeId) await stopSession(userId, linux.challengeId);
    await Promise.all(
      ["challengeProgress", "submissions", "testRuns"].map((name) =>
        db.collection(name).deleteMany({ userId }),
      ),
    );
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json(
      { error: "Could not finish deleting progress. Please retry." },
      { status: 502 },
    );
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDatabase();
  const rows = await db
    .collection("challengeProgress")
    .find(
      { userId: session.user.id },
      { projection: { challengeId: 1, status: 1, updatedAt: 1 } },
    )
    .toArray();
  return NextResponse.json({
    progress: rows.map(({ challengeId, status, updatedAt }) => ({
      challengeId,
      status,
      updatedAt,
    })),
  });
}
