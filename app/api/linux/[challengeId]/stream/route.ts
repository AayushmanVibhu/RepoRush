import { NextRequest } from "next/server";
import type { CommandHandle } from "e2b";
import { auth } from "@/lib/auth";
import { getChallenge, ownedSandbox } from "@/lib/linux-sandbox";
import { SandboxProblem } from "@/lib/sandbox-policy";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { challengeId } = await params;
    getChallenge(challengeId);
    const { sandbox, row } = await ownedSandbox(session.user.id, challengeId);
    let handle: CommandHandle | undefined;
    let close = () => {};
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let ended = false;
        const send = (event: string, value: unknown) => {
          if (!ended)
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`,
              ),
            );
        };
        const heartbeat = setInterval(() => send("heartbeat", {}), 10000);
        const timer = setTimeout(() => close(), 45000);
        close = () => {
          if (ended) return;
          ended = true;
          clearInterval(heartbeat);
          clearTimeout(timer);
          request.signal.removeEventListener("abort", close);
          handle?.disconnect().catch(() => undefined);
          try {
            controller.close();
          } catch {}
        };
        request.signal.addEventListener("abort", close, { once: true });
        if (request.signal.aborted) {
          close();
          return;
        }
        try {
          const decoder = new TextDecoder();
          let bytes = 0;
          handle = await sandbox.pty.connect(row.pid!, {
            timeoutMs: 50000,
            onData: (data) => {
              bytes += data.byteLength;
              if (bytes > 2000000) {
                send("terminal-error", {
                  error:
                    "Terminal output limit reached. Stop Linux to terminate a noisy command.",
                });
                close();
                return;
              }
              send("output", { data: decoder.decode(data, { stream: true }) });
            },
          });
          if (ended) {
            await handle.disconnect();
            return;
          }
          send("connected", {});
          await handle.wait();
          send("ended", {});
        } catch {
          send("terminal-error", {
            error: "Terminal disconnected. Reconnect or start a new session.",
          });
        } finally {
          close();
        }
      },
      cancel() {
        close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SandboxProblem
            ? error.message
            : "Linux session unavailable.",
      },
      { status: error instanceof SandboxProblem ? error.status : 502 },
    );
  }
}
