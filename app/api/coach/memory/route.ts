import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import {
  flushMemories,
  forgetLearning,
  memorySettings,
  queueMemory,
  recallLearning,
  setMemoryEnabled,
} from "@/lib/supermemory";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const delivery = await flushMemories(userId, 1);
  const recalled = await recallLearning(
    userId,
    "Learning preferences, debugging lessons, recently practiced programming concepts",
  );
  const settings = await memorySettings(userId);
  return NextResponse.json(
    { enabled: settings.enabled, ...recalled, delivery },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = await request.json();
    const userId = session.user.id;
    if (body.action === "enable" && typeof body.enabled === "boolean") {
      await setMemoryEnabled(userId, body.enabled);
      return NextResponse.json({ enabled: body.enabled });
    }
    if (body.action === "forget")
      return NextResponse.json(await forgetLearning(userId));
    if (
      body.action === "remember" &&
      typeof body.text === "string" &&
      body.text.trim() &&
      body.text.length <= 1000
    ) {
      const settings = await memorySettings(userId);
      if (!settings.enabled)
        return NextResponse.json(
          { error: "Enable learning memory first." },
          { status: 400 },
        );
      const usage = (await getDatabase()).collection<{
        _id: string;
        count: number;
      }>("memoryNoteUsage");
      const _id = `${userId}:${new Date().toISOString().slice(0, 10)}`;
      await usage.updateOne(
        { _id },
        { $setOnInsert: { count: 0 } },
        { upsert: true },
      );
      if (
        !(await usage.findOneAndUpdate(
          { _id, count: { $lt: 20 } },
          { $inc: { count: 1 } },
        ))
      )
        return NextResponse.json(
          { error: "Daily learning-note limit reached." },
          { status: 429 },
        );
      await queueMemory(
        userId,
        `The learner explicitly asked to remember this learning preference or lesson: ${body.text}`,
      );
      return NextResponse.json(await flushMemories(userId, 2));
    }
    return NextResponse.json(
      { error: "Invalid memory operation." },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { error: "Memory operation failed. Retry later." },
      { status: 502 },
    );
  }
}
