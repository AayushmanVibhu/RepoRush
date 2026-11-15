import type { Challenge } from "./challenges";
import snapshots from "./interview-data/challenges.json";

export const interviewChallenges: Challenge[] = snapshots.map((snapshot) => ({
  id: snapshot.id,
  title: snapshot.title,
  summary: `${snapshot.company} · company-published interview task · ${snapshot.mode}`,
  language: snapshot.language as Challenge["language"],
  difficulty: snapshot.difficulty as Challenge["difficulty"],
  time: snapshot.time,
  skills: snapshot.skills,
  status: "Not started",
  repoName: `interview-${snapshot.slug}`,
  entryFile: snapshot.entryFile,
  files: Object.fromEntries(
    Object.entries(snapshot.files).filter((entry) => typeof entry[1] === "string"),
  ),
  problem: snapshot.problem,
  expected: snapshot.expected,
  reproduction: [
    "Read REPORUSH.md and ATTRIBUTION.md for the task, provenance and adaptation scope.",
    `Run the supplied behavioral regression: ${snapshot.command}`,
    "Implement the contract in the entry file and rerun the regression without weakening tests.",
  ],
  constraints: [
    "Keep the public interface and supplied regression tests intact.",
    "Preserve source attribution and licenses.",
    "Use general behavior rather than hard-coding the supplied test inputs.",
  ],
  note: "Company-published assessment adapted for RepoRush practice, with no endorsement implied. Run tests and Submit execute the supplied regression in a fresh Linux sandbox. Use the terminal for exploration. See ATTRIBUTION.md for what is original versus adapted.",
  hints: snapshot.hints as [string, string, string],
  source: {
    label: `${snapshot.company} · ${snapshot.mode}`,
    license: snapshot.license,
    url: `https://github.com/${snapshot.repository}/tree/${snapshot.revision}`,
  },
  evaluate: (files) => {
    const source = files[snapshot.entryFile] ?? "";
    const forbidden = /UnsupportedOperationException|\.toLowerCase\(\)/;
    return [
      {
        name: "Static implementation check",
        pass:
          !forbidden.test(source) &&
          snapshot.patterns.every((pattern) =>
            new RegExp(pattern).test(source),
          ),
        detail:
          "Source heuristic only. The included runtime tests establish behavior and may accept other implementations.",
      },
      {
        name: "Regression and attribution preserved",
        pass: Object.entries(snapshot.files).every(
          ([path, original]) =>
            path === snapshot.entryFile || files[path] === original,
        ),
        detail:
          "Retain supplied tests, supporting source and attribution files.",
      },
    ];
  },
}));
