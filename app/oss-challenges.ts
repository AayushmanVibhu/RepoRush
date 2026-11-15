import type { Challenge, Difficulty } from "./challenges";
import escape from "./oss-data/escape-string-regexp.json";
import ms from "./oss-data/ms.json";
import equal from "./oss-data/fast-deep-equal.json";
import map from "./oss-data/p-map.json";
import limit from "./oss-data/p-limit.json";

type Snapshot = {
  id: string;
  repository: string;
  commit: string;
  fork: string;
  files: Record<string, string>;
};
type Ticket = {
  snapshot: Snapshot;
  title: string;
  difficulty: Difficulty;
  time: string;
  entry: string;
  skills: string[];
  problem: string;
  expected: string;
  hints: [string, string, string];
  fixed: RegExp;
};

const tickets: Ticket[] = [
  {
    snapshot: escape,
    title: "Only the first regex metacharacter is escaped",
    difficulty: "Easy",
    time: "25 min",
    entry: "index.js",
    skills: ["Regex", "Input handling"],
    problem:
      "Literal searches containing multiple special characters behave like regular expressions after an intentional escaping regression.",
    expected:
      "Escape every metacharacter while preserving Unicode-safe hyphens and input validation.",
    hints: [
      "Try a string with two dots.",
      "Compare the two replace calls.",
      "Check the global flag on the character-class regex.",
    ],
    fixed: /\]\/g\s*,/,
  },
  {
    snapshot: ms,
    title: "Minute durations are half their expected value",
    difficulty: "Easy",
    time: "25 min",
    entry: "index.js",
    skills: ["Numbers", "Parsing"],
    problem:
      "An intentionally changed conversion constant shortens minute timeouts and corrupts derived hour and day durations.",
    expected:
      "One minute equals 60,000 milliseconds; parsing and formatting use consistent units.",
    hints: [
      "Compare seconds and minutes.",
      "Find the shared unit constants.",
      "Check the multiplier defining m.",
    ],
    fixed: /var\s+m\s*=\s*s\s*\*\s*60\s*;/,
  },
  {
    snapshot: equal,
    title: "Nested object equality uses reference identity",
    difficulty: "Medium",
    time: "45 min",
    entry: "src/index.jst",
    skills: ["Recursion", "Equality"],
    problem:
      "Separately allocated nested objects compare unequal although arrays still recurse correctly. The JavaScript variants are generated from a shared source template.",
    expected:
      "Compare property values recursively and preserve missing-key and NaN behavior.",
    hints: [
      "Compare nested arrays and nested objects.",
      "Inspect src/index.jst, then build.js.",
      "Call equal recursively for property values.",
    ],
    fixed: /!equal\(a\[key\],\s*b\[key\]\)/,
  },
  {
    snapshot: map,
    title: "Concurrent mapping returns completion order",
    difficulty: "Medium",
    time: "50 min",
    entry: "index.js",
    skills: ["Async", "Ordering"],
    problem:
      "An intentional result-storage regression places slow early inputs after fast later inputs. Follow captured indexes, result storage and skip filtering.",
    expected:
      "Results retain input order regardless of completion time, and skipped results remain omitted.",
    hints: [
      "Give mapper calls different delays.",
      "Find where the input index is captured.",
      "Store the value at that captured index.",
    ],
    fixed: /result\[index\]\s*=\s*value/,
  },
  {
    snapshot: limit,
    title: "Rejected jobs permanently consume worker capacity",
    difficulty: "Hard",
    time: "75 min",
    entry: "index.js",
    skills: ["Concurrency", "Queues", "Exceptions"],
    problem:
      "A deliberately inserted early return after rejection prevents worker-slot cleanup. Later queued jobs stall, even though the caller receives the original rejection.",
    expected:
      "Both settlement paths release one slot, drain pending work and respect the concurrency ceiling.",
    hints: [
      "Queue work behind a rejected task at concurrency 1.",
      "Follow activeCount and next() on both settlement paths.",
      "Ensure rejection cleanup reaches next() without changing caller-facing rejection.",
    ],
    fixed: /catch\s*\{\s*\}\s*next\(\)/,
  },
];

export const ossChallenges: Challenge[] = tickets.map((ticket) => ({
  id: ticket.snapshot.id,
  title: ticket.title,
  summary: `${ticket.snapshot.repository} · real upstream source with an injected regression`,
  language: "JavaScript",
  difficulty: ticket.difficulty,
  time: ticket.time,
  skills: ticket.skills,
  status: "Not started",
  repoName: ticket.snapshot.repository.split("/")[1],
  entryFile: ticket.entry,
  files: ticket.snapshot.files,
  problem: ticket.problem,
  expected: ticket.expected,
  reproduction: [
    "Read REPORUSH.md for pinned provenance and setup.",
    "Install dependencies with npm install --ignore-scripts; for fast-deep-equal run node build.js.",
    "Run node --test reporush/regression.test.mjs and trace the failure into the implementation.",
  ],
  constraints: [
    "Preserve upstream APIs and licenses.",
    "Do not weaken regression or upstream tests.",
    "Fix the source rather than hard-coding regression inputs.",
  ],
  note: "Real MIT-licensed upstream repository snapshot with an intentional training bug. Run tests and Submit execute the supplied regression in a fresh Linux sandbox; this is the focused regression, not the complete upstream suite. Use the terminal for exploration and manual commands.",
  hints: ticket.hints,
  source: {
    label: `${ticket.snapshot.repository} @ ${ticket.snapshot.commit.slice(0, 7)}`,
    license: "MIT",
    url: `https://github.com/${ticket.snapshot.repository}/tree/${ticket.snapshot.commit}`,
  },
  evaluate: (files) => [
    {
      name: "Static patch check",
      pass: ticket.fixed.test(files[ticket.entry] ?? ""),
      detail:
        "Checks the targeted source pattern; run the Node regression to verify behavior.",
    },
    {
      name: "Regression test preserved",
      pass:
        files["reporush/regression.test.mjs"] ===
        ticket.snapshot.files["reporush/regression.test.mjs"],
      detail: "The supplied behavioral regression must remain unchanged.",
    },
    {
      name: "Upstream files preserved",
      pass: Object.entries(ticket.snapshot.files).every(
        ([path, source]) => path === ticket.entry || files[path] === source,
      ),
      detail: "Keep upstream tests, supporting files and attribution intact.",
    },
  ],
}));
