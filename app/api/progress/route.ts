import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

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
