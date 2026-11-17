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
  GitBranch,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Mail,
  Play,
  RotateCcw,
  Search,
  ArrowUpDown,
  SlidersHorizontal,
  Sparkles,
  Target,
  TerminalSquare,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import type { Difficulty, TestRow } from "./challenges";
import { languageForPath, type ChallengeCard, type WorkspaceChallenge } from "@/lib/challenge-model";
import {
  challengeJson,
  deleteWorkspaceDrafts,
  fetchChallengeCatalog,
  openPublishedChallenge,
  sameFiles,
  storeWorkspaceDraft,
  type OpenChallenge,
} from "@/lib/challenge-client";
import { LoginPanel } from "./login/login-panel";
import { BrandLogo } from "./brand-logo";
import { LinuxTerminal, linuxRequest } from "./linux-terminal";
import { AICoach } from "./ai-coach";
import { ResizableResults } from "./resizable-results";
import { FileTree } from "./file-tree";
import { TestCaseResults } from "./test-case-results";

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
      <BrandLogo />
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
  const {data: accountSession} = useSession();
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
            {accountSession?.user?.username ? <span className="account-password-name">Username: {accountSession.user.username}</span> : <a className="password-login-link" href="/signup"><KeyRound/>Add password sign-in</a>}
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

const challengePreferencesKey = "rr-challenge-preferences";
const challengeLanguages = ["All", "Java", "Python", "JavaScript"];
const challengeDifficulties = ["All", "Easy", "Medium", "Hard"];
const challengeSortOptions = [
  { value: "recommended", label: "Recommended order" },
  { value: "difficulty-asc", label: "Difficulty: Easy to Hard" },
  { value: "difficulty-desc", label: "Difficulty: Hard to Easy" },
  { value: "language", label: "Language: A to Z" },
];
const defaultChallengeFilters = {
  query: "",
  difficulty: "All",
  language: "All",
  skill: "All",
};
const defaultChallengePreferences = {
  ...defaultChallengeFilters,
  sort: "recommended",
};

function savedChoice(value: unknown, options: readonly string[], fallback: string) {
  return typeof value === "string" && options.includes(value) ? value : fallback;
}

function readChallengePreferences(options: {
  languages: readonly string[];
  difficulties: readonly string[];
  skills: readonly string[];
}): typeof defaultChallengePreferences {
  try {
    const raw = localStorage.getItem(challengePreferencesKey);
    if (raw === null) return defaultChallengePreferences;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaultChallengePreferences;
    }

    const saved = parsed as Record<string, unknown>;
    return {
      query:
        typeof saved.query === "string" ? saved.query : defaultChallengeFilters.query,
      difficulty: savedChoice(
        saved.difficulty,
        options.difficulties,
        defaultChallengeFilters.difficulty,
      ),
      language: savedChoice(
        saved.language,
        options.languages,
        defaultChallengeFilters.language,
      ),
      skill: savedChoice(saved.skill, options.skills, defaultChallengeFilters.skill),
      sort:
        challengeSortOptions.find(({ value }) => value === saved.sort)?.value ??
        defaultChallengePreferences.sort,
    };
  } catch {
    return defaultChallengePreferences;
  }
}

function Explorer({
  challenges,
  open,
  navigate,
  name,
  email,
  image,
  progress,
}: {
  challenges: ChallengeCard[];
  open: (c: ChallengeCard) => void;
  navigate: (screen: CatalogScreen) => void;
  name: string;
  email?: string | null;
  image?: string | null;
  progress: Record<string, ProgressRecord>;
}) {
  const filterOptions = useMemo(() => ({
    languages: challengeLanguages.filter((option) =>
      option === "All" || challenges.some((card) => card.language === option),
    ),
    difficulties: challengeDifficulties.filter((option) =>
      option === "All" || challenges.some((card) => card.difficulty === option),
    ),
    skills: [...new Set(challenges.flatMap((card) => card.skills))].sort(),
  }), [challenges]);
  const [preferences, setPreferences] = useState(defaultChallengePreferences);
  const searchInput = useRef<HTMLInputElement>(null);
  const { query, difficulty, language, skill, sort } = preferences;
  const hasActiveFilters =
    query !== defaultChallengeFilters.query ||
    difficulty !== defaultChallengeFilters.difficulty ||
    language !== defaultChallengeFilters.language ||
    skill !== defaultChallengeFilters.skill;

  useEffect(() => {
    setPreferences(readChallengePreferences(filterOptions));
  }, [filterOptions]);

  function updatePreferences(changes: Partial<typeof preferences>) {
    const next = { ...preferences, ...changes };
    setPreferences(next);
    try {
      localStorage.setItem(challengePreferencesKey, JSON.stringify(next));
    } catch {
      // Keep the catalog usable when browser storage is unavailable.
    }
  }

  function resetFilters() {
    updatePreferences(defaultChallengeFilters);
    searchInput.current?.focus();
  }

  const rows = useMemo(() => {
    const difficultyRank: Record<Difficulty, number> = {
      Easy: 0,
      Medium: 1,
      Hard: 2,
    };
    const filtered = challenges.filter(
      (c) =>
        (difficulty === "All" || c.difficulty === difficulty) &&
        (language === "All" || c.language === language) &&
        (skill === "All" || c.skills.includes(skill)) &&
        (c.title + " " + c.skills.join(" "))
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    return filtered.toSorted((a, b) => {
      if (sort === "difficulty-asc")
        return difficultyRank[a.difficulty] - difficultyRank[b.difficulty];
      if (sort === "difficulty-desc")
        return difficultyRank[b.difficulty] - difficultyRank[a.difficulty];
      if (sort === "language")
        return (
          a.language.localeCompare(b.language) || a.title.localeCompare(b.title)
        );
      return 0;
    });
  }, [challenges, query, difficulty, language, skill, sort]);
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
              ref={searchInput}
              value={query}
              onChange={(e) => updatePreferences({ query: e.target.value })}
              aria-label="Search challenges"
              placeholder="Search challenges"
            />
            <kbd>⌘ K</kbd>
          </label>
          <label>
            <Code2 />
            <select
              aria-label="Language"
              value={language}
              onChange={(e) => updatePreferences({ language: e.target.value })}
            >
              {filterOptions.languages.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ChevronDown />
          </label>
          <label>
            <SlidersHorizontal />
            <select
              aria-label="Difficulty"
              value={difficulty}
              onChange={(e) => updatePreferences({ difficulty: e.target.value })}
            >
              {filterOptions.difficulties.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ChevronDown />
          </label>
          <label>
            <Target />
            <select
              aria-label="Skill"
              value={skill}
              onChange={(e) => updatePreferences({ skill: e.target.value })}
            >
              <option value="All">All skills</option>
              {filterOptions.skills.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>
          <label>
            <ArrowUpDown />
            <select
              aria-label="Sort challenges"
              value={sort}
              onChange={(e) => updatePreferences({ sort: e.target.value })}
            >
              {challengeSortOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              className="filter-button"
              onClick={resetFilters}
            >
              <RotateCcw aria-hidden="true" />
              Reset Filters
            </button>
          )}
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
                        Challenge {c.number} · {c.summary}
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
              <button type="button" onClick={resetFilters}>
                Clear filters
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ResultsPanel({
  running,
  results,
  tab,
  setTab,
  close,
  terminal,
  coach,
  output,
}: {
  running: boolean;
  results: TestRow[];
  tab: "tests" | "output" | "terminal" | "coach";
  setTab: (t: "tests" | "output" | "terminal" | "coach") => void;
  close: () => void;
  terminal: React.ReactNode;
  coach: React.ReactNode;
  output: string;
}) {
  return (
    <ResizableResults tab={tab}>
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
          <button className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}>
            <TerminalSquare /> Linux terminal
          </button>
          <button className={tab === "coach" ? "active" : ""} onClick={() => setTab("coach")}><Sparkles /> AI coach</button>
        </div>
        <button title="Close panel" onClick={close}>
          <X />
        </button>
      </header>
      <div className="results-body">
        <div className="linux-frame" hidden={tab !== "terminal"}>{terminal}</div>
        <div className="coach-frame" hidden={tab !== "coach"}>{coach}</div>
        {tab === "terminal" || tab === "coach" ? null : running ? (
          <div className="running-state">
            <span className="spinner" />
            Running checks…
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
          <TestCaseResults rows={results} />
        ) : (
          <pre>
            {output || results
              .map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n`)
              .join("")}
            \n{results.filter((r) => r.pass).length} passed,{" "}
            {results.filter((r) => !r.pass).length} failed
          </pre>
        )}
      </div>
    </ResizableResults>
  );
}
function IssuePanel({
  challenge,
  width,
}: {
  challenge: WorkspaceChallenge;
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
          <span>Challenge {challenge.number}</span>
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
  opened,
  userId,
  back,
  finish,
}: {
  opened: OpenChallenge;
  userId: string;
  back: () => void;
  finish: (r: TestRow[], m: number) => void;
}) {
  const { challenge } = opened;
  const [files, setFiles] = useState<FileBuffers>(opened.initialFiles);
  const [selected, setSelected] = useState(challenge.entryFile);
  const [results, setResults] = useState<TestRow[]>([]);
  const [running, setRunning] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [tab, setTab] = useState<"tests" | "output" | "terminal" | "coach">("tests");
  const [selection, setSelection] = useState("");
  const [output, setOutput] = useState("");
  const [saveState, setSaveState] = useState<
    "saving" | "saved" | "local"
  >(opened.updatedAt ? "saved" : "local");
  const [conflicting, setConflicting] = useState(opened.conflicting);
  const [saveError, setSaveError] = useState("");
  const cloudFiles = useRef(opened.cloudFiles);
  const cloudUpdatedAt = useRef(opened.updatedAt);
  const latestFiles = useRef(files);
  const mounted = useRef(false);
  const saveQueue = useRef(Promise.resolve());
  const [left, setLeft] = useState(230);
  const [right, setRight] = useState(318);
  const drag = useRef<{ side: string; x: number; w: number } | null>(null);
  const dirty = useMemo(
    () =>
      new Set(
        [...new Set([...Object.keys(challenge.files), ...Object.keys(files)])].filter(
          (p) => files[p] !== challenge.files[p],
        ),
      ),
    [challenge, files],
  );
  const execute = async (submit = false) => {
    if (running || (submit && (conflicting || saveError))) return;
    setRunning(true);
    setBottomOpen(true);
    setTab("tests");
    setOutput("");
    try {
      let data: {results: TestRow[]; durationMs: number; output: string};
      if (submit) {
        await saveQueue.current;
        const response = await fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.id,
            revision: challenge.revision,
            baseUpdatedAt: cloudUpdatedAt.current,
            files,
          }),
        });
        const saved = await challengeJson<typeof data & { updatedAt: string }>(response);
        cloudUpdatedAt.current = saved.updatedAt;
        cloudFiles.current = files;
        storeWorkspaceDraft(opened, userId, latestFiles.current, saved.updatedAt, !sameFiles(latestFiles.current, files));
        data = saved;
      } else {
        data = await linuxRequest("run", challenge.id, { files, revision: challenge.revision });
      }
      setResults(data.results);
      setOutput(data.output);
      if (submit) finish(data.results, data.durationMs);
    } catch (error) {
      const message = (error as Error).message;
      setResults([{name: "Execution unavailable", pass: false, kind: "error", detail: message}]);
      setOutput(message);
    } finally {setRunning(false);}
  };
  useEffect(() => {
    mounted.current = true;
    fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.id,
        type: "challenge_started",
        summary: `Started a ${challenge.difficulty.toLowerCase()} ${challenge.language} challenge about ${challenge.skills.join(", ")}.`,
      }),
    }).catch(() => undefined);
    return () => { mounted.current = false; };
  }, [challenge]);
  useEffect(() => {
    latestFiles.current = files;
    if (conflicting) return;
    const pending = !sameFiles(files, cloudFiles.current);
    storeWorkspaceDraft(opened, userId, files, cloudUpdatedAt.current, pending);
    if (!pending || saveError || running) return;
    let active = true;
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        if (!active || sameFiles(files, cloudFiles.current)) return;
        setSaveState("saving");
        try {
          const response = await fetch(`/api/progress/${encodeURIComponent(challenge.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files, revision: challenge.revision, baseUpdatedAt: cloudUpdatedAt.current }),
          });
          if (response.status === 409) {
            setSaveError("Workspace changed elsewhere. Reopen it to review the saved and local copies.");
          }
          const { updatedAt } = await challengeJson<{ updatedAt: string }>(response);
          cloudFiles.current = files;
          cloudUpdatedAt.current = updatedAt;
          if (mounted.current) {
            storeWorkspaceDraft(opened, userId, latestFiles.current, updatedAt, !sameFiles(latestFiles.current, files));
            setSaveState("saved");
          }
        } catch {
          if (mounted.current) setSaveState("local");
        }
      });
    }, 900);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [challenge, conflicting, files, opened, running, saveError, userId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest(".linux-panel, .coach-panel")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        execute();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!conflicting) storeWorkspaceDraft(opened, userId, files, cloudUpdatedAt.current, !sameFiles(files, cloudFiles.current));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [files, userId, opened, running, conflicting, saveError]);
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
  useEffect(() => {
    if (!(selected in files)) setSelected(challenge.entryFile in files ? challenge.entryFile : Object.keys(files)[0] || challenge.entryFile);
  }, [files, selected, challenge.entryFile]);
  return (
    <div className="workspace">
      <header className="workspace-bar">
        <button className="compact-brand" onClick={back}>
          <Mark />
        </button>
        <div className="breadcrumbs">
          <span>Challenges</span>
          <ChevronRight />
          <b>Challenge {challenge.number}</b>
          <i />
          <strong>{challenge.title}</strong>
          <small className={`save-state ${saveState}`}>
            {saveState === "saving"
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
            disabled={conflicting}
            onClick={() => {
              setFiles({ ...challenge.files });
              setResults([]);
              setOutput("");
            }}
          >
            <RotateCcw />
            Reset
          </button>
          <button className="run" disabled={running} onClick={() => execute()}>
            <Play />
            {running ? "Running…" : challenge.gradingMode === "sandbox" ? "Run tests" : "Static checks"}
            <kbd>⌘↵</kbd>
          </button>
          <button
            className="submit"
            disabled={running || conflicting || Boolean(saveError)}
            onClick={() => execute(true)}
          >
            <Check />
            Submit fix
          </button>
        </div>
      </header>
      {(conflicting || saveError) && (
        <div className="workspace-recovery">
          <p role="alert">{saveError || "Local edits differ from the saved workspace. Choose the copy to keep."}</p>
          {conflicting && (
            <>
              <button type="button" className="filter-button" onClick={() => { setFiles(cloudFiles.current); setConflicting(false); }}>Use saved copy</button>
              <button type="button" className="filter-button" onClick={() => setConflicting(false)}>Keep local edits</button>
            </>
          )}
        </div>
      )}
      <div className="work-main">
        <aside style={{ width: left }}>
          <FileTree
            challenge={challenge}
            files={files}
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
              path={`file:///${userId}/${challenge.id}/${selected}`}
              height="100%"
              language={languageForPath(selected)}
              value={files[selected] ?? ""}
              onMount={editor => {setSelection(""); editor.onDidChangeCursorSelection(() => {const range = editor.getSelection(); setSelection(range ? (editor.getModel()?.getValueInRange(range) || "").slice(0, 6000) : "");});}}
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
                readOnly: conflicting,
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
              output={output}
              terminal={<LinuxTerminal challengeId={challenge.id} revision={challenge.revision} files={files} onFilesChange={(next) => { if (!conflicting) setFiles(next); }} visible={tab === "terminal"} />}
              coach={<AICoach challenge={challenge} files={files} selected={selected} selection={selection} output={output} onFilesChange={(next) => { if (!conflicting) setFiles(next); }} />}
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
  challenges,
  navigate,
  open,
  name,
  email,
  image,
  progress,
}: {
  navigate: (screen: CatalogScreen) => void;
  challenges: ChallengeCard[];
  open: (challenge: ChallengeCard) => void;
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
              (track.finished / (track.items.length || 1)) * 100,
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
                <button disabled={!track.next} onClick={() => track.next && open(track.next)}>
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
  challenges,
  navigate,
  open,
  name,
  email,
  image,
  progress,
  onDeleteProgress,
}: {
  navigate: (screen: CatalogScreen) => void;
  challenges: ChallengeCard[];
  open: (challenge: ChallengeCard) => void;
  name: string;
  email?: string | null;
  image?: string | null;
  progress: Record<string, ProgressRecord>;
  onDeleteProgress: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState('');
  const [deleteFailed, setDeleteFailed] = useState(false);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const deleteProgress = async () => {
    if (deleting || deleteConfirmation !== 'DELETE MY PROGRESS') return;
    setDeleting(true); setDeleteNotice(''); setDeleteFailed(false);
    try {await onDeleteProgress(); setDeleteNotice('Your challenge progress has been deleted.'); deleteDialog.current?.close(); setDeleteConfirmation('');}
    catch (error) {setDeleteFailed(true); setDeleteNotice((error as Error).message);}
    finally {setDeleting(false);}
  };
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
          <div className="progress-actions">
          <button className="continue-button delete-progress-button" onClick={() => {setDeleteConfirmation(''); setDeleteNotice(''); deleteDialog.current?.showModal();}} disabled={deleting}>
            <XCircle />{deleting ? 'Deleting…' : 'Delete progress'}
          </button>
          <button className="continue-button" onClick={() => next && open(next)} disabled={deleting || !next}>
            Continue practice
            <ChevronRight />
          </button>
          </div>
        </header>
        <dialog ref={deleteDialog} className="delete-progress-dialog" aria-labelledby="delete-progress-title" onCancel={event => {if (deleting) event.preventDefault(); else setDeleteConfirmation('');}}>
          <h2 id="delete-progress-title">Delete your progress?</h2>
          <p>This deletes all your challenge progress, saved code, hint counts and submission history. This cannot be undone. Your account and AI learning memory remain.</p>
          {deleteFailed && deleteNotice && <p className="progress-delete-notice failed" role="alert">{deleteNotice}</p>}
          <form onSubmit={event => {event.preventDefault(); void deleteProgress();}}>
            <label htmlFor="delete-progress-confirmation">Type DELETE MY PROGRESS to confirm</label>
            <input id="delete-progress-confirmation" autoComplete="off" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} disabled={deleting}/>
            <div className="delete-dialog-actions">
              <button type="button" className="continue-button" disabled={deleting} onClick={() => {deleteDialog.current?.close(); setDeleteConfirmation('');}}>Cancel</button>
              <button type="submit" className="continue-button delete-progress-button" disabled={deleting || deleteConfirmation !== 'DELETE MY PROGRESS'}>{deleting ? 'Deleting…' : 'Delete all progress'}</button>
            </div>
          </form>
        </dialog>
        {deleteNotice && <p className={`progress-delete-notice ${deleteFailed ? 'failed' : ''}`} role={deleteFailed ? 'alert' : 'status'}>{deleteNotice}</p>}
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
              {Math.round((completed / (challenges.length || 1)) * 100)}%
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
              const percent = Math.round((count / (items.length || 1)) * 100);
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
  challenge: WorkspaceChallenge;
  rows: TestRow[];
  ms: number;
  retry: () => void;
  home: () => void;
}) {
  const passed = rows.filter((r) => r.pass).length;
  const accepted = rows.length > 0 && passed === rows.length;
  const staticOnly = rows.length > 0 && rows.every(row => row.kind === "static");
  const hasError = rows.some(row => row.kind === "error");
  return (
    <div className="result-page">
      <header>
        <div className="brand">
          <Mark />
        </div>
        <span>Submission · Challenge {challenge.number}</span>
      </header>
      <main>
        <div className={`result-icon ${accepted ? "accepted" : "rejected"}`}>
          {accepted ? <Check /> : <X />}
        </div>
        <p className="eyebrow">{challenge.title}</p>
        <h1>{accepted ? "Congratulations, challenge solved!" : hasError ? "Let’s fix that error" : "Keep going, you’re getting closer"}</h1>
        <p>
          {accepted
            ? staticOnly ? "Nice work! You passed all source checks for this challenge. Runtime tests are not available for this repository yet." : `Great work! Your solution passed all ${rows.length} test cases. Your progress has been saved.`
            : hasError ? "Your code could not complete the test run. Check the error below, then return to your code and try again." : "Some test cases still need attention. Review the results below, update your code, and try again. Your edits are saved."}
        </p>
        <div className="result-stats">
          <div>
            <small>{staticOnly ? "Source checks passed" : "Tests passed"}</small>
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
            <h2>{staticOnly ? "Source checks" : "Test results"}</h2>
            <span>
              {accepted
                ? "All checks passed"
                : `${rows.length - passed} failing`}
            </span>
          </header>
          <TestCaseResults rows={rows} />
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
function CatalogStatus({
  message,
  error,
  retry,
  cancel,
}: {
  message: string;
  error?: string;
  retry?: () => void;
  cancel?: () => void;
}) {
  return (
    <main className="session-loading">
      {error ? <p role="alert">{error}</p> : <p role="status">{message}</p>}
      {retry && (
        <button type="button" className="filter-button" onClick={retry}>
          Retry
        </button>
      )}
      {cancel && (
        <button type="button" className="filter-button" onClick={cancel}>
          Back
        </button>
      )}
    </main>
  );
}

function SignedInPage({
  userId,
  name,
  email,
  image,
}: {
  userId: string;
  name: string;
  email?: string | null;
  image?: string | null;
}) {
  const [screen, setScreen] = useState<Screen>("explorer");
  const [challenges, setChallenges] = useState<ChallengeCard[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [opening, setOpening] = useState<{
    card: ChallengeCard;
    error?: string;
  } | null>(null);
  const [opened, setOpened] = useState<OpenChallenge | null>(null);
  const openingRequest = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<Record<string, ProgressRecord>>({});
  const progressVersion = useRef(0);
  const [submission, setSubmission] = useState<{ rows: TestRow[]; ms: number }>(
    { rows: [], ms: 0 },
  );
  const loadProgress = () => {
    const version = ++progressVersion.current;
    return fetch("/api/progress", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && version === progressVersion.current) {
          setProgress(
            Object.fromEntries(
              data.progress.map((row: ProgressRecord) => [
                row.challengeId,
                row,
              ]),
            ),
          );
        }
      })
      .catch(() => undefined);
  };
  const deleteProgress = async () => {
    progressVersion.current++;
    const response = await fetch("/api/progress", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE MY PROGRESS" }),
    });
    await challengeJson(response);
    setProgress({});
    try {
      deleteWorkspaceDrafts(userId, challenges ?? []);
    } catch {
      throw new Error(
        "Database progress was deleted, but browser drafts could not be cleared. Please retry.",
      );
    }
  };
  useEffect(() => {
    void loadProgress();
    return () => {
      openingRequest.current?.abort();
      progressVersion.current++;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError("");
    fetchChallengeCatalog(controller.signal)
      .then((catalog) => {
        if (!controller.signal.aborted) setChallenges(catalog.challenges);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setCatalogError((error as Error).message);
      });
    return () => controller.abort();
  }, [catalogRetry]);
  const open = async (item: ChallengeCard) => {
    openingRequest.current?.abort();
    const controller = new AbortController();
    openingRequest.current = controller;
    setOpening({ card: item });
    try {
      const workspace = await openPublishedChallenge(
        item.id,
        userId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setOpened(workspace);
      setScreen("workspace");
      setOpening(null);
    } catch (error) {
      if (!controller.signal.aborted)
        setOpening({ card: item, error: (error as Error).message });
    }
  };
  if (!challenges) {
    return (
      <CatalogStatus
        message="Loading challenge library…"
        error={catalogError}
        retry={
          catalogError
            ? () => setCatalogRetry((attempt) => attempt + 1)
            : undefined
        }
      />
    );
  }
  if (opening) {
    return (
      <CatalogStatus
        message={`Loading ${opening.card.title}…`}
        error={opening.error}
        retry={opening.error ? () => void open(opening.card) : undefined}
        cancel={() => {
          openingRequest.current?.abort();
          setOpening(null);
        }}
      />
    );
  }
  const catalog = {
    challenges,
    name,
    email,
    image,
    progress,
    open,
    navigate: (destination: CatalogScreen) => setScreen(destination),
  };
  if (screen === "skills") return <SkillTracks {...catalog} />;
  if (screen === "progress")
    return <ProgressView {...catalog} onDeleteProgress={deleteProgress} />;
  if (screen === "workspace" && opened) {
    return (
      <Workspace
        key={opened.challenge.id}
        opened={opened}
        userId={userId}
        back={() => {
          setScreen("explorer");
          void loadProgress();
        }}
        finish={(rows, ms) => {
          setSubmission({ rows, ms });
          setScreen("result");
          void loadProgress();
        }}
      />
    );
  }
  if (screen === "result" && opened) {
    return (
      <Result
        challenge={opened.challenge}
        {...submission}
        retry={() => void open(opened.challenge)}
        home={() => setScreen("explorer")}
      />
    );
  }
  return <Explorer {...catalog} />;
}

export default function Page() {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return (
      <div className="session-loading">
        <span className="spinner" />
        Loading RepoRush…
      </div>
    );
  }
  if (!session?.user?.id) return <LoginPanel />;
  return (
    <SignedInPage
      key={session.user.id}
      userId={session.user.id}
      name={session.user.name || session.user.email || "Developer"}
      email={session.user.email}
      image={session.user.image}
    />
  );
}
