"use client";
import type { ChallengeRevision } from "@/lib/challenge-model";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { mergeFiles, type WorkspaceFiles } from "@/lib/sandbox-policy";

export async function linuxRequest(
  action: string,
  challengeId: string,
  extra: Record<string, unknown> = {},
) {
  const response = await fetch("/api/linux", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, challengeId, ...extra }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Linux operation failed.");
  return result;
}
function equalFiles(a: WorkspaceFiles, b: WorkspaceFiles) {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((path) => a[path] === b[path])
  );
}
export function LinuxTerminal({
  challengeId,
  revision,
  files,
  onFilesChange,
  visible,
}: {
  challengeId: string;
  revision?: ChallengeRevision;
  files: WorkspaceFiles;
  onFilesChange: (files: WorkspaceFiles) => void;
  visible: boolean;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflicted, setConflicted] = useState(false);
  const [status, setStatus] = useState("Stopped");
  const [syncTick, setSyncTick] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fit = useRef<(() => void) | null>(null);
  const current = useRef(files);
  const base = useRef<WorkspaceFiles>({});
  const remote = useRef<WorkspaceFiles>({});
  const conflict = useRef(false);
  const syncing = useRef(false);
  const events = useRef<EventSource | null>(null);
  current.current = files;
  const change = useRef(onFilesChange);
  change.current = onFilesChange;

  useEffect(() => {
    let active = true;
    fetch("/api/linux")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Cannot check Linux availability.");
        if (active) setConfigured(data.configured);
      })
      .catch((error) => {
        if (active) {
          setConfigured(false);
          setError(error.message);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const pull = useCallback(async () => {
    if (syncing.current || conflict.current) return;
    syncing.current = true;
    try {
      const data = await linuxRequest("pull", challengeId);
      const pulled = data.files as WorkspaceFiles;
      remote.current = pulled;
      const merged = mergeFiles(current.current, base.current, pulled);
      if (merged.conflicts.length) {
        conflict.current = true;
        setConflicted(true);
        setError(
          `Both editors changed ${merged.conflicts.join(", ")}. Choose which version to keep.`,
        );
      } else {
        base.current = pulled;
        if (!equalFiles(current.current, merged.files))
          change.current(merged.files);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      syncing.current = false;
    }
  }, [challengeId]);

  useEffect(() => {
    if (!started) return;
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !host.current) return;
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        scrollback: 2000,
        theme: {
          background: "#0d0f12",
          foreground: "#d7c5a4",
          cursor: "#5fad83",
          selectionBackground: "#293552",
        },
      });
      const addon = new FitAddon();
      term.loadAddon(addon);
      term.open(host.current);
      terminal.current = term;
      let resizeTimer: ReturnType<typeof setTimeout>;
      fit.current = () => {
        if (!host.current?.clientWidth || !host.current?.clientHeight) return;
        addon.fit();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          void linuxRequest("resize", challengeId, {
            cols: Math.max(10, Math.min(400, term.cols)),
            rows: Math.max(2, Math.min(200, term.rows)),
          }).catch(() => undefined);
        }, 200);
      };
      const observer = new ResizeObserver(() => fit.current?.());
      observer.observe(host.current);
      fit.current();
      let pending = "";
      let inputTimer: ReturnType<typeof setTimeout>;
      let inputQueue = Promise.resolve();
      const flush = () => {
        const data = pending.slice(0, 8192);
        pending = pending.slice(8192);
        if (data)
          inputQueue = inputQueue
            .then(async () => {
              await linuxRequest("input", challengeId, { data });
            })
            .catch((error) => {
              setError(error.message);
            });
        if (pending) inputTimer = setTimeout(flush, 80);
      };
      const listener = term.onData((data) => {
        pending += data;
        clearTimeout(inputTimer);
        inputTimer = setTimeout(flush, 80);
      });
      const source = new EventSource(
        `/api/linux/${encodeURIComponent(challengeId)}/stream`,
      );
      events.current = source;
      source.addEventListener("output", (event) => {
        const data = JSON.parse((event as MessageEvent).data).data;
        term.write(data);
      });
      source.addEventListener("connected", () => {
        setStatus("Connected");
      });
      source.addEventListener("terminal-error", (event) => {
        setError(JSON.parse((event as MessageEvent).data).error);
        setStatus("Disconnected");
        source.close();
      });
      source.addEventListener("ended", () => {
        setStatus("Shell exited — stop and start to create a new shell");
        source.close();
      });
      source.onerror = () => {
        setStatus("Reconnecting…");
        void linuxRequest("status", challengeId).catch((error) => {
          if (disposed) return;
          setError(error.message);
          setStatus("Session ended");
          source.close();
          setStarted(false);
        });
      };
      term.writeln(
        "Linux workspace connected. Press Enter for the shell prompt.",
      );
      cleanup = () => {
        source.close();
        observer.disconnect();
        listener.dispose();
        clearTimeout(inputTimer);
        clearTimeout(resizeTimer);
        term.dispose();
        terminal.current = null;
        fit.current = null;
      };
      if (disposed) cleanup();
    })().catch((error) => setError(error.message));
    return () => {
      disposed = true;
      cleanup();
    };
  }, [started, challengeId]);
  useEffect(() => {
    if (visible) fit.current?.();
  }, [visible]);
  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => {
      void pull();
    }, 5000);
    const retry = setInterval(() => setSyncTick((tick) => tick + 1), 2500);
    return () => {
      clearInterval(timer);
      clearInterval(retry);
    };
  }, [started, pull]);
  useEffect(() => {
    if (!started || conflict.current) return;
    const timer = setTimeout(async () => {
      if (syncing.current || equalFiles(current.current, base.current)) return;
      syncing.current = true;
      const captured = { ...current.current };
      try {
        await linuxRequest("sync", challengeId, {
          files: captured,
          base: base.current,
        });
        base.current = captured;
      } catch (error) {
        setError((error as Error).message);
      } finally {
        syncing.current = false;
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [files, started, challengeId, syncTick]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const captured = { ...current.current };
      const data = await linuxRequest("start", challengeId, {
        revision,
        files: captured,
      });
      base.current = captured;
      if (data.reused) {
        const loaded = await linuxRequest("pull", challengeId);
        remote.current = loaded.files;
        if (!equalFiles(captured, loaded.files)) {
          conflict.current = true;
          setConflicted(true);
          setError(
            "An existing Linux session has different files. Choose the editor or Linux version.",
          );
        }
      }
      setStatus("Connecting…");
      setStarted(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      if (!conflict.current) await pull();
      if (conflict.current)
        throw new Error(
          "Resolve the file conflict before stopping Linux so neither version is lost.",
        );
      await linuxRequest("stop", challengeId);
      events.current?.close();
      setStarted(false);
      setStatus("Stopped");
      conflict.current = false;
      setConflicted(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const resolveConflict = async (useEditor: boolean) => {
    setBusy(true);
    try {
      if (useEditor) {
        const latest = await linuxRequest("pull", challengeId);
        await linuxRequest("sync", challengeId, {
          files: current.current,
          base: latest.files,
        });
        base.current = { ...current.current };
      } else {
        base.current = remote.current;
        change.current({ ...remote.current });
      }
      conflict.current = false;
      setConflicted(false);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="linux-panel" aria-label="Linux terminal">
      <div className="linux-toolbar">
        <span aria-live="polite">{status}</span>
        {!started ? (
          <button disabled={busy || configured !== true} onClick={start}>
            {busy ? "Starting Linux…" : "Start Linux"}
          </button>
        ) : (
          <>
            <button
              disabled={busy}
              onClick={() => {
                setError("");
                void pull();
              }}
            >
              Load Linux files
            </button>
            <button disabled={busy} onClick={stop}>
              Stop Linux
            </button>
          </>
        )}
      </div>
      {configured === false && (
        <p className="linux-notice">
          {error ||
            "Linux is not configured yet. The administrator needs to add E2B_API_KEY."}
        </p>
      )}
      {configured !== false && error && (
        <p className="linux-notice" role="alert">
          {error}
        </p>
      )}
      {conflicted && (
        <div className="linux-conflict">
          <button disabled={busy} onClick={() => resolveConflict(false)}>
            Use Linux files
          </button>
          <button disabled={busy} onClick={() => resolveConflict(true)}>
            Use editor files
          </button>
        </div>
      )}
      {!started && (
        <p className="linux-notice">
          A real isolated Linux shell. Editor changes sync automatically;
          terminal file changes load every five seconds. Sessions stop after
          five minutes without input or file writes, with a 30-minute maximum.
          New files are included; dependencies and build folders are excluded.
        </p>
      )}
      <div ref={host} className="linux-terminal-host" hidden={!started} />
    </section>
  );
}
