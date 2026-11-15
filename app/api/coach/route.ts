import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChallenge } from "@/lib/linux-sandbox";
import { validateFiles } from "@/lib/sandbox-policy";
import {
  COACH_MODES,
  CoachError,
  type CoachMode,
  type CoachPatch,
} from "@/lib/coach-policy";
import {
  clearConversation,
  coachConfigured,
  coachModel,
  coachPermit,
  completeCoach,
  geminiAnswer,
  getConversation,
  patchFrom,
  prepareCoach,
} from "@/lib/coach";
import { memorySettings, flushMemories } from "@/lib/supermemory";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "Sign in to use the coach." },
      { status: 401 },
    );
  try {
    const challenge = getChallenge(
      request.nextUrl.searchParams.get("challengeId"),
    );
    const userId = session.user.id;
    const [chat, settings] = await Promise.all([
      getConversation(userId, challenge.id),
      memorySettings(userId),
    ]);
    return NextResponse.json(
      {
        messages: chat?.messages || [],
        configured: coachConfigured(),
        model: coachModel(),
        memoryConfigured: Boolean(process.env.SUPERMEMORY_API_KEY),
        memoryEnabled: settings.enabled,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load coaching history." },
      { status: 400 },
    );
  }
}
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    await clearConversation(
      session.user.id,
      getChallenge(request.nextUrl.searchParams.get("challengeId")).id,
    );
    return NextResponse.json({ cleared: true });
  } catch {
    return NextResponse.json(
      { error: "Could not clear this conversation." },
      { status: 400 },
    );
  }
}
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "Sign in to use the coach." },
      { status: 401 },
    );
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let release: (() => Promise<void>) | undefined;
  try {
    if (!coachConfigured())
      throw new CoachError(
        "The administrator needs to configure GEMINI_API_KEY.",
        503,
      );
    const raw = await request.text();
    if (raw.length > 250000)
      throw new CoachError("Coaching context is too large.", 413);
    const body = JSON.parse(raw);
    const challenge = getChallenge(body.challengeId);
    if (
      body.consent !== true ||
      !COACH_MODES.includes(body.mode) ||
      typeof body.question !== "string" ||
      !body.question.trim() ||
      body.question.length > 4000 ||
      typeof body.selected !== "string"
    )
      throw new CoachError(
        "Confirm code-sharing consent and provide a valid question.",
      );
    const files = validateFiles(body.files);
    if (!(body.selected in files))
      throw new CoachError("Include the selected file in the shared context.");
    release = await coachPermit(session.user.id);
    const prepared = await prepareCoach(session.user.id, challenge, {
      mode: body.mode as CoachMode,
      question: body.question,
      selected: body.selected,
      files,
      selection: typeof body.selection === "string" ? body.selection : "",
      output: typeof body.output === "string" ? body.output : "",
    });
    const releaseLease = release;
    release = undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        let answer = "";
        let patch: CoachPatch | undefined;
        const send = (type: string, data: unknown) => {
          if (!closed)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type, ...(data as object) })}\n\n`,
              ),
            );
        };
        try {
          send("context", {
            memories: prepared.recalled.memories,
            memoryStatus: prepared.recalled.status,
            model: coachModel(),
          });
          for await (const chunk of geminiAnswer(
            prepared.context.prompt,
            prepared.conversation?.messages || [],
            body.mode,
            request.signal,
          )) {
            if (request.signal.aborted) throw new Error("Disconnected");
            if (chunk.type === "text") {
              answer = (answer + chunk.text).slice(0, 16000);
              send("token", { text: chunk.text });
            } else if (["debug", "review"].includes(body.mode)) {
              patch = patchFrom(chunk.args, prepared.context.shared);
            }
          }
          if (!answer.trim())
            answer = patch
              ? "Review the proposed edit below, apply it if appropriate, then run the tests."
              : "No response was produced. Try a more specific question.";
          const messages = await completeCoach(
            session.user.id,
            challenge.id,
            body.question,
            answer,
            prepared.recalled.memories,
            patch,
            prepared.conversation?.threadId,
          );
          send("done", { messages, patch });
        } catch (error) {
          const status = Number((error as { status?: number }).status);
          send("error", {
            error:
              status === 429
                ? "Gemini free-tier quota reached. Wait before trying again."
                : status === 503
                  ? "Gemini is temporarily busy. Please retry in a moment; no edit was applied."
                  : status === 404
                    ? "The configured Gemini model is unavailable. Ask the administrator to update GEMINI_MODEL."
                    : "The coach could not finish this response. Retry; no edit was applied.",
          });
        } finally {
          closed = true;
          await releaseLease();
          try {
            controller.close();
          } catch {}
        }
      },
      cancel() {
        void releaseLease();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (release) await release();
    return NextResponse.json(
      {
        error:
          error instanceof CoachError
            ? error.message
            : "Could not prepare the coach. Please retry.",
      },
      { status: error instanceof CoachError ? error.status : 502 },
    );
  }
}
