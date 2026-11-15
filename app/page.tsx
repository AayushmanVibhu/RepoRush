"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Clock3,
  Code2,
  FileCode2,
  FileJson2,
  Files,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Mail,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TerminalSquare,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import {
  challenges,
  languageForPath,
  type Challenge,
  type Difficulty,
  type TestRow,
} from "./challenges";
import { LoginPanel } from "./login/login-panel";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });
type Screen = "explorer" | "skills" | "progress" | "workspace" | "result";
type FileBuffers = Record<string, string>;
type CatalogScreen = "explorer" | "skills" | "progress";
type ProgressRecord = {
  challengeId: string;
  status: string;
  updatedAt?: string;
};
function Mark() {
  return (
    <span className="mark">
      <GitBranch size={14} />
    </span>
  );
}
function DifficultyBadge({ value }: { value: Difficulty }) {
  return (
    <span className={`difficulty ${value.toLowerCase()}`}>
      <i />
      {value}
    </span>
  );
}
function AppSidebar({
  active,
  navigate,
  name,
  email,
  image,
  completed,
}: {
  active: CatalogScreen;
  navigate: (screen: CatalogScreen) => void;
  name: string;
  email?: string | null;
  image?: string | null;
  completed: number;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const initials =
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "RR";
  return (
    <aside className="sidebar">
      <div className="brand">
        <Mark />
        <strong>RepoRush</strong>
      </div>
      <nav>
        <button
          className={active === "explorer" ? "active" : ""}
          onClick={() => navigate("explorer")}
        >
          <LayoutDashboard />
          <span>Challenges</span>
        </button>
        <button
          className={active === "skills" ? "active" : ""}
          onClick={() => navigate("skills")}
        >
          <GitBranch />
          <span>Skill tracks</span>
        </button>
        <button
          className={active === "progress" ? "active" : ""}
          onClick={() => navigate("progress")}
        >
          <Trophy />
          <span>Progress</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        {accountOpen && (
          <div className="account-menu">
            <div className="account-summary">
              {image ? <img src={image} alt="" /> : <span>{initials}</span>}
              <div>
                <b>{name}</b>
                {email && (
                  <small>
                    <Mail />
                    {email}
                  </small>
                )}
              </div>
            </div>
            <div className="account-metric">
              <span>Completed challenges</span>
              <b>{completed}</b>
            </div>
            <button
              onClick={() => {
                navigate("progress");
                setAccountOpen(false);
              }}
            >
              <Trophy />
              View progress
            </button>
            <button
              className="sign-out"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut />
              Sign out
            </button>
          </div>
        )}
        <button
          className="profile"
          onClick={() => setAccountOpen((value) => !value)}
          aria-expanded={accountOpen}
          title="Open account menu"
        >
          {image ? <img src={image} alt="" /> : <span>{initials}</span>}
          <div>
            <b>{name}</b>
            <small>{completed} completed</small>
          </div>
          <ChevronsUpDown />
        </button>
      </div>
    </aside>
  );
}

function Explorer({
  open,
  navigate,
  name,
  email,
  image,
  progress,
}: {
  open: (c: Challenge) => void;
  navigate: (screen: CatalogScreen) => void;
  name: string;
  email?: string | null;
  image?: string | null;
  progress: Record<string, ProgressRecord>;
}) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("All");
  const [language, setLanguage] = useState("All");
  const [skill, setSkill] = useState("All");
  const skillOptions = useMemo(
    () => [...new Set(challenges.flatMap((c) => c.skills))].sort(),
    [],
  );
  const rows = useMemo(
    () =>
      challenges.filter(
        (c) =>
          (difficulty === "All" || c.difficulty === difficulty) &&
          (language === "All" || c.language === language) &&
          (skill === "All" || c.skills.includes(skill)) &&
          (c.title + " " + c.skills.join(" "))
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [query, difficulty, language, skill],
  );
  return (
    <div className="app-shell">
      <AppSidebar
        active="explorer"
        navigate={navigate}
        name={name}
        email={email}
        image={image}
        completed={
          Object.values(progress).filter((row) => row.status === "completed")
            .length
        }
      />
      <main className="catalog">
        <header className="catalog-head">
          <div>
            <p className="eyebrow">Practice environment</p>
            <h1>Challenges</h1>
            <p>Practice debugging real-world codebases.</p>
          </div>
          <div className="streak">
            <Sparkles />
            <span>
              <b>3 languages</b>
              <small>Java · Python · JavaScript</small>
            </span>
          </div>
        </header>
        <section className="filters" aria-label="Challenge filters">
          <label className="search">
            <Search />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search challenges"
            />
            <kbd>⌘ K</kbd>
          </label>
          <label>
            <Code2 />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option>All</option>
              <option>Java</option>
              <option>Python</option>
              <option>JavaScript</option>
            </select>
            <ChevronDown />
          </label>
          <label>
            <SlidersHorizontal />
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option>All</option>
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
            <ChevronDown />
          </label>
          <label>
            <Target />
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="All">All skills</option>
              {skillOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>
        </section>
        <section className="table-wrap">
          <div className="table-title">
            <div>
              <h2>Challenge library</h2>
              <p>{rows.length} available challenges</p>
            </div>
            <span>Bundled practice repositories</span>
          </div>
          {rows.length ? (
            <div className="challenge-table">
              <div className="table-row table-header">
                <span>Challenge</span>
                <span>Language</span>
                <span>Skills</span>
                <span>Difficulty</span>
                <span>Est. time</span>
                <span>Status</span>
              </div>
              {rows.map((c) => {
                const status =
                  progress[c.id]?.status === "completed"
                    ? "Completed"
                    : progress[c.id]?.status === "in-progress"
                      ? "In progress"
                      : "Not started";
                return (
                  <button
                    className="table-row challenge-row"
                    key={c.id}
                    onClick={() => open(c)}
                  >
                    <span className="challenge-name">
                      <b>{c.title}</b>
                      <small>
                        {c.id} · {c.summary}
                      </small>
                    </span>
                    <span className="language">
                      <Braces />
                      {c.language}
                    </span>
                    <span className="skill-list">
                      {c.skills.map((s) => (
                        <i key={s}>{s}</i>
                      ))}
                    </span>
                    <DifficultyBadge value={c.difficulty} />
                    <span className="time">
                      <Clock3 />
                      {c.time}
                    </span>
                    <span
                      className={`status ${status.replace(" ", "-").toLowerCase()}`}
                    >
                      {status === "Completed" ? <Check /> : <Circle />}
                      {status}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <Search />
              <h3>No matching challenges</h3>
              <p>Try clearing a filter or using a broader search.</p>
              <button
                onClick={() => {
                  setQuery("");
                  setDifficulty("All");
                  setLanguage("All");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function FileTree({
  challenge,
  selected,
  setSelected,
  dirty,
}: {
  challenge: Challenge;
  selected: string;
  setSelected: (s: string) => void;
  dirty: Set<string>;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    Object.keys(challenge.files).forEach((path) => {
      const parts = path.split("/");
      const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      map.set(folder, [...(map.get(folder) || []), path]);
    });
    return [...map.entries()];
  }, [challenge]);
  return (
    <div className="file-panel">
      <div className="panel-title">
        <span>
          <Files />
          Explorer
        </span>
      </div>
      <div className="repo-title">
        <ChevronDown />
        <b>{challenge.repoName.toUpperCase()}</b>
      </div>
      {groups.map(([folder, paths]) => (
        <div key={folder || "root"}>
          {folder && (
            <div className="tree-row folder">
              <ChevronDown />
              <FolderOpen />
              {folder}
            </div>
          )}
          {paths.map((path) => {
            const name = path.split("/").at(-1);
            return (
              <button
                key={path}
                title={path}
                onClick={() => setSelected(path)}
                className={`tree-row file ${folder ? "" : "root-file"} ${selected === path ? "selected" : ""}`}
              >
                {path.endsWith(".json") ? <FileJson2 /> : <FileCode2 />}
                {name}
                {dirty.has(path) && <i />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
function loadFiles(c: Challenge): FileBuffers {
  if (typeof window === "undefined") return { ...c.files };
  try {
    const saved = JSON.parse(localStorage.getItem(`rr-files-${c.id}`) || "{}");
    return Object.fromEntries(
      Object.entries(c.files).map(([p, s]) => [
        p,
        typeof saved[p] === "string" ? saved[p] : s,
      ]),
    );
  } catch {
    return { ...c.files };
  }
}

function ResultsPanel({
  running,
  results,
  tab,
  setTab,
  close,
}: {
  running: boolean;
  results: TestRow[];
  tab: "tests" | "output";
  setTab: (t: "tests" | "output") => void;
  close: () => void;
}) {
  return (
    <section className="results-panel">
      <header>
        <div>
          <button
            className={tab === "tests" ? "active" : ""}
            onClick={() => setTab("tests")}
          >
            <Check />
            Test results{" "}
            {results.length > 0 && (
              <span>
                {results.filter((r) => r.pass).length}/{results.length}
              </span>
            )}
          </button>
          <button
            className={tab === "output" ? "active" : ""}
            onClick={() => setTab("output")}
          >
            <TerminalSquare />
            Output
          </button>
        </div>
        <button title="Close panel" onClick={close}>
          <X />
        </button>
      </header>
      <div className="results-body">
        {running ? (
          <div className="running-state">
            <span className="spinner" />
            Running public test suite…
          </div>
        ) : results.length === 0 ? (
          <div className="idle-state">
            <TerminalSquare />
            <p>Run the tests to validate your changes.</p>
            <span>
              Use <kbd>Ctrl/⌘ + Enter</kbd> from anywhere in the workspace.
            </span>
          </div>
        ) : tab === "tests" ? (
          <div className="tests">
            {results.map((r) => (
              <div key={r.name} className={r.pass ? "pass" : "fail"}>
                {r.pass ? <Check /> : <XCircle />}
                <span>
                  <b>{r.name}</b>
                  <small>{r.detail}</small>
                </span>
                <em>{r.pass ? "PASS" : "FAIL"}</em>
              </div>
            ))}
          </div>
        ) : (
          <pre>
            {results
              .map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n`)
              .join("")}
            \n{results.filter((r) => r.pass).length} passed,{" "}
            {results.filter((r) => !r.pass).length} failed
          </pre>
        )}
      </div>
    </section>
  );
}
function IssuePanel({
  challenge,
  width,
}: {
  challenge: Challenge;
  width: number;
}) {
  const [revealed, setRevealed] = useState(0);
  const hints = challenge.hints || [
    "Start from the failing public test and trace its inputs.",
    "Compare the observed behavior with the expected contract.",
    "The smallest correct fix belongs in the challenge entry file.",
  ];
  const reveal = () => {
    const next = revealed + 1;
    setRevealed(next);
    fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.id,
        type: "hint_revealed",
        summary: `Revealed progressive hint ${next} for a ${challenge.difficulty.toLowerCase()} ${challenge.language} challenge.`,
      }),
    }).catch(() => undefined);
  };
  return (
    <aside className="issue" style={{ width }}>
      <div className="panel-title">
        <span>
          <Circle />
          Issue ticket
        </span>
      </div>
      <div className="issue-body">
        <div className="issue-meta">
          <span>{challenge.id}</span>
          <DifficultyBadge value={challenge.difficulty} />
        </div>
        <h1>{challenge.title}</h1>
        <p className="issue-intro">{challenge.problem}</p>
        <section>
          <h2>Expected behavior</h2>
          <p>{challenge.expected}</p>
        </section>
        <section>
          <h2>Reproduction</h2>
          <ol>
            {challenge.reproduction.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
        <section>
          <h2>Constraints</h2>
          <ul>
            {challenge.constraints.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
        <section className="hints">
          <h2>
            Progressive hints <span>{revealed}/3 used</span>
          </h2>
          {hints.slice(0, revealed).map((hint, index) => (
            <div className="revealed-hint" key={hint}>
              <b>Hint {index + 1}</b>
              <p>{hint}</p>
            </div>
          ))}
          {revealed < 3 && (
            <button onClick={reveal}>
              <Sparkles />
              Reveal hint {revealed + 1}
            </button>
          )}
        </section>
        <div className="hint">
          <Sparkles />
          <p>
            <b>Repository note</b>
            <span>{challenge.note}</span>
            {challenge.source && (
              <small>
                {challenge.source.label} · {challenge.source.license}
              </small>
            )}
          </p>
        </div>
      </div>
    </aside>
  );
}

function Workspace({
  challenge,
  back,
  finish,
}: {
  challenge: Challenge;
  back: () => void;
  finish: (r: TestRow[], m: number) => void;
}) {
  const [files, setFiles] = useState<FileBuffers>(() => loadFiles(challenge));
  const [selected, setSelected] = useState(challenge.entryFile);
  const [results, setResults] = useState<TestRow[]>([]);
  const [running, setRunning] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [tab, setTab] = useState<"tests" | "output">("tests");
  const [saveState, setSaveState] = useState<
    "loading" | "saving" | "saved" | "local"
  >("loading");
  const [left, setLeft] = useState(230);
  const [right, setRight] = useState(318);
  const drag = useRef<{ side: string; x: number; w: number } | null>(null);
  const remoteLoaded = useRef(false);
  const dirty = useMemo(
    () =>
      new Set(
        Object.keys(challenge.files).filter(
          (p) => files[p] !== challenge.files[p],
        ),
      ),
    [challenge, files],
  );
  const storageKey = `rr-files-${challenge.id}`;
  const execute = (submit = false) => {
    setRunning(true);
    setBottomOpen(true);
    setTab("tests");
    const start = performance.now();
    setTimeout(() => {
      const rows = challenge.evaluate(files);
      const durationMs = Math.max(84, Math.round(performance.now() - start));
      setResults(rows);
      setRunning(false);
      if (submit) {
        fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.id,
            files,
            results: rows,
            durationMs,
          }),
        }).catch(() => undefined);
        finish(rows, durationMs);
      }
    }, 550);
  };
  useEffect(() => {
    let active = true;
    remoteLoaded.current = false;
    fetch(`/api/progress/${encodeURIComponent(challenge.id)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!active || !data.progress?.files) return;
        const saved = data.progress.files as FileBuffers;
        setFiles(
          Object.fromEntries(
            Object.entries(challenge.files).map(([path, starter]) => [
              path,
              typeof saved[path] === "string" ? saved[path] : starter,
            ]),
          ),
        );
      })
      .catch(() => setSaveState("local"))
      .finally(() => {
        if (active) remoteLoaded.current = true;
      });
    fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.id,
        type: "challenge_started",
        summary: `Started a ${challenge.difficulty.toLowerCase()} ${challenge.language} challenge about ${challenge.skills.join(", ")}.`,
      }),
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [challenge]);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(files));
    if (!remoteLoaded.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      fetch(`/api/progress/${encodeURIComponent(challenge.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, status: "in-progress" }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Save failed");
          setSaveState("saved");
        })
        .catch(() => setSaveState("local"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [challenge.id, files, storageKey]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        execute();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        localStorage.setItem(storageKey, JSON.stringify(files));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [files, storageKey]);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      const d = e.clientX - drag.current.x;
      if (drag.current.side === "left")
        setLeft(Math.min(360, Math.max(180, drag.current.w + d)));
      else setRight(Math.min(440, Math.max(270, drag.current.w - d)));
    };
    const up = () => (drag.current = null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);
  const name = selected.split("/").at(-1);
  return (
    <div className="workspace">
      <header className="workspace-bar">
        <button className="compact-brand" onClick={back}>
          <Mark />
          <b>RepoRush</b>
        </button>
        <div className="breadcrumbs">
          <span>Challenges</span>
          <ChevronRight />
          <b>{challenge.id}</b>
          <i />
          <strong>{challenge.title}</strong>
          <small className={`save-state ${saveState}`}>
            {saveState === "loading"
              ? "Loading workspace…"
              : saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : "Saved locally"}
          </small>
        </div>
        <DifficultyBadge value={challenge.difficulty} />
        <div className="toolbar-actions">
          <button
            className="reset"
            onClick={() => {
              setFiles({ ...challenge.files });
              setResults([]);
            }}
          >
            <RotateCcw />
            Reset
          </button>
          <button className="run" disabled={running} onClick={() => execute()}>
            <Play />
            {running ? "Running…" : "Run tests"}
            <kbd>⌘↵</kbd>
          </button>
          <button
            className="submit"
            disabled={running}
            onClick={() => execute(true)}
          >
            <Check />
            Submit fix
          </button>
        </div>
      </header>
      <div className="work-main">
        <aside style={{ width: left }}>
          <FileTree
            challenge={challenge}
            selected={selected}
            setSelected={setSelected}
            dirty={dirty}
          />
        </aside>
        <div
          className="resize-handle"
          onMouseDown={(e) =>
            (drag.current = { side: "left", x: e.clientX, w: left })
          }
        />
        <section className="editor-stack">
          <div className="editor-tabs">
            <div className="active editor-tab">
              <FileCode2 />
              {name}
              {dirty.has(selected) && <i />}
            </div>
          </div>
          <div className="editor">
            <Monaco
              key={`${challenge.id}:${selected}`}
              path={`file:///${challenge.repoName}/${selected}`}
              height="100%"
              language={languageForPath(selected)}
              value={files[selected]}
              onChange={(v) => setFiles((f) => ({ ...f, [selected]: v ?? "" }))}
              theme="vs-dark"
              options={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                minimap: { enabled: false },
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                renderLineHighlight: "all",
                lineNumbersMinChars: 3,
              }}
            />
          </div>
          {bottomOpen && (
            <ResultsPanel
              running={running}
              results={results}
              tab={tab}
              setTab={setTab}
              close={() => setBottomOpen(false)}
            />
          )}{" "}
          {!bottomOpen && (
            <button
              className="open-results"
              onClick={() => setBottomOpen(true)}
            >
              <TerminalSquare />
              Test results
            </button>
          )}
        </section>
        <div
          className="resize-handle"
          onMouseDown={(e) =>
            (drag.current = { side: "right", x: e.clientX, w: right })
          }
        />
        <IssuePanel challenge={challenge} width={right} />
      </div>
    </div>
  );
}

function SkillTracks({
  navigate,
  open,
  name,
  email,
  image,
  progress,
}: {
  navigate: (screen: CatalogScreen) => void;
  open: (challenge: Challenge) => void;
  name: string;
  email?: string | null;
  image?: string | null;
  progress: Record<string, ProgressRecord>;
}) {
  const completed = Object.values(progress).filter(
    (row) => row.status === "completed",
  ).length;
  const tracks = (["JavaScript", "Python", "Java"] as const).map((language) => {
    const items = challenges.filter(
      (challenge) => challenge.language === language,
    );
    const finished = items.filter(
      (challenge) => progress[challenge.id]?.status === "completed",
    ).length;
    const next =
      items.find(
        (challenge) => progress[challenge.id]?.status === "in-progress",
      ) ||
      items.find(
        (challenge) => progress[challenge.id]?.status !== "completed",
      ) ||
      items[0];
    return {
      language,
      items,
      finished,
      next,
      skills: [...new Set(items.flatMap((item) => item.skills))].slice(0, 6),
    };
  });
  return (
    <div className="app-shell">
      <AppSidebar
        active="skills"
        navigate={navigate}
        name={name}
        email={email}
        image={image}
        completed={completed}
      />
      <main className="catalog insight-page">
        <header className="catalog-head">
          <div>
            <p className="eyebrow">Guided practice</p>
            <h1>Skill tracks</h1>
            <p>Build depth one ecosystem at a time.</p>
          </div>
          <div className="streak">
            <GitBranch />
            <span>
              <b>{tracks.length} active tracks</b>
              <small>{challenges.length} repository challenges</small>
            </span>
          </div>
        </header>
        <section className="track-grid">
          {tracks.map((track) => {
            const percent = Math.round(
              (track.finished / track.items.length) * 100,
            );
            return (
              <article className="track-card" key={track.language}>
                <header>
                  <span
                    className={`track-mark ${track.language.toLowerCase()}`}
                  >
                    <Braces />
                  </span>
                  <div>
                    <small>Language track</small>
                    <h2>{track.language}</h2>
                  </div>
                  <b>{percent}%</b>
                </header>
                <div className="track-progress">
                  <i style={{ width: `${percent}%` }} />
                </div>
                <p>
                  {track.finished} of {track.items.length} challenges completed
                </p>
                <div className="track-skills">
                  {track.skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
                <button onClick={() => open(track.next)}>
                  {track.finished ? "Continue track" : "Start track"}
                  <ChevronRight />
                </button>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}

function ProgressView({
  navigate,
  open,
  name,
  email,
  image,
  progress,
}: {
  navigate: (screen: CatalogScreen) => void;
  open: (challenge: Challenge) => void;
  name: string;
  email?: string | null;
  image?: string | null;
  progress: Record<string, ProgressRecord>;
}) {
  const records = Object.values(progress);
  const completed = records.filter((row) => row.status === "completed").length;
  const inProgress = records.filter(
    (row) => row.status === "in-progress",
  ).length;
  const recent = records
    .filter((row) => row.updatedAt)
    .sort(
      (a, b) =>
        new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime(),
    )
    .slice(0, 6);
  const next =
    challenges.find((item) => progress[item.id]?.status === "in-progress") ||
    challenges.find((item) => !progress[item.id]) ||
    challenges[0];
  return (
    <div className="app-shell">
      <AppSidebar
        active="progress"
        navigate={navigate}
        name={name}
        email={email}
        image={image}
        completed={completed}
      />
      <main className="catalog insight-page">
        <header className="catalog-head">
          <div>
            <p className="eyebrow">Learning record</p>
            <h1>Your progress</h1>
            <p>A clear view of the work you have shipped.</p>
          </div>
          <button className="continue-button" onClick={() => open(next)}>
            Continue practice
            <ChevronRight />
          </button>
        </header>
        <section className="metric-grid">
          <article>
            <small>Completed</small>
            <strong>{completed}</strong>
            <span>of {challenges.length} challenges</span>
          </article>
          <article>
            <small>In progress</small>
            <strong>{inProgress}</strong>
            <span>active workspaces</span>
          </article>
          <article>
            <small>Completion</small>
            <strong>
              {Math.round((completed / challenges.length) * 100)}%
            </strong>
            <span>across all tracks</span>
          </article>
        </section>
        <section className="progress-layout">
          <article className="progress-card">
            <header>
              <div>
                <h2>Language progress</h2>
                <p>Completion across each practice track.</p>
              </div>
            </header>
            {(["JavaScript", "Python", "Java"] as const).map((language) => {
              const items = challenges.filter(
                (item) => item.language === language,
              );
              const count = items.filter(
                (item) => progress[item.id]?.status === "completed",
              ).length;
              const percent = Math.round((count / items.length) * 100);
              return (
                <div className="language-progress" key={language}>
                  <span>
                    <b>{language}</b>
                    <small>
                      {count}/{items.length}
                    </small>
                  </span>
                  <div>
                    <i style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </article>
          <article className="progress-card">
            <header>
              <div>
                <h2>Recent activity</h2>
                <p>Your latest saved workspaces.</p>
              </div>
            </header>
            {recent.length ? (
              recent.map((record) => {
                const item = challenges.find(
                  (challenge) => challenge.id === record.challengeId,
                );
                return item ? (
                  <button
                    className="activity-row"
                    key={record.challengeId}
                    onClick={() => open(item)}
                  >
                    <span className={`activity-state ${record.status}`}>
                      {record.status === "completed" ? <Check /> : <Circle />}
                    </span>
                    <span>
                      <b>{item.title}</b>
                      <small>
                        {item.language} · {record.status.replace("-", " ")}
                      </small>
                    </span>
                    <ChevronRight />
                  </button>
                ) : null;
              })
            ) : (
              <div className="progress-empty">
                <Target />
                <p>Your saved challenge activity will appear here.</p>
              </div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}

function Result({
  challenge,
  rows,
  ms,
  retry,
  home,
}: {
  challenge: Challenge;
  rows: TestRow[];
  ms: number;
  retry: () => void;
  home: () => void;
}) {
  const passed = rows.filter((r) => r.pass).length;
  const accepted = passed === rows.length;
  return (
    <div className="result-page">
      <header>
        <div className="brand">
          <Mark />
          <strong>RepoRush</strong>
        </div>
        <span>Submission · {challenge.id}</span>
      </header>
      <main>
        <div className={`result-icon ${accepted ? "accepted" : "rejected"}`}>
          {accepted ? <Check /> : <X />}
        </div>
        <p className="eyebrow">Submission evaluated</p>
        <h1>PATCH {accepted ? "ACCEPTED" : "REJECTED"}</h1>
        <p>
          {accepted
            ? "Clean fix. Your patch satisfies the repository contract and evaluation suite."
            : "Your patch still has a failing behavior. Your edits are safe—return to the workspace and keep debugging."}
        </p>
        <div className="result-stats">
          <div>
            <small>Tests passed</small>
            <b>
              {passed}
              <span> / {rows.length}</span>
            </b>
          </div>
          <div>
            <small>Execution time</small>
            <b>
              {ms}
              <span> ms</span>
            </b>
          </div>
          <div>
            <small>Status</small>
            <b className={accepted ? "green" : "red"}>
              {accepted ? "Complete" : "Needs work"}
            </b>
          </div>
        </div>
        <section className="evaluation">
          <header>
            <h2>Evaluation summary</h2>
            <span>
              {accepted
                ? "All checks passed"
                : `${rows.length - passed} failing`}
            </span>
          </header>
          {rows.map((r) => (
            <div key={r.name}>
              {r.pass ? (
                <Check className="green" />
              ) : (
                <XCircle className="red" />
              )}
              <span>
                <b>{r.name}</b>
                <small>{r.detail}</small>
              </span>
              <em>{r.pass ? "Passed" : "Failed"}</em>
            </div>
          ))}
        </section>
        {accepted && (
          <div className="skills-practiced">
            <span>Skills practiced</span>
            {challenge.skills.map((s) => (
              <i key={s}>{s}</i>
            ))}
          </div>
        )}
        <div className="result-actions">
          <button className="secondary" onClick={accepted ? home : retry}>
            {accepted ? "Return to challenges" : "Back to editor"}
          </button>
          <button className="primary" onClick={accepted ? home : retry}>
            {accepted ? "Attempt another challenge" : "Continue debugging"}
            <ChevronRight />
          </button>
        </div>
      </main>
    </div>
  );
}
export default function Page() {
  const { data: session, status } = useSession();
  const [screen, setScreen] = useState<Screen>("explorer");
  const [progress, setProgress] = useState<Record<string, ProgressRecord>>({});
  const [challenge, setChallenge] = useState(challenges[0]);
  const [submission, setSubmission] = useState<{ rows: TestRow[]; ms: number }>(
    { rows: [], ms: 0 },
  );
  const loadProgress = () =>
    fetch("/api/progress")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data)
          setProgress(
            Object.fromEntries(
              data.progress.map((row: ProgressRecord) => [
                row.challengeId,
                row,
              ]),
            ),
          );
      })
      .catch(() => undefined);
  useEffect(() => {
    if (session?.user?.id) loadProgress();
  }, [session?.user?.id]);
  if (status === "loading")
    return (
      <div className="session-loading">
        <span className="spinner" />
        Loading RepoRush…
      </div>
    );
  if (!session?.user) return <LoginPanel />;
  const name = session.user.name || session.user.email || "Developer";
  const navigate = (destination: CatalogScreen) => setScreen(destination);
  const open = (item: Challenge) => {
    setChallenge(item);
    setScreen("workspace");
  };
  return screen === "explorer" ? (
    <Explorer
      name={name}
      email={session.user.email}
      image={session.user.image}
      progress={progress}
      navigate={navigate}
      open={open}
    />
  ) : screen === "skills" ? (
    <SkillTracks
      name={name}
      email={session.user.email}
      image={session.user.image}
      progress={progress}
      navigate={navigate}
      open={open}
    />
  ) : screen === "progress" ? (
    <ProgressView
      name={name}
      email={session.user.email}
      image={session.user.image}
      progress={progress}
      navigate={navigate}
      open={open}
    />
  ) : screen === "workspace" ? (
    <Workspace
      key={challenge.id}
      challenge={challenge}
      back={() => setScreen("explorer")}
      finish={(rows, ms) => {
        setSubmission({ rows, ms });
        setScreen("result");
        window.setTimeout(loadProgress, 1000);
      }}
    />
  ) : (
    <Result
      challenge={challenge}
      {...submission}
      retry={() => setScreen("workspace")}
      home={() => setScreen("explorer")}
    />
  );
}
