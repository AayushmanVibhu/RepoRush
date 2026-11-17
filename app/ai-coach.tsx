"use client";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import type { WorkspaceChallenge } from "@/lib/challenge-model";
type FileBuffers = Record<string, string>;
import type { CoachMessage } from "@/lib/coach";
import type { CoachMode, CoachPatch, RecalledMemory } from "@/lib/coach-policy";

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Please retry.");
  return data;
}
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export function AICoach({
  challenge,
  files,
  selected,
  selection,
  output,
  onFilesChange,
}: {
  challenge: WorkspaceChallenge;
  files: FileBuffers;
  selected: string;
  selection: string;
  output: string;
  onFilesChange: React.Dispatch<React.SetStateAction<FileBuffers>>;
}) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [mode, setMode] = useState<CoachMode>("hint");
  const [question, setQuestion] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [memories, setMemories] = useState<RecalledMemory[]>([]);
  const [status, setStatus] = useState("off");
  const [settings, setSettings] = useState(false);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const chatUrl = `/api/coach?challengeId=${encodeURIComponent(challenge.id)}`;
  useEffect(() => {
    let alive = true;
    api(chatUrl)
      .then((data) => {
        if (alive) {
          setMessages(data.messages);
          setConfigured(data.configured);
          setEnabled(data.memoryEnabled);
          setStatus(data.memoryEnabled ? "ready" : "off");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [chatUrl]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [pending, messages]);
  async function memoryAction(body: unknown) {
    setMemoryBusy(true);
    setNotice("");
    try {
      const data = await api("/api/coach/memory", json(body));
      if (typeof data.enabled === "boolean") {
        setEnabled(data.enabled);
        setStatus(data.enabled ? "ready" : "off");
      }
      if (data.forgotten) {
        setMemories([]);
        setStatus("off");
        setNotice(
          `Recall cleared. Provider deletion: ${data.deletion}. Chat history is separate.`,
        );
      } else
        setNotice(
          data.status === "pending"
            ? "Saved locally; memory delivery will retry on your next visit."
            : "Saved. New memories may take a moment to become searchable.",
        );
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      setMemoryBusy(false);
    }
  }
  async function inspectMemory() {
    setMemoryBusy(true);
    try {
      const data = await api("/api/coach/memory");
      setEnabled(data.enabled);
      setMemories(data.memories);
      setStatus(data.status);
      setNotice(
        data.delivery.status === "pending"
          ? "Some memories are awaiting delivery."
          : "Showing actual Supermemory results.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setMemoryBusy(false);
    }
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !configured || !question.trim()) return;
    setError("");
    setPending("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const shared: FileBuffers = {};
    for (const path of [
      ...new Set([
        selected,
        challenge.entryFile,
        ...Object.keys(files).filter((p) => /test|spec/i.test(p)),
      ]),
    ].slice(0, 3))
      if (files[path] !== undefined) shared[path] = files[path];
    try {
      const response = await fetch("/api/coach", {
        ...json({
          challengeId: challenge.id,
          revision: challenge.revision,
          mode,
          question,
          selected,
          selection,
          files: shared,
          output,
        }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(95000),
        ]),
      });
      if (!response.ok) {
        const data = await response.json();
        throw Error(data.error || "Coach unavailable.");
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (!frame.startsWith("data: ")) continue;
          const data = JSON.parse(frame.slice(6));
          if (data.type === "token") setPending((text) => text + data.text);
          if (data.type === "context") {
            setMemories(data.memories);
            setStatus(data.memoryStatus);
          }
          if (data.type === "done") {
            setMessages(data.messages);
            setPending("");
            setQuestion("");
          }
          if (data.type === "error") throw Error(data.error);
        }
      }
    } catch (e) {
      setError(
        (e as Error).name === "TimeoutError"
          ? "The coach took too long to respond. Please retry."
          : (e as Error).name === "AbortError"
            ? "Response stopped. Partial text was not saved."
            : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function apply(patch: CoachPatch) {
    const source = files[patch.path];
    if (source === undefined) {
      setError("That file is no longer available.");
      return;
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(source),
    );
    const hash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== patch.baseHash || source.split(patch.original).length !== 2) {
      setError(
        "This file changed since the suggestion. Ask the coach to review the current version.",
      );
      return;
    }
    // Recheck inside the state update: typing may have continued while hashing.
    onFilesChange((current) =>
      current[patch.path] === source
        ? {
            ...current,
            [patch.path]: source.replace(patch.original, patch.replacement),
          }
        : current,
    );
    setNotice(`Applied suggestion to ${patch.path}. Run tests to verify it.`);
  }
  return (
    <section className="coach-panel" aria-label="AI coding coach">
      <div className="coach-toolbar">
        <label>
          Mode{" "}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as CoachMode)}
          >
            {["hint", "explain", "debug", "review"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <span>
          {selected}
          {selection ? " · highlighted code included" : ""}
        </span>
        <button onClick={() => setSettings(!settings)}>
          Learning memory{" "}
          {enabled === null ? "loading…" : enabled ? "on" : "off"}
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            try {
              await api(chatUrl, { method: "DELETE" });
              setMessages([]);
              setPending("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          New chat
        </button>
      </div>
      <div className="coach-scroll">
        {settings && (
          <div className="coach-memory">
            <label>
              <input
                type="checkbox"
                checked={enabled === true}
                disabled={enabled === null || memoryBusy || busy}
                onChange={(e) => {
                  if (!e.target.checked) {
                    setMemories([]);
                    setStatus("off");
                  }
                  void memoryAction({
                    action: "enable",
                    enabled: e.target.checked,
                  });
                }}
              />{" "}
              Remember practice events and lessons across challenges with
              Supermemory
            </label>
            <p>
              Learning memory is on by default for your profile. It remembers
              practice, coaching context and lessons across challenges. You can
              pause it or forget it here. Chats are saved separately.
            </p>
            <div className="coach-actions">
              <button disabled={memoryBusy} onClick={inspectMemory}>
                Inspect memories
              </button>
              <button
                disabled={memoryBusy || busy}
                onClick={() => {
                  if (!confirmForget) setConfirmForget(true);
                  else {
                    setConfirmForget(false);
                    void memoryAction({ action: "forget" });
                  }
                }}
              >
                {confirmForget
                  ? "Confirm forget learning memory"
                  : "Forget learning memory"}
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void memoryAction({ action: "remember", text: note }).then(
                  (saved) => {
                    if (saved) setNote("");
                  },
                );
              }}
            >
              <input
                aria-label="Lesson to remember"
                maxLength={1000}
                placeholder="Remember: I prefer a small example before a fix…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button disabled={!enabled || memoryBusy || !note.trim()}>
                Remember lesson
              </button>
            </form>
          </div>
        )}
        <details className="coach-recall">
          <summary>
            Recalled context ·{" "}
            {status === "recalled" ? `${memories.length} memories` : status}
          </summary>
          {memories.length ? (
            memories.map((memory) => (
              <p key={memory.id}>
                {memory.text}
                <small>
                  {memory.source} · {memory.id}
                </small>
              </p>
            ))
          ) : (
            <p>
              {status === "unavailable"
                ? "Supermemory is unavailable. The coach can still help with current code."
                : "No learning memories were recalled for this question."}
            </p>
          )}
        </details>
        {!messages.length && !pending && (
          <p className="coach-welcome">
            A second pair of eyes for this repository. Ask for one hint, an
            explanation, help tracing a failure, or a code review. Suggestions
            need your review and real tests.
          </p>
        )}
        {messages.map((message, index) => (
          <article
            className={`coach-message ${message.role}`}
            key={`${message.at}:${index}`}
          >
            <b>{message.role === "user" ? "You" : "RepoRush coach"}</b>
            <div
              className={message.role === "assistant" ? "coach-markdown" : ""}
            >
              {message.role === "assistant" ? (
                <Markdown skipHtml disallowedElements={["img"]}>
                  {message.text}
                </Markdown>
              ) : (
                message.text
              )}
            </div>
            {message.patch && (
              <details>
                <summary>Review proposed edit · {message.patch.path}</summary>
                <p>Replace</p>
                <pre>{message.patch.original}</pre>
                <p>With</p>
                <pre>{message.patch.replacement}</pre>
                <button
                  disabled={busy}
                  onClick={() => void apply(message.patch!)}
                >
                  Apply to editor
                </button>
              </details>
            )}
          </article>
        ))}
        {(busy || pending) && (
          <article className="coach-message" aria-live="polite">
            <b>RepoRush coach{busy ? " · thinking" : " · incomplete"}</b>
            <div className="coach-markdown">
              <Markdown skipHtml disallowedElements={["img"]}>
                {pending || "Reading the shared context…"}
              </Markdown>
            </div>
          </article>
        )}
        {notice && (
          <p className="coach-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="coach-error" role="alert">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <form className="coach-compose" onSubmit={ask}>
        <div>
          <textarea
            aria-label="Question for the coach"
            maxLength={4000}
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key !== "Enter" ||
                e.shiftKey ||
                e.nativeEvent.isComposing ||
                e.keyCode === 229
              )
                return;
              e.preventDefault();
              if (!e.repeat && configured && !busy && question.trim()) {
                e.currentTarget.form?.requestSubmit();
              }
            }}
            title="Enter to send; Shift+Enter for a new line"
            placeholder="What should I inspect next?"
          />
          <button disabled={!configured || busy || !question.trim()}>
            Ask coach
          </button>
          {busy && (
            <button type="button" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
